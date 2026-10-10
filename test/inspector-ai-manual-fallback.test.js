'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const dashboard=fs.readFileSync(path.join(__dirname,'..','dashboard.html'),'utf8');
const aiAnalyze=fs.readFileSync(path.join(__dirname,'..','api/ai/analyze.js'),'utf8');
const rules=fs.readFileSync(path.join(__dirname,'..','firestore.rules'),'utf8');

const start=dashboard.indexOf('window.useManualSmartCaptureFallback=function(){');
const end=dashboard.indexOf('window.retrySmartCaptureAnalysis=function(){',start);
assert.ok(start>0 && end>start,'manual fallback function must exist');
const functionSource=dashboard.slice(start,end);

function makeHarness({description='حفرة في الرصيف',evidence='HSR/before/owned.jpeg',aiDraft=null}={}){
  const nodes={
    rawObservationInput:{value:description,focus(){events.push('focus')}},
    inspectorAiPreviewRoot:{classList:{remove(name){events.push('preview:'+name)}}},
    processSmartInputBtn:{innerHTML:''}
  };
  const events=[];
  const capture={uploadedUrl:evidence,aiDraft};
  const context={
    window:{},pendingSmartCapture:capture,
    imageUploadInFlight:false,smartInputSaveInFlight:false,
    document:{getElementById(id){return nodes[id]||null}},
    hide(k){events.push('hide:'+k)},unhide(k){events.push('unhide:'+k)},
    setHTML(k,text){events.push('html:'+k); assert.doesNotMatch(text,/apiKey|token|secret/i)},
    returnToSmartInputStep1(){events.push('return')},
    showToast(text){events.push('toast:'+text)},
    checkSmartInputState(){events.push('check')},
    lucide:{createIcons(){events.push('icons')}}
  };
  vm.runInNewContext(functionSource,context);
  return {context,capture,events,nodes};
}
test('manual fallback demands uploaded private evidence; no AI or storage call',()=>{
  const h=makeHarness({evidence:''});
  h.context.window.useManualSmartCaptureFallback();
  assert.equal(h.capture.manualMode,undefined);
  assert.deepEqual(h.events,[]);
  assert.doesNotMatch(functionSource,/analyzeSmartCaptureDraft\(|uploadImageToStorage\(|saveObservationToFirestore\(/);
});
test('manual fallback requires actual human description',()=>{
  const h=makeHarness({description:''});
  h.context.window.useManualSmartCaptureFallback();
  assert.equal(h.capture.manualMode,undefined);
  assert.ok(h.events.includes('return'));
  assert.ok(h.events.some(e=>e.startsWith('toast:')));
});
test('explicit manual opt-in preserves object key and awaits separate save click',()=>{
  const h=makeHarness();
  h.context.window.useManualSmartCaptureFallback();
  assert.equal(h.capture.uploadedUrl,'HSR/before/owned.jpeg');
  assert.equal(h.capture.manualMode,true);
  assert.ok(h.events.includes('hide:modalResult'));
  assert.ok(h.events.includes('unhide:modalStep1'));
  assert.match(h.nodes.processSmartInputBtn.innerHTML,/حفظ الملاحظة يدويًا/);
  assert.ok(h.events.includes('check'));
});
test('AI result cannot be overridden by manual fallback',()=>{
  const h=makeHarness({aiDraft:{ok:true}});
  h.context.window.useManualSmartCaptureFallback();
  assert.equal(h.capture.manualMode,undefined);
  assert.deepEqual(h.events,[]);
});
test('save path separates AI and manual modes, both tenant-scoped with explicit human save',()=>{
  const start=dashboard.indexOf('window.processSmartInput = async function(){');
  const end=dashboard.indexOf('async function commitPendingSmartInput()',start);
  const flow=dashboard.slice(start,end);
  assert.match(flow,/if\(!aiDraft && !manualMode\)/);
  assert.match(flow,/if\(manualMode && !rawText\)/);
  assert.match(flow,/pendingSmartInput = \{ payload, nextDisplayId, clientRequestId \}/);
  assert.match(flow,/organizationId: inspectorContext\.organizationId/);
  assert.match(flow,/createdByUid: auth\.currentUser\.uid/);
  assert.match(flow,/\*\*ملاحظة ميدانية كتبها المراقب؛ لم يُجرَ تحليل AI/);
  assert.match(dashboard,/if\(savedManually\) return true;\s*const bindOutcome = await bindCachedVisionAnalysis/);
  assert.match(rules,/data\.organizationId == orgUserOrgId\(\)/);
  assert.match(rules,/data\.createdByUid == request\.auth\.uid/);
});
test('production AI tenant allowlist and server authorization stay fail closed',()=>{
  assert.match(aiAnalyze,/resolvePilotOrganizationIds\(\)\.includes\(caller\.organizationId\)/);
  assert.match(aiAnalyze,/AI_APPLICATION_ORGANIZATION_NOT_ENABLED/);
  assert.match(aiAnalyze,/evaluateObservationAccess\(observation, caller\)/);
});

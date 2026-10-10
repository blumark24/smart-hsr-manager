'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const dashboard=fs.readFileSync(path.join(__dirname,'..','dashboard.html'),'utf8');
const start=dashboard.indexOf('// Only allowlisted server error codes are translated.');
const end=dashboard.indexOf('window.retrySmartCaptureAnalysis=function()',start);
assert.ok(start>=0&&end>start,'diagnostics block must be present');

function renderFailure(code,message=''){
  const events=[];
  const ctx={
    REAUTHENTICATION_REQUIRED:'REAUTHENTICATION_REQUIRED',
    setHTML:(_id,content)=>events.push(content),
    hide:()=>{},
    lucide:{createIcons(){}},
    smartCaptureAiErrorHTML:msg=>msg,
  };
  vm.runInNewContext(dashboard.slice(start,end),ctx,{timeout:500});
  ctx.showSmartCaptureAiFailure({code,message});
  return events.at(-1);
}

test('tenant gate identifies organization enablement without granting access',()=>{
  assert.match(renderFailure('AI_APPLICATION_ORGANIZATION_NOT_ENABLED'),/غير مفعّلة لهذه البلدية/);
  assert.match(dashboard,/if\(!response\.ok\|\|payload\?\.ok!==true\)/);
});

test('provider readiness and configuration failures get actionable owner-facing messages',()=>{
  assert.match(renderFailure('AI_APPLICATION_INTEGRATION_DISABLED'),/إعدادات الخادم/);
  assert.match(renderFailure('AI_APPLICATION_API_KEY_REQUIRED'),/إعدادات الربط/);
  assert.match(renderFailure('AI_PROVIDER_UNAVAILABLE'),/مزوّد تحليل الصور/);
});

test('timeout and unknown errors do not expose server exception text',()=>{
  assert.match(renderFailure('AbortError','timeout'),/وقتاً أطول/);
  const msg=renderFailure('SECRET_EXCEPTION','private-user-data');
  assert.doesNotMatch(msg,/SECRET_EXCEPTION|private-user-data/);
});

test('failure path retains uploaded image, retry idempotence and no fake report',()=>{
  assert.match(dashboard,/تم رفع صورة الملاحظة بنجاح، ولن يُعاد رفعها. لم يتم إنشاء أي بلاغ/);
  assert.match(dashboard,/window\.retrySmartCaptureAnalysis=function/);
  assert.match(dashboard,/if\(!pendingSmartCapture\?\.uploadedUrl\|\|pendingSmartCapture\.aiDraft/);
});

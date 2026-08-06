(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SmartHsrInspectorPreview=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SAFE_HOSTS=Object.freeze(['localhost','127.0.0.1','::1']);
  const decisions=Object.freeze({CREATE_SINGLE:'إنشاء بلاغ واحد لاحقاً',CREATE_MULTIPLE:'مراجعة إنشاء عدة بلاغات',IGNORE_SECONDARY:'تجاهل الملاحظات الثانوية',MANUAL_REVIEW:'مراجعة يدوية'});
  function resolveFlag(locationLike={}){
    const host=String(locationLike.hostname||'').toLowerCase();
    const requested=new URLSearchParams(String(locationLike.search||'').replace(/^\?/,'')).get('inspectorAiPreview')==='1';
    if(!requested)return Object.freeze({enabled:false,code:'PREVIEW_DISABLED_BY_DEFAULT'});
    if(!SAFE_HOSTS.includes(host)&&!host.endsWith('.preview.local'))return Object.freeze({enabled:false,code:'PREVIEW_HOST_DENIED'});
    return Object.freeze({enabled:true,code:'PREVIEW_LOCAL_MOCK_ENABLED'});
  }
  function localFixtureAnalysis(file={}){
    const name=String(file.name||'').toLowerCase();
    const multi=/multi|متعدد/.test(name);
    const low=/low|unclear|ضعيف/.test(name);
    const primary={issueId:'local-pothole-1',issueCode:'ASPHALT_POTHOLE',issueLabelAr:'حفرة أسفلتية',confidence:low?0.42:0.91};
    const secondary={issueId:'local-sign-2',issueCode:'DAMAGED_SIGN',issueLabelAr:'لوحة إرشادية متضررة',confidence:0.4};
    return Object.freeze({
      analysisId:'local-preview-analysis-001',
      shortSummaryAr:low?'تعذر تحديد الملاحظة بدقة وتحتاج الصورة إلى مراجعة ميدانية.':'تم رصد حفرة أسفلتية تتطلب المعالجة لحماية مستخدمي الطريق.',
      category:'ROADS_AND_ASPHALT',subcategory:'ASPHALT_POTHOLE',priority:low?'UNKNOWN':'HIGH',confidence:primary.confidence,imageQuality:low?'POOR':'GOOD',department:'ROADS',
      multipleIssuesDetected:multi,detectedIssues:Object.freeze(multi?[primary,secondary]:[primary]),warnings:Object.freeze(low?['LOW_CONFIDENCE_MANUAL_REVIEW_REQUIRED']:[]),
      provenance:Object.freeze({advisoryOnly:true,automaticActions:false,providerHidden:true})
    });
  }
  function createController({document,location,confirmReplace=()=>false,applyManualLocation=()=>false,analyzeLocal=localFixtureAnalysis}={}){
    const flag=resolveFlag(location||{});let state={mode:'MANUAL',analysisStatus:'IDLE',suggestion:null,intelligence:null,selectedIssues:[],descriptionDraft:'',categoryDraft:'',subcategoryDraft:'',priorityDraft:'',locationDraft:{},provenance:{descriptionSource:'MANUAL',aiSuggestionUsed:false,aiSuggestionEdited:false},error:null,warnings:[]};
    const byId=id=>document?.getElementById(id);const hide=(id,value=true)=>byId(id)?.classList.toggle('hidden',value);
    const selectedImage=()=>{const file=byId('fileUploadInput')?.files?.[0];return file&&['image/jpeg','image/png','image/webp'].includes(file.type)?file:null};
    function render(){
      const root=byId('inspectorAiPreviewRoot');if(!root)return;
      root.classList.toggle('hidden',!flag.enabled);root.dataset.mode=state.mode;
      byId('inspectorAiAnalyzeBtn')?.classList.toggle('hidden',!flag.enabled);byId('manualAddressBtn')?.classList.toggle('hidden',!flag.enabled);
      const analyze=byId('inspectorAiAnalyzeBtn');if(analyze)analyze.disabled=!selectedImage()||state.mode==='ANALYZING';
      const suggestion=byId('inspectorAiSuggestionText');if(suggestion)suggestion.textContent=state.suggestion?.shortSummaryAr||'';
      hide('inspectorAiSuggestionPanel',!state.suggestion);
      const warning=byId('inspectorAiWarning');if(warning){warning.textContent=state.warnings.length?'الثقة منخفضة؛ يلزم التحقق والمراجعة اليدوية.':'';warning.classList.toggle('hidden',!state.warnings.length);}
      const chips=byId('inspectorAiChips');if(chips){chips.replaceChildren();if(state.intelligence){[['التصنيف',state.intelligence.category,'categoryDraft'],['التصنيف الفرعي',state.intelligence.subcategory,'subcategoryDraft'],['الأولوية',state.intelligence.priority,'priorityDraft'],['الثقة',Math.round(state.intelligence.confidence*100)+'%',null],['جودة الصورة',state.intelligence.imageQuality,null],['الإدارة',state.intelligence.department,null]].forEach(([label,value,field])=>{const span=document.createElement('span');span.className='inspector-ai-chip';span.textContent=`${label}: ${value}`;if(field){const button=document.createElement('button');button.type='button';button.textContent='تطبيق';button.setAttribute('aria-label',`تطبيق ${label}`);button.addEventListener('click',()=>{state={...state,[field]:value};span.dataset.applied='true'});span.append(' ',button)}chips.append(span)})}}
      const multi=byId('inspectorAiMultiIssue');if(multi){multi.replaceChildren();if(state.intelligence?.multipleIssuesDetected){const title=document.createElement('strong');title.textContent='تم اكتشاف أكثر من ملاحظة';multi.append(title);const list=document.createElement('ul');state.intelligence.detectedIssues.slice(0,3).forEach(issue=>{const li=document.createElement('li');li.textContent=`${issue.issueLabelAr} — ${Math.round(issue.confidence*100)}%`;if(issue.confidence<0.55)li.dataset.lowConfidence='true';list.append(li)});multi.append(list);const select=document.createElement('select');select.setAttribute('aria-label','قرار الملاحظات المتعددة');for(const [value,label] of Object.entries(decisions)){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option)}select.value='MANUAL_REVIEW';select.addEventListener('change',()=>{state={...state,provenance:{...state.provenance,multiIssueDecision:select.value}}});multi.append(select)}multi.classList.toggle('hidden',!state.intelligence?.multipleIssuesDetected)}
    }
    function setDescription(value){const input=byId('rawObservationInput');if(input){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}state={...state,descriptionDraft:value};}
    async function analyze(){const file=selectedImage();if(!flag.enabled||!file)return false;state={...state,mode:'ANALYZING',analysisStatus:'RUNNING'};render();const result=await Promise.resolve(analyzeLocal(file));state={...state,mode:'SUGGESTION_READY',analysisStatus:'SUCCEEDED',suggestion:{shortSummaryAr:result.shortSummaryAr},intelligence:result,selectedIssues:result.detectedIssues.filter(i=>i.confidence>=0.55).map(i=>i.issueId),warnings:[...result.warnings],provenance:{...state.provenance,analysisId:result.analysisId,selectedIssueIds:result.detectedIssues.filter(i=>i.confidence>=0.55).map(i=>i.issueId)}};render();return true;}
    function use(edit=false){const existing=byId('rawObservationInput')?.value||'';if(existing.trim()&&!confirmReplace('سيتم استبدال الوصف الحالي بالاقتراح. هل تريد المتابعة؟'))return false;setDescription(state.suggestion.shortSummaryAr);state={...state,mode:edit?'EDITING_AI_SUGGESTION':'AI_ACCEPTED',provenance:{...state.provenance,descriptionSource:'AI_ASSISTED',aiSuggestionUsed:true,aiSuggestionEdited:edit}};render();if(edit)byId('rawObservationInput')?.focus();return true;}
    function ignore(){state={...state,mode:'AI_IGNORED',suggestion:null,provenance:{...state.provenance,descriptionSource:'MANUAL',aiSuggestionUsed:false,aiSuggestionEdited:false}};render();}
    function toggleManual(){const opening=byId('inspectorManualLocationPanel')?.classList.contains('hidden');hide('inspectorManualLocationPanel',!opening);byId('manualAddressBtn')?.setAttribute('aria-expanded',String(Boolean(opening)));}
    function applyManual(){const draft={district:byId('manualDistrict')?.value||'',street:byId('manualStreet')?.value||'',landmark:byId('manualLandmark')?.value||'',latitude:byId('manualLatitude')?.value||'',longitude:byId('manualLongitude')?.value||''};const gpsExists=Boolean(byId('inputLatitude')?.value&&byId('inputLongitude')?.value);if(gpsExists&&!confirmReplace('يوجد موقع GPS مثبت. هل تريد استبداله بالموقع اليدوي؟'))return false;const applied=applyManualLocation(draft);if(applied){state={...state,locationDraft:{...draft,confirmed:true}};hide('inspectorManualLocationPanel',true)}return applied;}
    function bind(){if(!flag.enabled){render();return flag}byId('inspectorAiAnalyzeBtn')?.addEventListener('click',analyze);byId('inspectorAiUseBtn')?.addEventListener('click',()=>use(false));byId('inspectorAiEditBtn')?.addEventListener('click',()=>use(true));byId('inspectorAiIgnoreBtn')?.addEventListener('click',ignore);byId('manualAddressBtn')?.addEventListener('click',toggleManual);byId('manualLocationCancelBtn')?.addEventListener('click',toggleManual);byId('manualLocationApplyBtn')?.addEventListener('click',applyManual);byId('fileUploadInput')?.addEventListener('change',render);render();return flag}
    return Object.freeze({flag,bind,analyze,use,ignore,applyManualLocationDraft:applyManual,getState:()=>JSON.parse(JSON.stringify(state)),localFixtureAnalysis});
  }
  return Object.freeze({resolveFlag,localFixtureAnalysis,createController});
});

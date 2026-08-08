'use strict';

const FLAG='INSPECTOR_AI_SUGGESTIONS_PREVIEW';
const SAFE_HOSTS=Object.freeze(['localhost','127.0.0.1','::1']);
function resolveInspectorAiPreview({hostname='',search='',explicitOverride=false,localMock=false}={}){
  const host=String(hostname).toLowerCase();
  const requested=explicitOverride===true||new URLSearchParams(String(search).replace(/^\?/, '')).get('inspectorAiPreview')==='1';
  if(!requested)return Object.freeze({enabled:false,code:'PREVIEW_DISABLED_BY_DEFAULT'});
  if(!SAFE_HOSTS.includes(host)&&!host.endsWith('.preview.local'))return Object.freeze({enabled:false,code:'PREVIEW_HOST_DENIED'});
  if(localMock!==true)return Object.freeze({enabled:false,code:'LOCAL_MOCK_REQUIRED'});
  return Object.freeze({enabled:true,code:'PREVIEW_LOCAL_MOCK_ENABLED'});
}
module.exports=Object.freeze({FLAG,SAFE_HOSTS,resolveInspectorAiPreview});

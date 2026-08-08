'use strict';
const fs=require('node:fs');
function readLocalEnvironment(file='.env.local'){
  const values={};if(!fs.existsSync(file))return values;
  for(const line of fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)){const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);if(match)values[match[1]]=match[2].replace(/^(?:'|")|(?:'|")$/g,'')}
  return values;
}
function safeEnvironmentStatus(values={}){
  const pick=(...names)=>names.map(name=>values[name]).find(value=>value!==undefined);const yes=value=>String(value).toLowerCase()==='true';
  const applicationIntegrationEnabled=pick('APPLICATION_INTEGRATION_ENABLED','SMART_HSR_APPLICATION_INTEGRATION_ENABLED');
  return Object.freeze({GEMINI_API_KEY_present:Boolean(values.GEMINI_API_KEY),REAL_VISION_LOCAL_EVALUATION_enabled:yes(pick('REAL_VISION_LOCAL_EVALUATION','SMART_HSR_REAL_AI_EVALUATION')),SYNTHETIC_DATA_ONLY_true:yes(pick('SYNTHETIC_DATA_ONLY','SMART_HSR_SYNTHETIC_DATA_ONLY')),VISION_PROVIDER_gemini:String(pick('VISION_PROVIDER','SMART_HSR_AI_PROVIDER')||'').toLowerCase()==='gemini',RUNTIME_local:String(pick('RUNTIME','SMART_HSR_RUNTIME')||'local').toLowerCase()==='local',APPLICATION_INTEGRATION_disabled:yes(pick('SMART_HSR_NO_APP_INTEGRATION','NO_APPLICATION_INTEGRATION'))||String(applicationIntegrationEnabled).toLowerCase()==='false'});
}
if(require.main===module)process.stdout.write(`${JSON.stringify(safeEnvironmentStatus(readLocalEnvironment()))}\n`);
module.exports=Object.freeze({readLocalEnvironment,safeEnvironmentStatus});

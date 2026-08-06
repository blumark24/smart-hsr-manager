'use strict';

const { createDecision, deepFreeze } = require('../contracts/decision');

const REQUIRED_FIELDS=Object.freeze(['environmentName','firebaseProjectId','allowedHostnames','emulatorOnly','assignmentV2Enabled','candidateRulesFile','demoDataOnly','rollbackVersion','candidateRulesHash']);
function text(value){return typeof value==='string'?value.trim():'';}function hash(value){return /^[a-f0-9]{64}$/.test(text(value));}
function validateStagingEnvironmentContract(contract){
  if(!contract||typeof contract!=='object'||Array.isArray(contract))return createDecision(false,'STAGING_CONFIG_REQUIRED','A staging configuration object is required.');
  for(const field of REQUIRED_FIELDS)if(contract[field]===undefined||contract[field]===null)return createDecision(false,'STAGING_FIELD_REQUIRED',`Staging field ${field} is required.`,{field});
  if(!text(contract.environmentName)||!text(contract.firebaseProjectId)||!text(contract.candidateRulesFile)||!text(contract.rollbackVersion))return createDecision(false,'STAGING_TEXT_FIELD_INVALID','Staging text fields must be non-empty.');
  if(!Array.isArray(contract.allowedHostnames)||contract.allowedHostnames.length===0||contract.allowedHostnames.some(x=>!text(x)))return createDecision(false,'STAGING_HOST_ALLOWLIST_INVALID','An exact non-empty hostname allowlist is required.');
  if(!Array.isArray(contract.allowedProjectIds)||contract.allowedProjectIds.length===0||!contract.allowedProjectIds.includes(contract.firebaseProjectId))return createDecision(false,'STAGING_PROJECT_ALLOWLIST_INVALID','The Firebase project must be in the exact project allowlist.');
  if(!contract.firebaseProjectId.startsWith('demo-')&&!contract.firebaseProjectId.includes('staging'))return createDecision(false,'STAGING_PROJECT_DENIED','Only demo or staging project ids are accepted.');
  if(!hash(contract.candidateRulesHash)||!hash(contract.rollbackVersion))return createDecision(false,'STAGING_HASH_INVALID','Candidate and rollback hashes must be SHA-256 values.');
  for(const field of ['emulatorOnly','assignmentV2Enabled','demoDataOnly'])if(typeof contract[field]!=='boolean')return createDecision(false,'STAGING_BOOLEAN_INVALID',`${field} must be boolean.`,{field});
  return createDecision(true,'STAGING_CONTRACT_VALID','The isolated staging contract is structurally valid.');
}
function evaluateStagingActivation({contract,explicitOverride,hostname,firebaseProjectId,candidateRulesHash}={}){
  const valid=validateStagingEnvironmentContract(contract);if(!valid.allowed)return deepFreeze({...valid,environment:'staging'});
  if(explicitOverride!==true)return deepFreeze({...createDecision(false,'STAGING_OVERRIDE_REQUIRED','Explicit staging override is required.'),environment:'staging'});
  if(contract.assignmentV2Enabled!==true)return deepFreeze({...createDecision(false,'STAGING_V2_DISABLED','Assignment V2 is disabled in staging configuration.'),environment:'staging'});
  if(contract.demoDataOnly!==true)return deepFreeze({...createDecision(false,'STAGING_DEMO_DATA_REQUIRED','Staging activation requires demo-only data.'),environment:'staging'});
  if(!contract.allowedHostnames.includes(text(hostname)))return deepFreeze({...createDecision(false,'STAGING_HOST_DENIED','Hostname is not in the exact staging allowlist.'),environment:'staging'});
  if(firebaseProjectId!==contract.firebaseProjectId||!contract.allowedProjectIds.includes(firebaseProjectId))return deepFreeze({...createDecision(false,'STAGING_PROJECT_DENIED','Firebase project is not exactly approved.'),environment:'staging'});
  if(candidateRulesHash!==contract.candidateRulesHash)return deepFreeze({...createDecision(false,'STAGING_RULES_HASH_MISMATCH','Candidate rules hash does not match the reviewed package.'),environment:'staging'});
  return deepFreeze({...createDecision(true,'STAGING_ACTIVATION_ALLOWED','All isolated staging activation gates passed.'),environment:'staging'});
}
module.exports=Object.freeze({REQUIRED_FIELDS,evaluateStagingActivation,validateStagingEnvironmentContract});

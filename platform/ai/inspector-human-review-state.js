'use strict';

const MODES = Object.freeze(['MANUAL','ANALYZING','SUGGESTION_READY','EDITING_AI_SUGGESTION','AI_ACCEPTED','AI_IGNORED','ERROR']);
const SOURCE = Object.freeze({ MANUAL:'MANUAL', AI_ASSISTED:'AI_ASSISTED' });
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const freeze = value => Object.freeze(value);

function createHumanReviewState(drafts={}) {
  return freeze({
    mode:'MANUAL', analysisStatus:'IDLE', suggestion:null, intelligence:null,
    selectedIssues:freeze([]), descriptionDraft:String(drafts.descriptionDraft||''),
    categoryDraft:String(drafts.categoryDraft||''), subcategoryDraft:String(drafts.subcategoryDraft||''),
    priorityDraft:String(drafts.priorityDraft||''), locationDraft:freeze(clone(drafts.locationDraft)||{}),
    provenance:freeze({descriptionSource:SOURCE.MANUAL,aiSuggestionUsed:false,aiSuggestionEdited:false}),
    error:null, warnings:freeze([]), persisted:false, executable:false
  });
}

function evolve(state, changes={}) {
  const next={...state,...changes};
  if(!MODES.includes(next.mode)) throw new TypeError('Unsupported human review mode.');
  next.selectedIssues=freeze([...(next.selectedIssues||[])]);
  next.locationDraft=freeze(clone(next.locationDraft)||{});
  next.provenance=freeze({...next.provenance});
  next.warnings=freeze([...(next.warnings||[])]);
  next.persisted=false; next.executable=false;
  return freeze(next);
}

function beginAnalysis(state,{hasValidImage=false}={}) {
  if(!hasValidImage)return freeze({allowed:false,code:'IMAGE_REQUIRED',state});
  return freeze({allowed:true,code:'ANALYSIS_STARTED',state:evolve(state,{mode:'ANALYZING',analysisStatus:'RUNNING',error:null})});
}
function receiveSuggestion(state,{suggestion,intelligence}={}) {
  if(state.mode!=='ANALYZING'||!suggestion?.shortSummaryAr||!intelligence?.analysisId)return freeze({allowed:false,code:'SUGGESTION_INVALID',state});
  const selectable=(intelligence.detectedIssues||[]).filter(issue=>issue.confidence>=0.55&&issue.issueCode!=='UNKNOWN').map(issue=>issue.issueId);
  return freeze({allowed:true,code:'SUGGESTION_READY',state:evolve(state,{mode:'SUGGESTION_READY',analysisStatus:'SUCCEEDED',suggestion:clone(suggestion),intelligence:clone(intelligence),selectedIssues:selectable,warnings:intelligence.warnings||[],provenance:{...state.provenance,analysisId:intelligence.analysisId,selectedIssueIds:selectable}})});
}
function useSuggestion(state,{replaceConfirmed=false}={}) {
  if(!state.suggestion?.shortSummaryAr)return freeze({allowed:false,code:'SUGGESTION_UNAVAILABLE',state});
  if(state.descriptionDraft.trim()&&!replaceConfirmed)return freeze({allowed:false,code:'DESCRIPTION_REPLACEMENT_CONFIRMATION_REQUIRED',state});
  return freeze({allowed:true,code:'SUGGESTION_USED',state:evolve(state,{mode:'AI_ACCEPTED',descriptionDraft:state.suggestion.shortSummaryAr,provenance:{...state.provenance,descriptionSource:SOURCE.AI_ASSISTED,aiSuggestionUsed:true,aiSuggestionEdited:false}})});
}
function editSuggestion(state,{replaceConfirmed=false}={}) {
  const used=useSuggestion(state,{replaceConfirmed});if(!used.allowed)return used;
  return freeze({allowed:true,code:'SUGGESTION_EDITING',state:evolve(used.state,{mode:'EDITING_AI_SUGGESTION',provenance:{...used.state.provenance,aiSuggestionEdited:true}})});
}
function ignoreSuggestion(state){return freeze({allowed:true,code:'SUGGESTION_IGNORED',state:evolve(state,{mode:'AI_IGNORED',suggestion:null,provenance:{...state.provenance,descriptionSource:SOURCE.MANUAL,aiSuggestionUsed:false,aiSuggestionEdited:false}})});}
function updateManualDescription(state,value){return evolve(state,{descriptionDraft:String(value||''),provenance:{...state.provenance,descriptionSource:state.provenance.aiSuggestionUsed?SOURCE.AI_ASSISTED:SOURCE.MANUAL,aiSuggestionEdited:state.provenance.aiSuggestionUsed}});}
function applyDraftSuggestion(state,field,value){if(!['categoryDraft','subcategoryDraft','priorityDraft'].includes(field))return freeze({allowed:false,code:'DRAFT_FIELD_DENIED',state});return freeze({allowed:true,code:'DRAFT_UPDATED',state:evolve(state,{[field]:String(value||'')})});}
function setMultiIssueDecision(state,decision){const supported=['CREATE_SINGLE','CREATE_MULTIPLE','IGNORE_SECONDARY','MANUAL_REVIEW'];if(!supported.includes(decision))return freeze({allowed:false,code:'MULTI_ISSUE_DECISION_INVALID',state});return freeze({allowed:true,code:'MULTI_ISSUE_DECISION_RECORDED',state:evolve(state,{provenance:{...state.provenance,multiIssueDecision:decision}})});}
function updateLocationDraft(state,draft){return evolve(state,{locationDraft:{district:String(draft?.district||''),street:String(draft?.street||''),landmark:String(draft?.landmark||''),latitude:draft?.latitude??'',longitude:draft?.longitude??'',confirmed:false}});}
function confirmManualLocation(state,{gpsExists=false,replaceConfirmed=false}={}){const lat=Number(state.locationDraft.latitude),lng=Number(state.locationDraft.longitude);if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180)return freeze({allowed:false,code:'MANUAL_COORDINATES_INVALID',state});if(gpsExists&&!replaceConfirmed)return freeze({allowed:false,code:'GPS_REPLACEMENT_CONFIRMATION_REQUIRED',state});return freeze({allowed:true,code:'MANUAL_LOCATION_CONFIRMED',state:evolve(state,{locationDraft:{...state.locationDraft,latitude:lat,longitude:lng,confirmed:true}})});}

module.exports=freeze({MODES,SOURCE,createHumanReviewState,beginAnalysis,receiveSuggestion,useSuggestion,editSuggestion,ignoreSuggestion,updateManualDescription,applyDraftSuggestion,setMultiIssueDecision,updateLocationDraft,confirmManualLocation});

'use strict';

const { createMunicipalIntelligence } = require('../intelligence/municipal-intelligence-engine');
function createLocalPreviewSuggestion({analysis,organizationId,observationId}={}){
  const resolved=createMunicipalIntelligence({analysis,organizationId,observationId});
  if(!resolved.ok)return Object.freeze({ok:false,errorCode:resolved.errorCode,reason:resolved.reason});
  const intelligence=resolved.intelligence;
  return Object.freeze({ok:true,suggestion:Object.freeze({shortSummaryAr:intelligence.primaryIssue.shortSummaryAr}),intelligence,networkRequested:false,persisted:false,providerCalled:false});
}
module.exports=Object.freeze({createLocalPreviewSuggestion});

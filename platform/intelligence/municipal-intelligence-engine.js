'use strict';

const { validateShortSummaryAr, LOW_CONFIDENCE_FALLBACK_AR } = require('../ai/arabic-summary-policy');
const { FORBIDDEN_ACTIONS, validateMunicipalIntelligence, RISK_INDICATORS } = require('./municipal-intelligence-contract');
const { resolveTaxonomy, resolveTaxonomyWithFallback } = require('./municipal-taxonomy');
const { resolveExplainablePriority } = require('./explainable-priority-resolver');

const MAX_DETECTED_ISSUES=5;
const ISSUE_CONFIDENCE_THRESHOLD=0.55;
const OVERLAP_POLICY='Same-code issues are merged; the highest-confidence representation is retained.';
const SEVERITY_RANK=Object.freeze({UNKNOWN:0,LOW:1,MEDIUM:2,HIGH:3,CRITICAL:4});
function fail(code,reason){return Object.freeze({ok:false,errorCode:code,reason});}
function clean(value){return typeof value==='string'?value.trim():'';}

function validateRawIssue(issue={}){
  if(!clean(issue.categoryCode)||!Number.isFinite(issue.confidence)||issue.confidence<0||issue.confidence>1||!Number.isFinite(issue.severityScore)||!Object.hasOwn(SEVERITY_RANK,issue.severity))return fail('MUNICIPAL_ANALYSIS_ISSUE_INVALID','Provider issue structure is invalid.');
  const summary=validateShortSummaryAr(issue.shortSummaryAr,{confidence:issue.confidence});if(!summary.allowed)return fail('MUNICIPAL_ANALYSIS_SUMMARY_INVALID',summary.code);
  const serialized=JSON.stringify(issue).toUpperCase();
  if(FORBIDDEN_ACTIONS.some(command=>serialized.includes(command))||/(?:API[_-]?KEY|PRIVATE[_-]?KEY|BEARER\s|RAW[_-]?PROMPT)/i.test(serialized))return fail('MUNICIPAL_ANALYSIS_UNSAFE','Provider issue contains prohibited content.');
  return Object.freeze({ok:true});
}

function normalizeIssue(issue,analysisId,index){
  // Exact categoryCode match stays first priority; only an unsupported code
  // falls through to the conservative label/summary fallback match (defense
  // in depth -- the schema/prompt now constrain new provider calls to the
  // allowlist, this covers a provider that ignores it).
  const evidenceText=[issue.categoryLabelAr,issue.shortSummaryAr].filter(v=>typeof v==='string').join(' ');
  const {entry:taxonomy,usedFallback}=resolveTaxonomyWithFallback(issue.categoryCode,evidenceText);
  const low=issue.confidence<ISSUE_CONFIDENCE_THRESHOLD;
  const warnings=[...(Array.isArray(issue.warnings)?issue.warnings:[])];
  if(taxonomy.code==='UNKNOWN'&&String(issue.categoryCode).toUpperCase()!=='UNKNOWN')warnings.push('UNSUPPORTED_CATEGORY_MAPPED_TO_UNKNOWN');
  if(usedFallback)warnings.push('FALLBACK_CATEGORY_MATCH_USED');
  if(low)warnings.push('LOW_CONFIDENCE_NOT_AUTO_SELECTABLE');
  const safety=taxonomy.safetyFlags;
  return Object.freeze({issueId:`${analysisId}-${taxonomy.code.toLowerCase()}-${index+1}`,issueCode:taxonomy.code,issueLabelAr:taxonomy.labelAr,
    shortSummaryAr:low?LOW_CONFIDENCE_FALLBACK_AR:issue.shortSummaryAr,categoryCode:taxonomy.parentCategory,categoryLabelAr:taxonomy.labelAr,
    ...(issue.subcategoryCode?{subcategoryCode:issue.subcategoryCode}:{}),...(issue.subcategoryLabelAr?{subcategoryLabelAr:issue.subcategoryLabelAr}:{}),
    severity:taxonomy.code==='UNKNOWN'?'UNKNOWN':issue.severity,severityScore:taxonomy.code==='UNKNOWN'?0:issue.severityScore,confidence:issue.confidence,
    ...(issue.boundingRegion?{boundingRegion:Object.freeze({...issue.boundingRegion})}:{}),recommendedActionAr:taxonomy.treatmentGuidanceAr,suggestedDepartment:taxonomy.department,
    publicSafetyRisk:safety.includes('PUBLIC_SAFETY'),trafficImpact:safety.includes('TRAFFIC_OBSTRUCTION')?'HIGH':safety.includes('ACCESSIBILITY_IMPACT')?'MEDIUM':'NONE',
    requiresHumanReview:true,warnings:Object.freeze([...new Set(warnings)])});
}

function createMunicipalIntelligence({analysis,organizationId,observationId}={}){
  if(!analysis||analysis.ok!==true||!clean(analysis.analysisId)||!clean(organizationId)||!clean(observationId))return fail('MUNICIPAL_ANALYSIS_CONTEXT_INVALID','Validated analysis and organization/observation context are required.');
  if(analysis.controlledImagePayload||analysis.imageBytes||analysis.rawPrompt)return fail('MUNICIPAL_ANALYSIS_SENSITIVE_INPUT','Image bytes and raw prompts are prohibited.');
  const rawIssues=Array.isArray(analysis.detectedIssues)&&analysis.detectedIssues.length?analysis.detectedIssues:[analysis];
  for(const issue of rawIssues){const valid=validateRawIssue(issue);if(!valid.ok)return valid;}
  const byCode=new Map();
  for(const issue of rawIssues){const code=resolveTaxonomy(issue.categoryCode).code;const current=byCode.get(code);if(!current||issue.confidence>current.confidence)byCode.set(code,issue);}
  const deduplicated=[...byCode.values()].slice(0,MAX_DETECTED_ISSUES);
  let detectedIssues=deduplicated.map((issue,index)=>normalizeIssue(issue,analysis.analysisId,index));
  if(!detectedIssues.length)return fail('MUNICIPAL_ANALYSIS_NO_ISSUES','No analyzable issue was provided.');
  const selectable=detectedIssues.filter(issue=>issue.confidence>=ISSUE_CONFIDENCE_THRESHOLD&&issue.issueCode!=='UNKNOWN');
  const candidates=selectable.length?selectable:detectedIssues;
  const primary=[...candidates].sort((a,b)=>(SEVERITY_RANK[b.severity]-SEVERITY_RANK[a.severity])||(b.severityScore-a.severityScore)||(b.confidence-a.confidence))[0];
  const taxonomy=resolveTaxonomy(primary.issueCode);const riskCodes=[...new Set(detectedIssues.flatMap(issue=>resolveTaxonomy(issue.issueCode).safetyFlags))];if(!riskCodes.length)riskCodes.push('UNKNOWN');
  const multiple=detectedIssues.length>1;const confidence=Math.min(...detectedIssues.map(issue=>issue.confidence));const imageQuality=analysis.imageQuality||'UNUSABLE';
  const trafficImpact=detectedIssues.some(issue=>issue.trafficImpact==='HIGH')?'HIGH':detectedIssues.some(issue=>issue.trafficImpact==='MEDIUM')?'MEDIUM':'NONE';
  const priority=resolveExplainablePriority({severity:primary.severity,riskIndicators:riskCodes,trafficImpact,criticalInfrastructureImpact:riskCodes.some(code=>['ELECTRICAL_HAZARD','FLOODING_RISK','STRUCTURAL_RISK'].includes(code)),confidence,imageQuality,multipleIssuesDetected:multiple,unclearEvidence:primary.issueCode==='UNKNOWN'});
  const warnings=[];if(rawIssues.length>MAX_DETECTED_ISSUES)warnings.push('MAX_ISSUES_TRUNCATED');if(rawIssues.length!==byCode.size)warnings.push('DUPLICATE_ISSUES_SUPPRESSED');
  if(detectedIssues.some(issue=>issue.confidence<ISSUE_CONFIDENCE_THRESHOLD))warnings.push('LOW_CONFIDENCE_SECONDARY_REQUIRES_REVIEW');
  if(clean(analysis.responsibleDepartmentSuggestion)&&clean(analysis.responsibleDepartmentSuggestion)!==taxonomy.department)warnings.push('PROVIDER_DEPARTMENT_SUGGESTION_OVERRIDDEN_BY_TAXONOMY');
  if(['POOR','UNUSABLE'].includes(imageQuality))warnings.push('IMAGE_QUALITY_REQUIRES_REVIEW');
  const result={intelligenceId:`intel-${analysis.analysisId}`,analysisId:analysis.analysisId,organizationId,observationId,detectedIssues:Object.freeze(detectedIssues),primaryIssue:primary,
    multipleIssuesDetected:multiple,suggestedDepartment:taxonomy.department,suggestedServiceCategory:taxonomy.parentCategory,suggestedSubcategory:taxonomy.code,
    severity:primary.severity,prioritySuggestion:priority,riskIndicators:Object.freeze(riskCodes.map(code=>Object.freeze({code,reasonAr:RISK_INDICATORS[code]||RISK_INDICATORS.UNKNOWN}))),
    publicSafetyRisk:riskCodes.includes('PUBLIC_SAFETY'),trafficImpact,requiresSiteIsolation:riskCodes.some(code=>['PUBLIC_SAFETY','ELECTRICAL_HAZARD','FALL_RISK','TRAFFIC_OBSTRUCTION'].includes(code)),
    requiresPowerIsolation:detectedIssues.some(issue=>resolveTaxonomy(issue.issueCode).powerIsolation===true),requiresSpecialEquipment:detectedIssues.some(issue=>resolveTaxonomy(issue.issueCode).specialEquipment===true),
    suggestedTreatment:taxonomy.treatmentGuidanceAr,suggestedResponseWindow:taxonomy.responseWindow,confidence,requiresHumanReview:true,warnings:Object.freeze([...new Set(warnings)]),
    provenance:Object.freeze({sourceAnalysisId:analysis.analysisId,engineVersion:'1.0.0',advisoryOnly:true,automaticActions:false,provider:clean(analysis.provider)||'UNKNOWN',model:clean(analysis.model)||'UNKNOWN'})};
  const validation=validateMunicipalIntelligence(result);if(!validation.allowed)return fail(validation.code,validation.reason);
  return Object.freeze({ok:true,intelligence:Object.freeze(result),policy:Object.freeze({maxDetectedIssues:MAX_DETECTED_ISSUES,confidenceThreshold:ISSUE_CONFIDENCE_THRESHOLD,overlapPolicy:OVERLAP_POLICY})});
}

module.exports=Object.freeze({MAX_DETECTED_ISSUES,ISSUE_CONFIDENCE_THRESHOLD,OVERLAP_POLICY,validateRawIssue,createMunicipalIntelligence});

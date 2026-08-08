'use strict';

const DEPARTMENTS = Object.freeze({
  ROADS:'إدارة الطرق', LIGHTING:'إدارة الإنارة', PARKS_AND_LANDSCAPING:'إدارة الحدائق والتشجير', CLEANLINESS:'إدارة النظافة',
  WATER_SERVICES:'إدارة خدمات المياه', MUNICIPAL_ASSETS:'إدارة الأصول البلدية', TRAFFIC_SAFETY:'إدارة السلامة المرورية', GENERAL_REVIEW:'المراجعة البلدية العامة', UNKNOWN:'غير محدد',
});
const RESPONSE_WINDOWS = Object.freeze(['IMMEDIATE','WITHIN_4_HOURS','WITHIN_24_HOURS','WITHIN_72_HOURS','PLANNED_MAINTENANCE','MANUAL_REVIEW_REQUIRED','UNKNOWN']);
const RISK_INDICATORS = Object.freeze({
  PUBLIC_SAFETY:'خطر محتمل على السلامة العامة', TRAFFIC_OBSTRUCTION:'تأثير محتمل على حركة المرور', ELECTRICAL_HAZARD:'خطر كهربائي محتمل', FALL_RISK:'خطر سقوط محتمل',
  FLOODING_RISK:'خطر تجمع أو تدفق المياه', STRUCTURAL_RISK:'خطر إنشائي محتمل', ENVIRONMENTAL_IMPACT:'أثر بيئي محتمل', VISUAL_POLLUTION:'تشوه بصري محتمل', ACCESSIBILITY_IMPACT:'تأثير محتمل على سهولة الوصول', UNKNOWN:'يتطلب تقييم المخاطر ميدانياً',
});
const MULTI_ISSUE_OPTIONS = Object.freeze(['CREATE_SINGLE','CREATE_MULTIPLE','IGNORE_SECONDARY','MANUAL_REVIEW']);
const FORBIDDEN_ACTIONS = Object.freeze(['SAVE_OBSERVATION','CREATE_OBSERVATION','ASSIGN_CONTRACTOR','UPDATE_STATUS','COMPLETE','CLOSE','DELETE']);

function validateMunicipalIntelligence(value = {}) {
  const required = ['intelligenceId','analysisId','organizationId','observationId','detectedIssues','primaryIssue','suggestedDepartment','suggestedServiceCategory','severity','prioritySuggestion','riskIndicators','suggestedTreatment','suggestedResponseWindow','warnings','provenance'];
  const missing = required.filter(field => value[field] === undefined || value[field] === null || value[field] === '');
  if (missing.length) return Object.freeze({ allowed:false, code:'MUNICIPAL_INTELLIGENCE_FIELD_REQUIRED', reason:`Missing fields: ${missing.join(', ')}` });
  if (!Array.isArray(value.detectedIssues) || !value.detectedIssues.length || !Array.isArray(value.riskIndicators) || !Array.isArray(value.warnings)) return Object.freeze({ allowed:false, code:'MUNICIPAL_INTELLIGENCE_ARRAY_INVALID', reason:'Issue, risk, and warning arrays are required.' });
  if (!Object.hasOwn(DEPARTMENTS, value.suggestedDepartment) || !RESPONSE_WINDOWS.includes(value.suggestedResponseWindow)) return Object.freeze({ allowed:false, code:'MUNICIPAL_INTELLIGENCE_ENUM_INVALID', reason:'Department or response window is invalid.' });
  const serialized = JSON.stringify(value).toUpperCase();
  if (FORBIDDEN_ACTIONS.some(command => serialized.includes(command)) || /(?:API[_-]?KEY|PRIVATE[_-]?KEY|BEARER\s)/i.test(serialized)) return Object.freeze({ allowed:false, code:'MUNICIPAL_INTELLIGENCE_UNSAFE_OUTPUT', reason:'Executable commands or secrets are prohibited.' });
  if (value.provenance?.advisoryOnly !== true || value.provenance?.automaticActions !== false) return Object.freeze({ allowed:false, code:'MUNICIPAL_INTELLIGENCE_ADVISORY_REQUIRED', reason:'Intelligence must be advisory-only.' });
  return Object.freeze({ allowed:true, code:'MUNICIPAL_INTELLIGENCE_VALID', reason:'Municipal intelligence contract is valid.' });
}

module.exports = Object.freeze({ DEPARTMENTS, RESPONSE_WINDOWS, RISK_INDICATORS, MULTI_ISSUE_OPTIONS, FORBIDDEN_ACTIONS, validateMunicipalIntelligence });

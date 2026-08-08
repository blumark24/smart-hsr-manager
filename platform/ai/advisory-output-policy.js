'use strict';

const FORBIDDEN_COMMANDS = Object.freeze(['SAVE_OBSERVATION','CREATE_OBSERVATION','ASSIGN_CONTRACTOR','UPDATE_STATUS','COMPLETE','CLOSE','DELETE']);
const FORBIDDEN_FIELDS = Object.freeze(['command','commands','workflowAction','workflowTransition','firestoreWrite','autoSave','applyClassification','applyPriority']);
const ALLOWED_RESULT_FIELDS = Object.freeze(['ok','analysisId','shortSummaryAr','categoryCode','categoryLabelAr','subcategoryCode','subcategoryLabelAr','severity','severityScore','prioritySuggestion','responsibleDepartmentSuggestion','recommendedActionAr','confidence','imageQuality','requiresHumanReview','warnings','provider','model','modelVersion','processingTimeMs','errorCode','reason']);

function validateAdvisoryOutput(result = {}) {
  const keys = Object.keys(result);
  const forbiddenField = keys.find(key => FORBIDDEN_FIELDS.includes(key) || !ALLOWED_RESULT_FIELDS.includes(key));
  if (forbiddenField) return Object.freeze({ allowed: false, code: 'AI_WORKFLOW_OUTPUT_DENIED', reason: `Provider output field ${forbiddenField} is not advisory.` });
  const serialized = JSON.stringify(result).toUpperCase();
  const command = FORBIDDEN_COMMANDS.find(value => serialized.includes(value));
  if (command) return Object.freeze({ allowed: false, code: 'AI_WORKFLOW_COMMAND_DENIED', reason: 'Provider output contains a prohibited workflow command.' });
  return Object.freeze({ allowed: true, code: 'AI_ADVISORY_OUTPUT_VALID', reason: 'Output contains advisory fields only.' });
}

module.exports = Object.freeze({ FORBIDDEN_COMMANDS, FORBIDDEN_FIELDS, ALLOWED_RESULT_FIELDS, validateAdvisoryOutput });

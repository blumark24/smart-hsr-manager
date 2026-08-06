'use strict';

const DESCRIPTION_SOURCES = Object.freeze(['MANUAL', 'AI_ASSISTED']);
const INSPECTOR_OPTIONS = Object.freeze(['USE_SUGGESTION', 'EDIT_SUGGESTION', 'IGNORE_SUGGESTION', 'WRITE_MANUALLY']);
const AUTOMATION_PROHIBITIONS = Object.freeze({
  automaticSave: false, automaticObservationCreation: false, automaticClassificationApplication: false,
  automaticPriorityApplication: false, automaticAssignment: false, automaticStatusTransition: false,
  automaticCompletion: false, automaticClosure: false,
});

function createSuggestionProvenance({ descriptionSource = 'MANUAL', aiSuggestionUsed = false, aiSuggestionEdited = false, analysisId } = {}) {
  if (!DESCRIPTION_SOURCES.includes(descriptionSource)) return Object.freeze({ allowed: false, code: 'AI_PROVENANCE_SOURCE_INVALID', provenance: null });
  if (descriptionSource === 'MANUAL' && (aiSuggestionUsed || aiSuggestionEdited || analysisId)) return Object.freeze({ allowed: false, code: 'AI_PROVENANCE_MANUAL_CONFLICT', provenance: null });
  if (aiSuggestionEdited && !aiSuggestionUsed) return Object.freeze({ allowed: false, code: 'AI_PROVENANCE_EDIT_CONFLICT', provenance: null });
  const provenance = { descriptionSource, aiSuggestionUsed: aiSuggestionUsed === true, aiSuggestionEdited: aiSuggestionEdited === true };
  if (analysisId) provenance.analysisId = String(analysisId);
  return Object.freeze({ allowed: true, code: 'AI_PROVENANCE_VALID', provenance: Object.freeze(provenance) });
}

function advisoryEnvelope(result) {
  return Object.freeze({ result, advisoryOnly: true, requiresExplicitHumanAction: true, inspectorOptions: INSPECTOR_OPTIONS, automation: AUTOMATION_PROHIBITIONS });
}

module.exports = Object.freeze({ DESCRIPTION_SOURCES, INSPECTOR_OPTIONS, AUTOMATION_PROHIBITIONS, createSuggestionProvenance, advisoryEnvelope });

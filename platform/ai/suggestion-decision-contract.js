'use strict';

const SUGGESTION_STATES = Object.freeze(['MANUAL','AI_SUGGESTED','AI_ACCEPTED','AI_EDITED','AI_IGNORED']);
function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
function frozenSession(value) { return Object.freeze({ ...value, persisted: false, automaticSave: false }); }
function failure(code, reason, session = null) { return Object.freeze({ allowed: false, code, reason, session }); }

function createSuggestionSession({ sessionId, observationId, analysisResult } = {}) {
  if (!clean(sessionId) || !clean(observationId)) return failure('AI_SUGGESTION_SESSION_CONTEXT_REQUIRED', 'Session and observation identifiers are required.');
  if (!analysisResult?.ok || !clean(analysisResult.analysisId) || !clean(analysisResult.shortSummaryAr)) return failure('AI_SUGGESTION_RESULT_REQUIRED', 'A valid advisory result is required.');
  return Object.freeze({ allowed: true, code: 'AI_SUGGESTION_SESSION_CREATED', session: frozenSession({ sessionId: clean(sessionId), observationId: clean(observationId), state: 'AI_SUGGESTED', analysisId: clean(analysisResult.analysisId), suggestedDescription: clean(analysisResult.shortSummaryAr), description: '', descriptionSource: 'AI_ASSISTED', aiSuggestionUsed: false, aiSuggestionEdited: false }) });
}

function acceptSuggestion(session) {
  if (session?.state !== 'AI_SUGGESTED') return failure('AI_SUGGESTION_STATE_INVALID', 'Only a pending suggestion may be accepted.', session || null);
  return Object.freeze({ allowed: true, code: 'AI_SUGGESTION_ACCEPTED', session: frozenSession({ ...session, state: 'AI_ACCEPTED', description: session.suggestedDescription, descriptionSource: 'AI_ASSISTED', aiSuggestionUsed: true, aiSuggestionEdited: false }) });
}

function editSuggestion(session, editedDescription) {
  if (!['AI_SUGGESTED','AI_ACCEPTED'].includes(session?.state) || !clean(editedDescription)) return failure('AI_SUGGESTION_EDIT_INVALID', 'A pending/accepted suggestion and edited description are required.', session || null);
  return Object.freeze({ allowed: true, code: 'AI_SUGGESTION_EDITED', session: frozenSession({ ...session, state: 'AI_EDITED', description: clean(editedDescription), descriptionSource: 'AI_ASSISTED', aiSuggestionUsed: true, aiSuggestionEdited: true }) });
}

function ignoreSuggestion(session) {
  if (!['AI_SUGGESTED','AI_ACCEPTED','AI_EDITED'].includes(session?.state)) return failure('AI_SUGGESTION_IGNORE_INVALID', 'An AI suggestion session is required.', session || null);
  return Object.freeze({ allowed: true, code: 'AI_SUGGESTION_IGNORED', session: frozenSession({ ...session, state: 'AI_IGNORED', description: '', descriptionSource: 'MANUAL', aiSuggestionUsed: false, aiSuggestionEdited: false }) });
}

function useManualDescription(session, description) {
  if (!clean(description)) return failure('AI_MANUAL_DESCRIPTION_REQUIRED', 'Manual description is required.', session || null);
  return Object.freeze({ allowed: true, code: 'AI_MANUAL_DESCRIPTION_SELECTED', session: frozenSession({ sessionId: clean(session?.sessionId) || null, observationId: clean(session?.observationId) || null, state: 'MANUAL', analysisId: clean(session?.analysisId) || null, suggestedDescription: clean(session?.suggestedDescription) || null, description: clean(description), descriptionSource: 'MANUAL', aiSuggestionUsed: false, aiSuggestionEdited: false }) });
}

module.exports = Object.freeze({ SUGGESTION_STATES, createSuggestionSession, acceptSuggestion, editSuggestion, ignoreSuggestion, useManualDescription });

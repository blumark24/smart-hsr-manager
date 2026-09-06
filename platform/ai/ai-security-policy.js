'use strict';

const { validateShortSummaryAr, LOW_CONFIDENCE_FALLBACK_AR } = require('./arabic-summary-policy');
const { SEVERITIES, PRIORITIES, IMAGE_QUALITIES } = require('./ai-provider-contract');
const { ASSET_VALUES, DEFECT_VALUES } = require('../intelligence/municipal-taxonomy');
const { MAX_EVIDENCE_STATEMENTS, MAX_UNCERTAINTIES } = require('./server/municipal-vision-prompt');

const ALLOWED_IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_PAYLOAD_BYTES = 700 * 1024;
const DEFAULT_TIMEOUT_MS = 15000;
const CONFIDENCE_THRESHOLD = 0.65;
const PRIVATE_REFERENCE = /^(?:organizations\/[A-Za-z0-9_-]+\/observations\/[A-Za-z0-9_-]+\/(?:before|after|thumbnail)\/[A-Za-z0-9_-]+|(?:[A-Za-z0-9_-]+\/)*observations\/[A-Za-z0-9_-]+\/(?:before|after)\/[A-Za-z0-9_\-/.]+\.(?:jpe?g|png|webp)|local-demo:\/\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)$/i;

function decision(allowed, code, reason) { return Object.freeze({ allowed, code, reason }); }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function validateAnalyzeInput(input = {}, authenticatedContext = {}) {
  for (const [field, code] of [['organizationId','AI_ORGANIZATION_REQUIRED'],['observationId','AI_OBSERVATION_REQUIRED'],['actorId','AI_ACTOR_REQUIRED'],['actorRole','AI_ACTOR_ROLE_REQUIRED'],['correlationId','AI_CORRELATION_REQUIRED']]) {
    if (!text(input[field])) return decision(false, code, `${field} is required.`);
  }
  if (!text(authenticatedContext.organizationId) || text(authenticatedContext.organizationId) !== text(input.organizationId)) return decision(false, 'AI_TENANT_SCOPE_DENIED', 'Authenticated organization must exactly match the request organization.');
  if (text(authenticatedContext.actorId) && text(authenticatedContext.actorId) !== text(input.actorId)) return decision(false, 'AI_ACTOR_SCOPE_DENIED', 'Authenticated actor must match the request actor.');
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(text(input.imageContentType).toLowerCase())) return decision(false, 'AI_IMAGE_MIME_DENIED', 'Only JPEG, PNG, and WebP images are allowed.');
  const payload = input.controlledImagePayload;
  const payloadSize = payload instanceof Uint8Array ? payload.byteLength : Number(input.imagePayloadSize || 0);
  if (payloadSize > MAX_IMAGE_PAYLOAD_BYTES) return decision(false, 'AI_IMAGE_TOO_LARGE', 'Image payload exceeds the configured limit.');
  const reference = text(input.imageReference);
  if (!reference && !(payload instanceof Uint8Array && payload.byteLength)) return decision(false, 'AI_PRIVATE_IMAGE_REQUIRED', 'A validated private reference or controlled payload is required.');
  if (reference && (!PRIVATE_REFERENCE.test(reference) || /^https?:\/\//i.test(reference))) return decision(false, 'AI_PUBLIC_IMAGE_REFERENCE_DENIED', 'Public or uncontrolled image references are prohibited.');
  return decision(true, 'AI_INPUT_VALID', 'Analyze-image input satisfies isolated security policy.');
}

function validateAIOutput(output = {}) {
  if (!output || output.ok !== true) return decision(false, 'AI_OUTPUT_NOT_SUCCESS', 'Provider output is not a successful structured result.');
  for (const field of ['analysisId','shortSummaryAr','categoryCode','categoryLabelAr','recommendedActionAr','provider','model','modelVersion']) {
    if (!text(output[field])) return decision(false, 'AI_OUTPUT_FIELD_REQUIRED', `Output field ${field} is required.`);
  }
  if (!SEVERITIES.includes(output.severity) || !PRIORITIES.includes(output.prioritySuggestion) || !IMAGE_QUALITIES.includes(output.imageQuality)) return decision(false, 'AI_OUTPUT_ENUM_INVALID', 'Output contains an unsupported enum value.');
  if (!Number.isFinite(output.severityScore) || output.severityScore < 0 || output.severityScore > 100) return decision(false, 'AI_SEVERITY_SCORE_INVALID', 'Severity score must be between 0 and 100.');
  if (!Number.isFinite(output.confidence) || output.confidence < 0 || output.confidence > 1) return decision(false, 'AI_CONFIDENCE_INVALID', 'Confidence must be between 0 and 1.');
  if (!Number.isFinite(output.processingTimeMs) || output.processingTimeMs < 0 || !Array.isArray(output.warnings) || typeof output.requiresHumanReview !== 'boolean') return decision(false, 'AI_OUTPUT_SHAPE_INVALID', 'Output timing, warnings, or review flag is invalid.');
  const summary = validateShortSummaryAr(output.shortSummaryAr, { confidence: output.confidence }); if (!summary.allowed) return summary;
  if (output.confidence < CONFIDENCE_THRESHOLD && (output.shortSummaryAr !== LOW_CONFIDENCE_FALLBACK_AR || output.requiresHumanReview !== true)) return decision(false, 'AI_LOW_CONFIDENCE_POLICY_VIOLATION', 'Low confidence must use the fallback and require human review.');
  // visualEvidence/uncertainties (Municipal Decision Intelligence hardening):
  // both fields are OPTIONAL at this validator so every pre-existing
  // provider/fixture that never mentions them (offline Gemini fixtures,
  // older sprint tests) stays valid exactly as before. When a provider DOES
  // supply visualEvidence -- which the OpenAI schema now requires on every
  // real call -- it must be fully well-formed: a closed-taxonomy-derived
  // asset/defect pair (never a second, independently maintained enum; see
  // ASSET_VALUES/DEFECT_VALUES in municipal-taxonomy.js) and 1-4 concise
  // evidence statements. This is where "must not fabricate certainty"
  // becomes enforceable: a present-but-empty evidenceStatements array, an
  // asset/defect outside the approved municipal vocabulary, or a
  // non-string/oversized statement is rejected outright, never silently
  // coerced or dropped.
  if (output.visualEvidence !== undefined) {
    const evidence = output.visualEvidence;
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return decision(false, 'AI_VISUAL_EVIDENCE_INVALID', 'visualEvidence must be a structured object.');
    if (!ASSET_VALUES.includes(evidence.affectedAsset)) return decision(false, 'AI_VISUAL_EVIDENCE_ASSET_INVALID', 'affectedAsset is not an approved municipal asset value.');
    if (!DEFECT_VALUES.includes(evidence.visibleDefect)) return decision(false, 'AI_VISUAL_EVIDENCE_DEFECT_INVALID', 'visibleDefect is not an approved visible-defect value.');
    const statements = evidence.evidenceStatements;
    if (!Array.isArray(statements) || statements.length < 1 || statements.length > MAX_EVIDENCE_STATEMENTS) return decision(false, 'AI_VISUAL_EVIDENCE_STATEMENTS_COUNT_INVALID', `evidenceStatements must contain between 1 and ${MAX_EVIDENCE_STATEMENTS} items.`);
    if (statements.some(statement => typeof statement !== 'string' || !statement.trim() || statement.length > 300)) return decision(false, 'AI_VISUAL_EVIDENCE_STATEMENTS_SHAPE_INVALID', 'Each evidence statement must be a short, non-empty string.');
  }
  if (output.uncertainties !== undefined) {
    if (!Array.isArray(output.uncertainties) || output.uncertainties.length > MAX_UNCERTAINTIES) return decision(false, 'AI_UNCERTAINTIES_COUNT_INVALID', `uncertainties must contain at most ${MAX_UNCERTAINTIES} items.`);
    if (output.uncertainties.some(item => typeof item !== 'string' || !item.trim() || item.length > 300)) return decision(false, 'AI_UNCERTAINTIES_SHAPE_INVALID', 'Each uncertainty must be a short, non-empty string.');
  }
  const serialized = JSON.stringify(output);
  if (/(?:api[_-]?key|private[_-]?key|authorization|bearer\s|secret)/i.test(serialized)) return decision(false, 'AI_OUTPUT_SENSITIVE_DATA', 'Provider output contains sensitive material.');
  return decision(true, 'AI_OUTPUT_VALID', 'Provider output matches the canonical schema.');
}

function createAuditSafeMetadata(input = {}, result = {}) {
  return Object.freeze({ organizationId: text(input.organizationId), observationId: text(input.observationId), actorId: text(input.actorId), actorRole: text(input.actorRole), correlationId: text(input.correlationId),
    operation: 'ANALYZE_OBSERVATION_IMAGE', provider: text(result.provider) || null, analysisId: text(result.analysisId) || null, ok: result.ok === true, errorCode: text(result.errorCode) || null });
}

function createControlledProviderInput(input = {}) {
  const controlled = {
    organizationId: text(input.organizationId), observationId: text(input.observationId), actorId: text(input.actorId), actorRole: text(input.actorRole),
    imageReference: text(input.imageReference) || null, imageContentType: text(input.imageContentType).toLowerCase(), correlationId: text(input.correlationId),
    untrustedContext: Object.freeze({ existingDescription: text(input.existingDescription) || null, locationContext: input.locationContext && typeof input.locationContext === 'object' ? Object.freeze({ ...input.locationContext }) : null, instructionsAuthoritative: false }),
  };
  if (input.controlledImagePayload instanceof Uint8Array) controlled.controlledImagePayload = new Uint8Array(input.controlledImagePayload);
  return Object.freeze(controlled);
}

function retryEligibility(errorCode) { return Object.freeze({ eligible: ['AI_TIMEOUT','AI_PROVIDER_UNAVAILABLE','AI_RATE_LIMITED'].includes(errorCode), maxAttempts: 1 }); }

const PROMPT_SAFETY = Object.freeze({ metadataAsDataOnly: true, existingTextAsUntrusted: true, ignoreEmbeddedInstructions: true, noToolExecution: true, noWorkflowAuthority: true });

module.exports = Object.freeze({ ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_PAYLOAD_BYTES, DEFAULT_TIMEOUT_MS, CONFIDENCE_THRESHOLD, PROMPT_SAFETY, validateAnalyzeInput, validateAIOutput, createAuditSafeMetadata, createControlledProviderInput, retryEligibility });

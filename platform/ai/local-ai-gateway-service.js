'use strict';

const { evaluateLocalAIRuntime } = require('./local-ai-runtime-guard');
const { validateProviderCapabilities } = require('./provider-capability-contract');
const { createProviderRouter } = require('./provider-router');
const { createAuditSafeMetadata } = require('./ai-security-policy');
const { evaluateAIStorageInput } = require('./ai-storage-boundary');
const { validateAdvisoryOutput } = require('./advisory-output-policy');

const OPERATIONS = Object.freeze(['ANALYZE_OBSERVATION_IMAGE','VERIFY_BEFORE_AFTER','SUGGEST_PRIORITY']);
function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
function elapsed(clock, started) { return Math.max(0, Number(clock()) - started); }

function safeAudit(request = {}, result = {}, operation = request.operation) {
  return Object.freeze({ ...createAuditSafeMetadata(request, result), requestId: clean(request.requestId), operation: operation || null });
}

function response(request, operation, started, clock, value = {}) {
  const output = { ok: value.ok === true, requestId: clean(request?.requestId), correlationId: clean(request?.correlationId), operation,
    warnings: Object.freeze([...(value.warnings || [])]), auditMetadata: safeAudit(request, value.result || value, operation), processingTimeMs: elapsed(clock, started) };
  if (value.ok) output.result = value.result;
  else { output.errorCode = value.errorCode || 'AI_GATEWAY_DENIED'; output.reason = value.reason || 'AI gateway request was denied.'; }
  return Object.freeze(output);
}

function validateEnvelope(request, expectedOperation) {
  for (const field of ['requestId','correlationId','organizationId','observationId','actorId','actorRole','requestedAt']) if (!clean(request?.[field])) return Object.freeze({ allowed: false, code: 'AI_GATEWAY_REQUEST_INVALID', reason: `Request field ${field} is required.` });
  if (request.operation !== expectedOperation || !OPERATIONS.includes(request.operation)) return Object.freeze({ allowed: false, code: 'AI_GATEWAY_OPERATION_INVALID', reason: 'Request operation is invalid.' });
  if (!Number.isFinite(Date.parse(request.requestedAt))) return Object.freeze({ allowed: false, code: 'AI_GATEWAY_REQUEST_TIME_INVALID', reason: 'requestedAt must be an ISO-compatible timestamp.' });
  return Object.freeze({ allowed: true, code: 'AI_GATEWAY_REQUEST_VALID', reason: 'Gateway request envelope is valid.' });
}

function createLocalAIGatewayService({ runtime = {}, selectedProvider = null, providers = {}, resolveAuthenticatedContext = async () => null, clock = () => Date.now() } = {}) {
  async function analyzeObservationImage(request) {
    const started = Number(clock());
    const runtimeDecision = evaluateLocalAIRuntime(runtime); if (!runtimeDecision.allowed) return response(request, 'ANALYZE_OBSERVATION_IMAGE', started, clock, { ok: false, errorCode: runtimeDecision.code, reason: runtimeDecision.reason });
    const envelope = validateEnvelope(request, 'ANALYZE_OBSERVATION_IMAGE'); if (!envelope.allowed) return response(request, 'ANALYZE_OBSERVATION_IMAGE', started, clock, { ok: false, errorCode: envelope.code, reason: envelope.reason });
    const trusted = await resolveAuthenticatedContext(request);
    if (!trusted || trusted.organizationId !== request.organizationId || trusted.actorId !== request.actorId) return response(request, request.operation, started, clock, { ok: false, errorCode: 'AI_GATEWAY_AUTH_CONTEXT_DENIED', reason: 'Trusted actor context does not match the request.' });
    const storage = evaluateAIStorageInput(request); if (!storage.allowed) return response(request, request.operation, started, clock, { ok: false, errorCode: storage.code, reason: storage.reason });
    const registration = providers[selectedProvider];
    if (!selectedProvider || !registration) return response(request, request.operation, started, clock, { ok: false, errorCode: 'AI_PROVIDER_NOT_CONFIGURED', reason: 'No local provider is configured.' });
    const capabilities = validateProviderCapabilities(registration.capabilities, request.operation); if (!capabilities.allowed) return response(request, request.operation, started, clock, { ok: false, errorCode: capabilities.code, reason: capabilities.reason });
    const routerProviders = { [selectedProvider]: { ...registration, capabilities: { vision: registration.capabilities.supportsVision } } };
    const router = createProviderRouter({ selectedProvider, providers: routerProviders, timeoutMs: registration.capabilities.timeoutMs });
    const routed = await router.analyzeObservationImage({ ...request, imageContentType: request.imageContentType || 'image/jpeg' }, trusted);
    if (!routed.result.ok) return response(request, request.operation, started, clock, { ok: false, errorCode: routed.result.errorCode, reason: routed.result.reason, warnings: routed.result.warnings });
    const advisory = validateAdvisoryOutput(routed.result); if (!advisory.allowed) return response(request, request.operation, started, clock, { ok: false, errorCode: advisory.code, reason: advisory.reason });
    return response(request, request.operation, started, clock, { ok: true, result: routed.result, warnings: routed.result.warnings });
  }

  async function unavailableOperation(request, operation) {
    const started = Number(clock());
    const runtimeDecision = evaluateLocalAIRuntime(runtime); if (!runtimeDecision.allowed) return response(request, operation, started, clock, { ok: false, errorCode: runtimeDecision.code, reason: runtimeDecision.reason });
    const envelope = validateEnvelope(request, operation); if (!envelope.allowed) return response(request, operation, started, clock, { ok: false, errorCode: envelope.code, reason: envelope.reason });
    const registration = providers[selectedProvider];
    if (!registration) return response(request, operation, started, clock, { ok: false, errorCode: 'AI_PROVIDER_NOT_CONFIGURED', reason: 'No local provider is configured.' });
    const capabilities = validateProviderCapabilities(registration.capabilities, operation); if (!capabilities.allowed) return response(request, operation, started, clock, { ok: false, errorCode: capabilities.code, reason: capabilities.reason });
    return response(request, operation, started, clock, { ok: false, errorCode: 'AI_OPERATION_NOT_ACTIVATED', reason: 'This advisory operation is contracted but not activated.' });
  }

  async function health() {
    const started = Number(clock()); const runtimeDecision = evaluateLocalAIRuntime(runtime);
    return Object.freeze({ ok: runtimeDecision.allowed, status: runtimeDecision.code, localOnly: true, network: false, firebase: false, persistence: false, processingTimeMs: elapsed(clock, started) });
  }

  return Object.freeze({ health, analyzeObservationImage, verifyBeforeAfter: request => unavailableOperation(request, 'VERIFY_BEFORE_AFTER'), suggestPriority: request => unavailableOperation(request, 'SUGGEST_PRIORITY') });
}

module.exports = Object.freeze({ OPERATIONS, validateEnvelope, createLocalAIGatewayService });

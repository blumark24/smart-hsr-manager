'use strict';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function createDecision(allowed, code, reason, metadata) {
  const value = { allowed: allowed === true, code: String(code), reason: String(reason) };
  if (metadata && typeof metadata === 'object' && Object.keys(metadata).length) {
    value.metadata = { ...metadata };
  }
  return deepFreeze(value);
}

function withDecisionMetadata(decision, metadata) {
  return createDecision(decision.allowed, decision.code, decision.reason, {
    ...(decision.metadata || {}),
    ...(metadata || {}),
  });
}

module.exports = Object.freeze({ createDecision, deepFreeze, withDecisionMetadata });

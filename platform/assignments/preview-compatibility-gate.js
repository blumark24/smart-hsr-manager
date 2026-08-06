'use strict';

const { BRIDGE_CLASSIFICATIONS, resolveAssignmentBridge } = require('./legacy-assignment-bridge');
const { createDecision, deepFreeze } = require('../contracts/decision');

function evaluatePreviewCompatibility(input = {}) {
  const bridge = resolveAssignmentBridge(input);
  const allowed = [BRIDGE_CLASSIFICATIONS.CANONICAL, BRIDGE_CLASSIFICATIONS.LEGACY_COMPATIBLE].includes(bridge.classification);
  const decision = allowed
    ? createDecision(true, 'PREVIEW_COMPATIBILITY_ALLOWED', 'Assignment shape is eligible for Preview processing.')
    : createDecision(false, 'PREVIEW_COMPATIBILITY_DENIED', 'Ambiguous or invalid assignment shape must fail closed.');
  return deepFreeze({ ...decision, classification: bridge.classification, bridge });
}

module.exports = Object.freeze({ evaluatePreviewCompatibility });

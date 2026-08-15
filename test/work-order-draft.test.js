'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkOrderDraft } = require('../platform/intelligence/work-order-draft');

const MUTATING_KEYS = ['status', 'assignedContractorUid', 'assignedToUid', 'closedAt', 'completedAt', 'closed', 'completed'];

test('missing aiAnalysis fails honestly with WORK_ORDER_VISION_REQUIRED', () => {
  const result = createWorkOrderDraft({});
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'WORK_ORDER_VISION_REQUIRED');
});

test('golden pothole case: correct scope, discipline, and SLA derived from taxonomy', () => {
  const aiAnalysis = { category: 'ASPHALT_POTHOLE', prioritySuggestion: 'URGENT' };
  const observation = { location: '21.512329, 39.233032' };
  const { workOrder } = createWorkOrderDraft({ aiAnalysis, observation });

  assert.equal(workOrder.workType, 'حفرة أسفلتية');
  assert.equal(workOrder.location, '21.512329, 39.233032');
  assert.equal(workOrder.priority, 'URGENT');
  assert.equal(workOrder.targetSla, 'خلال 24 ساعة');
  assert.equal(workOrder.scopeOfWork, 'تأمين الموقع وتنفيذ ترقيع أسفلتي ملائم.');
  assert.equal(workOrder.recommendedDiscipline, 'إدارة الطرق');
  assert.ok(workOrder.executionSteps.length > 0);
  assert.ok(workOrder.executionSteps.includes('تأمين الموقع وتنفيذ ترقيع أسفلتي ملائم.'));
  assert.ok(workOrder.safetyConsiderations.length > 0);
  assert.ok(workOrder.requiredEvidence.length >= 2);
  assert.ok(workOrder.closureRequirements.length >= 2);
});

test('golden damaged-sidewalk case: correct scope, discipline, and SLA', () => {
  const aiAnalysis = { category: 'DAMAGED_SIDEWALK', prioritySuggestion: 'NORMAL' };
  const { workOrder } = createWorkOrderDraft({ aiAnalysis, observation: {} });
  assert.equal(workOrder.workType, 'رصيف متضرر');
  assert.equal(workOrder.scopeOfWork, 'تأمين الجزء المتضرر وإصلاح الرصيف لاستعادة الوصول.');
  assert.equal(workOrder.recommendedDiscipline, 'إدارة الطرق');
  assert.equal(workOrder.targetSla, 'خلال 72 ساعة');
});

test('UNKNOWN category produces a safe "needs field review" draft, never a fabricated scope', () => {
  const aiAnalysis = { category: 'STREET_MAINTENANCE', prioritySuggestion: 'HIGH' }; // unsupported raw code -> UNKNOWN
  const { workOrder } = createWorkOrderDraft({ aiAnalysis, observation: {} });
  assert.equal(workOrder.priority, 'UNKNOWN');
  assert.match(workOrder.scopeOfWork, /مراجعة ميدانية/);
  assert.equal(workOrder.recommendedDiscipline, 'المراجعة البلدية العامة');
});

test('output never contains a status/assignment/closure-mutating field', () => {
  const aiAnalysis = { category: 'ASPHALT_POTHOLE', prioritySuggestion: 'HIGH' };
  const { workOrder } = createWorkOrderDraft({ aiAnalysis, observation: {} });
  const keys = Object.keys(workOrder);
  for (const forbidden of MUTATING_KEYS) {
    assert.equal(keys.includes(forbidden), false, `workOrder must never include "${forbidden}"`);
  }
  const serialized = JSON.stringify(workOrder);
  assert.equal(/"status"\s*:/.test(serialized), false);
});

test('safety-critical category includes a power-isolation execution step and its safety flags', () => {
  const aiAnalysis = { category: 'LEANING_LIGHTING_POLE', prioritySuggestion: 'URGENT' };
  const { workOrder } = createWorkOrderDraft({ aiAnalysis, observation: {} });
  assert.ok(workOrder.executionSteps.some(s => s.includes('فصل مصدر الكهرباء')));
  assert.ok(workOrder.safetyConsiderations.length > 0);
});

test('is independent of Root Cause: no rootCauseProven field is read or required', () => {
  const aiAnalysis = { category: 'ASPHALT_POTHOLE', prioritySuggestion: 'HIGH' };
  const withRootCauseFalse = createWorkOrderDraft({ aiAnalysis, observation: { rootCauseProven: false } });
  const withoutRootCauseField = createWorkOrderDraft({ aiAnalysis, observation: {} });
  assert.deepEqual(withRootCauseFalse.workOrder, withoutRootCauseField.workOrder);
});

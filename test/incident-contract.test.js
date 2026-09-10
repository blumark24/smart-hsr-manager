'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createIncidentContract, validateIncidentContract } = require('../platform/contracts/incident-contract');

function base(overrides = {}) {
  return {
    incidentId: 'i-1', organizationId: 'org-a', missionId: 'm-1', vehicleId: 'V101',
    createdByUid: 'emp-1', category: 'حادث مروري', status: 'NEW', severity: 'CRITICAL',
    createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z', ...overrides,
  };
}

test('a well-formed new incident is valid', () => {
  const { decision } = createIncidentContract(base());
  assert.equal(decision.allowed, true);
});

test('a required field missing is rejected', () => {
  const decision = validateIncidentContract(base({ vehicleId: '' }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'INCIDENT_FIELD_REQUIRED');
});

test('an unsupported status is rejected', () => {
  const decision = validateIncidentContract(base({ status: 'CLOSED_FOREVER' }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'INCIDENT_STATUS_UNSUPPORTED');
});

test('an unsupported severity is rejected', () => {
  const decision = validateIncidentContract(base({ severity: 'APOCALYPTIC' }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'INCIDENT_SEVERITY_UNSUPPORTED');
});

console.log('incident contract OK');

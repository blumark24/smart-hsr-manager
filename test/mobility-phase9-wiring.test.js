'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { INCIDENT_STATUSES } = require('../platform/policies/incident-workflow-policy');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'smart-mobility.html'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'smart-mobility-adapter.js'), 'utf8');

// incidents() must read real, live, scoped Firestore data — never the
// design's four seeded demo incidents.
assert.match(page, /incidents\(\)\s*\{\s*return this\.state\.liveIncidents \|\| \[\];\s*\}/);
assert.doesNotMatch(page, /id: 'I-118'/);

// The employee's incident report must create a real incident document, not
// only flip the mission to INCIDENT_HOLD.
assert.match(page, /window\.SmartHSRMobilityAdapter\.createIncident\(\{/);

// mobility_head's incident actions must call the real, status-gated
// adapter function, never the local-only flash() no-op.
assert.match(page, /window\.SmartHSRMobilityAdapter\.mobilityProcessIncident\(i\.id, toStatus\)/);
assert.doesNotMatch(page, /this\.flash\('تم استلام الحادث ' \+ i\.id\)/);

// Every canonical incident status must have an Arabic mapping in the
// adapter, kept in sync with the pure policy module.
for (const status of INCIDENT_STATUSES) {
  assert.match(adapter, new RegExp(`${status}: '`), `incident status ${status} must be mapped`);
}

// Audit: every mutation function must record at least one auditEvents
// write, and the transactional ones must record it inside the same
// transaction (not as a separate, non-atomic follow-up write).
const auditedFns = ['createMissionRequest', 'submitMissionForApproval', 'decideMission', 'employeeAdvanceMission', 'createIncident', 'mobilityProcessIncident'];
for (const fn of auditedFns) {
  const start = adapter.indexOf(`async function ${fn}(`);
  assert.ok(start >= 0, `${fn} must exist`);
  const end = adapter.indexOf('\nasync function ', start + 1);
  const body = adapter.slice(start, end > 0 ? end : start + 2000);
  assert.match(body, /recordAudit\(/, `${fn} must record an audit event`);
}
const transactionalAuditedFns = ['allocateVehicle', 'handoverMission', 'confirmVehicleReturn', 'employeeReturnVehicle'];
for (const fn of transactionalAuditedFns) {
  const start = adapter.indexOf(`async function ${fn}(`);
  const end = adapter.indexOf('\nasync function ', start + 1);
  const body = adapter.slice(start, end > 0 ? end : start + 2000);
  assert.match(body, /transaction\.set\(api\.doc\(api\.collection\(db, 'auditEvents'\)\)/, `${fn} must write its audit event inside the transaction`);
}

// The audit payload must self-attribute the real actor — never let the
// caller supply an arbitrary actorId/actorRole.
assert.match(adapter, /actorId: ctx\.uid, actorRole: rawRoleOf\(ctx\)/);

console.log('mobility Phase 9 wiring OK');

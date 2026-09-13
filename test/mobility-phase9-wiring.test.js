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

// PHASE 06 CLOSURE — DEFECT 1 fix: a single-document mutation that
// previously wrote its business state via setDoc/updateDoc and then
// recorded its audit event as a SEPARATE, later write (recordAudit()) could
// leave the business state changed with no audit trail if that second
// write failed. Every one of these functions now commits its business
// write AND its auditEvents/{eventId} write together in one atomic
// writeBatch() — see test/mobility-audit-atomicity.test.js for the
// executable (real-emulator) proof that a forced audit failure leaves
// neither write applied.
const auditedFns = ['submitMissionForApproval', 'decideMission', 'employeeAdvanceMission', 'mobilityProcessIncident'];
for (const fn of auditedFns) {
  const start = adapter.indexOf(`async function ${fn}(`);
  assert.ok(start >= 0, `${fn} must exist`);
  const end = adapter.indexOf('\nasync function ', start + 1);
  const body = adapter.slice(start, end > 0 ? end : start + 2000);
  assert.match(body, /const batch = api\.writeBatch\(db\);/, `${fn} must open one atomic batch for its business write and its audit write`);
  assert.match(body, /batch\.set\(api\.doc\(api\.collection\(db, 'auditEvents'\)\)/, `${fn} must record its audit event inside that same batch`);
  assert.match(body, /await batch\.commit\(\);/, `${fn} must commit the batch atomically`);
  assert.doesNotMatch(body, /recordAudit\(/, `${fn} must no longer use the removed non-atomic recordAudit() helper`);
}

// PHASE 10 UAT FIX — createMissionRequest and createIncident are the two
// exceptions to the atomic-batch rule above: each writes a resource's OWN
// 'create' audit event, self-referencing that SAME resource in the SAME
// write. firestore.rules' auditReferencedResourceOk() requires the
// referenced resource to already exist, which Security Rules can never see
// for a sibling write still in flight in the same batch — proven by direct
// reproduction to reliably hit this rule graph's per-write expression-
// evaluation ceiling and deny the whole batch, so no department head could
// ever create a mission and no employee could ever report an incident.
// Closed by sequencing the two writes instead of batching them (the
// resource first, then its audit event, both still real setDoc() calls,
// never the removed recordAudit() helper) — the one accepted tradeoff is
// documented at each function's own definition in smart-mobility-adapter.js.
const sequentialAuditedFns = ['createMissionRequest', 'createIncident'];
for (const fn of sequentialAuditedFns) {
  const start = adapter.indexOf(`async function ${fn}(`);
  assert.ok(start >= 0, `${fn} must exist`);
  const end = adapter.indexOf('\nasync function ', start + 1);
  const body = adapter.slice(start, end > 0 ? end : start + 2000);
  assert.doesNotMatch(body, /const batch = api\.writeBatch\(db\);/, `${fn} must not batch its self-referencing audit event with its own create (see PHASE 10 UAT FIX comment)`);
  assert.match(body, /await api\.setDoc\(ref,/, `${fn} must create its own resource first`);
  assert.match(body, /await api\.setDoc\(api\.doc\(api\.collection\(db, 'auditEvents'\)\), auditEventData\(/, `${fn} must record its audit event as a second, sequential write`);
  assert.doesNotMatch(body, /recordAudit\(/, `${fn} must no longer use the removed non-atomic recordAudit() helper`);
}
const transactionalAuditedFns = ['handoverMission', 'confirmVehicleReturn', 'employeeReturnVehicle'];
for (const fn of transactionalAuditedFns) {
  const start = adapter.indexOf(`async function ${fn}(`);
  const end = adapter.indexOf('\nasync function ', start + 1);
  const body = adapter.slice(start, end > 0 ? end : start + 2000);
  assert.match(body, /transaction\.set\(api\.doc\(api\.collection\(db, 'auditEvents'\)\)/, `${fn} must write its audit event inside the transaction`);
}

// PHASE 06B CLOSURE — allocateVehicle's audit event is no longer written by
// the client at all: it is recorded by the trusted server-side Admin SDK
// transaction (api/admin/users.js action:'allocateVehicle'), inside the
// SAME transaction as the mission/vehicle writes, so a forced audit failure
// still cannot leave either document changed — see
// test/mobility-allocate-vehicle-endpoint.test.js for the executable proof
// against the real emulator.
{
  const start = adapter.indexOf('async function allocateVehicle(');
  const end = adapter.indexOf('\nasync function ', start + 1);
  const body = adapter.slice(start, end > 0 ? end : start + 2000);
  assert.doesNotMatch(body, /transaction\.set\(api\.doc\(api\.collection\(db, 'auditEvents'\)\)/, 'allocateVehicle must no longer write its own audit event client-side');
  assert.match(body, /action:\s*'allocateVehicle'/, 'allocateVehicle must delegate to the trusted server-side allocation action');
}

// The audit payload must self-attribute the real actor — never let the
// caller supply an arbitrary actorId/actorRole.
assert.match(adapter, /actorId: ctx\.uid, actorRole: rawRoleOf\(ctx\)/);

console.log('mobility Phase 9 wiring OK');

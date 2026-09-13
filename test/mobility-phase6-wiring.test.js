'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { MISSION_STATUSES } = require('../platform/policies/mission-workflow-policy');
const { VEHICLE_STATUSES } = require('../platform/policies/vehicle-workflow-policy');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'smart-mobility.html'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'smart-mobility-adapter.js'), 'utf8');

// smart-mobility.html: missions()/vehicles() must read real, live,
// organizationId-scoped data (Phase 4/5), never the design's seeded demo
// generator.
assert.match(page, /missions\(\)\s*\{\s*return this\.state\.liveMissions \|\| \[\];\s*\}/);
assert.match(page, /vehicles\(\)\s*\{\s*return this\.state\.liveVehicles \|\| \[\];\s*\}/);
assert.doesNotMatch(page, /const statuses = \['في مهمة', 'في مهمة'/);

// Department Head's create-mission drawer and Administrative Affairs'
// approve/reject/return-for-review drawer must call the real adapter, not
// the local-only demo setStatus() helper.
assert.match(page, /window\.SmartHSRMobilityAdapter\.createMissionRequest\(payload\)/);
assert.match(page, /window\.SmartHSRMobilityAdapter\.submitMissionForApproval\(missionId\)/);
assert.match(page, /window\.SmartHSRMobilityAdapter\.decideMission\(m\.id, 'APPROVED'\)/);
assert.match(page, /window\.SmartHSRMobilityAdapter\.decideMission\(m\.id, 'DRAFT'\)/);
assert.match(page, /window\.SmartHSRMobilityAdapter\.decideMission\(m\.id, 'REJECTED'\)/);

// Mobility Head's allocate/handover/confirm-return actions must call the
// real, transactional adapter functions (Phase 5's conflict prevention only
// holds if both documents are written together).
assert.match(page, /window\.SmartHSRMobilityAdapter\.allocateVehicle\(m\.id, vehId, empUid, empName\)/);
assert.match(page, /window\.SmartHSRMobilityAdapter\.handoverMission\(m\.id, m\.veh\)/);
assert.match(page, /window\.SmartHSRMobilityAdapter\.confirmVehicleReturn\(m\.id, m\.veh\)/);

// smart-mobility-adapter.js: every canonical status from the pure policy
// modules must have an Arabic UI mapping — if a new status is ever added to
// the policy without updating the adapter, this test catches the drift.
for (const status of MISSION_STATUSES) {
  assert.match(adapter, new RegExp(`${status}: '`), `mission status ${status} must be mapped to an Arabic label`);
}
for (const status of VEHICLE_STATUSES) {
  assert.match(adapter, new RegExp(`${status}: '`), `vehicle status ${status} must be mapped to an Arabic label`);
}

// Handover and return-confirmation must each be one atomic Firestore
// transaction — writing the mission and vehicle documents separately would
// reopen the double-allocation race Phase 5 closed.
const transactionalFns = ['handoverMission', 'confirmVehicleReturn'];
for (const fn of transactionalFns) {
  const start = adapter.indexOf(`async function ${fn}(`);
  assert.ok(start >= 0, `${fn} must exist`);
  const end = adapter.indexOf('\n}', start);
  const body = adapter.slice(start, end);
  assert.match(body, /runTransaction/, `${fn} must use a Firestore transaction`);
}

// PHASE 06B CLOSURE — allocateVehicle no longer writes missions/vehicles
// directly from the client at all (firestore.rules now denies that
// transition outright — see mobility-mission-rules.test.js). It must call
// the trusted server-side Admin SDK transaction instead, sending only
// missionId/vehicleId/employeeUid and never a client-derived organizationId
// or actor identity.
{
  const start = adapter.indexOf('async function allocateVehicle(');
  assert.ok(start >= 0, 'allocateVehicle must exist');
  const end = adapter.indexOf('\n}', start);
  const body = adapter.slice(start, end);
  assert.doesNotMatch(body, /runTransaction/, 'allocateVehicle must no longer perform a direct client-side Firestore transaction');
  assert.match(body, /getIdToken\(\)/, 'allocateVehicle must authenticate the trusted API call with the caller\'s own ID token');
  assert.match(body, /fetch\('\/api\/admin\/users'/, 'allocateVehicle must call the trusted server-side allocation endpoint');
  assert.match(body, /action:\s*'allocateVehicle'/, 'allocateVehicle must dispatch the allocateVehicle server action');
}

// Only a department_head-authored draft may be created; role/authority
// checks belong to firestore.rules, but the adapter must also fail closed
// locally rather than silently attempting an unauthorized write.
assert.match(adapter, /function requireRole/);
assert.match(adapter, /requireRole\('dept'\)/);
assert.match(adapter, /requireRole\('admin'\)/);
assert.match(adapter, /requireRole\('mobility'\)/);

console.log('mobility Phase 6 wiring OK');

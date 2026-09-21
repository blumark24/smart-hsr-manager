'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'mobility-runtime.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');

test('Mobility-only identities route to the approved shared operational surface', () => {
  assert.match(login, /mobilityRole && !hasFieldRole && !hasLandsRole/);
  assert.match(login, /department-head\.html\?mode=mobility/);
  assert.match(page, /mode === 'mobility' \? '\.\/mobility-runtime\.js' : '\.\/field-head-runtime\.js'/);
});

test('Mobility runtime uses mobilityAccess as authoritative and does not require Field or Lands', () => {
  assert.match(runtime, /Object\.prototype\.hasOwnProperty\.call\(data, 'mobilityAccess'\)/);
  assert.match(runtime, /ALLOWED_ROLES = Object\.freeze\(\['mobility_head','department_head','administrative_affairs','employee'\]\)/);
  assert.doesNotMatch(runtime, /landsAccess/);
  assert.doesNotMatch(runtime, /isFieldSurveyDepartment/);
  assert.doesNotMatch(runtime, /الحصر\|ميداني\|field/);
});

test('Every Mobility operational role maps to the intended UI mode', () => {
  assert.match(runtime, /mobility_head: 'mobility'/);
  assert.match(runtime, /department_head: 'dept'/);
  assert.match(runtime, /administrative_affairs: 'admin'/);
  assert.match(runtime, /employee: 'employee'/);
  assert.match(runtime, /screen:component\.homeOf\(uiRole\)/);
});

test('Mobility runtime consumes one trusted role-scoped workspace', () => {
  assert.match(runtime, /api\('getMobilityWorkspace'\)/);
  assert.match(api, /action === 'getMobilityWorkspace'/);
  assert.match(api, /\['mobility_head', 'department_head', 'administrative_affairs', 'employee'\]/);
  assert.match(api, /actor\.role === 'department_head'/);
  assert.match(api, /actor\.role === 'employee'/);
});

test('Department mission request selects a real employee record, not free text, in Mobility mode', () => {
  assert.match(page, /runtimeMode === 'mobility'/);
  assert.match(page, /requestedEmployeeId: mobilityMode/);
  assert.match(page, /f\.cEmpId/);
  assert.match(page, /options: \(this\.state\.liveEmployees \|\| \[\]\)\.map/);
  assert.match(runtime, /filter\(e => e\.vehicleEligible === true\)/);
});

test('Mobility mutations are wired from approved UI to trusted server actions', () => {
  for (const action of [
    'createMissionRequest','submitMissionForApproval','decideMobilityMission',
    'allocateVehicle','handoverVehicle','employeeAdvanceMission',
    'employeeReturnVehicle','confirmVehicleReturn','createIncident',
    'processMobilityIncident','decideVehicleAuthorization'
  ]) {
    assert.ok(runtime.includes("'" + action + "'"), 'missing runtime action: ' + action);
    assert.ok(api.includes("action === '" + action + "'"), 'missing server action: ' + action);
  }
});

test('Mobility incident processing is Mobility Head only and uses the incident state machine', () => {
  const start = api.indexOf("if (action === 'processMobilityIncident')");
  const block = api.slice(start, start + 5500);
  assert.ok(start >= 0);
  assert.match(block, /\['mobility_head'\]/);
  assert.match(block, /evaluateIncidentTransition/);
  assert.match(block, /cross_organization_denied/);
  assert.match(block, /incident_status_transition/);
});

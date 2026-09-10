'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'smart-mobility.html'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'smart-mobility-adapter.js'), 'utf8');

// smart-mobility-adapter.js: the employee's own missions/vehicles listeners
// must be scoped to assignedEmployeeUid — an employee must never receive
// another employee's mission or vehicle data.
assert.match(adapter, /if \(context\.designRole === 'employee'\) clauses\.push\(firestoreApi\.where\('assignedEmployeeUid', '==', context\.uid\)\)/);
assert.match(adapter, /'manager', 'mobility', 'admin', 'employee'\]\.includes\(context\.designRole\)/);
assert.match(adapter, /async function employeeAdvanceMission/);
assert.match(adapter, /async function employeeReturnVehicle/);
assert.match(adapter, /requireRole\('employee'\)/);

// The employee's mission/vehicle return must be one atomic transaction too
// (mirrors Phase 5's allocateVehicle/handoverMission/confirmVehicleReturn).
{
  const start = adapter.indexOf('async function employeeReturnVehicle(');
  const end = adapter.indexOf('\n}', start);
  assert.match(adapter.slice(start, end), /runTransaction/);
}

// smart-mobility.html: the employee screen must no longer be hardcoded to
// the design's single demo mission 'M-2418' — it must derive its active
// mission from the (now employee-scoped) live missions() list, and handle
// having no active mission at all without crashing.
assert.doesNotMatch(page, /M\.filter\(x => x\.id === 'M-2418'\)/);
assert.match(page, /out\.empHasMission = !!m;/);
assert.match(page, /out\.empNoMission = !m;/);
assert.match(page, /empNoMission/);

// Every employee action must call the real adapter (employeeAdvanceMission
// or employeeReturnVehicle), never the local-only setStatus() demo helper,
// on the employee's own mission id.
assert.match(page, /window\.SmartHSRMobilityAdapter\.employeeAdvanceMission\(m\.id, 'READY'\)/);
assert.match(page, /window\.SmartHSRMobilityAdapter\.employeeAdvanceMission\(m\.id, 'IN_PROGRESS'\)/);
assert.match(page, /advance\('COMPLETED'/);
assert.match(page, /advance\('IN_PROGRESS', 'تم استئناف المهمة'/);
assert.match(page, /window\.SmartHSRMobilityAdapter\.employeeReturnVehicle\(m\.id, m\.veh\)/);
assert.match(page, /window\.SmartHSRMobilityAdapter\.employeeAdvanceMission\(im\.id, 'INCIDENT_HOLD'\)/);

// No setStatus('M-2418', ...) demo call paths remain reachable from the
// employee flow's action handlers.
assert.doesNotMatch(page, /this\.setStatus\('M-2418'/);

console.log('mobility Phase 7 wiring OK');

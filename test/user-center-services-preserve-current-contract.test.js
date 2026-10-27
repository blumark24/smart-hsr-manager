'use strict';

// Phase 0 acceptance guard for SMART HSR User Center / Services integration.
// Read-only protection of EXISTING behavior. These tests deliberately add
// no operational capability, role, migration or production dependency.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const WA = require('../workspace-access.js');

const userCenterGrid = read('manager-phase11d-user-center-enhancements.js');
const approvedEdit = read('manager-phase11f-reference-ui.js');
const approvedSkin = read('manager-phase11g-user-center-approved-skin.js');
const centerCore = read('manager-phase11c-user-center-core.js');
const switcher = read('service-switcher.js');
const mobilityRuntime = read('mobility-runtime.js');
const api = read('api/admin/users.js');
const org = Object.freeze({ organizationId: 'demo-safe-org', active: true });

function productIds(profile) {
  return WA.resolveWorkspaces(profile).workspaces.map(x => x.id);
}

test('Lands remains the PRIMARY destination when a Lands employee gains Mobility access', () => {
  const identity = {
    ...org, institutionalRole: 'employee', administration: 'إدارة الأراضي والممتلكات',
    landsAccess: { enabled: true, role: 'lands_employee' },
    entitlements: { capabilities: ['mobility.access'] }
  };
  const result = WA.resolveWorkspaces(identity);
  assert.equal(result.valid, true);
  assert.equal(result.primary, 'lands');
  assert.deepEqual(result.workspaces.map(x => x.id), ['lands', 'mobility']);
  assert.equal(result.workspaces.find(x => x.id === 'mobility').route, 'department-head.html?mode=mobility');
  assert.deepEqual(result.capabilities, ['mobility.access']);
  assert.equal(result.mobilityRole, 'employee');
});

test('Field inspector remains in Field after Mobility is enabled additively', () => {
  const identity = {
    ...org, role: 'inspector', institutionalRole: 'employee',
    administration: 'إدارة الحصر الميداني',
    entitlements: { capabilities: ['mobility.access'] }
  };
  const result = WA.resolveWorkspaces(identity);
  assert.equal(result.primary, 'field');
  assert.deepEqual(productIds(identity), ['field', 'mobility']);
  assert.equal(result.workspaces[0].route, 'dashboard.html');
  assert.equal(result.mobilityRole, 'employee');
});

test('Mobility without vehicle capabilities must never imply driving or fleet management', () => {
  const identity = { ...org, entitlements: { capabilities: ['mobility.access'] } };
  const result = WA.resolveWorkspaces(identity);
  assert.equal(result.primary, 'mobility');
  assert.deepEqual(result.capabilities, ['mobility.access']);
  assert.equal(result.mobilityRole, 'employee');
  for (const action of ['vehicle.checkout', 'vehicle.drive', 'vehicle.return']) {
    assert.equal(WA.hasCapability(identity, action), false);
  }
  assert.equal(WA.resolveMobilityRole(identity), 'employee');
});

test('Vehicle eligibility on an unrelated product does not grant Mobility', () => {
  const inspector = { ...org, role: 'inspector', vehicleEligible: true };
  const lands = {
    ...org, landsAccess: { enabled: true, role: 'lands_employee' },
    vehicleEligible: true
  };
  assert.equal(WA.hasCapability(inspector, 'mobility.access'), false);
  assert.equal(WA.hasCapability(lands, 'mobility.access'), false);
  assert.deepEqual(productIds(lands), ['lands']);
  assert.deepEqual(productIds(inspector), ['field']);
});

test('Entitlements are fail-closed: vehicle.drive alone cannot authorize access', () => {
  const identity = { ...org, entitlements: { capabilities: ['vehicle.drive'] } };
  assert.deepEqual([...WA.resolveCapabilities(identity)], []);
  assert.equal(WA.resolveMobilityRole(identity), null);
  assert.deepEqual(productIds(identity), []);
});

test('Current user center retains approved compact registry columns and modal layout', () => {
  assert.match(userCenterGrid,
    /الموظف<\/th><th>الرقم الوظيفي<\/th><th>الإدارة<\/th><th>القسم<\/th><th>المسمى<\/th><th>الدور الوظيفي<\/th><th>الخدمات المفعلة<\/th><th>أهلية المركبة<\/th><th>الحالة<\/th>/);
  assert.match(approvedEdit, /const steps=\['البيانات الأساسية','الدور والخدمات','حساب الدخول','السجل'\]/);
  assert.match(approvedSkin, /FINAL VISUAL OWNER/);
  assert.match(approvedSkin, /ucv21-single-page/);
  assert.match(centerCore, /U\.permissions=/);
  assert.match(centerCore, /U\.readProducts=/);
  assert.match(centerCore, /U\.sync=async/);
});

test('Existing switcher respects trusted workspace resolution and one-time Lands handoff', () => {
  assert.match(switcher, /action: 'resolveWorkspaces'/);
  assert.match(switcher, /\/api\/organization\/context/);
  assert.match(switcher, /data-smart-hsr-workspace-trigger/);
  assert.match(switcher, /workspaces\.length < 2/);
  assert.doesNotMatch(switcher, /createUserWithEmailAndPassword|createUser\(|setDoc\(|addDoc\(/);
});

test('Current mission creation stays department-head only; do not grant ordinary users operational authority', () => {
  const start = api.indexOf("if (action === 'createMissionRequest')");
  const end = api.indexOf("if (action === 'createDirectMobilityMission')", start);
  assert.ok(start >= 0 && end > start);
  const createMission = api.slice(start, end);
  assert.match(createMission, /caller\.isDepartmentHead/);
  assert.match(createMission, /department_head_required/);
  assert.match(mobilityRuntime, /api\('createMissionRequest',body\)/);
  // This is a guard, not a requester-feature test. A separate audited
  // request capability/action must be implemented later for Lands/Field users.
});

test('Approved field/mobility header exposes an integrated, trusted services menu', () => {
  const departmentHead = read('department-head.html');
  assert.match(departmentHead, /data-smart-hsr-workspace-trigger/);
  assert.match(switcher, /const integratedTrigger = document\.querySelector/);
  assert.match(switcher, /services\.setAttribute\('role', 'group'\)/);
  assert.match(switcher, /integratedTrigger\.after\(services\)/);
  assert.match(switcher, /mainLabel\.textContent = 'خدماتي'/);
  assert.match(switcher, /for \(const ws of workspaces\)/);
  assert.doesNotMatch(switcher, /integratedTrigger\.onclick = \(\) => \{ location\.href = 'workspace\.html'; \}/);
});

test('Header services preserve guarded routes, accessible feedback and current-workspace status', () => {
  assert.match(switcher, /SAFE_ROUTE\.test\(ws\.route\)/);
  assert.match(switcher, /if \(ws\.id === 'lands'\) await openLands\(user\)/);
  assert.match(switcher, /item\.setAttribute\('aria-current', 'page'\)/);
  assert.match(switcher, /status\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(switcher, /if \(event\.key === 'Escape'\) setOpen\(false\)/);
  assert.doesNotMatch(switcher, /createUserWithEmailAndPassword|\.signOut\(/);
});

test('Service switcher discards stale users and removes old event handlers', () => {
  assert.match(switcher, /sessionGeneration = 0/);
  assert.match(switcher, /generation !== sessionGeneration \|\| auth\.currentUser\?\.uid !== user\.uid/);
  assert.match(switcher, /if \(unmountSwitcher\) \{ unmountSwitcher\(\); unmountSwitcher = null; \}/);
  assert.match(switcher, /document\.removeEventListener\('keydown', dismissOnEscape\)/);
  assert.match(switcher, /document\.removeEventListener\('click', dismissOnOutside\)/);
  assert.match(switcher, /services\.remove\(\)/);
  assert.match(switcher, /integratedTrigger\.onclick = null/);
});

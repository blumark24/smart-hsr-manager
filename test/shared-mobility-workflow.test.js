'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const entitlements = require('../api/_lib/serviceEntitlements');
const authz = require('../api/_lib/authz');
const product = require('../platform/contracts/product-entitlement-contract');
const usersApi = fs.readFileSync(path.join(root, 'api/admin/users.js'), 'utf8');
const employeesApi = fs.readFileSync(path.join(root, 'api/admin/employees.js'), 'utf8');

test('Mobility is an independent entitlement from Field and Lands', () => {
  const field = entitlements.validateFieldSelection({ enabled: false });
  const mobility = entitlements.validateMobilitySelection({ enabled: true, role: 'employee' });
  const lands = entitlements.validateLandsSelection({ enabled: false });
  assert.equal(field.ok, true);
  assert.equal(mobility.ok, true);
  assert.equal(lands.ok, true);
  assert.deepEqual(
    entitlements.resolveEffectiveServiceState(field, lands, null, undefined, { enabled: true, role: 'employee' }),
    { fieldEffectiveEnabled: false, landsEffectiveEnabled: false, existingMobilityEnabled: true }
  );
});

test('A Mobility-only employee resolves as Mobility-enabled with Field and Lands off', () => {
  const resolved = product.resolveProductEntitlements({
    role: null,
    mobilityAccess: { enabled: true, role: 'employee' },
    landsAccess: { enabled: false, role: null },
    vehicleEligible: true,
  });
  assert.deepEqual(resolved.field, { enabled: false, role: null });
  assert.deepEqual(resolved.lands, { enabled: false, role: null });
  assert.deepEqual(resolved.mobility, { enabled: true, role: 'employee', vehicleEligible: true });
});

test('Vehicle eligibility stays independent and explicit', () => {
  const notEligible = product.resolveProductEntitlements({
    role: null,
    mobilityAccess: { enabled: true, role: 'employee' },
  });
  assert.equal(notEligible.mobility.enabled, true);
  assert.equal(notEligible.mobility.vehicleEligible, false);

  const eligible = product.resolveProductEntitlements({
    role: null,
    mobilityAccess: { enabled: true, role: 'employee' },
    vehicleEligible: true,
  });
  assert.equal(eligible.mobility.vehicleEligible, true);
});

test('User Center employee registry can assign Mobility without enabling Field or Lands', () => {
  assert.match(employeesApi, /validateMobilitySelection\(mobility\)/);
  assert.match(employeesApi, /userUpdate\.mobilityAccess/);
  assert.match(employeesApi, /vehicleEligible !== undefined/);
  assert.match(employeesApi, /field: \{ enabled: nextFieldEnabled/);
  assert.match(employeesApi, /lands: \{/);
  assert.match(employeesApi, /mobility: \{/);
});

test('Department mission workflow is municipality-wide, not Field-only', () => {
  const listStart = usersApi.indexOf("if (action === 'listDepartmentMissions')");
  const submitStart = usersApi.indexOf("if (action === 'submitMissionForApproval')");
  const nextStart = usersApi.indexOf("if (action ===", submitStart + 10);
  const listBlock = usersApi.slice(listStart, submitStart);
  const submitBlock = usersApi.slice(submitStart, nextStart > submitStart ? nextStart : submitStart + 9000);

  assert.match(listBlock, /department_head_required/);
  assert.match(submitBlock, /department_head_required/);
  assert.doesNotMatch(listBlock, /isFieldSurveyDepartment/);
  assert.doesNotMatch(submitBlock, /isFieldSurveyDepartment/);
  assert.match(listBlock, /cleanString\(data\.department\) !== cleanString\(caller\.department\)/);
  assert.match(submitBlock, /cleanString\(mission\.department\) !== cleanString\(caller\.department\)/);
});

test('Mission request targets a same-department active Mobility employee with explicit vehicle eligibility', () => {
  assert.match(usersApi, /employee\.organizationId !== caller\.organizationId/);
  assert.match(usersApi, /cleanString\(employee\.department\) !== cleanString\(caller\.department\)/);
  assert.match(usersApi, /mobility\.enabled !== true \|\| mobility\.role !== 'employee'/);
  assert.match(usersApi, /mobility\.vehicleEligible !== true/);
});

test('Mobility allocation target does not depend on Field or Lands roles', () => {
  assert.equal(authz.isValidMobilityAllocationTarget({
    organizationId: 'org-1',
    active: true,
    role: null,
    mobilityAccess: { enabled: true, role: 'employee' },
    vehicleEligible: true,
  }, 'org-1'), true);

  assert.equal(authz.isValidMobilityAllocationTarget({
    organizationId: 'org-1',
    active: true,
    role: null,
    landsAccess: { enabled: true, role: 'lands_employee' },
    mobilityAccess: { enabled: false, role: null },
    vehicleEligible: true,
  }, 'org-1'), false);
});

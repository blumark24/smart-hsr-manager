'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  MOBILITY_WORKFLOW_POLICIES,
  normalizeWorkflowPolicy,
  evaluateMissionTransition,
} = require(path.join(root, 'platform', 'policies', 'mission-workflow-policy.js'));

const ORG = 'org-a';
const head = { uid:'head-1', role:'department_head', organizationId:ORG };
const admin = { uid:'admin-1', role:'administrative_affairs', organizationId:ORG };
const mobility = { uid:'mob-1', role:'mobility_head', organizationId:ORG };

test('exactly three municipality mobility workflow policies are supported', () => {
  assert.deepEqual(MOBILITY_WORKFLOW_POLICIES, {
    FULL:'FULL',
    SHORT:'SHORT',
    DIRECT:'DIRECT',
  });
  assert.equal(normalizeWorkflowPolicy('bogus'), 'FULL');
});

test('FULL requires Department Head -> Administrative Affairs -> Mobility', () => {
  const draft = { status:'DRAFT', workflowPolicy:'FULL', organizationId:ORG, createdByUid:head.uid };
  assert.equal(evaluateMissionTransition({ actor:head, mission:draft, toStatus:'PENDING_APPROVAL' }).allowed, true);
  assert.equal(evaluateMissionTransition({ actor:head, mission:draft, toStatus:'APPROVED' }).allowed, false);

  const pending = { ...draft, status:'PENDING_APPROVAL' };
  assert.equal(evaluateMissionTransition({ actor:admin, mission:pending, toStatus:'APPROVED' }).allowed, true);
  assert.equal(evaluateMissionTransition({ actor:mobility, mission:pending, toStatus:'APPROVED' }).allowed, false);
});

test('SHORT skips Administrative Affairs and goes Department Head -> Mobility', () => {
  const draft = { status:'DRAFT', workflowPolicy:'SHORT', organizationId:ORG, createdByUid:head.uid };
  assert.equal(evaluateMissionTransition({ actor:head, mission:draft, toStatus:'APPROVED' }).allowed, true);
  assert.equal(evaluateMissionTransition({ actor:head, mission:draft, toStatus:'PENDING_APPROVAL' }).allowed, false);

  const pending = { ...draft, status:'PENDING_APPROVAL' };
  assert.equal(evaluateMissionTransition({ actor:admin, mission:pending, toStatus:'APPROVED' }).allowed, false);
});

test('DIRECT approval authority belongs to Mobility Head only', () => {
  const draft = { status:'DRAFT', workflowPolicy:'DIRECT', organizationId:ORG, createdByUid:mobility.uid };
  assert.equal(evaluateMissionTransition({ actor:mobility, mission:draft, toStatus:'APPROVED' }).allowed, true);
  assert.equal(evaluateMissionTransition({ actor:mobility, mission:draft, toStatus:'PENDING_APPROVAL' }).allowed, false);
  assert.equal(evaluateMissionTransition({ actor:head, mission:draft, toStatus:'APPROVED' }).allowed, false);
  assert.equal(evaluateMissionTransition({ actor:admin, mission:draft, toStatus:'APPROVED' }).allowed, false);
});

test('all three policies converge on the same post-approval vehicle lifecycle', () => {
  for (const policy of ['FULL','SHORT','DIRECT']) {
    const approved = { status:'APPROVED', workflowPolicy:policy, organizationId:ORG };
    const decision = evaluateMissionTransition({
      actor:mobility,
      mission:approved,
      toStatus:'VEHICLE_ALLOCATED',
      requestedFields:{ vehicleId:'v1', assignedEmployeeUid:'u1' },
    });
    assert.equal(decision.allowed, true, policy);
  }
});

test('workflow authorization is organization-bound', () => {
  const foreignHead = { ...head, organizationId:'org-b' };
  const draft = { status:'DRAFT', workflowPolicy:'SHORT', organizationId:ORG, createdByUid:foreignHead.uid };
  const decision = evaluateMissionTransition({ actor:foreignHead, mission:draft, toStatus:'APPROVED' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'ORGANIZATION_SCOPE_DENIED');
});

test('Manager is the policy authority; Mobility Head UI is read-only', () => {
  const managerHtml = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
  const headHtml = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');

  assert.match(managerHtml, /getMobilityWorkflowPolicy/);
  assert.match(managerHtml, /setMobilityWorkflowPolicy/);
  assert.match(managerHtml, /مدير البلدية|سياسة حركة السير/);

  assert.match(api, /municipality_manager_required/);
  assert.match(api, /set_mobility_workflow_policy/);
  assert.match(api, /municipalitySettings/);

  assert.match(headHtml, /عرض للقراءة فقط/);
  assert.match(headHtml, /مدير البلدية يعتمد السياسة/);
  assert.doesNotMatch(headHtml, /معاينة فقط — السياسة المطبَّقة فعلياً تبقى السياسة الكاملة/);
  assert.doesNotMatch(headHtml, /معاينة تصميم — غير مفعّلة/);
});

test('Mobility runtime consumes server workflowPolicy and enables direct creation only for DIRECT', () => {
  const runtime = fs.readFileSync(path.join(root, 'mobility-runtime.js'), 'utf8');
  assert.match(runtime, /workflowPolicy:workspace\.workflowPolicy \|\| 'FULL'/);
  assert.match(runtime, /=== 'DIRECT'/);
  assert.match(runtime, /\+ مهمة مباشرة/);
});


test('Mobility Head vehicle handover is role-gated, not blocked by employee vehicle.return capability', () => {
  const api = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
  const start = api.indexOf("if (action === 'handoverVehicle')");
  const end = api.indexOf("if (action === 'employeeAdvanceMission')", start);
  assert.ok(start >= 0 && end > start);
  const block = api.slice(start, end);
  assert.match(block, /\['mobility_head'\]/);
  assert.doesNotMatch(block, /resolvedActorCapability\(actor, 'vehicle\.return'/);
  assert.doesNotMatch(block, /capability_required/);
});

test('FULL keeps Administrative Affairs vehicle authorization; SHORT/DIRECT are policy-auto authorized', () => {
  const api = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
  const adminRuntime = fs.readFileSync(path.join(root, 'admin-affairs-runtime.js'), 'utf8');
  const headHtml = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');

  assert.match(api, /requiresAdministrativeAuthorization = workflowPolicy === MOBILITY_WORKFLOW_POLICIES\.FULL/);
  assert.match(api, /authorizationMode = requiresAdministrativeAuthorization \? 'ADMINISTRATIVE_AFFAIRS' : 'POLICY_AUTO'/);
  assert.match(api, /authorization_not_required_for_policy/);
  assert.match(api, /auto_authorize_vehicle_use_by_policy/);

  assert.match(adminRuntime, /\(a\.workflowPolicy\|\|'FULL'\)==='FULL'/);
  assert.match(adminRuntime, /a\.authorizationMode==='POLICY_AUTO'/);
  assert.match(headHtml, /m\.authorizationStatus === 'AUTHORIZED'/);
});

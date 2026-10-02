'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root=path.join(__dirname,'..');
const login=fs.readFileSync(path.join(root,'login.html'),'utf8') + '\n' + fs.readFileSync(path.join(root, 'workspace-access.js'), 'utf8');
const workspace=fs.readFileSync(path.join(root,'workspace.html'),'utf8');
const switcher=fs.readFileSync(path.join(root,'service-switcher.js'),'utf8');
const employees=fs.readFileSync(path.join(root,'api/admin/employees.js'),'utf8');
const dashboard=fs.readFileSync(path.join(root,'dashboard.html'),'utf8');
const department=fs.readFileSync(path.join(root,'department-head.html'),'utf8');
const manager=fs.readFileSync(path.join(root,'manager.html'),'utf8');
const mobile=fs.readFileSync(path.join(root,'mobile-map.html'),'utf8');

test('login routes through the unified workspace resolver: institutional primary, Mobility additional',()=>{
  // The institutional (HR-owned) path stays the PRIMARY workspace; entitled
  // workspaces such as Mobility are ADDITIONAL (supersedes the PHASE16 rule
  // that hid every non-canonical workspace).
  assert.match(login,/canonicalInstitutionalRole|CANONICAL_ROLES/);
  assert.match(login,/canonicalFieldPath/);
  assert.match(login,/canonicalLandsPath/);
  assert.match(login,/canonicalMobilityPath/);
  assert.match(login,/canonicalAdministrativePath/);
  assert.match(login,/action: 'resolveWorkspaces'/);
  assert.match(login,/WA\.resolveWorkspaces\(/);
  assert.match(login,/else if \(canonicalMobilityPath && authorized\.mobility\) primary = 'mobility'/);
  assert.doesNotMatch(login,/createUserWithEmailAndPassword/);
});

test('single-service routing remains direct and Lands keeps trusted SSO',()=>{
  assert.match(login,/if \(primary\.id === 'lands'\)/);
  assert.match(login,/fetch\('\/api\/organization\/context'/);
  assert.match(login,/department-head\.html\?mode=mobility/);
  assert.match(login,/'dashboard\.html'/);
});

test('workspace chooser is resolver-driven and shows the safe empty state',()=>{
  assert.match(workspace,/action:'resolveWorkspaces'/);
  assert.match(workspace,/WA\.resolveWorkspaces/);
  assert.match(workspace,/openLands\(user\)/);
  assert.match(workspace,/لم يتم تعيين مساحة عمل لهذا الحساب بعد/);
  // only an invalid account/session ends the session
  assert.match(workspace,/if\(!res\.valid\)\{ await signOut\(auth\)/);
});

test('workspace does not create or clone identities',()=>{
  assert.doesNotMatch(workspace,/createUser|createEmployee|employees\/|addDoc|setDoc/);
  assert.doesNotMatch(switcher,/createUser|createEmployee|addDoc|setDoc/);
});

test('employee registry prevents same-municipality duplicate person records',()=>{
  assert.match(employees,/ONE PERSON = ONE EMPLOYEE RECORD/);
  assert.match(employees,/employee_ref_already_exists/);
  assert.match(employees,/employee_email_already_exists/);
  assert.match(employees,/where\('organizationId', '==', organizationId\)/);
});

test('operational surfaces may load the compatibility switcher script without forcing a chooser',()=>{
  for(const [name,source] of [
    ['dashboard',dashboard],['department-head',department],['manager',manager],['mobile-map',mobile]
  ]){
    assert.ok(source.includes('./service-switcher.js'), name+' missing service switcher');
  }
});

test('workspace switcher lists the API-resolved workspaces for multi-workspace users, without re-login',()=>{
  assert.match(switcher,/action: 'resolveWorkspaces'/);
  assert.match(switcher,/workspaces\.length < 2/);
  assert.match(switcher,/role', 'menu'/);
  assert.match(switcher,/location\.href = ws\.route/);
  assert.match(switcher,/openLands\(user\)/);
  assert.doesNotMatch(switcher,/signInWith|createUser|setDoc|addDoc/);
});

test('workspace.html is a first-class destination, not a legacy transitional page',()=>{
  assert.doesNotMatch(workspace,/مسار انتقالي للحسابات القديمة/);
  assert.doesNotMatch(workspace,/الحساب يحتاج تحديث المسار الوظيفي/);
  assert.match(workspace,/مساحات العمل/);
});

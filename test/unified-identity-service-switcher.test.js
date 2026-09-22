'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root=path.join(__dirname,'..');
const login=fs.readFileSync(path.join(root,'login.html'),'utf8');
const workspace=fs.readFileSync(path.join(root,'workspace.html'),'utf8');
const switcher=fs.readFileSync(path.join(root,'service-switcher.js'),'utf8');
const employees=fs.readFileSync(path.join(root,'api/admin/employees.js'),'utf8');
const dashboard=fs.readFileSync(path.join(root,'dashboard.html'),'utf8');
const department=fs.readFileSync(path.join(root,'department-head.html'),'utf8');
const manager=fs.readFileSync(path.join(root,'manager.html'),'utf8');
const mobile=fs.readFileSync(path.join(root,'mobile-map.html'),'utf8');

test('canonical institutional identity routes to one workspace before any legacy service chooser',()=>{
  assert.match(login,/canonicalInstitutionalRole/);
  assert.match(login,/canonicalFieldPath/);
  assert.match(login,/canonicalLandsPath/);
  assert.match(login,/canonicalMobilityPath/);
  assert.match(login,/canonicalAdministrativePath/);
  assert.match(login,/if \(hasCanonicalPath && canonicalFieldPath/);
  assert.match(login,/if \(hasCanonicalPath && canonicalLandsPath/);
  assert.match(login,/if \(hasCanonicalPath && canonicalMobilityPath/);
  assert.match(login,/LEGACY COMPATIBILITY ONLY/);
  assert.doesNotMatch(login,/createUserWithEmailAndPassword/);
});

test('single-service routing remains direct and Lands keeps trusted SSO',()=>{
  assert.match(login,/if \(hasLandsRole && !hasFieldRole && !mobilityRole\)/);
  assert.match(login,/fetch\('\/api\/organization\/context'/);
  assert.match(login,/department-head\.html\?mode=mobility/);
  assert.match(login,/window\.location\.href = 'dashboard\.html'/);
});

test('legacy workspace remains non-destructive for unmigrated accounts only',()=>{
  assert.match(workspace,/getDoc\(doc\(db,'users',user\.uid\)\)/);
  assert.match(workspace,/FIELD_ROLES/);
  assert.match(workspace,/landsAccess/);
  assert.match(workspace,/mobilityAccess/);
  assert.match(workspace,/department-head\.html\?mode=mobility/);
  assert.match(workspace,/openLands\(user\)/);
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

test('service switcher is suppressed for canonical institutional paths and remains legacy-only',()=>{
  assert.match(switcher,/canonicalRole/);
  assert.match(switcher,/canonicalPath/);
  assert.match(switcher,/if\(d\.active===false\|\|canonicalPath\|\|countServices\(d\)<2\)return/);
  assert.match(switcher,/location\.href='workspace\.html'/);
  assert.match(switcher,/doc\(db,'users',user\.uid\)/);
});

test('legacy workspace is visibly marked as transitional rather than a normal user destination',()=>{
  assert.match(workspace,/مسار انتقالي للحسابات القديمة/);
  assert.match(workspace,/الحساب يحتاج تحديث المسار الوظيفي/);
});

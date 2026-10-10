'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const manager=fs.readFileSync(path.join(root,'manager.html'),'utf8');
const context=fs.readFileSync(path.join(root,'api/organization/context.js'),'utf8');
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
test('verified API prioritizes owner-maintained organization name',()=>{
  assert.match(context,/organizationName: cleanText\(organizationData\.name,/);
  assert.match(context,/managerName: cleanText\(organizationData\.manager\)/);
  assert.match(context,/requested && requested !== caller\.organizationId/);
});
test('manager badge refresh uses tenant-scoped verified API, not owner-only direct Firestore read',()=>{
  assert.match(manager,/fetchOrganizationMapContext\(auth, \{organizationId: linkedOrganizationId\}\)/);
  assert.match(manager,/live\?\.organizationId !== linkedOrganizationId/);
  assert.match(manager,/setInterval\(refreshVisibleOrganizationIdentity, 15000\)/);
  assert.doesNotMatch(manager,/onSnapshot\(doc\(db, 'organizations', linkedOrganizationId\)/);
  assert.match(rules,/match \/organizations\/\{orgId\} \{\s*allow read, write: if isActiveOwner\(\)/);
});
test('manager dashboard command heading no longer hardcodes a municipality',()=>{
  assert.match(manager,/commandTitle\.textContent = verifiedOrganizationName/);
  assert.doesNotMatch(manager,/<h1 id="commandTitle">بلدية القنفذة/);
});

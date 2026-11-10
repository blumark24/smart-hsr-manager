'use strict';
// V2 replaces the old in-page record DOM. Behavioral repository tests are in inspector-v2.test.js.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const app=read('inspector/app.mjs'),repository=read('api/_lib/inspectorObservations.js');
test('Inspector record is the independent tasks route',()=>{assert.match(app,/route === "tasks"/);assert.match(read('inspector.html'),/href="#tasks"/);assert.doesNotMatch(app,/dashboard\.html|iframe/)});
test('Record repository scopes every page to authenticated organization and creator',()=>{assert.match(repository,/where\("organizationId", "==", caller\.organizationId\)/);assert.match(repository,/where\("createdByUid", "==", caller\.uid\)/);assert.match(repository,/owns\(cursor\.data\(\), caller\)/)});
test('Record has search, status filtering and compact rows',()=>{assert.match(app,/id="task-search"/);assert.match(app,/id="task-status"/);assert.match(app,/class="report-row"/)});
test('Record pages are bounded and can be explicitly extended',()=>{assert.match(repository,/\.limit\(26\)/);assert.match(repository,/slice\(0, 25\)/);assert.match(app,/data-action="more"/)});
test('Selected record loads private before and after evidence',()=>{assert.match(app,/async function openCase/);assert.match(app,/before-evidence/);assert.match(app,/after-evidence/);assert.match(app,/\.evidence\(key\)/)});
test('Record refresh only accepts the current authenticated session response',()=>{assert.match(app,/epoch !== sessionEpoch/);assert.match(app,/api\.list/);assert.match(app,/await refresh\(\)/)});

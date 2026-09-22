'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const page=fs.readFileSync(path.join(root,'dashboard.html'),'utf8');

test('Inspector record is a lightweight in-page route, not a modal',()=>{
  assert.match(page,/id="inspector-record-page"/);
  assert.match(page,/body\.inspector-record-view #inspector-record-page/);
  assert.match(page,/function openInspectorRecord\(\)/);
  assert.doesNotMatch(page,/<dialog[^>]+inspector-record/i);
  assert.doesNotMatch(page,/showModal\(\)[\s\S]{0,80}inspectorRecord/i);
});

test('Inspector record reuses only the already scoped personal observation set',()=>{
  const start=page.indexOf('function inspectorRecordFilteredRows()');
  const end=page.indexOf('function inspectorRecordWhen',start);
  const block=page.slice(start,end);
  assert.match(block,/ownPersonalObservations\(\)/);
  assert.doesNotMatch(block,/collection\(|where\(|getDocs\(|onSnapshot\(/);
  assert.match(page,/return observationsData\.filter\(o=>o\.organizationId===organizationId&&o\.createdByUid===uid\)/);
});

test('Inspector record has search, status filter, date-time and compact rows',()=>{
  assert.match(page,/id="inspectorRecordSearch"/);
  assert.match(page,/id="inspectorRecordStatusFilter"/);
  assert.match(page,/inspectorRecordStatus==='ALL'\|\|o\.status===inspectorRecordStatus/);
  assert.match(page,/formatObservationDate\(observation\?\.createdAt\|\|observation\?\.date/);
  assert.match(page,/class="inspector-record-row"/);
});

test('Dock سجل opens the in-page record and home exits it',()=>{
  assert.match(page,/\['mobileNavLog',\(\)=>openInspectorRecord\(\)\]/);
  assert.match(page,/\['mobileNavHome',\(\)=>\{closeInspectorRecord\(\)/);
  assert.match(page,/document\.getElementById\('refLogBtn'\)\?\.addEventListener\('click',focusPersonalObservations\)/);
  assert.match(page,/function focusPersonalObservations\(\)\{ openInspectorRecord\(\); \}/);
});

test('Record details load evidence only after a selected record is opened',()=>{
  const start=page.indexOf('async function showInspectorRecordDetail');
  const end=page.indexOf('function showInspectorRecordList',start);
  const block=page.slice(start,end);
  assert.match(block,/resolveEvidenceReference\(obs\.imagePath\)/);
  assert.match(block,/resolveEvidenceReference\(obs\.afterImagePath\)/);
  assert.match(block,/inspectorRecordSelectedId=docId/);
});

test('Record stays synchronized with the trusted observation stream',()=>{
  assert.match(page,/renderObservationsList\(observationsData\);\s*renderInspectorRecord\(\);\s*renderPersonalMap\(\);/);
  assert.match(page,/renderInspectorCounts\(\);\s*renderInspectorRecord\(\);\s*renderPersonalMap\(\);/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const lands = fs.readFileSync('lands/index.html','utf8');
const css = fs.readFileSync('lands/registry-table.css','utf8');
const detail = lands.slice(lands.indexOf('function decisionDetailView()'),lands.indexOf('function decisionTwinTab('));
const registry = lands.slice(lands.indexOf('function registryView()'),lands.indexOf('function rerenderRegistry('));
test('Decision KPIs: five existing metrics and fifth spans mobile grid',()=>{
  const hero = detail.slice(0,detail.indexOf('function grantAttachmentsCell('));
  assert.match(hero,/summary-strip decision-grant-kpis/);
  assert.equal((hero.match(/class="summary-seg"/g)||[]).length,5);
  assert.match(css,/\.decision-grant-kpis>\.summary-seg:last-child\s*\{[^}]*grid-column:1\/-1/);
  assert.match(hero,/متوسط اكتمال البيانات/);
  assert.match(hero,/مكتمل بيانات/);
});
test('Mobile decision cards re-use real grant fields, status and canonical completeness',()=>{
  assert.match(detail,/function decisionGrantMobileCard\(g, canArchiveGrant\)/);
  assert.match(detail,/mod\.grantNumberLabel\(g\)/);
  assert.match(detail,/mod\.grantReferenceLabel\(g, "plan"/);
  assert.match(detail,/mod\.grantReferenceLabel\(g, "parcel"/);
  assert.match(detail,/grantAttachmentsCell\(g\)/);
  assert.match(detail,/grantCompletenessCell\(g\)/);
  assert.match(detail,/decisionGrantMobileCard\(g, canArchiveGrant\)/);
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/body \.grant-registry-scroll\{display:none!important\}/);
  assert.match(css,/body \.decision-mobile-grant-list\{display:grid/);
});
test('Desktop grant table remains, and mobile discard is creator-and-draft gated',()=>{
  assert.match(detail,/data-table grant-registry-table/);
  assert.match(detail,/g\.status === "draft" && g\.created_by === session\.firebaseUid/);
  assert.match(registry,/!g\.archived/);
  assert.match(lands,/function discardDraftGrant\(grantId\)/);
  assert.match(lands,/await client\.discardDraftGrant\(/);
});

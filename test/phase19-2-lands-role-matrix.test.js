'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const manager=read('manager.html');
const login=read('login.html');
const adapter=read('manager-lands-adapter.js');

test('Lands manager workspace is exposed from municipality manager',()=>{
  assert.match(manager,/إدارة الأراضي والممتلكات/);
  assert.match(manager,/إجمالي سجلات الأراضي/);
  assert.match(manager,/الملف الرقمي/);
  assert.match(manager,/Smart Completeness Engine/);
  assert.match(manager,/GIS · بيانات موثّقة فقط/);
});

test('Lands manager digital record uses authoritative relationships',()=>{
  for(const label of ['المستفيد','الأمر السامي','قرار التخصيص','المخطط','القطعة']){
    assert.match(manager,new RegExp(label));
  }
  assert.match(adapter,/beneficiary_id|beneficiaryId/);
  assert.match(adapter,/royal_order_id|royalOrderId/);
  assert.match(adapter,/allocation_decision_id|allocationDecisionId/);
  assert.match(adapter,/plan_id|planId/);
  assert.match(adapter,/parcel_id|parcelId/);
});

test('Lands department head and employee are distinct trusted roles',()=>{
  assert.match(login,/lands_department_manager/);
  assert.match(login,/lands_employee/);
  assert.match(login,/canonicalLandsPath/);
});

test('Lands SSO redirect carries only an opaque handoff code',()=>{
  assert.match(login,/fetch\('\/api\/organization\/context'/);
  assert.match(login,/landsUrl\.searchParams\.set\('code', handoffCode\)/);
  const block=login.slice(login.indexOf('const landsUrl = new URL'),login.indexOf('window.location.href = landsUrl.toString();')+80);
  assert.doesNotMatch(block,/password|idToken|customToken/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'manager-lands-adapter.js'), 'utf8');

test('Lands manager navigation exposes the municipality digital record', () => {
  assert.match(manager, /\{ id: 'file', label: 'الملف الرقمي' \}/);
  assert.match(manager, /landsScreenIsFile: landsScreen === 'file'/);
});

test('Registry rows open the exact selected record in the digital file', () => {
  assert.match(manager, /landsSelectedId: r\.id, landsScreen: 'file'/);
  assert.match(manager, /landsRegistryAll\.find\(r => r\.id === st\.landsSelectedId\)/);
});

test('Digital record shows authoritative grant relationships and completeness', () => {
  for (const label of ['المستفيد','الأمر السامي','قرار التخصيص','المخطط','القطعة','Smart Completeness Engine']) {
    assert.ok(manager.includes(label), `missing digital-record label: ${label}`);
  }
  assert.match(manager, /landsMissingRequirements/);
  assert.match(manager, /landsRecordDocuments/);
  assert.match(manager, /landsRecordSpatialLabel/);
});

test('Manager Lands adapter resolves related records from authoritative collections', () => {
  for (const collection of ['royalOrders','allocationDecisions','beneficiaries','plans','parcels']) {
    assert.ok(adapter.includes(`\${base}/${collection}`), `missing authoritative collection listener: ${collection}`);
  }
  assert.match(adapter, /beneficiariesById\.get\(g\.beneficiary_id\)/);
  assert.match(adapter, /royalOrdersById\.get\(g\.royal_order_id\)/);
  assert.match(adapter, /allocationDecisionsById\.get\(g\.allocation_decision_id\)/);
  assert.match(adapter, /plansById\.get\(g\.plan_id\)/);
  assert.match(adapter, /parcelsById\.get\(g\.parcel_id\)/);
});

test('Manager Lands presentation no longer depends on legacy nested grant fields', () => {
  assert.doesNotMatch(adapter, /g\.beneficiary\?\.name/);
  assert.doesNotMatch(adapter, /g\.royal_order\?\.number/);
  assert.doesNotMatch(adapter, /g\.allocation_decision\?\.number/);
});

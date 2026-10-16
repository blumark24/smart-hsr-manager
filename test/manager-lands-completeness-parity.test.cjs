'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const adapterSource = fs.readFileSync(path.join(root, 'manager-lands-adapter.js'), 'utf8');
const landsSource = fs.readFileSync(path.join(root, 'lands/client/lands-domain.js'), 'utf8');
const managerSource = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');

function extractCalculator(source, prefix = '') {
  const escaped = prefix ? 'export ' : '';
  const expression = new RegExp('^' + escaped + 'function computeGrantCompleteness\\(grant\\) \\{[\\s\\S]*?^\\}', 'm');
  const match = source.match(expression);
  assert.ok(match, 'missing five-axis completeness calculator');
  return match[0].replace(/^export /, '');
}

function managerFunctions() {
  const context = vm.createContext({
    window: {},
    location: { hostname: 'audit.invalid', search: '' },
    URLSearchParams,
  });
  vm.runInContext(adapterSource, context);
  return {
    compute: vm.runInContext('computeGrantCompleteness', context),
    buildViewData: vm.runInContext('buildViewData', context),
  };
}

const jsonCopy = value => JSON.parse(JSON.stringify(value));

test('manager calculation is an exact mirror of canonical Lands business policy', () => {
  assert.equal(extractCalculator(adapterSource), extractCalculator(landsSource, 'export'));
});

test('manager and Lands score identical synthetic grants with and without GIS/document references', async () => {
  const { computeGrantCompleteness } = await import('../lands/client/lands-domain.js');
  const { compute } = managerFunctions();
  const complete = {
    beneficiary: { name: 'Synthetic beneficiary', national_id: 'NOT-REAL' },
    royal_order: { number: 'TEST-ORDER', date: '1448-01-01' },
    allocation_decision: { number: 'TEST-ALLOCATION', date: '1448-01-02' },
    plan_reference_number: 'TEST-PLAN',
    parcel_reference_number: 'TEST-PARCEL',
    conveyance: { letter_number: 'TEST-LETTER', letter_date: '1448-01-03' },
  };
  const cases = [
    {},
    { beneficiary: complete.beneficiary },
    { ...complete },
    { ...complete, document_ids: [], plan_id: null, parcel_id: null },
    { ...complete, beneficiary_id: null, royal_order_id: null, allocation_decision_id: null },
    { ...complete, parcel_reference_number: null },
    { ...complete, conveyance: { letter_number: 'TEST-LETTER' } },
    { beneficiary_id: 'legacy-only', royal_order_id: 'legacy-only', allocation_decision_id: 'legacy-only', plan_id: 'legacy-only', parcel_id: 'legacy-only', document_ids: ['legacy-doc'] },
    { ...complete, beneficiary: null, royal_order: {}, allocation_decision: null, conveyance: null },
  ];
  for (const [index, grant] of cases.entries()) {
    assert.deepEqual(jsonCopy(compute(grant)), computeGrantCompleteness(grant), 'scenario ' + index);
  }
  assert.equal(compute(complete).percentage, 100);
  assert.equal(compute(cases[7]).percentage, 0, 'legacy links cannot impersonate business completeness');
});

test('manager KPI uses canonical 100% while missing documents and unverified GIS remain distinct', () => {
  const { compute, buildViewData } = managerFunctions();
  const grant = {
    id: 'synthetic-grant',
    status: 'approved',
    grant_number: 'TEST-001',
    beneficiary: { name: 'Synthetic', national_id: 'NOT-REAL' },
    royal_order: { number: 'TEST-ROYAL', date: '1448-01-01' },
    allocation_decision: { number: 'TEST-ALLOC', date: '1448-01-02' },
    plan_reference_number: 'PLAN-TEST',
    parcel_reference_number: 'PARCEL-TEST',
    conveyance: { letter_number: 'LETTER-TEST', letter_date: '1448-01-03' },
  };
  const data = buildViewData(
    [{ ...grant, completeness: compute(grant) }],
    [],
    { royalOrders: [], allocationDecisions: [], beneficiaries: [], plans: [], parcels: [] },
    [],
    'unavailable'
  );
  assert.equal(data.kpi.complete, '1');
  assert.equal(data.kpi.avgPercent, '100%');
  assert.equal(data.registry[0].completion, '100%');
  assert.deepEqual(jsonCopy(data.registry[0].missingRequirements), []);
  assert.equal(data.kpi.missingDocs, '1');
  assert.equal(data.kpi.noLocation, '1');
});

test('digital file labels the same five canonical missing axes', () => {
  assert.match(managerSource, /plan_parcel: 'رقما المخطط والقطعة'/);
  assert.match(managerSource, /conveyance: 'خطاب الإفراغ'/);
  assert.match(managerSource, /السجل مكتمل وفق محاور الاكتمال الخمسة/);
  assert.doesNotMatch(managerSource, /السجل مكتمل وفق عناصر التحقق الستة/);
});

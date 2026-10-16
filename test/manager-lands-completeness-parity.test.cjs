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

test('manager digital record displays current Lands embedded values without requiring foreign-key links', () => {
  const { buildViewData } = managerFunctions();
  const grant = {
    id: 'internal-opaque-id',
    status: 'approved',
    grant_number: ' 0012/1448 ',
    beneficiary: { name: 'Synthetic beneficiary', national_id: 'SYNTHETIC' },
    royal_order: { number: 'ROYAL-123', date: '1448-01-01' },
    allocation_decision: { number: 'DECISION-123', date: '1448-01-02' },
    plan_reference_number: 'PLAN-007',
    parcel_reference_number: 'PARCEL-009',
    conveyance: { letter_number: 'LETTER-123', letter_date: '1448-01-03' }
  };
  const view = buildViewData([grant], [], {}, [], 'unavailable');
  const row = view.registry[0];
  assert.equal(row.reference, '0012/1448');
  assert.equal(row.beneficiary, 'Synthetic beneficiary');
  assert.equal(row.royalOrder, 'ROYAL-123');
  assert.equal(row.allocationDecision, 'DECISION-123');
  assert.equal(row.plan, 'PLAN-007');
  assert.equal(row.parcel, 'PARCEL-009');
  assert.equal(row.completion, '100%');
  assert.equal(view.kpi.missingDocs, '1');
  assert.equal(view.kpi.noLocation, '1');
  assert.equal(row.id, 'internal-opaque-id');
});

test('legacy related-record details still display when embedded business fields are absent', () => {
  const { buildViewData } = managerFunctions();
  const grant = {
    id: 'internal-old-record', status: 'draft',
    beneficiary_id: 'b-1', royal_order_id: 'r-1', allocation_decision_id: 'a-1',
    plan_id: 'p-1', parcel_id: 'pc-1'
  };
  const related = {
    beneficiaries: [{ id: 'b-1', name: 'Legacy beneficiary' }],
    royalOrders: [{ id: 'r-1', reference_id: 'ROYAL-LEGACY' }],
    allocationDecisions: [{ id: 'a-1', reference_id: 'DECISION-LEGACY' }],
    plans: [{ id: 'p-1', reference_id: 'PLAN-LEGACY' }],
    parcels: [{ id: 'pc-1', reference_id: 'PARCEL-LEGACY' }]
  };
  const view = buildViewData([grant], [], related, [], 'unavailable');
  const row = view.registry[0];
  assert.equal(row.reference, 'ROYAL-LEGACY');
  assert.equal(row.beneficiary, 'Legacy beneficiary');
  assert.equal(row.royalOrder, 'ROYAL-LEGACY');
  assert.equal(row.allocationDecision, 'DECISION-LEGACY');
  assert.equal(row.plan, 'PLAN-LEGACY');
  assert.equal(row.parcel, 'PARCEL-LEGACY');
  assert.equal(row.completion, '0%', 'business completeness is not guessed from legacy links');
  assert.equal(view.priorities[0].beneficiary, 'Legacy beneficiary');
  assert.equal(view.priorities[0].reference, 'ROYAL-LEGACY');
});

test('missing business grant number never displays internal record identifier', () => {
  const { buildViewData } = managerFunctions();
  const view = buildViewData([{ id: 'internal-private-key', status: 'draft' }], [], {}, [], 'unavailable');
  assert.equal(view.registry[0].reference, 'غير مسجّل');
  assert.equal(view.priorities[0].reference, 'غير مسجّل');
});

test('digital file labels the same five canonical missing axes', () => {
  assert.match(managerSource, /plan_parcel: 'رقما المخطط والقطعة'/);
  assert.match(managerSource, /conveyance: 'خطاب الإفراغ'/);
  assert.match(managerSource, /السجل مكتمل وفق محاور الاكتمال الخمسة/);
  assert.doesNotMatch(managerSource, /السجل مكتمل وفق عناصر التحقق الستة/);
});

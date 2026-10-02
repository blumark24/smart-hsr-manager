'use strict';
// Unified Identity & Workspace Access — unit, API execution and negative
// access tests. The real api/admin/users.js handler and the REAL authz.js run
// against an in-memory Firebase Admin fake (require.cache injection), so the
// server-side authorization decisions below are the production code paths.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..');
const WA = require(path.join(root, 'workspace-access.js'));

// ---------------------------------------------------------------------------
// 1. Pure resolver — capabilities (dual-read) and workspaces
// ---------------------------------------------------------------------------

const ORG = { organizationId: 'org-a', active: true };

test('capabilities are exactly the four approved identifiers', () => {
  assert.deepEqual([...WA.CAPABILITIES], ['mobility.access', 'vehicle.checkout', 'vehicle.drive', 'vehicle.return']);
});

test('legacy dual-read: mobilityAccess + vehicleEligible derive capabilities with no migration', () => {
  assert.deepEqual([...WA.resolveCapabilities({ ...ORG, role: 'inspector' })], []);
  assert.deepEqual([...WA.resolveCapabilities({ ...ORG, mobilityAccess: { enabled: true, role: 'employee' } })], ['mobility.access']);
  assert.deepEqual(
    [...WA.resolveCapabilities({ ...ORG, mobilityAccess: { enabled: true, role: 'employee' }, vehicleEligible: true })],
    ['mobility.access', 'vehicle.checkout', 'vehicle.drive', 'vehicle.return']);
  // pre-06A record: legacy scalar role only
  assert.deepEqual([...WA.resolveCapabilities({ ...ORG, role: 'employee', vehicleEligible: true })], ['mobility.access', 'vehicle.checkout', 'vehicle.drive', 'vehicle.return']);
  // vehicleEligible alone (no Mobility role) grants nothing
  assert.deepEqual([...WA.resolveCapabilities({ ...ORG, role: 'inspector', vehicleEligible: true })], []);
});

test('a present mobilityAccess key stays authoritative: disabled/malformed never falls back to a stale role', () => {
  for (const bad of [{ enabled: false, role: null }, null, 'x', 5, {}, { enabled: true, role: 'supervisor' }]) {
    assert.equal(WA.resolveMobilityRole({ ...ORG, role: 'employee', mobilityAccess: bad }), null, JSON.stringify(bad));
  }
});

test('entitlements, once present, are authoritative and fail closed', () => {
  const legacy = { ...ORG, mobilityAccess: { enabled: true, role: 'employee' }, vehicleEligible: true };
  // revoked via entitlements even though legacy fields still say yes
  assert.deepEqual([...WA.resolveCapabilities({ ...legacy, entitlements: { capabilities: [] } })], []);
  assert.equal(WA.resolveMobilityRole({ ...legacy, entitlements: { capabilities: [] } }), null);
  // malformed entitlements never fall back to legacy
  for (const bad of [null, 'x', {}, { capabilities: 'mobility.access' }, { capabilities: [1, {}] }]) {
    assert.deepEqual([...WA.resolveCapabilities({ ...legacy, entitlements: bad })], [], JSON.stringify(bad));
  }
  // vehicle.* without mobility.access is meaningless
  assert.deepEqual([...WA.resolveCapabilities({ ...ORG, entitlements: { capabilities: ['vehicle.drive'] } })], []);
  // unknown strings are dropped
  assert.deepEqual([...WA.resolveCapabilities({ ...ORG, entitlements: { capabilities: ['mobility.access', 'admin.everything'] } })], ['mobility.access']);
});

test('capability-only user is an execution-only Mobility employee (least privilege)', () => {
  const d = { ...ORG, entitlements: { capabilities: ['mobility.access', 'vehicle.drive'] } };
  assert.equal(WA.resolveMobilityRole(d), 'employee');
  // an existing operational role is preserved, never elevated
  assert.equal(WA.resolveMobilityRole({ ...d, mobilityAccess: { enabled: true, role: 'mobility_head' } }), 'mobility_head');
});

test('validateCapabilitySelection allowlists and requires mobility.access for vehicle.*', () => {
  assert.equal(WA.validateCapabilitySelection(['mobility.access', 'vehicle.drive']).ok, true);
  assert.equal(WA.validateCapabilitySelection([]).ok, true);
  assert.equal(WA.validateCapabilitySelection(['vehicle.drive']).reason, 'mobility_access_required');
  assert.equal(WA.validateCapabilitySelection(['mobility.access', 'root']).reason, 'unknown_capability');
  assert.equal(WA.validateCapabilitySelection('mobility.access').reason, 'invalid_capabilities');
  assert.equal(WA.validateCapabilitySelection([1]).reason, 'invalid_capabilities');
});

test('account state: only missing record / inactive / no organization are invalid', () => {
  assert.equal(WA.accountState(null).reason, 'no_record');
  assert.equal(WA.accountState({ organizationId: 'o', active: false }).reason, 'inactive');
  assert.equal(WA.accountState({ organizationId: '  ' }).reason, 'no_organization');
  assert.equal(WA.accountState({ organizationId: 'o' }).valid, true);
});

test('primary workspace stays institutional; Mobility is an additional workspace', () => {
  const field = WA.resolveWorkspaces({ ...ORG, role: 'inspector', institutionalRole: 'employee', administration: 'إدارة الحصر الميداني', entitlements: { capabilities: ['mobility.access'] } });
  assert.equal(field.primary, 'field');
  assert.deepEqual(field.workspaces.map(w => w.id), ['field', 'mobility']);
  assert.equal(field.workspaces[0].route, 'dashboard.html');
  assert.equal(field.workspaces[1].route, 'department-head.html?mode=mobility');
});

test('mobility.access with no department/administration makes Mobility the effective primary', () => {
  const r = WA.resolveWorkspaces({ ...ORG, entitlements: { capabilities: ['mobility.access', 'vehicle.drive'] } });
  assert.equal(r.primary, 'mobility');
  assert.deepEqual(r.workspaces.map(w => w.id), ['mobility']);
});

test('mobility.access on a department head / supervisor / lands user adds Mobility without changing their primary', () => {
  const cap = { entitlements: { capabilities: ['mobility.access'] } };
  const head = WA.resolveWorkspaces({ ...ORG, ...cap, institutionalRole: 'department_head', administration: 'إدارة الحصر الميداني', department: 'الحصر' });
  assert.equal(head.primary, 'field');
  assert.equal(head.workspaces[0].route, 'department-head.html');
  assert.ok(head.workspaces.some(w => w.id === 'mobility'));
  const sup = WA.resolveWorkspaces({ ...ORG, ...cap, role: 'supervisor' });
  assert.equal(sup.primary, 'field');
  assert.equal(sup.workspaces[0].route, 'manager.html');
  const lands = WA.resolveWorkspaces({ ...ORG, ...cap, landsAccess: { enabled: true, role: 'lands_employee' }, institutionalRole: 'employee', administration: 'إدارة الأراضي والممتلكات' });
  assert.equal(lands.primary, 'lands');
  assert.equal(lands.workspaces[0].route, null);
  assert.equal(lands.workspaces[0].handoff, true);
});

test('canonical Administrative Affairs identity keeps its own workspace; mobility is additional', () => {
  const r = WA.resolveWorkspaces({ ...ORG, institutionalRole: 'department_head', administration: 'الشؤون الإدارية', entitlements: { capabilities: ['mobility.access'] } });
  assert.equal(r.primary, 'admin_affairs');
  assert.deepEqual(r.workspaces.map(w => w.id), ['admin_affairs', 'mobility']);
});

test('active user with a valid organization but no authorized workspace resolves valid + empty', () => {
  const r = WA.resolveWorkspaces({ ...ORG, institutionalRole: 'employee', administration: 'الموارد البشرية' });
  assert.equal(r.valid, true);
  assert.equal(r.primary, null);
  assert.deepEqual(r.workspaces, []);
});

test('stale canonical path with a missing entitlement does not invent a workspace', () => {
  // HR path says Field but no Field role/department-head status exists
  const r = WA.resolveWorkspaces({ ...ORG, institutionalRole: 'employee', administration: 'إدارة الحصر الميداني' });
  assert.deepEqual(r.workspaces, []);
});

test('invalid accounts resolve to no workspaces at all', () => {
  for (const d of [null, { organizationId: 'o', active: false, role: 'inspector' }, { role: 'inspector' }]) {
    const r = WA.resolveWorkspaces(d);
    assert.equal(r.valid, false);
    assert.deepEqual(r.workspaces, []);
  }
});

test('workspaceForPage maps pages to workspaces (mode=mobility is Mobility only)', () => {
  assert.equal(WA.workspaceForPage('/department-head.html', '?mode=mobility'), 'mobility');
  assert.equal(WA.workspaceForPage('/department-head.html', ''), 'field');
  assert.equal(WA.workspaceForPage('/admin-affairs.html', ''), 'admin_affairs');
  assert.equal(WA.workspaceForPage('/dashboard.html', ''), 'field');
  assert.equal(WA.workspaceForPage('/index.html', ''), null);
});

// ---------------------------------------------------------------------------
// 2. API execution — real handler + real authz, in-memory Firebase Admin
// ---------------------------------------------------------------------------

const firebaseAdminPath = path.join(root, 'api', '_lib', 'firebaseAdmin.js');
const authzPath = path.join(root, 'api', '_lib', 'authz.js');
const usersPath = path.join(root, 'api', 'admin', 'users.js');
const enterpriseHelpers = ['serviceEntitlements.js', 'ownerOpsSupport.js', 'landsBridge.js', 'landsManagerBootstrap.js', 'landsSyncReconciliation.js']
  .map(f => path.join(root, 'api', '_lib', f));

const SERVER_TS = { __serverTimestamp: true };
const DELETE = { __delete: true };

function buildFakeDb(seed) {
  const store = new Map();
  const key = (c, i) => `${c}/${i}`;
  let auto = 0;
  for (const [c, docs] of Object.entries(seed)) for (const [i, d] of Object.entries(docs)) store.set(key(c, i), JSON.parse(JSON.stringify(d)));
  const apply = (existing, data) => {
    const out = { ...existing };
    for (const [k, v] of Object.entries(data)) {
      if (v && v.__delete) delete out[k];
      else out[k] = v && v.__serverTimestamp ? 'TS' : v;
    }
    return out;
  };
  function snap(c, i) {
    const ref = docRef(c, i);
    const data = store.get(key(c, i));
    return { id: i, exists: store.has(key(c, i)), ref, data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined) };
  }
  function docRef(c, i) {
    return {
      id: i, path: key(c, i),
      get: async () => snap(c, i),
      set: async (d, o) => { store.set(key(c, i), apply(o && o.merge ? (store.get(key(c, i)) || {}) : {}, d)); },
      update: async d => { store.set(key(c, i), apply(store.get(key(c, i)) || {}, d)); },
    };
  }
  function query(c, filters, max) {
    return {
      where(f, _o, v) { return query(c, [...filters, [f, v]], max); },
      limit(n) { return query(c, filters, n); },
      get: async () => {
        let docs = [...store.entries()].filter(([k, v]) => k.startsWith(`${c}/`) && filters.every(([f, val]) => v[f] === val)).map(([k]) => snap(c, k.split('/')[1]));
        if (max) docs = docs.slice(0, max);
        return { docs, empty: docs.length === 0 };
      },
    };
  }
  return {
    collection(c) {
      return {
        doc(i) { return docRef(c, i || `auto${++auto}`); },
        add: async d => { const i = `auto${++auto}`; store.set(key(c, i), apply({}, d)); return docRef(c, i); },
        where(f, _o, v) { return query(c, [[f, v]]); },
        get: async () => ({ docs: [...store.keys()].filter(k => k.startsWith(`${c}/`)).map(k => snap(c, k.split('/')[1])) }),
      };
    },
    runTransaction: async fn => fn({
      get: async ref => ref.get(),
      set: (ref, d, o) => { ref.set(d, o); },
      update: (ref, d) => { ref.update(d); },
      create: (ref, d) => { ref.set(d); },
    }),
    _dump: () => Object.fromEntries(store),
  };
}

function buildHandler(seed) {
  const fakeDb = buildFakeDb(seed);
  const fakeAuth = { verifyIdToken: async token => { if (!token || token === 'bad') throw new Error('bad'); return { uid: token, auth_time: Math.floor(Date.now() / 1000) }; } };
  const fakeAdmin = { getAuth: () => fakeAuth, getDb: () => fakeDb, getAdmin: () => ({}), FieldValue: { serverTimestamp: () => SERVER_TS, delete: () => DELETE } };
  for (const p of [firebaseAdminPath, authzPath, usersPath, ...enterpriseHelpers]) delete require.cache[p];
  require.cache[firebaseAdminPath] = { id: firebaseAdminPath, filename: firebaseAdminPath, loaded: true, exports: fakeAdmin };
  const handler = require(usersPath);
  for (const p of [usersPath, authzPath, firebaseAdminPath, ...enterpriseHelpers]) delete require.cache[p];
  return { handler, db: fakeDb };
}

function call(handler, uid, body) {
  const req = { method: 'POST', headers: { authorization: uid ? `Bearer ${uid}` : '' }, body };
  let status = 0, payload = null;
  const res = { set statusCode(v) { status = v; }, get statusCode() { return status; }, setHeader() {}, end(t) { payload = JSON.parse(t); } };
  return handler(req, res).then(() => ({ status, body: payload }));
}

const U = (extra) => ({ organizationId: 'org-a', active: true, name: 'Test', ...extra });
function seed() {
  return {
    managers: { 'mgr-a': { role: 'manager', organizationId: 'org-a', active: true }, 'mgr-b': { role: 'manager', organizationId: 'org-b', active: true } },
    users: {
      'inspector': U({ role: 'inspector' }),
      'inspector-mob': U({ role: 'inspector', mobilityAccess: { enabled: true, role: 'employee' } }),
      'mob-only-cap': U({ entitlements: { capabilities: ['mobility.access', 'vehicle.checkout', 'vehicle.drive', 'vehicle.return'] } }),
      'cap-access-only': U({ entitlements: { capabilities: ['mobility.access'] } }),
      'cap-return-only': U({ entitlements: { capabilities: ['mobility.access', 'vehicle.return'] } }),
      'cap-checkout-only': U({ entitlements: { capabilities: ['mobility.access', 'vehicle.checkout'] } }),
      'cap-drive-only': U({ entitlements: { capabilities: ['mobility.access', 'vehicle.drive'] } }),
      'legacy-eligible': U({ mobilityAccess: { enabled: true, role: 'employee' }, vehicleEligible: true }),
      'legacy-not-eligible': U({ mobilityAccess: { enabled: true, role: 'employee' }, vehicleEligible: false }),
      'revoked-by-ent': U({ mobilityAccess: { enabled: true, role: 'employee' }, vehicleEligible: true, entitlements: { capabilities: [] } }),
      'disabled-stale': U({ role: 'employee', vehicleEligible: true, mobilityAccess: { enabled: false, role: null } }),
      'no-workspace': U({ institutionalRole: 'employee', administration: 'الموارد البشرية' }),
      'inactive': U({ role: 'inspector', active: false }),
      'no-org': { role: 'inspector', active: true },
      'other-org-user': { ...U({ role: 'inspector' }), organizationId: 'org-b' },
      'target-legacy': U({ mobilityAccess: { enabled: true, role: 'employee' } }),
      'target-ent': U({ mobilityAccess: { enabled: true, role: 'employee' }, entitlements: { capabilities: ['mobility.access', 'vehicle.drive'] } }),
      'target-b': { ...U({ role: 'inspector' }), organizationId: 'org-b' },
    },
    employees: { 'emp-1': { organizationId: 'org-a', authUid: 'target-ent', products: { mobility: { enabled: true, role: 'employee', vehicleEligible: true } } } },
  };
}

test('API resolveWorkspaces: identity comes from the verified token + live record, never the body', async () => {
  const { handler } = buildHandler(seed());
  const r = await call(handler, 'inspector', { action: 'resolveWorkspaces', uid: 'mob-only-cap', organizationId: 'org-b', role: 'manager' });
  assert.equal(r.status, 200);
  assert.equal(r.body.kind, 'workforce');
  assert.deepEqual(r.body.workspaces.map(w => w.id), ['field']);
  assert.deepEqual(r.body.capabilities, []);
});

test('API resolveWorkspaces: field user with Mobility entitlement gets both, Field primary, allowed flags are authoritative', async () => {
  const { handler } = buildHandler(seed());
  const r = await call(handler, 'inspector-mob', { action: 'resolveWorkspaces', workspace: 'mobility' });
  assert.equal(r.body.primary, 'field');
  assert.deepEqual(r.body.workspaces.map(w => w.id), ['field', 'mobility']);
  assert.equal(r.body.allowed, true);
  const denied = await call(handler, 'inspector', { action: 'resolveWorkspaces', workspace: 'mobility' });
  assert.equal(denied.status, 200);
  assert.equal(denied.body.valid, true);
  assert.equal(denied.body.allowed, false);
});

test('API resolveWorkspaces: capability-only user lands on Mobility; extra workspace is not invented', async () => {
  const { handler } = buildHandler(seed());
  const r = await call(handler, 'mob-only-cap', { action: 'resolveWorkspaces', workspace: 'field' });
  assert.equal(r.body.primary, 'mobility');
  assert.equal(r.body.allowed, false);
  assert.deepEqual(r.body.capabilities, ['mobility.access', 'vehicle.checkout', 'vehicle.drive', 'vehicle.return']);
});

test('API resolveWorkspaces: valid identity without workspace is valid + empty (session kept by the client)', async () => {
  const { handler } = buildHandler(seed());
  const r = await call(handler, 'no-workspace', { action: 'resolveWorkspaces' });
  assert.equal(r.body.valid, true);
  assert.deepEqual(r.body.workspaces, []);
  assert.equal(r.body.primary, null);
});

test('NEGATIVE: inactive, no-organization, missing-record and unauthenticated callers get no workspace', async () => {
  const { handler } = buildHandler(seed());
  for (const uid of ['inactive', 'no-org', 'ghost']) {
    const r = await call(handler, uid, { action: 'resolveWorkspaces', workspace: 'field' });
    assert.equal(r.status, 200, uid);
    assert.equal(r.body.valid, false, uid);
    assert.equal(r.body.allowed, false, uid);
    assert.deepEqual(r.body.workspaces, [], uid);
  }
  assert.equal((await call(handler, '', { action: 'resolveWorkspaces' })).status, 401);
  assert.equal((await call(handler, 'bad', { action: 'resolveWorkspaces' })).status, 401);
});

test('NEGATIVE: stale legacy role or disabled/revoked entitlement never grants Mobility', async () => {
  const { handler } = buildHandler(seed());
  for (const uid of ['disabled-stale', 'revoked-by-ent']) {
    const r = await call(handler, uid, { action: 'resolveWorkspaces', workspace: 'mobility' });
    assert.equal(r.body.allowed, false, uid);
  }
});

test('API resolveWorkspaces: managers are reported as managers; unknown workspace id is rejected', async () => {
  const { handler } = buildHandler(seed());
  const m = await call(handler, 'mgr-a', { action: 'resolveWorkspaces', workspace: 'mobility' });
  assert.equal(m.body.kind, 'manager');
  assert.deepEqual(m.body.workspaces, []);
  const bad = await call(handler, 'inspector', { action: 'resolveWorkspaces', workspace: 'owner' });
  assert.equal(bad.status, 400);
});

// ---- per-action capability enforcement (server-side, real authz) ----

const advance = (uid, toStatus) => ({ action: 'employeeAdvanceMission', missionId: 'm-1', toStatus });

test('NEGATIVE: mobility.access alone (no vehicle capability) cannot operate a vehicle', async () => {
  const { handler } = buildHandler(seed());
  for (const body of [advance('x', 'READY'), advance('x', 'COMPLETED'), { action: 'employeeReturnVehicle', missionId: 'm-1' }, { action: 'createIncident', missionId: 'm-1', severity: 'LOW' }]) {
    const r = await call(handler, 'cap-access-only', body);
    assert.equal(r.status, 403, body.action);
    assert.equal(r.body.reason, 'assigned_vehicle_operator_required', body.action);
  }
});

test('capabilities gate each vehicle action individually', async () => {
  const { handler } = buildHandler(seed());
  // checkout-only: may start (passes gate → mission_not_found), may NOT drive-complete/return/incident
  assert.equal((await call(handler, 'cap-checkout-only', advance('x', 'IN_PROGRESS'))).body.reason, 'mission_not_found');
  assert.equal((await call(handler, 'cap-checkout-only', advance('x', 'COMPLETED'))).body.capability, 'vehicle.drive');
  assert.equal((await call(handler, 'cap-checkout-only', { action: 'employeeReturnVehicle', missionId: 'm-1' })).body.capability, 'vehicle.return');
  // drive-only: may complete, may NOT start/return
  assert.equal((await call(handler, 'cap-drive-only', advance('x', 'COMPLETED'))).body.reason, 'mission_not_found');
  assert.equal((await call(handler, 'cap-drive-only', advance('x', 'READY'))).body.capability, 'vehicle.checkout');
  assert.equal((await call(handler, 'cap-drive-only', { action: 'employeeReturnVehicle', missionId: 'm-1' })).body.capability, 'vehicle.return');
  // return-only: may return, may NOT start
  assert.equal((await call(handler, 'cap-return-only', { action: 'employeeReturnVehicle', missionId: 'm-1' })).body.reason, 'mission_not_found');
  assert.equal((await call(handler, 'cap-return-only', advance('x', 'READY'))).status, 403);
  // incident needs vehicle.drive
  assert.equal((await call(handler, 'cap-return-only', { action: 'createIncident', missionId: 'm-1', severity: 'LOW' })).body.capability, 'vehicle.drive');
  assert.equal((await call(handler, 'cap-drive-only', { action: 'createIncident', missionId: 'm-1', severity: 'LOW' })).status, 400); // passed gates → request validation
});

test('regression: legacy vehicleEligible employees keep exactly the previous behaviour', async () => {
  const { handler } = buildHandler(seed());
  assert.equal((await call(handler, 'legacy-eligible', advance('x', 'READY'))).body.reason, 'mission_not_found');
  assert.equal((await call(handler, 'legacy-eligible', { action: 'employeeReturnVehicle', missionId: 'm-1' })).body.reason, 'mission_not_found');
  assert.equal((await call(handler, 'legacy-not-eligible', advance('x', 'READY'))).body.reason, 'assigned_vehicle_operator_required');
  assert.equal((await call(handler, 'revoked-by-ent', advance('x', 'READY'))).body.reason, 'assigned_vehicle_operator_required');
  assert.equal((await call(handler, 'disabled-stale', advance('x', 'READY'))).body.reason, 'assigned_vehicle_operator_required');
  assert.equal((await call(handler, 'inspector', advance('x', 'READY'))).body.reason, 'assigned_vehicle_operator_required');
});

test('allocation target validation uses vehicle.drive (legacy flag or capability), never role alone', () => {
  const authz = require(authzPath);
  const org = 'org-a';
  assert.equal(authz.isValidMobilityAllocationTarget({ organizationId: org, mobilityAccess: { enabled: true, role: 'employee' }, vehicleEligible: true }, org), true);
  assert.equal(authz.isValidMobilityAllocationTarget({ organizationId: org, mobilityAccess: { enabled: true, role: 'employee' } }, org), false);
  assert.equal(authz.isValidMobilityAllocationTarget({ organizationId: org, entitlements: { capabilities: ['mobility.access', 'vehicle.drive'] } }, org), true);
  assert.equal(authz.isValidMobilityAllocationTarget({ organizationId: org, entitlements: { capabilities: ['mobility.access', 'vehicle.checkout'] } }, org), false);
  assert.equal(authz.isValidMobilityAllocationTarget({ organizationId: 'org-b', entitlements: { capabilities: ['mobility.access', 'vehicle.drive'] } }, org), false);
  assert.equal(authz.isValidMobilityAllocationTarget({ organizationId: org, active: false, entitlements: { capabilities: ['mobility.access', 'vehicle.drive'] } }, org), false);
  assert.equal(authz.isValidMobilityAllocationTarget({ organizationId: org, mobilityAccess: { enabled: true, role: 'employee' }, vehicleEligible: true, entitlements: { capabilities: [] } }, org), false);
});

// ---- granting capabilities (setServices) ----

test('setServices: a same-organization manager grants capabilities; only users/{uid} gains `entitlements`', async () => {
  const { handler, db } = buildHandler(seed());
  const r = await call(handler, 'mgr-a', { action: 'setServices', uid: 'inspector', capabilities: ['mobility.access', 'vehicle.drive'] });
  assert.equal(r.status, 200);
  const doc = db._dump()['users/inspector'];
  assert.deepEqual(doc.entitlements.capabilities, ['mobility.access', 'vehicle.drive']);
  assert.equal(doc.entitlements.updatedBy, 'mgr-a');
  assert.equal(doc.role, 'inspector'); // role untouched
  assert.equal(doc.organizationId, 'org-a');
  assert.equal(doc.active, true);
  const after = await call(handler, 'inspector', { action: 'resolveWorkspaces', workspace: 'mobility' });
  assert.equal(after.body.allowed, true);
});

test('NEGATIVE setServices: unknown capability, vehicle.* without access, non-array and empty change are rejected', async () => {
  const { handler, db } = buildHandler(seed());
  const before = JSON.stringify(db._dump()['users/inspector']);
  assert.equal((await call(handler, 'mgr-a', { action: 'setServices', uid: 'inspector', capabilities: ['mobility.access', 'god.mode'] })).body.reason, 'unknown_capability');
  assert.equal((await call(handler, 'mgr-a', { action: 'setServices', uid: 'inspector', capabilities: ['vehicle.drive'] })).body.reason, 'mobility_access_required');
  assert.equal((await call(handler, 'mgr-a', { action: 'setServices', uid: 'inspector', capabilities: 'mobility.access' })).body.reason, 'invalid_capabilities');
  assert.equal(JSON.stringify(db._dump()['users/inspector']), before);
});

test('NEGATIVE setServices: no self-grant, no cross-organization grant, no grant by a non-manager', async () => {
  const { handler, db } = buildHandler(seed());
  // the user trying to grant themselves
  const self = await call(handler, 'inspector', { action: 'setServices', uid: 'inspector', capabilities: ['mobility.access'] });
  assert.equal(self.status, 403);
  assert.equal(self.body.reason, 'owner_or_manager_required');
  // a Mobility employee granting a colleague
  assert.equal((await call(handler, 'legacy-eligible', { action: 'setServices', uid: 'inspector', capabilities: ['mobility.access'] })).status, 403);
  // a manager of another organization
  const cross = await call(handler, 'mgr-b', { action: 'setServices', uid: 'inspector', capabilities: ['mobility.access'] });
  assert.equal(cross.status, 403);
  assert.equal(cross.body.reason, 'cross_organization_denied');
  assert.equal(db._dump()['users/inspector'].entitlements, undefined);
});

test('setServices keeps `entitlements` coherent with legacy changes — and never migrates records without it', async () => {
  const { handler, db } = buildHandler(seed());
  // record WITH entitlements: disabling legacy Mobility revokes all capabilities
  await call(handler, 'mgr-a', { action: 'setServices', uid: 'target-ent', mobility: { enabled: false } });
  assert.deepEqual(db._dump()['users/target-ent'].entitlements.capabilities, []);
  assert.equal(db._dump()['employees/emp-1'].products.mobility.enabled, false);
  assert.equal(db._dump()['employees/emp-1'].products.mobility.vehicleEligible, false);
  // record WITHOUT entitlements: legacy write only, no entitlements key appears (no migration)
  await call(handler, 'mgr-a', { action: 'setServices', uid: 'target-legacy', vehicleEligible: true });
  const legacy = db._dump()['users/target-legacy'];
  assert.equal(legacy.vehicleEligible, true);
  assert.equal(Object.prototype.hasOwnProperty.call(legacy, 'entitlements'), false);
});

test('setServices: employees registry mirror is advisory and organization-bound', async () => {
  const { handler, db } = buildHandler(seed());
  await call(handler, 'mgr-a', { action: 'setServices', uid: 'target-ent', capabilities: ['mobility.access'] });
  assert.equal(db._dump()['employees/emp-1'].products.mobility.vehicleEligible, false);
  await call(handler, 'mgr-a', { action: 'setServices', uid: 'target-ent', capabilities: ['mobility.access', 'vehicle.drive'] });
  assert.equal(db._dump()['employees/emp-1'].products.mobility.vehicleEligible, true);
});


function delegationSeed() {
  const s = seed();
  s.users['mob-head'] = U({ mobilityAccess: { enabled: true, role: 'mobility_head' }, department: 'الحركة' });
  s.users['supervisor-a'] = U({ role: 'supervisor' });
  s.users['plain-target'] = U({ institutionalRole: 'employee' });
  s.users['expired-target'] = U({
    institutionalRole: 'employee',
    mobilityDelegation: {
      id: 'expired-1', status: 'ACTIVE',
      capabilities: ['mobility.access','vehicle.checkout','vehicle.drive','vehicle.return'],
      startsAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2026-09-02T00:00:00.000Z',
      grantedByUid: 'mob-head', grantedByRole: 'mobility_head'
    }
  });
  return s;
}

test('scoped delegation: Mobility Head can grant temporary access to an active same-org user with no department/product', async () => {
  const { handler, db } = buildHandler(delegationSeed());
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const r = await call(handler, 'mob-head', {
    action: 'grantMobilityDelegation',
    targetUid: 'plain-target',
    capabilities: ['mobility.access','vehicle.checkout','vehicle.drive','vehicle.return'],
    reason: 'مهمة تشغيلية مؤقتة',
    expiresAt: future
  });
  assert.equal(r.status, 200);
  const target = db._dump()['users/plain-target'];
  assert.equal(target.role, undefined);
  assert.equal(target.department, undefined);
  assert.equal(target.mobilityDelegation.status, 'ACTIVE');
  assert.deepEqual(target.mobilityDelegation.capabilities, ['mobility.access','vehicle.checkout','vehicle.drive','vehicle.return']);

  const resolved = await call(handler, 'plain-target', { action:'resolveWorkspaces', workspace:'mobility' });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.allowed, true);
  assert.equal(resolved.body.primary, 'mobility');
});

test('scoped delegation: existing supervisor is the only higher same-org authority; municipality manager is not given a new daily control', async () => {
  const s = delegationSeed();
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  {
    const { handler } = buildHandler(s);
    const ok = await call(handler, 'supervisor-a', {
      action:'grantMobilityDelegation', targetUid:'plain-target',
      capabilities:['mobility.access'], reason:'تفويض إشرافي', expiresAt:future
    });
    assert.equal(ok.status, 200);
  }

  {
    const { handler } = buildHandler(delegationSeed());
    const denied = await call(handler, 'mgr-a', {
      action:'grantMobilityDelegation', targetUid:'plain-target',
      capabilities:['mobility.access'], reason:'لا ينبغي', expiresAt:future
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.reason, 'mobility_delegation_authority_required');
  }
});

test('NEGATIVE scoped delegation: expiry is mandatory; self-grant, inactive target and cross-org are denied', async () => {
  const s = delegationSeed();
  s.users['inactive-target'] = U({ active:false });
  const { handler } = buildHandler(s);
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const noExpiry = await call(handler, 'mob-head', {
    action:'grantMobilityDelegation', targetUid:'plain-target',
    capabilities:['mobility.access'], reason:'x'
  });
  assert.equal(noExpiry.status, 400);
  assert.equal(noExpiry.body.reason, 'expires_at_required');

  const self = await call(handler, 'mob-head', {
    action:'grantMobilityDelegation', targetUid:'mob-head',
    capabilities:['mobility.access'], reason:'x', expiresAt:future
  });
  assert.equal(self.status, 403);
  assert.equal(self.body.reason, 'self_grant_denied');

  const inactive = await call(handler, 'mob-head', {
    action:'grantMobilityDelegation', targetUid:'inactive-target',
    capabilities:['mobility.access'], reason:'x', expiresAt:future
  });
  assert.equal(inactive.status, 409);
  assert.equal(inactive.body.reason, 'target_inactive');

  const cross = await call(handler, 'mob-head', {
    action:'grantMobilityDelegation', targetUid:'target-b',
    capabilities:['mobility.access'], reason:'x', expiresAt:future
  });
  assert.equal(cross.status, 403);
  assert.equal(cross.body.reason, 'cross_organization_denied');
});

test('expired scoped delegation grants no workspace and no vehicle operation', async () => {
  const { handler } = buildHandler(delegationSeed());
  const w = await call(handler, 'expired-target', { action:'resolveWorkspaces', workspace:'mobility' });
  assert.equal(w.body.allowed, false);
  const op = await call(handler, 'expired-target', { action:'employeeAdvanceMission', missionId:'missing', toStatus:'READY' });
  assert.equal(op.status, 403);
  assert.equal(op.body.reason, 'assigned_vehicle_operator_required');
});

test('revoke scoped delegation invalidates access immediately without deleting the user', async () => {
  const { handler, db } = buildHandler(delegationSeed());
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const granted = await call(handler, 'mob-head', {
    action:'grantMobilityDelegation', targetUid:'plain-target',
    capabilities:['mobility.access','vehicle.drive'], reason:'مؤقت', expiresAt:future
  });
  assert.equal(granted.status, 200);
  const id = granted.body.delegation.id;

  const revoked = await call(handler, 'mob-head', { action:'revokeMobilityDelegation', delegationId:id });
  assert.equal(revoked.status, 200);
  assert.equal(db._dump()['users/plain-target'].mobilityDelegation.status, 'REVOKED');
  assert.equal(db._dump()['users/plain-target'].active, true);

  const after = await call(handler, 'plain-target', { action:'resolveWorkspaces', workspace:'mobility' });
  assert.equal(after.body.allowed, false);
});

test('allocation target validation honors active scoped vehicle.drive and rejects expired delegation', () => {
  const authz = require(authzPath);
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const active = U({
    mobilityDelegation: {
      id:'g1', status:'ACTIVE', capabilities:['mobility.access','vehicle.drive'],
      startsAt:new Date(Date.now()-1000).toISOString(), expiresAt:future
    }
  });
  const expired = U({
    mobilityDelegation: {
      id:'g2', status:'ACTIVE', capabilities:['mobility.access','vehicle.drive'],
      startsAt:'2026-09-01T00:00:00.000Z', expiresAt:'2026-09-02T00:00:00.000Z'
    }
  });
  assert.equal(authz.isValidMobilityAllocationTarget(active, 'org-a'), true);
  assert.equal(authz.isValidMobilityAllocationTarget(expired, 'org-a'), false);
});

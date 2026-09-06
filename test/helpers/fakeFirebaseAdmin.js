'use strict';
// Minimal in-memory Firestore + Auth double, faithful enough to the Admin
// SDK surface api/admin/users.js, api/admin/lands-bootstrap.js, and
// api/_lib/authz.js actually use (doc/collection/get/set/where/
// runTransaction, auth.createUser/getUser/updateUser). This lets the REAL
// authorization logic (getCallerContext, assertCanManage) and the REAL
// handlers run unmodified against fake data — no real Firebase project, no
// network — for genuine integration coverage of the manager -> Lands bridge
// wiring, not just isolated pure functions.

function makeStore() {
  const docs = new Map(); // full path -> data object (or undefined if absent)

  function normalize(path) {
    return path.replace(/^\/+|\/+$/g, '');
  }

  function docRef(path) {
    path = normalize(path);
    const segments = path.split('/');
    const ref = {
      path,
      id: segments[segments.length - 1],
      async get() {
        const data = docs.get(path);
        return { exists: data !== undefined, data: () => (data === undefined ? undefined : { ...data }), id: segments[segments.length - 1], ref };
      },
      async set(data, options) {
        if (options && options.merge) {
          const existing = { ...(docs.get(path) || {}) };
          for (const [key, value] of Object.entries(data)) {
            if (value === FieldValue.__delete__) delete existing[key];
            else existing[key] = value === FieldValue.__serverTimestamp__ ? new Date().toISOString() : value;
          }
          docs.set(path, existing);
        } else {
          docs.set(path, stripSentinels(data));
        }
      },
      async delete() {
        docs.delete(path);
      },
    };
    return ref;
  }

  function stripSentinels(data) {
    const out = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === FieldValue.__delete__) continue; // FieldValue.delete() on a top-level key removes it
      out[key] = value === FieldValue.__serverTimestamp__ ? new Date().toISOString() : value;
    }
    return out;
  }

  function collectionRef(name) {
    return {
      doc(id) {
        const generatedId = id || `auto_${Math.random().toString(36).slice(2)}`;
        return docRef(`${name}/${generatedId}`);
      },
      where(field, op, value) {
        return {
          async get() {
            const matches = [];
            for (const [path, data] of docs.entries()) {
              if (!path.startsWith(`${name}/`) || path.slice(name.length + 1).includes('/')) continue;
              if (op === '==' && data[field] === value) matches.push({ id: path.split('/').pop(), data: () => ({ ...data }) });
            }
            return { docs: matches };
          },
        };
      },
    };
  }

  return {
    docs,
    doc: (path) => docRef(path),
    collection: (name) => collectionRef(name),
    async runTransaction(fn) {
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, data, options) => { ref.set(data, options); },
        delete: (ref) => { ref.delete(); },
      };
      return fn(tx);
    },
    // test helper: seed a document directly
    seed(path, data) { docs.set(normalize(path), data); },
  };
}

const FieldValue = {
  __serverTimestamp__: Symbol('serverTimestamp'),
  __delete__: Symbol('delete'),
  serverTimestamp: () => FieldValue.__serverTimestamp__,
  delete: () => FieldValue.__delete__,
};

function makeAuth(store) {
  let counter = 0;
  const users = new Map();
  return {
    async createUser({ email, displayName, disabled, password }) {
      const uid = `uid_${++counter}`;
      users.set(uid, { uid, email, displayName, disabled: Boolean(disabled), password });
      return { uid };
    },
    async getUser(uid) {
      const u = users.get(uid);
      if (!u) { const e = new Error('user-not-found'); e.code = 'auth/user-not-found'; throw e; }
      return { email: u.email, metadata: { lastSignInTime: null } };
    },
    async updateUser(uid, changes) {
      const u = users.get(uid) || { uid };
      users.set(uid, { ...u, ...changes });
      return users.get(uid);
    },
    async revokeRefreshTokens() { /* no-op for tests */ },
    // Mirrors the fake bearer token format fakeRequest() produces
    // ("Bearer token-for-<uid>") so authz.js's real verifyRequestToken()
    // runs unmodified against these fakes.
    async verifyIdToken(token) {
      const m = /^token-for-(.+)$/.exec(token);
      if (!m) { const e = new Error('invalid-token'); e.code = 'auth/argument-error'; throw e; }
      return { uid: m[1], auth_time: Math.floor(Date.now() / 1000) };
    },
    _users: users,
  };
}

/**
 * Installs fake firebaseAdmin + landsBridge modules into Node's require
 * cache BEFORE the handler modules are required, so every internal
 * require('../_lib/firebaseAdmin') / require('../_lib/landsBridge') call
 * resolves to these doubles instead of touching a real Firebase project or
 * the network. Returns { store, auth, restore, bridgeCalls }.
 */
function installFakes({ bridgeResponses = [], membershipStatusResponses = [] } = {}) {
  const store = makeStore();
  const auth = makeAuth(store);
  const bridgeCalls = [];
  const membershipStatusCalls = [];

  const firebaseAdminPath = require.resolve('../../api/_lib/firebaseAdmin.js');
  const landsBridgePath = require.resolve('../../api/_lib/landsBridge.js');
  const originalFirebaseAdmin = require.cache[firebaseAdminPath];
  const originalLandsBridge = require.cache[landsBridgePath];

  require.cache[firebaseAdminPath] = {
    id: firebaseAdminPath, filename: firebaseAdminPath, loaded: true,
    exports: { getAuth: () => auth, getDb: () => store, FieldValue },
  };
  require.cache[landsBridgePath] = {
    id: landsBridgePath, filename: landsBridgePath, loaded: true,
    exports: {
      bridgeConfigured: () => true,
      async callLandsTrustedMutation(args) {
        bridgeCalls.push(args);
        const next = bridgeResponses[bridgeCalls.length - 1] || bridgeResponses[bridgeResponses.length - 1] || { ok: true, bridged: true, eventId: 'lands_test_event' };
        return next;
      },
      // Mirrors the REAL callLandsMembershipStatus's shape (see
      // api/_lib/landsBridge.js) — a mockable double so
      // api/_lib/landsSyncReconciliation.js can be exercised through the
      // real handlers (api/admin/users.js) without a real Lands deployment.
      async callLandsMembershipStatus(args) {
        membershipStatusCalls.push(args);
        const next = membershipStatusResponses[membershipStatusCalls.length - 1]
          || membershipStatusResponses[membershipStatusResponses.length - 1]
          || { ok: true, exists: false, firebase_uid: null, municipality_id: null, lands_role: null, enabled: false };
        return next;
      },
    },
  };

  function restore() {
    if (originalFirebaseAdmin) require.cache[firebaseAdminPath] = originalFirebaseAdmin; else delete require.cache[firebaseAdminPath];
    if (originalLandsBridge) require.cache[landsBridgePath] = originalLandsBridge; else delete require.cache[landsBridgePath];
  }

  return { store, auth, bridgeCalls, membershipStatusCalls, restore };
}

function fakeRequest({ uid, method = 'POST', body = {} }) {
  return {
    method,
    headers: { authorization: `Bearer token-for-${uid}` },
    body,
  };
}

function fakeResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { res.headers[k] = v; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

module.exports = { installFakes, fakeRequest, fakeResponse, FieldValue };

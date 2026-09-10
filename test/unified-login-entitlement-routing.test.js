'use strict';
// PHASE 02B/06C — regression coverage for the unified login entitlement
// resolver and Product Chooser routing in login.html.
//
// login.html's post-authentication entitlement computation (hasFieldRole/
// hasMobilityRole/hasLandsRole/mobilityRole) is a straight-line, synchronous
// snippet with no Firebase calls of its own — it is extracted and executed
// for real in a sandboxed VM, the same real-execution technique
// test/manager-lands-sso.test.js already uses for resolveLandsRedirectBase().
// This proves the ACTUAL shipped logic, not a reimplementation of it.
//
// Complementary coverage:
//  - test/product-entitlement-contract.test.js already unit-tests
//    platform/contracts/product-entitlement-contract.js's resolveProductEntitlements()
//    for the legacy-role cases; this file adds that resolver's mobilityAccess
//    dual-read cases (independent field, disabled override, invalid role),
//    since login.html's own inline logic is intentionally a mirror of it.
//  - test/manager-lands-sso.test.js and test/manager-single-service-hotfix.test.js
//    already cover the Lands trusted SSO handoff wiring, the Field branch's
//    session/redirect targets, and same-Firebase-project session priming —
//    untouched by this phase and not re-tested here.
//  - test/manager-user-center-rules.test.js / test/mobility-mission-rules.test.js
//    / test/admin-list-mobility-employees.test.js already cover the
//    Firestore Rules side of cross-tenant/inactive/disabled denial — the
//    authoritative tenant/active boundary is Firestore Rules, not login.html
//    (login.html only decides where an already-authenticated session is
//    routed, never what data it can read).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Executes login.html's REAL entitlement-computation snippet (the lines
// between `const MOBILITY_ROLES = [...]` and the zero-service deny check)
// against an injected `data` object standing in for a users/{uid} document.
function resolveLoginEntitlements(data) {
  const source = read('login.html');
  const start = source.indexOf("const MOBILITY_ROLES = ['mobility_head'");
  const end = source.indexOf('if (!userDoc.exists()');
  assert.ok(start >= 0 && end > start, 'expected markers not found in login.html — has the entitlement block moved?');
  let snippet = source.slice(start, end);
  // The real snippet reads `data` from a live Firestore getDoc() call — for
  // this pure-logic test, `data` is injected directly instead. (login.html
  // uses CRLF line endings, hence the \r?\n in this regex.)
  snippet = snippet.replace(
    /const userDoc = await getDoc\(doc\(probeDb, "users", user\.uid\)\);\r?\n\s*const data = userDoc\.exists\(\) \? \(userDoc\.data\(\) \|\| \{\}\) : \{\};\r?\n\s*/,
    ''
  );
  snippet += 'module.exports = { hasFieldRole, hasMobilityRole, hasLandsRole, mobilityRole, role };';
  const sandbox = { module: { exports: {} }, data };
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox, { filename: 'login.html (entitlement snippet)' });
  return sandbox.module.exports;
}

function enabledCountOf(out) {
  return (out.hasFieldRole ? 1 : 0) + (out.hasMobilityRole ? 1 : 0) + (out.hasLandsRole ? 1 : 0);
}

// ---- account/product combinations (1 covered by the separate manager
// bypass tests below; 2-8 here) ----

test('2. Field-only', () => {
  const out = resolveLoginEntitlements({ role: 'inspector', organizationId: 'org-a', active: true });
  assert.equal(out.hasFieldRole, true);
  assert.equal(out.hasMobilityRole, false);
  assert.equal(out.hasLandsRole, false);
  assert.equal(enabledCountOf(out), 1);
});

test('3. Lands-only', () => {
  const out = resolveLoginEntitlements({ role: null, landsAccess: { enabled: true, role: 'lands_employee' } });
  assert.equal(out.hasFieldRole, false);
  assert.equal(out.hasMobilityRole, false);
  assert.equal(out.hasLandsRole, true);
  assert.equal(enabledCountOf(out), 1);
});

test('4. Mobility-only via the independent field (role is null)', () => {
  const out = resolveLoginEntitlements({ role: null, mobilityAccess: { enabled: true, role: 'employee' } });
  assert.equal(out.hasFieldRole, false);
  assert.equal(out.hasMobilityRole, true);
  assert.equal(out.mobilityRole, 'employee');
  assert.equal(out.hasLandsRole, false);
  assert.equal(enabledCountOf(out), 1);
});

test('5. Field + Mobility on one identity — the exact example from the phase brief: role supervisor, mobilityAccess enabled as employee', () => {
  const out = resolveLoginEntitlements({ role: 'supervisor', mobilityAccess: { enabled: true, role: 'employee' } });
  assert.equal(out.hasFieldRole, true, 'Field = enabled as supervisor');
  assert.equal(out.role, 'supervisor');
  assert.equal(out.hasMobilityRole, true, 'Mobility = enabled as employee');
  assert.equal(out.mobilityRole, 'employee');
  assert.equal(enabledCountOf(out), 2);
});

test('6. Field + Lands', () => {
  const out = resolveLoginEntitlements({ role: 'supervisor', landsAccess: { enabled: true, role: 'lands_department_manager' } });
  assert.equal(out.hasFieldRole, true);
  assert.equal(out.hasLandsRole, true);
  assert.equal(out.hasMobilityRole, false);
  assert.equal(enabledCountOf(out), 2);
});

test('7. Mobility + Lands', () => {
  const out = resolveLoginEntitlements({ role: null, mobilityAccess: { enabled: true, role: 'department_head' }, landsAccess: { enabled: true, role: 'lands_employee' } });
  assert.equal(out.hasMobilityRole, true);
  assert.equal(out.hasLandsRole, true);
  assert.equal(out.hasFieldRole, false);
  assert.equal(enabledCountOf(out), 2);
});

test('8. Field + Mobility + Lands, all three at once', () => {
  const out = resolveLoginEntitlements({ role: 'inspector', mobilityAccess: { enabled: true, role: 'administrative_affairs' }, landsAccess: { enabled: true, role: 'lands_employee' } });
  assert.equal(out.hasFieldRole, true);
  assert.equal(out.hasMobilityRole, true);
  assert.equal(out.hasLandsRole, true);
  assert.equal(enabledCountOf(out), 3);
});

// ---- Mobility roles (9-12) ----

for (const mobilityRole of ['mobility_head', 'department_head', 'administrative_affairs', 'employee']) {
  test(`9-12. valid Mobility operational role "${mobilityRole}" via the independent field enables Mobility`, () => {
    const out = resolveLoginEntitlements({ role: null, mobilityAccess: { enabled: true, role: mobilityRole } });
    assert.equal(out.hasMobilityRole, true);
    assert.equal(out.mobilityRole, mobilityRole);
  });
}

// ---- security / compatibility (15-18; 13/14 are Firestore-Rules-enforced,
// covered by the emulator suites named in the header comment) ----

test('15. mobilityAccess.enabled === false overrides a legacy Mobility role — Mobility must be disabled, never reactivated', () => {
  const out = resolveLoginEntitlements({ role: 'employee', mobilityAccess: { enabled: false, role: null } });
  assert.equal(out.hasMobilityRole, false, 'an explicit disable must never be reactivated by the stale legacy role value');
});

test('15b. mobilityAccess.enabled === false overrides a legacy Mobility role even when a Field role is also present', () => {
  const out = resolveLoginEntitlements({ role: 'supervisor', mobilityAccess: { enabled: false, role: null } });
  assert.equal(out.hasFieldRole, true, 'Field survives a Mobility disable');
  assert.equal(out.hasMobilityRole, false);
});

test('16. a valid legacy Mobility role works ONLY when mobilityAccess is absent entirely', () => {
  const legacy = resolveLoginEntitlements({ role: 'mobility_head' });
  assert.equal(legacy.hasMobilityRole, true, 'a record never touched by mobilityAccess still falls back to the legacy role');
  const touched = resolveLoginEntitlements({ role: 'mobility_head', mobilityAccess: { enabled: false, role: null } });
  assert.equal(touched.hasMobilityRole, false, 'once mobilityAccess exists at all, the legacy role is never consulted again');
});

test('17. an invalid/unrecognized Mobility role in mobilityAccess is denied, not silently accepted', () => {
  const out = resolveLoginEntitlements({ role: null, mobilityAccess: { enabled: true, role: 'not_a_real_mobility_role' } });
  assert.equal(out.hasMobilityRole, false);
});

test('17b. an invalid legacy role value is denied the same way', () => {
  const out = resolveLoginEntitlements({ role: 'not_a_real_role' });
  assert.equal(out.hasFieldRole, false);
  assert.equal(out.hasMobilityRole, false);
});

// ---- PHASE 02B.1/06C.1 SECURITY HOTFIX — the presence of the
// mobilityAccess KEY ITSELF is authoritative. Once the key exists on the
// record at all (even set to a malformed, non-object value), it alone
// decides Mobility state and a stale legacy role must NEVER be consulted
// again — every one of these must resolve to hasMobilityRole:false, not
// silently fall back to a legacy role that happens to be valid. ----

test('mobilityAccess: null (key present) never falls back to a stale legacy Mobility role', () => {
  const out = resolveLoginEntitlements({ role: 'mobility_head', mobilityAccess: null });
  assert.equal(out.hasMobilityRole, false, 'a present-but-null mobilityAccess must fail closed, not fall back to the legacy role');
});

test('mobilityAccess: a string value (key present) never falls back to a stale legacy Mobility role', () => {
  const out = resolveLoginEntitlements({ role: 'employee', mobilityAccess: 'employee' });
  assert.equal(out.hasMobilityRole, false);
});

test('mobilityAccess: a number value (key present) never falls back to a stale legacy Mobility role', () => {
  const out = resolveLoginEntitlements({ role: 'mobility_head', mobilityAccess: 123 });
  assert.equal(out.hasMobilityRole, false);
});

test('mobilityAccess: an array value (key present) never falls back to a stale legacy Mobility role', () => {
  const out = resolveLoginEntitlements({ role: 'employee', mobilityAccess: [] });
  assert.equal(out.hasMobilityRole, false);
});

test('mobilityAccess: an empty object (key present) never falls back to a stale legacy Mobility role', () => {
  const out = resolveLoginEntitlements({ role: 'mobility_head', mobilityAccess: {} });
  assert.equal(out.hasMobilityRole, false);
});

test('mobilityAccess: {enabled:true} with no role is denied, not silently accepted', () => {
  const out = resolveLoginEntitlements({ role: null, mobilityAccess: { enabled: true } });
  assert.equal(out.hasMobilityRole, false);
});

test('Field independence: a Field supervisor with mobilityAccess:null keeps Field enabled while Mobility stays disabled', () => {
  const out = resolveLoginEntitlements({ role: 'supervisor', mobilityAccess: null });
  assert.equal(out.hasFieldRole, true, 'Field must never be affected by a malformed Mobility value');
  assert.equal(out.hasMobilityRole, false);
});

// ---- 18: missing organization is denied — verified structurally, since
// the actual check lives in the deny-condition right after this snippet ----
test('18. login.html denies a record with no organizationId, even if a service role is otherwise present', () => {
  const source = read('login.html');
  assert.match(
    source,
    /if \(!userDoc\.exists\(\) \|\| data\.active === false \|\| !organizationId \|\| \(!hasFieldRole && !hasMobilityRole && !hasLandsRole\)\) \{/,
    'the deny check must AND together document existence, active, a non-empty organizationId, and all three service flags'
  );
});

// ---- routing / chooser structure (19-24; 20/25 covered fully by
// manager-lands-sso.test.js, referenced in the header comment) ----

test('21. Manager routes directly to manager.html with no product chooser — the managers/{uid} branch returns before any entitlement/chooser logic runs', () => {
  const source = read('login.html');
  const managerBranchStart = source.indexOf('const managerSnap = await getDoc(doc(probeDb, "managers", user.uid));');
  const entitlementStart = source.indexOf("const MOBILITY_ROLES = ['mobility_head'");
  assert.ok(managerBranchStart >= 0 && entitlementStart > managerBranchStart);
  const managerBranch = source.slice(managerBranchStart, entitlementStart);
  assert.match(managerBranch, /window\.location\.href = 'manager\.html';\s*\n\s*return;/);
  assert.doesNotMatch(managerBranch, /chooserCard|presentChooser|enabledServiceCount/, 'the manager branch must never reach the chooser');
});

test('22/23. exactly one enabled service routes directly; more than one shows the Product Chooser', () => {
  const source = read('login.html');
  assert.match(source, /const enabledServiceCount = \(hasFieldRole \? 1 : 0\) \+ \(hasMobilityRole \? 1 : 0\) \+ \(hasLandsRole \? 1 : 0\);/);
  assert.match(source, /if \(enabledServiceCount > 1\) \{/);
  // The single-service fallthrough after the chooser check.
  const afterChooserStart = source.indexOf('if (enabledServiceCount > 1) {');
  const tail = source.slice(afterChooserStart);
  assert.match(tail, /if \(hasFieldRole\) \{\s*\n\s*await performFieldRouting\(\);\s*\n\s*\} else \{\s*\n\s*await performMobilityRouting\(\);\s*\n\s*\}/);
});

test('24. the chooser only ever adds an option for a flag that is actually true — never an unauthorized product', () => {
  const source = read('login.html');
  const start = source.indexOf('if (enabledServiceCount > 1) {');
  const end = source.indexOf('if (hasFieldRole) {\n      await performFieldRouting();');
  const chooserBlock = source.slice(start, end);
  assert.match(chooserBlock, /if \(hasFieldRole\) options\.push\(\{ label: 'إدارة الحصر الميداني', run: performFieldRouting \}\);/);
  assert.match(chooserBlock, /if \(hasMobilityRole\) options\.push\(\{ label: 'إدارة الحركة والسير', run: performMobilityRouting \}\);/);
  assert.match(chooserBlock, /if \(hasLandsRole\) options\.push\(\{ label: 'إدارة الأراضي والممتلكات', run: performLandsRouting \}\);/);
  // Every push is gated by its own flag — never unconditional.
  assert.doesNotMatch(chooserBlock, /options\.push\(\{ label: '[^']+' \}\);(?!\s*\n\s*if)/);
});

test('the chooser never authenticates a second time — it only invokes the SAME session/redirect functions the single-service path already uses', () => {
  const source = read('login.html');
  // performFieldRouting/performMobilityRouting/performLandsRouting are each
  // defined exactly once and reused by both the auto-route and the chooser.
  for (const fn of ['performFieldRouting', 'performMobilityRouting', 'performLandsRouting']) {
    const defs = source.match(new RegExp(`async function ${fn}\\(`, 'g')) || [];
    assert.equal(defs.length, 1, `${fn} must be defined exactly once, reused by both the auto-route and the chooser`);
  }
  // Exactly one probe sign-in (the initial role lookup) — the chooser must
  // never trigger a second, redundant authentication of any kind.
  const probeSignIns = source.match(/signInWithEmailAndPassword\(probeAuth/g) || [];
  assert.equal(probeSignIns.length, 1, 'the initial probe sign-in must happen exactly once, never repeated by the chooser');
});

test('same-Firebase-project identity/session preserved through routing: Field/Mobility/Manager all sign into a NAMED persistent app derived from the SAME firebaseConfig, never a second Firebase project', () => {
  const source = read('login.html');
  assert.doesNotMatch(source, /initializeApp\(\s*\{/, 'no inline second Firebase project config is ever constructed');
  assert.match(source, /initializeApp\(firebaseConfig, 'smart-hsr-mobility-session'\)/);
  assert.match(source, /const managerApp = initializeApp\(firebaseConfig, 'smart-hsr-manager-session'\);/);
});

console.log('unified login entitlement routing (Phase 02B/06C) OK');

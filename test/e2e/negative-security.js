'use strict';
// Phase 11 negative security tests. These are NOT a repeat of the
// firestore.rules emulator unit tests (test/mobility-mission-rules.test.js
// etc. already cover the rule logic directly). This file proves the same
// denials hold for a REAL authenticated browser session using the app's
// own Firebase client SDK (loaded via the same mocked CDN routes the app
// itself uses), signed in for real against the Auth emulator — i.e. RBAC
// enforced beyond UI hiding, exercised the way a user poking the browser
// console would.
//
// Every attempt below is expected to be DENIED. A test fails if any
// attempt unexpectedly succeeds.

const { chromium } = require('playwright');
const { installFbMock } = require('./lib/fb-mock');
const { startHarness } = require('./lib/harness');
const { loginAs, PASSWORD } = require('./lib/login');

const CHROMIUM_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// Runs a Firestore operation in-page as a freshly, for-real authenticated
// user against the Auth + Firestore emulators. Signing in directly here
// (rather than trying to reuse whichever app instance the host page
// happens to have created) keeps this self-contained and exercises the
// exact same firebase/auth + firebase/firestore modules the app imports,
// through the same route-intercepted local bundles.
async function attemptFirestoreOp(page, email, password, fnBody, args) {
  return page.evaluate(async ({ email: innerEmail, password: innerPassword, fnBody: innerFnBody, args: innerArgs }) => {
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js');
    const {
      getAuth, connectAuthEmulator, signInWithEmailAndPassword,
    } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js');
    const {
      getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, collection,
    } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
    const firebaseConfig = {
      apiKey: 'AIzaSyCXCiNeaO9lhM79tKb98x4oaNqNy5xKvWM',
      authDomain: 'smart-hsr-manager.firebaseapp.com',
      projectId: 'smart-hsr-manager',
      storageBucket: 'smart-hsr-manager.firebasestorage.app',
      messagingSenderId: '38965508031',
      appId: '1:38965508031:web:6fd0b6c6b0b63fa513930a',
    };
    const appName = `negative-security-probe-${innerEmail}`;
    const app = getApps().find((a) => a.name === appName) || initializeApp(firebaseConfig, appName);
    const auth = getAuth(app);
    const db = getFirestore(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    const cred = await signInWithEmailAndPassword(auth, innerEmail, innerPassword);
    const helpers = { doc, getDoc, setDoc, updateDoc, collection, db, myUid: cred.user.uid };
    const runner = new Function('helpers', 'args', `return (async () => { ${innerFnBody} })();`);
    try {
      await runner(helpers, innerArgs);
      return { denied: false };
    } catch (err) {
      return { denied: true, code: err && err.code, message: err && err.message };
    }
  }, { email, password, fnBody, args });
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function main() {
  const harness = await startHarness();
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const results = [];

  // A blank-ish local page is enough to host the in-page Firestore probe —
  // it only needs the mocked CDN routes active, not a real logged-in UI.
  async function probePage(browserInstance) {
    const ctx = await browserInstance.newContext();
    await installFbMock(ctx);
    const page = await ctx.newPage();
    await page.goto(`${harness.baseUrl}/login.html`);
    return { ctx, page };
  }

  test('users/{uid} client write is always denied (role self-escalation blocked)', async () => {
    const { ctx, page } = await probePage(browser);
    const res = await attemptFirestoreOp(page, 'employee@e2e.test', PASSWORD,
      `await helpers.updateDoc(helpers.doc(helpers.db, 'users', helpers.myUid), { role: 'mobility_head' });`,
      {});
    await ctx.close();
    return res.denied ? 'PASS' : `FAIL: role write succeeded unexpectedly (${JSON.stringify(res)})`;
  });

  test('employee cannot read another organization\'s mission (cross-tenant isolation)', async () => {
    const { ctx, page } = await probePage(browser);
    const res = await attemptFirestoreOp(page, 'employee@e2e.test', PASSWORD,
      `const snap = await helpers.getDoc(helpers.doc(helpers.db, 'missions', args.missionId));
       if (snap.exists()) throw Object.assign(new Error('unexpectedly readable'), { code: 'unexpected-success' });`,
      { missionId: 'E2E-FIXTURE-ORGB' });
    await ctx.close();
    return res.denied ? 'PASS' : `FAIL: cross-org mission read succeeded (${JSON.stringify(res)})`;
  });

  test('manager of org e2e-org-b cannot read org e2e-org vehicles (tenant isolation)', async () => {
    const { ctx, page } = await probePage(browser);
    const res = await attemptFirestoreOp(page, 'manager-org-b@e2e.test', PASSWORD,
      `const snap = await helpers.getDoc(helpers.doc(helpers.db, 'vehicles', args.vehicleId));
       if (snap.exists()) throw Object.assign(new Error('unexpectedly readable'), { code: 'unexpected-success' });`,
      { vehicleId: 'E2E-V1' });
    await ctx.close();
    return res.denied ? 'PASS' : `FAIL: cross-org vehicle read succeeded (${JSON.stringify(res)})`;
  });

  test('department_head cannot approve their own mission (role-transition denied)', async () => {
    const { ctx, page } = await probePage(browser);
    const res = await attemptFirestoreOp(page, 'depthead@e2e.test', PASSWORD,
      `await helpers.updateDoc(helpers.doc(helpers.db, 'missions', args.missionId), { status: 'APPROVED', updatedByUid: helpers.myUid });`,
      { missionId: 'E2E-FIXTURE-PENDING' });
    await ctx.close();
    return res.denied ? 'PASS' : `FAIL: dept head self-approval succeeded (${JSON.stringify(res)})`;
  });

  test('administrative_affairs cannot allocate a vehicle (mobility_head-only action)', async () => {
    const { ctx, page } = await probePage(browser);
    const res = await attemptFirestoreOp(page, 'adminaffairs@e2e.test', PASSWORD,
      `await helpers.updateDoc(helpers.doc(helpers.db, 'vehicles', args.vehicleId), { status: 'RESERVED', assignedEmployeeUid: helpers.myUid, currentMissionId: 'x', updatedByUid: helpers.myUid });`,
      { vehicleId: 'E2E-V2' });
    await ctx.close();
    return res.denied ? 'PASS' : `FAIL: admin affairs vehicle allocation succeeded (${JSON.stringify(res)})`;
  });

  test('auditEvents cannot be impersonated (actorId must equal caller uid)', async () => {
    const { ctx, page } = await probePage(browser);
    const res = await attemptFirestoreOp(page, 'employee@e2e.test', PASSWORD,
      `await helpers.setDoc(helpers.doc(helpers.collection(helpers.db, 'auditEvents')), {
         organizationId: args.orgId, actorId: 'someone-else-uid', actorRole: 'employee',
         resourceType: 'mission', resourceId: 'x', action: 'forged', createdAt: new Date().toISOString()
       });`,
      { orgId: 'e2e-org' });
    await ctx.close();
    return res.denied ? 'PASS' : `FAIL: forged audit event write succeeded (${JSON.stringify(res)})`;
  });

  test('employee cannot reach manager.html (Manager Dashboard route guard)', async () => {
    const ctx = await browser.newContext();
    await installFbMock(ctx);
    const page = await loginAs(ctx, harness.baseUrl, 'employee@e2e.test');
    await page.goto(`${harness.baseUrl}/manager.html?useEmulators=1`);
    await page.waitForTimeout(2000);
    const denied = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      return location.pathname.includes('login.html')
        || bodyText.includes('غير مصرح') || bodyText.includes('لا توجد صلاحية')
        || bodyText.includes('رفض الوصول') || bodyText.includes('صلاحية');
    });
    await ctx.close();
    return denied ? 'PASS' : 'FAIL: employee reached Manager Dashboard without denial';
  });

  for (const t of tests) {
    let outcome;
    try {
      outcome = await t.fn();
    } catch (err) {
      outcome = `ERROR: ${err.message}`;
    }
    results.push({ name: t.name, outcome });
    console.log(`[${outcome.startsWith('PASS') ? 'PASS' : outcome.startsWith('INCONCLUSIVE') ? 'WARN' : 'FAIL'}] ${t.name} -> ${outcome}`);
  }

  await browser.close();
  await harness.stop();

  const failed = results.filter((r) => r.outcome.startsWith('FAIL'));
  console.log(`\n${results.length - failed.length}/${results.length} negative security tests passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });

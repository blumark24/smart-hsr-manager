'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8');
const begin = source.indexOf('function missingWorkforceAccessMessage(reason)');
const end = source.indexOf("\ndocument.getElementById('loginForm')", begin);
assert.ok(begin > -1 && end > begin, 'diagnostic helper must be present in existing login module');
const sandbox = {};
vm.runInNewContext(source.slice(begin, end) + '\nthis.explain=missingWorkforceAccessMessage;', sandbox);
const explain = sandbox.explain;

test('authenticated staging identity without a workforce record receives an actionable, non-credential message', () => {
  const label = explain('no_record');
  assert.match(label, /تم التحقق من بيانات الدخول/);
  assert.match(label, /سجل الموظف غير موجود/);
});

test('inactive and missing organization have distinct post-authentication guidance', () => {
  const disabled = explain('inactive');
  const noOrg = explain('no_organization');
  assert.match(disabled, /موقوف/);
  assert.match(noOrg, /غير مرتبط ببلدية/);
  assert.notEqual(disabled, noOrg);
  assert.match(explain('unknown'), /مراجعة سجل الموظف/);
});

test('login diagnostics preserve authenticated-only placement and conceal credentials and internal IDs', () => {
  const verified = source.indexOf('credentialsValidated = true;');
  const accessCheck = source.indexOf('if (!resolution.valid)');
  const branch = source.indexOf('showMsg(missingWorkforceAccessMessage(resolution.reason)');
  assert.ok(verified > -1 && accessCheck > verified && branch > accessCheck);
  assert.match(source, /await signOut\(probeAuth\);\s*showMsg\(missingWorkforceAccessMessage/);
  for (const reason of ['no_record', 'inactive', 'no_organization']) {
    assert.doesNotMatch(explain(reason), /password|firebase|uid|token|organizationId|@smart-hsr/i);
  }
  assert.match(source, /signInWithEmailAndPassword\(probeAuth, email, password\)/);
  assert.match(source, /if \(manager\.role === 'manager' && manager\.active !== false/);
});

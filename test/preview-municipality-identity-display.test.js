'use strict';
// Display-label regression only: synthetic tenants, no Firebase or live data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const mobility = fs.readFileSync(path.join(root, 'mobility-runtime.js'), 'utf8');
const fieldHead = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
const start = mobility.indexOf('function institutionalIdentity(data, resolution = null)');
const end = mobility.indexOf('\n  function requestId(prefix)', start);
assert.ok(start > -1 && end > start, 'identity resolver must be defined');
const resolveDisplay = vm.runInNewContext('(() => { ' + mobility.slice(start, end) +
  '; return institutionalIdentity; })()', {});

const tenant = { organizationId:'tenant-A', organizationName:'اسم قديم', name:'موظف قديم', department:'الحركة' };
const verified = {
  kind:'workforce', valid:true, allowed:true, organizationId:'tenant-A',
  profile:{organizationName:'بلدية محدثة', name:'الاسم الجديد'}
};

test('Mobility uses owner-managed canonical municipality label after verified workspace resolution', () => {
  const display = resolveDisplay(tenant, verified);
  assert.equal(display.organizationName, 'بلدية محدثة');
  assert.equal(display.displayName, 'الاسم الجديد');
  assert.equal(display.department, 'الحركة');
  assert.match(mobility, /const identity = institutionalIdentity\(data, resolution\)/);
  assert.match(mobility, /orgName:identity\.organizationName/);
});

test('Identity from a different tenant, disabled workspace or non-workforce role cannot be displayed', () => {
  for (const patch of [
    {organizationId:'tenant-B'}, {allowed:false}, {valid:false}, {kind:'manager'}, {profile:null}
  ]) {
    const label = resolveDisplay(tenant, {...verified,...patch});
    if (patch.profile === null) {
      assert.equal(label.organizationName, 'اسم البلدية غير متاح');
    } else {
      assert.equal(label.organizationName, 'اسم البلدية غير متاح');
      assert.equal(label.displayName, '');
    }
  }
  assert.doesNotMatch(mobility, /orgId === 'CnlVlKC7UcDMp2NZzjjT'/);
  assert.match(mobility, /resolution\.organizationId !== data\.organizationId/);
});

test('Display label refresh is UID/tenant guarded, only on focus/visibility/interval and cleans up', () => {
  assert.match(mobility, /currentUser\?\.uid !== user\.uid/);
  assert.match(mobility, /auth\?\.currentUser\?\.uid !== user\.uid/);
  assert.match(mobility, /resolved\?\.organizationId !== organizationId/);
  assert.match(mobility, /resolved\?\.allowed !== true/);
  assert.match(mobility, /window\.addEventListener\('focus', refreshIdentity\)/);
  assert.match(mobility, /document\.addEventListener\('visibilitychange', refreshIdentity\)/);
  assert.match(mobility, /window\.setInterval\(refreshIdentity, 60000\)/);
  assert.match(mobility, /window\.clearInterval\(timer\)/);
  assert.match(mobility, /if \(stopIdentityRefresh\) stopIdentityRefresh\(\)/);
  assert.doesNotMatch(mobility, /setDoc\(|updateDoc\(|revokeRefreshTokens/);
});

test('Approved department head displays the runtime identity in header and read-only profile', () => {
  assert.match(fieldHead, /class="hsr-identity-org">\{\{ orgName \}\}/);
  assert.match(fieldHead, /\{ k: 'الجهة', v: this\.state\.orgName/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const runtime = fs.readFileSync(path.join(root, 'field-head-runtime.js'), 'utf8');
const WA = require(path.join(root, 'workspace-access.js'));

test('Field Head resolver accepts administration-only scope exactly like workspace access', () => {
  const user = {
    active: true,
    organizationId: 'org-a',
    institutionalRole: 'department_head',
    administration: 'إدارة الحصر الميداني',
    department: ''
  };
  const resolved = WA.resolveWorkspaces(user);
  assert.equal(resolved.primary, 'field');
  assert.equal(resolved.workspaces[0].route, 'department-head.html');

  assert.match(runtime, /const fieldScope = dept \|\| administration;/);
  assert.match(runtime, /institutionalRole === 'department_head' && \/الحصر\|ميداني\|field\/i\.test\(fieldScope\)/);
  assert.doesNotMatch(runtime, /\|\| !dept \|\| !data\.organizationId/);
  assert.match(runtime, /department:fieldScope/);
});

test('Field Head runtime fails closed without leaving an infinite auth spinner', () => {
  assert.match(runtime, /console\.error\('\[SMART HSR\]\[FIELD_AUTH\]'/);
  assert.match(runtime, /component\.setState\(\{authPending:false, role:null\}\)/);
});

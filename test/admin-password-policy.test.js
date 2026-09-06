'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { passwordPolicyReason } = require('../api/admin/users.js')._test;

const target = { name: 'Inspector A', email: 'inspector-a@staging.blumark24.test' };

for (const [label, password] of [
  ['fewer than 8 characters', 'Aa@1234'],
  ['missing uppercase', 'aa@1234567'],
  ['missing lowercase', 'AA@1234567'],
  ['missing number', 'Aa@bcdefgh'],
  ['missing symbol', 'Aa1234567'],
]) {
  test(`admin password policy denies ${label}`, () => {
    assert.equal(passwordPolicyReason(password, target), 'password_policy_failed');
  });
}

test('admin password policy accepts the approved staging password', () => {
  assert.equal(passwordPolicyReason('Aa@1234567', target), null);
});

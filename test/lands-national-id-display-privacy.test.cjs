'use strict';

// Verify the actual UI masking function and each registry/dossier rendering
// path with synthetic identities. No live municipal records or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const markup = fs.readFileSync(path.join(__dirname, '../lands/index.html'), 'utf8');
const start = markup.indexOf('function maskNationalId(id) {');
const end = markup.indexOf('\n// ---- digital file ----', start);
assert.ok(start >= 0 && end > start, 'Masking helper is present in real Lands UI');
const maskNationalId = vm.runInNewContext(
  '(' + markup.slice(start, end).trim() + ')',
  {}, { timeout: 1500 }
);

test('valid 10-digit synthetic national ID shows only first 3 and last 2 digits', () => {
  const original = '1020000048';
  const masked = maskNationalId(original);
  assert.equal(masked, '102•••••48');
  assert.notEqual(masked, original);
  assert.equal(masked.includes(original.slice(3, 8)), false);
});

test('malformed or foreign-format identifiers fail closed, not raw rendered', () => {
  for (const original of ['ABC123XYZ', '123456789', '12345678901', '١٠٢٠٠٠٠٠٤٨', 'ID-1020000048']) {
    const masked = maskNationalId(original);
    assert.equal(masked, '••••••••••', original);
    assert.notEqual(masked, original);
  }
});

test('missing identifiers display a harmless placeholder', () => {
  for (const value of [null, undefined, '', '  ']) assert.equal(maskNationalId(value), '—');
});

test('both registry tables and the digital dossier use the same masker', () => {
  assert.equal((markup.match(/maskNationalId\(g\.beneficiary\?\.national_id\)/g) || []).length, 3);
  assert.match(markup, /detail\("السجل المدني",\s*maskNationalId\(g\.beneficiary\?\.national_id\)\)/);
  assert.doesNotMatch(markup, /detail\("السجل المدني",\s*g\.beneficiary\?\.national_id/);
});

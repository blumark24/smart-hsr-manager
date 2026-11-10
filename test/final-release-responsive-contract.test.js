const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public-enhancements.js'), 'utf8');

test('landing enhancement layer adds behaviour only and never re-lays-out the approved R3 sections', () => {
  assert.doesNotMatch(source, /FINAL RESPONSIVE SIZE PASS/);
  assert.doesNotMatch(source, /tagClaudeLayout|installClaudeResponsiveTags/);
  assert.doesNotMatch(source, /\.claude-(hero|bento|profile|statement|journey|presence|twin)/);
  assert.doesNotMatch(source, /smartResponsiveLanding|fitApprovedClaudeRoot|fitApprovedClaudeCanvas/);
  assert.doesNotMatch(source, /smartSafeTheme|data-public-theme/);
});

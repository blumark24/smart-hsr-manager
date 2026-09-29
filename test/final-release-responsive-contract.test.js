const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public-enhancements.js'), 'utf8');

test('final landing keeps approved Claude DOM and uses responsive sizing layer only', () => {
  assert.match(source, /FINAL RESPONSIVE SIZE PASS/);
  assert.match(source, /function tagClaudeLayout\(\)/);
  assert.match(source, /@media\(max-width:700px\)/);
  assert.match(source, /\.claude-hero/);
  assert.match(source, /\.claude-bento/);
  assert.match(source, /\.claude-profile/);

  assert.doesNotMatch(source, /smartResponsiveLanding/);
  assert.doesNotMatch(source, /fitApprovedClaudeRoot/);
  assert.doesNotMatch(source, /fitApprovedClaudeCanvas/);
});

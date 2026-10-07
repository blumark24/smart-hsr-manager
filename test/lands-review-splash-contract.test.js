const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

test('Review Mode preserves approved SMART HSR company splash', () => {
  const html = fs.readFileSync('lands/review-direct.html', 'utf8');
  const bootStart = html.indexOf('async function boot()');
  assert.notEqual(bootStart, -1);
  const boot = html.slice(bootStart);

  assert.match(boot, /window\.SmartHSRCompanySplash\?\.show\(\)/);
  assert.match(boot, /await withBootTimeout\(loadModules\(\), "review-modules"\)/);
  assert.match(boot, /enterReviewMode\(\)/);
  assert.doesNotMatch(boot, /landsReviewLoader/);
  assert.doesNotMatch(boot, /reviewLoader\.style\.cssText/);
});

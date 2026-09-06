'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// dashboard.html has no unit-testable module boundary for its inline script,
// so this asserts against the source text directly -- the same pattern
// already used by test/sprint6.11-2-provider-activation.test.js for
// api/ai/analyze.js's own integration shape.
function dashboardSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
}

function functionBody(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `could not find start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `could not find end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('page-load summary widget (renderReferenceInspectorDashboard) never calls resolveEvidenceReference -- proves initial dashboard open triggers zero /api/storage/read calls', () => {
  const source = dashboardSource();
  const body = functionBody(
    source,
    'function renderReferenceInspectorDashboard(own) {',
    "window.addEventListener('online', renderConnectionState",
  );
  assert.doesNotMatch(body, /resolveEvidenceReference\(/);
  // The thumbnail must stay explicitly hidden rather than silently omitted.
  assert.match(body, /getElementById\('refLatestImage'\)\?\.classList\.add\('hidden'\)/);
});

test('explicit observation selection (showObservationDetail) still resolves evidence exactly once per image field -- proves explicit selection loads evidence', () => {
  const source = dashboardSource();
  const body = functionBody(
    source,
    'window.showObservationDetail = async function(docId) {',
    'window.handleFilterChange = function()',
  );
  const matches = body.match(/resolveEvidenceReference\(/g) || [];
  // Exactly two call sites (before-image, after-image); an empty
  // afterImagePath resolves without a network call (see
  // resolveEvidenceReference's early return on a falsy reference), so a
  // typical PENDING observation with only a before-image produces exactly
  // one real /api/storage/read request.
  assert.equal(matches.length, 2);
  assert.match(body, /resolveEvidenceReference\(obs\.imagePath\)/);
  assert.match(body, /resolveEvidenceReference\(obs\.afterImagePath\)/);
});

test('resolveEvidenceReference itself short-circuits on an empty/falsy reference without making a network call', () => {
  const source = dashboardSource();
  const body = functionBody(
    source,
    'async function resolveEvidenceReference(reference) {',
    'async function refreshDemoStorageBadge()',
  );
  assert.match(body, /if\(!reference\)\s*return\s*'';/);
});

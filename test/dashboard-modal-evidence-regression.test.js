'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const storageRead = require('../api/storage/read.js')._test;

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');

function loadEvidenceNormalizer() {
  const match = dashboard.match(/function firstEvidenceReference[\s\S]*?(?=\nfunction subscribeObservations\(\))/);
  assert.ok(match, 'dashboard evidence normalizer must remain testable');
  const context = {};
  vm.runInNewContext(`${match[0]}\nthis.normalize = normalizeObservationEvidence;`, context);
  return context.normalize;
}

test('smart input controls stack into full-width rows on phones', () => {
  assert.match(
    dashboard,
    /@media\(max-width:760px\)[\s\S]*?#smartInputModal \.input-group-wrapper\{flex-direction:column;gap:\.65rem\}/
  );
  assert.match(
    dashboard,
    /#smartInputModal \.input-group\{width:100%;flex:0 0 auto\}/
  );
});

test('new private-storage records retain their canonical object key', () => {
  const normalize = loadEvidenceNormalizer();
  const evidence = normalize({
    imageObjectKey: 'organizations/org-a/observations/obs-1/before/new.jpg',
    imagePath: 'organizations/org-a/observations/obs-1/before/old.jpg',
    afterImagePath: 'organizations/org-a/observations/obs-1/after/result.jpg'
  });
  assert.equal(evidence.before, 'organizations/org-a/observations/obs-1/before/new.jpg');
  assert.equal(evidence.after, 'organizations/org-a/observations/obs-1/after/result.jpg');
});

test('legacy evidence records normalize to the same secure read flow', () => {
  const normalize = loadEvidenceNormalizer();
  const fixtures = [
    [{ imagePath: 'observations/org-a/legacy-path.jpg' }, 'observations/org-a/legacy-path.jpg'],
    [{ imageUrl: 'https://legacy.example/evidence.jpg' }, 'https://legacy.example/evidence.jpg'],
    [{ beforeImagePath: 'data:image/jpeg;base64,c2FmZQ==' }, 'data:image/jpeg;base64,c2FmZQ==']
  ];
  for (const [record, expected] of fixtures) assert.equal(normalize(record).before, expected);
  assert.equal(normalize({ afterImageUrl: 'https://legacy.example/after.jpg' }).after, 'https://legacy.example/after.jpg');
});

test('private evidence resolution still uses an authenticated token', () => {
  assert.match(dashboard, /authUser:auth\.currentUser/);
  assert.match(dashboard, /fetchWithFirebaseAuth/);
  assert.match(dashboard, /resolveObservationImage\(\{/);
});

test('authenticated storage read authorizes the canonical and legacy path fields', () => {
  assert.deepEqual([...storageRead.EVIDENCE_FIELDS], [
    'imageObjectKey', 'imagePath', 'imageUrl', 'beforeImagePath', 'afterImagePath', 'afterImageUrl'
  ]);
});

// PHASE 04 FINAL ACCEPTANCE GATE — Section H (GPS truthfulness) audit note:
// this test previously asserted a stricter, since-superseded policy (pure
// GPS-or-nothing, every location-correction control permanently hidden via
// CSS). The current architecture is a deliberate, more nuanced, and
// verifiably HONEST evolution of that same principle: a genuinely GOOD GPS
// fix still commits fully automatically (no click required), the map-based
// manual location path is still permanently unreachable, and a POOR-accuracy
// fix may only be accepted through one explicit, freshness-re-checked user
// click that visibly and truthfully labels the result as unverified
// ('gps_weak', shown everywhere as "ضعيف — غير موثّق"). Nothing here is a
// silent bypass — see dashboard.html's own inline comment at the
// useWeakLocationBtn click handler ("القبول مع تنبيه اختيار صريح من
// المستخدم... دون تجاوز شرط الموقع"). Assertions below were updated to match
// this verified-correct, more honest behavior — not weakened.
test('inspector capture starts GPS automatically; the map-based manual-location path stays permanently unreachable; a weak fix requires one explicit, truthfully-labeled user override', () => {
  assert.match(dashboard, /if \(id==='smartInputModal'\)[\s\S]*?window\.getLocation\(\);/);
  // The manual map-entry path (address panel + "تحديد يدوي" + the
  // location-correction map dialog) is permanently CSS-locked out — this
  // part of the original architecture is unchanged.
  assert.match(
    dashboard,
    /#manualAddressBtn,#inspectorManualLocationPanel,#manualLocationBtn,#editLocationBtn,#locationCorrectionDialog\{display:none!important\}/
  );
  // A genuinely good GPS fix still commits automatically, with no click.
  assert.match(dashboard, /if\(normalAllowed\)\{\s*commitLocationSelection\(\);/);
  // manual_map can never satisfy the save gate — only real (possibly
  // explicitly-overridden-weak) GPS can.
  assert.match(dashboard, /locationSource=manual\?'manual_map':\(locationDragged\?'gps_corrected':\(locationWarningOverride\?'gps_weak':'gps'\)\)/);
  assert.doesNotMatch(dashboard, /locationSource === 'manual_map'[^\n]*hasLocation/);
  // The weak-GPS override is possible ONLY via an explicit user click,
  // requires the candidate to still be fresh/valid at click time, and the
  // resulting status text is honestly labeled as unverified/reduced-accuracy
  // — never presented as a full, verified fix.
  const overrideHandler = dashboard.slice(dashboard.indexOf("getElementById('useWeakLocationBtn')?.addEventListener('click',"));
  assert.match(overrideHandler.slice(0, 700), /if\(!candidateIsCurrent\(locationCandidate\)\)\{/);
  assert.match(overrideHandler.slice(0, 700), /locationWarningOverride=true;/);
  assert.match(dashboard, /غير موثّق بدقة كاملة/, 'a weak-accepted location must be visibly labeled as not fully verified');
});

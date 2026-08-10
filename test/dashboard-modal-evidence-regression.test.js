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
  assert.match(dashboard, /getIdToken:\(\)=>auth\.currentUser\?\.getIdToken\(\)/);
  assert.match(dashboard, /resolveObservationImage\(\{/);
});

test('authenticated storage read authorizes the canonical and legacy path fields', () => {
  assert.deepEqual([...storageRead.EVIDENCE_FIELDS], [
    'imageObjectKey', 'imagePath', 'imageUrl', 'beforeImagePath', 'afterImagePath', 'afterImageUrl'
  ]);
});

test('inspector capture starts GPS automatically and hides every manual-location path', () => {
  assert.match(dashboard, /if \(id==='smartInputModal'\)[\s\S]*?window\.getLocation\(\);/);
  assert.match(
    dashboard,
    /#manualAddressBtn,#inspectorManualLocationPanel,#manualLocationBtn,#useWeakLocationBtn,#editLocationBtn,#confirmLocationBtn,#locationCorrectionDialog\{display:none!important\}/
  );
  assert.match(dashboard, /if\(normalAllowed\) commitLocationSelection\(\);/);
  assert.match(dashboard, /locationSource=manual\?'manual_map':\(locationDragged\?'gps_corrected':\(locationWarningOverride\?'gps_weak':'gps'\)\)/);
  assert.match(dashboard, /locationConfirmed === true && locationVerified === true && locationSource === 'gps'/);
});

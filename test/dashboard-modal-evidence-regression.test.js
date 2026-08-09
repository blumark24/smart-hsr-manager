'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');

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

test('legacy evidence fields normalize to the secure imagePath read flow', () => {
  assert.match(
    dashboard,
    /hasImage: !!\(data\.imagePath \|\| data\.imageUrl \|\| data\.beforeImagePath\)/
  );
  assert.match(
    dashboard,
    /imagePath:data\.imagePath \|\| data\.imageUrl \|\| data\.beforeImagePath \|\| null/
  );
});

test('private evidence resolution still uses an authenticated token', () => {
  assert.match(dashboard, /getIdToken:\(\)=>auth\.currentUser\?\.getIdToken\(\)/);
  assert.match(dashboard, /resolveObservationImage\(\{/);
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

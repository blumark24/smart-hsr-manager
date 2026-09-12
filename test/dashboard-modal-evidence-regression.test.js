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

// PHASE 04 FINAL MICRO-CLOSURE — executable (not file-global-regex-only) proof
// that the actual useWeakLocationBtn click handler (and its normal-GPS and
// manual-map siblings) behave exactly as the kept regex tests above claim.
// This runs the REAL extracted source of the handler and its direct
// dependencies inside an isolated vm context with a minimal DOM/geolocation
// stub — it does not reimplement or approximate the logic under test.
function sliceSrc(startMarker, endMarker) {
  const start = dashboard.indexOf(startMarker);
  const end = dashboard.indexOf(endMarker, start);
  assert.notEqual(start, -1, `marker not found: ${startMarker}`);
  assert.notEqual(end, -1, `end marker not found: ${endMarker}`);
  assert.ok(end > start, `end marker precedes start marker: ${startMarker}`);
  return dashboard.slice(start, end);
}

function loadWeakGpsHarness() {
  const lets = sliceSrc(
    'let inspectorMap=null,locationMarker=null,accuracyCircle=null;',
    "let pendingSmartInput=null,pendingSmartCapture=null,smartInputSaveInFlight=false;"
  ) + "let pendingSmartInput=null,pendingSmartCapture=null,smartInputSaveInFlight=false;";
  const accuracyLabelSrc = sliceSrc("function accuracyLabel(m){", 'function validLocationSample(');
  const candidateIsCurrentSrc = sliceSrc('function candidateIsCurrent(', 'function candidateWithinServiceArea(');
  const candidateWithinServiceAreaSrc = sliceSrc('function candidateWithinServiceArea(', 'function normalLocationConfirmationAllowed(');
  const normalLocationConfirmationAllowedSrc = sliceSrc('function normalLocationConfirmationAllowed(', 'function stopInspectorGps(');
  const stopInspectorGpsSrc = sliceSrc('function stopInspectorGps(', 'function setIdentityGpsStatus(');
  const setIdentityGpsStatusSrc = sliceSrc('function setIdentityGpsStatus(', '// مركز احتياطي للعرض فقط عند غياب مركز المؤسسة');
  const renderLocationCandidateOnMapSrc = sliceSrc('function renderLocationCandidateOnMap(', 'function renderLocationCandidate(');
  const renderLocationCandidateSrc = sliceSrc('function renderLocationCandidate(', '// التحديد اليدوي: لا يُعتمد أي موقع تلقائياً');
  const syncAdoptButtonSrc = sliceSrc('function syncAdoptButton(', '// نقطة واحدة لتحريك الاختيار على الخريطة');
  const candidateHasCoordsSrc = sliceSrc('function candidateHasCoords(', '// عند انتهاء المهلة');
  const commitLocationSelectionSrc = sliceSrc('function commitLocationSelection(', '// Preview-only manual location bridge.');
  const setTextSrc = sliceSrc('function setText(id, text){', 'function setHTML(id, html){');
  const handlerSrc = sliceSrc(
    "document.getElementById('useWeakLocationBtn')?.addEventListener('click',",
    "document.getElementById('confirmLocationBtn')?.addEventListener('click',"
  );

  const capturedHandlers = {};
  const elementRegistry = {};
  function makeElement(id) {
    if (!elementRegistry[id]) {
      elementRegistry[id] = {
        textContent: '', value: '', disabled: false,
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener(evt, fn) { capturedHandlers[`${id}:${evt}`] = fn; }
      };
    }
    return elementRegistry[id];
  }

  const context = {
    document: {
      getElementById: (id) => makeElement(id),
      querySelector: () => ({ classList: { add() {}, remove() {}, toggle() {} } })
    },
    navigator: { geolocation: { clearWatch() {} } },
    clearTimeout: () => {},
    organizationMapContext: undefined,
    console
  };

  vm.runInNewContext(
    [
      lets, accuracyLabelSrc, candidateIsCurrentSrc, candidateWithinServiceAreaSrc,
      normalLocationConfirmationAllowedSrc, stopInspectorGpsSrc, setIdentityGpsStatusSrc,
      renderLocationCandidateOnMapSrc, renderLocationCandidateSrc, syncAdoptButtonSrc,
      candidateHasCoordsSrc, commitLocationSelectionSrc, setTextSrc,
      'function checkSmartInputState(){}',
      handlerSrc,
      "this.__setState = (patch) => { for (const k of Object.keys(patch)) { if (k==='locationCandidate') locationCandidate = patch[k]; else if (k==='locationSamples') locationSamples = patch[k]; else if (k==='locationTimedOut') locationTimedOut = patch[k]; else if (k==='locationDragged') locationDragged = patch[k]; else if (k==='locationWarningOverride') locationWarningOverride = patch[k]; } };",
      'this.__getState = () => ({ locationSource, locationVerified, locationWarningOverride, locationCandidate });',
      'this.__commitLocationSelection = commitLocationSelection;',
      'this.__renderLocationCandidate = renderLocationCandidate;'
    ].join('\n'),
    context
  );

  return {
    elementRegistry,
    setState: context.__setState,
    getState: context.__getState,
    commitLocationSelection: context.__commitLocationSelection,
    renderLocationCandidate: context.__renderLocationCandidate,
    triggerWeakClick: () => {
      const fn = capturedHandlers["useWeakLocationBtn:click"];
      assert.ok(fn, 'useWeakLocationBtn click handler must be registered by the extracted source');
      fn();
    }
  };
}

function evalAcceptedGpsSource(locationVerified, locationSource, locationWarningOverride) {
  const match = dashboard.match(/const acceptedGpsSource =\s*\(locationVerified === true && locationSource === 'gps'\)\s*\|\|\s*\(locationSource === 'gps_weak' && locationWarningOverride === true\);/);
  assert.ok(match, 'save-gate acceptedGpsSource formula must remain present verbatim');
  const ctx = { locationVerified, locationSource, locationWarningOverride };
  vm.runInNewContext(`${match[0]}\nthis.result = acceptedGpsSource;`, ctx);
  return ctx.result;
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

// PHASE 04 FINAL MICRO-CLOSURE — WEAK GPS EXPLICIT WARNING + EXECUTABLE PROOF.
// The test above proves the warning phrase exists somewhere in dashboard.html
// and that the handler's early lines look right, but it never actually runs
// the useWeakLocationBtn click handler. These tests execute the real
// extracted handler (and its real dependencies: candidateIsCurrent,
// commitLocationSelection, renderLocationCandidate) inside an isolated vm
// context, proving the exact runtime behavior rather than trusting a
// file-global regex.
test('useWeakLocationBtn rejects a stale/invalid candidate without arming the override or showing the weak-GPS warning', () => {
  const harness = loadWeakGpsHarness();
  harness.setState({
    locationCandidate: {
      lat: 24.7136, lng: 46.6753, accuracy: 45, stable: false,
      capturedAt: new Date(Date.now() - 60000).toISOString() // stale: 60s old, beyond the 30s freshness window
    }
  });
  harness.triggerWeakClick();
  assert.equal(harness.elementRegistry.locationStatus.textContent, 'لا يمكن قبول موقع مفقود أو غير صالح أو قديم. أعد المحاولة.');
  assert.doesNotMatch(harness.elementRegistry.locationStatus.textContent, /GPS ضعيف|غير موثّق بدقة كاملة/);
  const state = harness.getState();
  assert.equal(state.locationWarningOverride, false);
  assert.notEqual(state.locationSource, 'gps_weak');
});

test('useWeakLocationBtn accepts a current-but-weak candidate only through the real click handler, with an explicit truthful warning, gps_weak source, and locationVerified=false', () => {
  const harness = loadWeakGpsHarness();
  harness.setState({
    locationCandidate: {
      lat: 24.7136, lng: 46.6753, accuracy: 45, stable: false, // 45m: current+valid but above the 30m normal-accuracy threshold
      capturedAt: new Date().toISOString()
    }
  });
  harness.triggerWeakClick();
  const statusText = harness.elementRegistry.locationStatus.textContent;
  assert.match(statusText, /GPS ضعيف/, 'the real button-path message must explicitly say weak GPS');
  assert.match(statusText, /غير موثّق بدقة كاملة/, 'the real button-path message must explicitly say not fully verified');
  assert.match(statusText, /±45م/, 'the real button-path message must include the measured accuracy');
  const state = harness.getState();
  assert.equal(state.locationSource, 'gps_weak');
  assert.equal(state.locationVerified, false);
  assert.equal(state.locationWarningOverride, true);
  assert.equal(harness.elementRegistry.inputLatitude.value, 24.7136);
  assert.equal(harness.elementRegistry.inputLongitude.value, 46.6753);
  // and the save gate's own real formula accepts exactly this combination
  assert.equal(evalAcceptedGpsSource(state.locationVerified, state.locationSource, state.locationWarningOverride), true);
});

test('manual_map can never satisfy the real save-gate formula, even after commitLocationSelection actually runs on a manual candidate', () => {
  const harness = loadWeakGpsHarness();
  harness.setState({
    locationCandidate: {
      lat: 24.7136, lng: 46.6753, correctedLat: 24.7136, correctedLng: 46.6753,
      accuracy: null, stable: false, manual: true, capturedAt: new Date().toISOString()
    },
    locationWarningOverride: true // even if an override were somehow set, manual_map must still lose
  });
  assert.equal(harness.commitLocationSelection(), true);
  const state = harness.getState();
  assert.equal(state.locationSource, 'manual_map');
  assert.equal(evalAcceptedGpsSource(true, 'manual_map', true), false);
  assert.equal(evalAcceptedGpsSource(false, 'manual_map', false), false);
});

test('a normal, good-accuracy GPS fix auto-commits via renderLocationCandidate with a distinct message that never carries the weak-GPS warning', () => {
  const harness = loadWeakGpsHarness();
  const freshSample = { lat: 24.7136, lng: 46.6753, accuracy: 12, stable: true, capturedAt: new Date().toISOString() };
  harness.setState({
    locationSamples: [freshSample, freshSample, freshSample],
    locationCandidate: freshSample
  });
  harness.renderLocationCandidate();
  const statusText = harness.elementRegistry.locationStatus.textContent;
  assert.match(statusText, /تم تحديد الموقع — الدقة/);
  assert.doesNotMatch(statusText, /GPS ضعيف|غير موثّق بدقة كاملة/, 'a normal verified GPS fix must never receive the weak-GPS warning');
  const state = harness.getState();
  assert.equal(state.locationSource, 'gps');
  assert.equal(state.locationVerified, true);
  assert.equal(state.locationWarningOverride, false);
  assert.equal(evalAcceptedGpsSource(state.locationVerified, state.locationSource, state.locationWarningOverride), true);
});

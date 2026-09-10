'use strict';
// PHASE 04D — targeted regression tests for the 4 verified responsive
// visual-acceptance defects found by the Phase 04C-L live browser audit
// (CRITICAL-01 map-card collapse, HIGH-01 390px horizontal overflow,
// HIGH-02 mobile header clipping, MEDIUM-01 Field Survey log truncation)
// and their corrections. This is not a redesign: each test locks in the
// specific fix, not new behavior.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');

function methodBody(source, signature, maxLen = 1500) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

function fieldSurveyBlock() {
  const start = manager.indexOf('<sc-if value="{{ viewIsFieldSurvey }}">');
  const end = manager.indexOf('</main>', start);
  assert.notEqual(start, -1); assert.notEqual(end, -1);
  return manager.slice(start, end);
}

// ---- A. CRITICAL-01: the executive map card owns its own responsive height ----
test('A. the Field Survey executive screen map shell carries min-height:var(--fsMapH,...) on itself, not on the wrapping row', () => {
  const block = fieldSurveyBlock();
  const execStart = block.indexOf('sc-if value="{{ fsScreenIsExec }}"');
  const execEnd = block.indexOf('sc-if value="{{ fsScreenIsLog }}"', execStart);
  const execBlock = block.slice(execStart, execEnd);

  const rowStart = execBlock.indexOf('display:flex;gap:14px;flex-wrap:var(--fsWrap,nowrap)');
  assert.notEqual(rowStart, -1, 'map+side row not found');
  const rowTag = execBlock.slice(rowStart - 20, rowStart + 80);
  assert.doesNotMatch(rowTag, /min-height/, 'the row itself must not carry the map min-height — an absolutely positioned map child contributes zero intrinsic height and the row collapses once it wraps');

  const shellStart = execBlock.indexOf('ref="{{ mapShellRef }}"', rowStart);
  assert.notEqual(shellStart, -1);
  const shellTag = execBlock.slice(shellStart, shellStart + 260);
  assert.match(shellTag, /min-height:var\(--fsMapH,420px\)/, 'the map shell itself must own min-height:var(--fsMapH,420px)');

  // the already-correct dedicated map screen must be untouched and keep the same pattern
  const mapScreenStart = block.indexOf('sc-if value="{{ fsScreenIsMap }}"');
  const mapScreenShell = block.slice(mapScreenStart, mapScreenStart + 2500);
  assert.match(mapScreenShell, /ref="\{\{ mapShellRef \}\}" style="flex:1;min-height:var\(--fsMapH,420px\)/);
});

// ---- B. HIGH-02: mobile header responsive contract ----
test('B. the manager header wraps at mob width via the already-defined --hdrWrap token, hides day/night labels, and keeps the SMART HSR wordmark visible', () => {
  const headerStart = manager.indexOf('<header style=');
  const headerEnd = manager.indexOf('</header>', headerStart);
  const header = manager.slice(headerStart, headerEnd);

  assert.match(header, /<header style="[^"]*flex-wrap:var\(--hdrWrap,nowrap\)/, '--hdrWrap must be wired onto the <header> flex-wrap itself');
  assert.match(header, /display:var\(--hdrLabel,inline\)">نهاري</);
  assert.match(header, /display:var\(--hdrLabel,inline\)">ليلي</);
  // the SMART HSR wordmark block must still exist and be governed by --brandTxt
  assert.match(header, /SMART<\/span><span style="color:var\(--logoGreenH,#149c2b\)">HSR/);
  assert.match(header, /style="text-align:left;display:var\(--brandTxt,block\)">\s*<div dir="ltr" style="display:flex;align-items:baseline;gap:5px;font-size:15px;font-weight:700;letter-spacing:2.5px;line-height:1">\s*<span style="color:var\(--logoNavyH,#e9f1fb\)">SMART/);

  // BP.mob must hide the day/night text labels and wrap the header, but must NOT
  // hide the brand wordmark (only BP.tab hides it — 768/1024 stay unchanged)
  const bp = methodBody(manager, 'BP = {', 2500);
  const mobStart = bp.indexOf('mob: {');
  const mobTier = bp.slice(mobStart, bp.indexOf('\n  };', mobStart));
  const tabStart = bp.indexOf('tab: {');
  const tabTier = bp.slice(tabStart, mobStart);

  assert.match(mobTier, /'--hdrWrap': 'wrap'/);
  assert.match(mobTier, /'--hdrLabel': 'none'/);
  assert.doesNotMatch(mobTier, /'--brandTxt': 'none'/, 'the SMART HSR wordmark must stay visible at mob width to avoid empty branding once the logo image 404s');
  assert.match(tabTier, /'--brandTxt': 'none'/, '768/1024 (tab tier) must remain visually unchanged by this fix');
});

// ---- C. HIGH-01: no overflow band-aid was used to fix the 390px overflow ----
test('C. the 390px horizontal-overflow fix is a real layout correction, not an overflow-x:hidden band-aid', () => {
  assert.doesNotMatch(manager, /overflow-x:\s*hidden/i, 'overflow-x:hidden must never be used to mask a horizontal-overflow defect instead of fixing the underlying width/flex/min-width issue');
  assert.doesNotMatch(manager, /overflowX/i);
});

// ---- D. MEDIUM-01: Field Survey log table narrow-width contract ----
test('D. the Field Survey log table reuses the existing --thead/--rowWrap narrow pattern and adds a genuine min-width floor scoped to Field Survey only', () => {
  const block = fieldSurveyBlock();
  const logStart = block.indexOf('sc-if value="{{ fsScreenIsLog }}"');
  const logEnd = block.indexOf('sc-if value="{{ fsScreenIsInspectors }}"', logStart);
  assert.notEqual(logStart, -1);
  const logBlock = logEnd !== -1 ? block.slice(logStart, logEnd) : block.slice(logStart, logStart + 6000);

  assert.match(logBlock, /display:var\(--thead,flex\)/, 'must reuse the existing header-row visibility token, not invent a new one');
  assert.match(logBlock, /flex-wrap:var\(--rowWrap,nowrap\)/, 'must reuse the existing row-wrap token already active at tab/mob');
  assert.match(logBlock, /min-width:var\(--fsCellMinW,0\)[^<]*>\{\{ c\.label \}\}/, 'header cells must carry the new min-width floor token');
  assert.match(logBlock, /min-width:var\(--fsCellMinW,0\)[^<]*>\{\{ c\.v \}\}/, 'row cells must carry the new min-width floor token');

  const bp = methodBody(manager, 'BP = {', 2500);
  const mobStart = bp.indexOf('mob: {');
  const mobTier = bp.slice(mobStart, bp.indexOf('\n  };', mobStart));
  const tabStart = bp.indexOf('tab: {');
  const tabTier = bp.slice(tabStart, mobStart);
  assert.match(mobTier, /'--fsCellMinW': '92px'/, 'the min-width floor must be set at mob width only, forcing genuine wrap instead of near-zero shrink');
  assert.doesNotMatch(tabTier, /--fsCellMinW/, '768/1024 (tab tier) table density must remain unchanged by this fix');

  // no important columns were dropped — all 5 real fields still render
  assert.match(manager, /tCols = \[\s*\{ label: 'الرقم', flex: '0 0 56px', align: 'right' \},\s*\{ label: 'العنوان', flex: '1\.3', align: 'right' \},\s*\{ label: 'الفئة', flex: '0\.9', align: 'right' \},\s*\{ label: 'المراقب', flex: '1', align: 'right' \},\s*\{ label: 'التاريخ', flex: '0 0 92px', align: 'left' \}\s*\];/);
});

// ---- E. Field Survey full-product architecture stays intact (no regression) ----
test('E. Field Survey remains the single full-page product view with its 4 real screens, unaffected by the CSS-only correction', () => {
  assert.equal((manager.match(/sc-if value="\{\{ viewIsFieldSurvey \}\}"/g) || []).length, 1);
  const fn = methodBody(manager, 'const fsNav = [', 500);
  assert.match(fn, /نظرة تنفيذية/);
  assert.match(fn, /سجل أعمال الحصر/);
  assert.match(fn, /المراقبون/);
  assert.match(fn, /الخريطة التشغيلية/);
});

// ---- F. Map lifecycle remains untouched by the responsive correction ----
test('F. bindMapContainer/initOperationalMap/syncOperationalMap/operationalObservations are unchanged by this phase', () => {
  const bind = methodBody(manager, 'bindMapContainer(el) {', 500);
  assert.match(bind, /if \(el === this\.mapEl\) return;/);
  assert.match(bind, /this\._opMap\.remove\(\); this\._opMap = null; this\._opMarkers = null;/);

  const init = methodBody(manager, 'initOperationalMap() {', 500);
  assert.match(init, /if \(!this\.mapEl \|\| this\._opMap \|\| !window\.L\) return;/);
  assert.equal((manager.match(/L\.map\(this\.mapEl/g) || []).length, 1);

  const sync = methodBody(manager, 'syncOperationalMap(forceFit = false) {', 1400);
  assert.match(sync, /L\.circleMarker\(\[item\.coordinates\.lat, item\.coordinates\.lng\]/);
  assert.match(sync, /this\.operationalObservations\(\)/);

  const obs = methodBody(manager, 'operationalObservations() {', 500);
  assert.match(obs, /if \(!item\.coordinates\) return false;/);
});

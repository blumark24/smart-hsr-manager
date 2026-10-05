const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manager = fs.readFileSync(path.join(__dirname,'..','manager.html'),'utf8');
const inspector = fs.readFileSync(path.join(__dirname,'..','dashboard.html'),'utf8');
const runtime = fs.readFileSync(path.join(__dirname,'..','field-head-runtime.js'),'utf8');

test('department head field workspace has unified visual markers', () => {
  assert.match(manager, /FIELD SURVEY VISUAL UNIFICATION V1/);
  assert.match(manager, /class="hsr-field-workspace"/);
  assert.match(manager, /class="hsr-field-context-card"/);
  assert.match(manager, /class="hsr-field-nav"/);
  assert.match(manager, /class="hsr-field-kpis"/);
  assert.match(manager, /hint-placeholder-count="4"/);
});

test('field lifecycle and trusted map contract remain intact', () => {
  assert.match(runtime, /الرصد/);
  assert.match(runtime, /الإسناد/);
  assert.match(runtime, /التنفيذ/);
  assert.match(runtime, /التحقق/);
  assert.match(runtime, /الإغلاق/);
  assert.match(runtime, /locationVerified === true/);
  assert.match(runtime, /const inSaudiEnvelope/);
  assert.doesNotMatch(runtime, /fake marker|mock marker/i);
});

test('inspector workspace receives presentation-only municipal polish', () => {
  assert.match(inspector, /field-inspector-visual-unification-v1/);
  assert.match(inspector, /FIELD INSPECTOR VISUAL UNIFICATION V1/);
  assert.match(inspector, /#hsrHeader\.hsr-header/);
  assert.match(inspector, /\.mission-summary/);
  assert.match(inspector, /\.inspector-light-card/);
  assert.match(inspector, /#personalObservationsMap/);
});

test('role boundaries remain explicit', () => {
  assert.match(runtime, /role:'dept'/);
  assert.match(runtime, /institutionalFieldHead/);
  assert.match(inspector, /user-role-inspector/);
  assert.match(inspector, /المراقب يتحقق من المعالجة فقط/);
  assert.match(inspector, /الإغلاق النهائي يتم من رئيس قسم الحصر الميداني/);
});

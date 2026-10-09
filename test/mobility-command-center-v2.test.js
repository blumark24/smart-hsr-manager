'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'mobility-runtime.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');

test('Mobility telemetry is trusted, assignment-bound and capability-gated', () => {
  assert.match(api, /action === 'reportMobilityTelemetry'/);
  assert.match(api, /getMobilityAssignedOperatorCallerContext/);
  assert.match(api, /actor\.capabilities\.includes\('vehicle\.drive'\)/);
  assert.match(api, /mission\.assignedEmployeeUid !== actor\.uid/);
  assert.match(api, /vehicle\.currentMissionId !== missionId/);
  assert.match(api, /vehicle\.status !== 'IN_MISSION'/);
  assert.match(api, /mobilityTelemetry/);
});

test('Mobility workspace returns trusted municipal map context and last-known telemetry', () => {
  assert.match(api, /safeMobilityMapContext/);
  assert.match(api, /mapContext,/);
  assert.match(api, /telemetry,/);
  assert.match(api, /mapBounds/);
  assert.match(api, /mapCenter/);
});

test('Runtime publishes privacy-bounded telemetry and refreshes command center', () => {
  assert.match(runtime, /navigator\.geolocation\.watchPosition/);
  assert.match(runtime, /TELEMETRY_REPORT_MIN_MS = 15 \* 1000/);
  assert.match(runtime, /reportMobilityTelemetry/);
  assert.match(runtime, /LIVE/);
  assert.match(runtime, /STALE/);
  assert.match(runtime, /OFFLINE/);
  assert.match(runtime, /setInterval\(\(\) => refresh\(\)\.catch/);
});

test('Mobility map no longer uses a hard-coded center or synthetic mobility layer counts', () => {
  assert.doesNotMatch(page, /center:\s*\[41\.07889,\s*19\.12639\]/);
  assert.match(page, /applyMunicipalMapContext/);
  assert.match(page, /syncMobilityRealMap/);
  assert.match(page, /trustedMobilityLayers/);
  assert.match(page, /SMART HSR SATELLITE/);
  assert.doesNotMatch(page, /SMART HSR TWIN — التوأم البلدي الرقمي/);
});


test('FULL workflow exposes both Administrative Affairs gates and no dead authorization path', () => {
  assert.match(page, /اعتماد المهمة — الشؤون الإدارية/);
  assert.match(page, /اعتماد تشغيل المركبة — الشؤون الإدارية/);
  assert.match(page, /vehicleauth/);
  assert.match(page, /decideVehicleAuthorization\(m\.id, 'AUTHORIZED'\)/);
  assert.match(page, /decideVehicleAuthorization\(m\.id, 'REJECTED'\)/);
  assert.match(api, /status: 'APPROVED'/);
  assert.match(api, /status: 'AVAILABLE'/);
  assert.match(api, /action: 'authorization_release'/);
});

test('Department-head Mobility candidates are department-scoped and self-driving remains supported', () => {
  assert.match(api, /actor\.role === 'department_head'[\s\S]{0,260}cleanString\(d\.department\) !== cleanString\(actor\.department\)/);
  assert.match(api, /assignSelf/);
  assert.match(api, /department_head_vehicle_eligibility_required/);
  assert.match(page, /طلب مركبة لي/);
  assert.match(page, /myvehicle/);
});

test('Trusted Mobility map layer toggles and search control actual rendered data', () => {
  assert.match(page, /this\.state\.layers\.veh \? telemetry : \[\]/);
  assert.match(page, /this\.state\.layers\.inc \? incidents : \[\]/);
  assert.match(page, /this\.state\.layers\.bound && Array\.isArray\(bounds\)/);
  assert.match(page, /const q=String\(this\.state\.mapQ\|\|''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(page, /if\(!matches\(vehicle\?\.no/);
  assert.match(page, /if\(!matches\(i\.id/);
  assert.match(page, /موقع مباشر/);
  assert.match(page, /حادث مفتوح/);
});

test('Mobility allocation queue contains only missions ready for vehicle allocation', () => {
  assert.match(page, /sideA: M\.filter\(m => this\.missionStatus\(m\.id\) === 'بانتظار المركبة'\)/);
  assert.doesNotMatch(page, /sideA: M\.filter\(m => \['بانتظار المركبة', 'معتمدة', 'بانتظار الاعتماد'\]/);
});

test('Administrative approval surface does not fabricate employee availability', () => {
  assert.doesNotMatch(page, /لا توجد إجازة مسجلة · لا يوجد تعارض مع مهمة أخرى/);
  assert.match(page, /لا تُفترض الإجازات أو التعارضات الزمنية/);
});


test('Trusted incident coordinates survive the runtime view model and can render as map pins', () => {
  assert.match(runtime, /location: hasCoordinate \? \{ \.\.\.location, lat, lng \} : null/);
  assert.match(runtime, /loc: hasCoordinate \? \(lat\.toFixed\(5\) \+ ', ' \+ lng\.toFixed\(5\)\) : 'غير متاح'/);
  assert.match(page, /mobilityIncidentCoordinate\(i\)/);
  assert.match(page, /const loc=i&&i\.location/);
});


test('Mobility side panels use real operational cards and context-aware empty states', () => {
  assert.match(runtime, /sideAEmptyText:'لا توجد مهام جارية في القسم حالياً.'/);
  assert.match(runtime, /sideA:instance\.missions\(\)[\s\S]{0,900}openDrawer\('mission',m\.id\)/);
  assert.match(runtime, /sideBEmptyText:'لا يوجد موظفون مؤهلون لاستلام مركبة في هذا القسم حالياً.'/);
  assert.match(runtime, /cEmpId:e\.employeeId/);
  assert.match(page, /\{\{ sideAEmptyText \}\}/);
  assert.match(page, /\{\{ sideBEmptyText \}\}/);
  assert.match(page, /لا توجد مهام بانتظار تخصيص مركبة حالياً/);
  assert.match(page, /لا توجد حوادث تشغيلية مفتوحة حالياً/);
});


test('Incident navigation preserves the authenticated UI role', () => {
  assert.match(page, /goIncidents: \(\) => this\.setState\(\{ screen: 'incidents' \}\)/);
  assert.doesNotMatch(page, /goIncidents: \(\) => this\.setState\(\{ role: 'mobility'/);
});


test('Stale drawer ids fail closed instead of falling back to another mission or vehicle', () => {
  assert.match(page, /const m = M\.find\(x => x\.id === id\) \|\| null/);
  assert.match(page, /const v = V\.find\(x => x\.id === id\) \|\| null/);
  assert.doesNotMatch(page, /M\.filter\(x => x\.id === id\)\[0\] \|\| M\[0\]/);
  assert.doesNotMatch(page, /V\.filter\(x => x\.id === id\)\[0\] \|\| V\[0\]/);
});


test('Mission lifecycle UI does not fabricate audit timestamps or actors', () => {
  assert.match(page, /يعرض المراحل المستنتجة من الحالة الحالية فقط؛ لا يعرض أوقاتاً أو منفذين غير مسجلين/);
  assert.match(page, /time: done \? 'مكتملة' : '—'/);
  assert.match(page, /who: done \? 'وفق حالة المهمة الحالية' : 'بانتظار التنفيذ'/);
  assert.doesNotMatch(page, /const times = \['08:02'/);
  assert.doesNotMatch(page, /27\/05 · /);
});


test('Mobility basemap does not use OpenStreetMap public volunteer tile servers', () => {
  assert.doesNotMatch(page, /https:\/\/tile\.openstreetmap\.org/);
  assert.match(page, /World_Street_Map\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/);
  assert.match(page, /World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/);
});

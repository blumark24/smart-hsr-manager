'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const adapter = fs.readFileSync(path.join(root, 'manager-mobility-adapter.js'), 'utf8');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');

test('Municipality Manager Mobility view is read-only and organization scoped', () => {
  assert.match(adapter, /where\('organizationId', '==', orgId\)/);
  assert.match(adapter, /collection\(db, 'missions'\)/);
  assert.match(adapter, /collection\(db, 'vehicles'\)/);
  assert.match(adapter, /collection\(db, 'incidents'\)/);
  assert.doesNotMatch(adapter, /addDoc|setDoc|updateDoc|deleteDoc|runTransaction/);
});

test('Manager opens Mobility inside the existing authenticated manager shell', () => {
  assert.match(manager, /goMobilityGateway/);
  assert.match(manager, /view: 'mobility'/);
  assert.match(manager, /SmartHSRMobilityAdapter\?\.connect\(this\)/);
  assert.doesNotMatch(manager, /goMobilityGateway[\s\S]{0,1200}location\.href\s*=\s*['"][^'"]*smart-mobility/);
});

test('Manager Mobility data sources report failures independently', () => {
  assert.match(adapter, /missionsState/);
  assert.match(adapter, /vehiclesState/);
  assert.match(adapter, /incidentsState/);
  assert.match(adapter, /failedSources/);
  assert.match(adapter, /overallState/);
});

test('Manager Mobility KPIs use canonical operational status vocabulary', () => {
  for (const status of [
    'PENDING_APPROVAL','APPROVED','VEHICLE_ALLOCATED','HANDED_OVER',
    'READY','IN_PROGRESS','INCIDENT_HOLD','AWAITING_RETURN','CLOSED',
    'AVAILABLE','RESERVED','IN_MISSION','MAINTENANCE','OUT_OF_SERVICE',
    'NEW','ACKNOWLEDGED','RESOLVED'
  ]) assert.ok(adapter.includes(status), 'missing canonical status: ' + status);
});

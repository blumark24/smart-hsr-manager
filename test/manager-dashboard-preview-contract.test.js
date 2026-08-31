'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'manager-dashboard-adapter.js'), 'utf8');
const operations = fs.readFileSync(path.join(root, 'manager-operations.html'), 'utf8');

assert.match(dashboard, /class Component extends DCLogic/);
assert.match(dashboard, /dashboard\.html/);
assert.doesNotMatch(dashboard, /manager-operations\.html#/);
assert.match(dashboard, /openView\('observations'/);
assert.match(dashboard, /openView\('reports'/);
assert.match(dashboard, /openView\('users'/);
assert.match(dashboard, /openMap\(/);
assert.match(dashboard, /L\.map\(/);
assert.match(dashboard, /حصر الأراضي الذكي/);
assert.match(dashboard, /حركة السير الذكية/);
assert.match(dashboard, /الهيكل الإداري/);
assert.match(dashboard, /المساعد التنفيذي الذكي/);
assert.match(dashboard, /SmartHSRFormat/);
assert.match(adapter, /where\('organizationId', '==', context\.organizationId\)/);
assert.match(adapter, /verifyManagerAccess/);
assert.match(adapter, /snapshot\.metadata\.fromCache/);
assert.match(adapter, /activeAuthApi/);
assert.match(operations, /manager-operations-route-adapter\.js/);

console.log('manager dashboard preview contract OK');

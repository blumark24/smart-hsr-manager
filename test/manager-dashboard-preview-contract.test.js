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
assert.match(dashboard, /manager-operations\.html#reports/);
assert.match(dashboard, /manager-operations\.html#twin/);
assert.match(dashboard, /حصر الأراضي الذكي بانتظار مساره التشغيلي الحقيقي/);
assert.match(dashboard, /حركة السير الذكية — قريباً/);
assert.match(dashboard, /الهيكل الإداري/);
assert.match(dashboard, /المساعد التنفيذي الذكي/);
assert.match(adapter, /where\('organizationId', '==', context\.organizationId\)/);
assert.match(adapter, /verifyManagerAccess/);
assert.match(adapter, /snapshot\.metadata\.fromCache/);
assert.match(operations, /manager-operations-route-adapter\.js/);

console.log('manager dashboard preview contract OK');

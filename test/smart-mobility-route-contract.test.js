'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'smart-mobility.html'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'smart-mobility-adapter.js'), 'utf8');

// manager.html: Smart Mobility must be a real route now, never a قريباً placeholder.
assert.match(manager, /goMobility:\s*\(\)\s*=>\s*this\.goRoute\('mobility'\)/);
assert.match(manager, /if\s*\(r === 'mobility'\)\s*\{\s*window\.location\.assign\('smart-mobility\.html'\)/);
assert.doesNotMatch(manager, /label:\s*'حركة السير الذكية',\s*tag:\s*'قريباً',\s*disabled:\s*true/);

// smart-mobility.html: no client-side role switcher may exist (design/QA-only
// affordance per the brief) — role must come only from the auth adapter.
assert.doesNotMatch(page, /sc-for list="\{\{ roles \}\}"/);
assert.match(page, /role:\s*null,\s*screen:\s*null,\s*authPending:\s*true/);
assert.match(page, /window\.SmartHSRMobilityAdapter\?\.connect\(this\)/);
assert.match(page, /window\.SmartHSRMobilityAdapter\?\.disconnect\(this\)/);
assert.match(page, /gateShow/);

// smart-mobility-adapter.js: real role resolution from Firestore, not the URL
// or client state, with a safe default-deny redirect to login.
assert.match(adapter, /async function verifyMobilityAccess/);
assert.match(adapter, /mobility_head:\s*'mobility'/);
assert.match(adapter, /department_head:\s*'dept'/);
assert.match(adapter, /administrative_affairs:\s*'admin'/);
assert.match(adapter, /employee:\s*'employee'/);
assert.match(adapter, /location\.replace\('login\.html'\)/);

// login.html: the four new Smart Mobility roles route to the real page.
assert.match(login, /mobility_head.*department_head.*administrative_affairs.*employee/s);
assert.match(login, /window\.location\.href = 'smart-mobility\.html'/);

console.log('smart mobility route contract OK');

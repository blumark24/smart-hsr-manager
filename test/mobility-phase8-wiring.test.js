'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'smart-mobility.html'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'smart-mobility-adapter.js'), 'utf8');

// No vehicle marker may be animated along a fabricated route — this system
// has no real GPS source, so implying live movement would be dishonest.
// vehPos() (the animated-route helper) must be gone entirely, and no pin
// may carry a non-zero pulse (the visual "live" indicator).
assert.doesNotMatch(page, /vehPos\(/);
assert.doesNotMatch(page, /pulse: moving \? '0\.55' : '0'/);
assert.match(page, /pulse: '0', z: s \? '12' : '6'/);

// Every vehicle marker must use the static, deterministic parkPos — never
// a status-conditional "moving" branch that would resurrect fake tracking.
assert.match(page, /const pos = this\.parkPos\(v\);/);
assert.match(page, /pos: this\.parkPos\(v\) \};/);

// The map/twin screen must carry an explicit, always-visible disclosure
// that positions are schematic, not real GPS.
assert.match(page, /مواقع تخطيطية — لا تتوفر بيانات GPS حقيقية/);

// Zone counts must be derived from the real fleet size, not the design's
// fixed placeholder numbers ('6'/'5'/'4'/'3', summing to a fake constant
// total regardless of how many vehicles actually exist).
assert.doesNotMatch(page, /a0: 40, a1: 130, n: '6'/);
assert.match(page, /const zoneShare = this\.ZONES\.map/);

// The adapter must not fabricate per-vehicle route/phase fields that only
// ever fed the now-removed fake animation.
assert.doesNotMatch(adapter, /route: 0, phase: 0/);

console.log('mobility Phase 8 wiring OK');

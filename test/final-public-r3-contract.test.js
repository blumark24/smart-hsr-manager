'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const enhancements = fs.readFileSync(path.join(root, 'public-enhancements.js'), 'utf8');

function publicR3(source) {
  assert.doesNotMatch(source, /__bundler\//, 'public R3 must ship as static HTML/assets, not a bundler manifest');
  assert.doesNotMatch(source, /__bundler_/, 'public R3 must not expose bundler runtime markers');
  assert.doesNotMatch(source, /blob:/, 'public R3 must not depend on Blob mounting');
  assert.match(source, /\/public-r3-assets\/runtime\//, 'R3 resources must ship as static local assets');
  assert.match(source, /\/public-enhancements\.js/, 'approved public behavior layer must be loaded');
  return source;
}

test('public Website R3 keeps the approved information architecture (hero, 10 sections, footer)', () => {
  const template = publicR3(index);
  const labels = [...template.matchAll(/data-screen-label="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(labels, [
    '01 Hero',
    '01 Hero Compact',
    '02 Statement',
    '03 Field to Decision',
    '04 Product Bento',
    '05 Product Presence',
    '06 Digital Twin Signature',
    '07 Institutional Value',
    '08 Architecture and Governance',
    '09 Company Profile',
    '10 Partnership CTA',
    '11 Footer',
  ]);
});

test('Website R3 keeps its native responsive engine (desktop / tablet / mobile) and new logo', () => {
  const template = publicR3(index);
  assert.match(template, /const SPANS = \{\s*d: \{[\s\S]*?\},\s*t: \{[\s\S]*?\},\s*m: \{/);
  assert.match(template, /bpOf\(window\.innerWidth\)/);
  assert.match(template, /01 Hero Compact/);
  assert.match(template, /menuOpen/);
  assert.match(template, /HSRTwin/);
});

test('the exported component no longer reads prevState that the design runtime never supplies', () => {
  const template = publicR3(index);
  assert.doesNotMatch(template, /componentDidUpdate\(pp, ps\)/);
  assert.match(template, /componentDidUpdate\(\) \{ if \(this\._bp !== this\.state\.bp\)/);
});

test('document root keeps Arabic RTL language, direction and a real title', () => {
  assert.match(index, /<html[^>]*lang="ar"[^>]*dir="rtl"/);
  assert.match(index, /<title>SMART HSR — من الميدان إلى القرار<\/title>/);
});

test('every public institutional-login CTA resolves to the hardened gateway only', () => {
  assert.match(enhancements, /location\.href\s*=\s*['"]Home\.html['"]/);
  assert.match(enhancements, /href="Home\.html">الدخول المؤسسي/);
  assert.doesNotMatch(enhancements, /owner-login\.html|manager-login\.html|login\.html/);
});

test('the previously developed institutional footer replaces the exported navy footer', () => {
  assert.match(enhancements, /\[data-screen-label="11 Footer"\]\{display:none!important\}/);
  assert.match(enhancements, /id = 'smartSafeFooter'/);
  assert.match(enhancements, /BLUMARK24/);
  assert.match(enhancements, /التطوير والتشغيل التقني/);
  assert.match(enhancements, /© 2026 SMART HSR/);
  assert.doesNotMatch(enhancements, /FIELD → DATA → OPERATIONS → DECISION/);
  assert.doesNotMatch(enhancements, /Arabic · English/);
  assert.match(enhancements, /@media\(max-width:900px\)/);
  assert.match(enhancements, /@media\(max-width:680px\)/);
  assert.match(enhancements, /@media\(max-width:390px\)/);
  assert.match(enhancements, /env\(safe-area-inset-bottom\)/);
});

test('the footer is rebuilt in the Cloud emerald glass language with the new logo', () => {
  assert.match(enhancements, /#073324/);
  assert.match(enhancements, /#04221A/);
  assert.match(enhancements, /#8FE0B0/);
  assert.match(enhancements, /smart-hsr-logo-r2\.png/);
  assert.match(enhancements, /cloud-noise\.png/);
  assert.match(enhancements, /\.sf-main/);
  assert.match(enhancements, /\.sf-dev/);
  assert.match(enhancements, /من الميدان إلى القرار/);
  assert.match(enhancements, /prefers-reduced-motion/);
});

test('exported nav and menu items navigate to the Website R3 sections, only from fixed chrome', () => {
  for (const label of ['02 Statement', '04 Product Bento', '06 Digital Twin Signature', '07 Institutional Value', '09 Company Profile']) {
    assert.ok(enhancements.includes(label), `${label} must be a navigation target`);
  }
  assert.match(enhancements, /inFixedChrome\(hit\)/);
  assert.match(enhancements, /#smartSafeFooter \[data-tail\]/);
});

test('official company profile opens the real PDF instead of the exported placeholder viewer', () => {
  assert.match(enhancements, /drive\.google\.com\/file\/d\/1yietCualc15XxZVzlxJzI7NhHVcTAwMh\/preview/);
  assert.match(enhancements, /drive\.google\.com\/uc\?export=download&id=1yietCualc15XxZVzlxJzI7NhHVcTAwMh/);
});

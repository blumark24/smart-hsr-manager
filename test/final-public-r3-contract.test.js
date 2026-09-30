'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const enhancements = fs.readFileSync(path.join(root, 'public-enhancements.js'), 'utf8');

function bundledTemplate(source) {
  const match = source.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  assert.ok(match, 'index.html must contain the approved bundled R3 template');
  return JSON.parse(match[1]);
}

test('public R3 keeps the approved seven-section information architecture', () => {
  const template = bundledTemplate(index);
  const labels = [...template.matchAll(/data-screen-label="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(labels, [
    '01 Hero',
    '02 Statement',
    '03 Field to Decision',
    '04 Product Bento',
    '05 Product Presence',
    '06 Digital Twin Signature',
    '07 Company Profile',
  ]);
});

test('every public institutional-login CTA resolves to the hardened gateway only', () => {
  assert.match(enhancements, /location\.href=['"]Home\.html['"]/);
  assert.match(enhancements, /class="login" href="Home\.html"/);
  assert.match(enhancements, /href="Home\.html">الدخول المؤسسي/);
  assert.doesNotMatch(enhancements, /owner-login\.html|manager-login\.html|login\.html/);
});

test('public R3 responsive contract covers tablet, mobile, small mobile and safe areas', () => {
  assert.match(enhancements, /@media\(max-width:1024px\)/);
  assert.match(enhancements, /@media\(max-width:680px\)/);
  assert.match(enhancements, /@media\(max-width:390px\)/);
  assert.match(enhancements, /overflow-x:hidden!important/);
  assert.match(enhancements, /env\(safe-area-inset-top\)/);
  assert.match(enhancements, /min-height:52px/);
  assert.match(enhancements, /width:44px;height:44px/);
});

test('mobile public navigation retains an accessible route to institutional access', () => {
  assert.match(enhancements, /\.claude-login\{display:none!important\}/);
  assert.match(enhancements, /#smartSafeMenu button,#smartSafeMenu a\{[\s\S]*?min-height:52px/);
  assert.match(enhancements, /<a class="login" href="Home\.html">الدخول إلى SMART HSR<\/a>/);
});

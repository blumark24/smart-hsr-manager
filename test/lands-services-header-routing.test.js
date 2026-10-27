'use strict';

// Lightweight DOM contract UAT for the existing Lands profile menu.
// No browser, Firebase, credentials, tenant access or fixture writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const lands = fs.readFileSync(path.join(root, 'lands/index.html'), 'utf8');
const start = lands.indexOf('function clearAuthorizedLandsServices()');
const end = lands.indexOf('// Profile display is populated', start);
assert.ok(start !== -1 && end > start, 'Lands shared-services helper must exist');
const helper = lands.slice(start, end);

function harness() {
  const menu = {
    children: [],
    insertBefore(element, before) {
      const at = this.children.indexOf(before);
      assert.ok(at !== -1, 'existing account-menu landmark required');
      this.children.splice(at, 0, element);
      element.parent = this;
    }
  };
  const managerMode = { id: 'managerModeMenuItem', dataset: {} };
  menu.children.push(managerMode);
  const assignedUrls = [];
  let menuCloses = 0;
  const document = {
    getElementById(id) {
      return id === 'accountMenu' ? menu : id === 'managerModeMenuItem' ? managerMode : null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, '#accountMenu [data-hsr-lands-shared]');
      return menu.children.filter(el => el.dataset && el.dataset.hsrLandsShared);
    },
    createElement(tagName) {
      return {
        tagName, dataset: {}, style: {}, attributes: {}, textContent: '',
        setAttribute(k, v) { this.attributes[k] = v; },
        remove() {
          const at = menu.children.indexOf(this);
          if (at !== -1) menu.children.splice(at, 1);
        }
      };
    }
  };
  const location = {
    origin: 'https://smart-hsr-preview.example.test',
    assign(url) { assignedUrls.push(url); }
  };
  const sandbox = {
    document, location, URL, Set, Object, Array,
    closeAccountMenu() { menuCloses++; }
  };
  vm.runInNewContext(helper, sandbox, { filename: 'lands/index.html (services helper)' });
  return { ...sandbox, menu, assignedUrls, get menuCloses() { return menuCloses; } };
}

const landsWorkspace = { id: 'lands', title: 'الأراضي', route: null };
const mobilityWorkspace = { id: 'mobility', title: 'الحركة الذكية', route: 'department-head.html?mode=mobility' };
const fieldWorkspace = { id: 'field', title: 'الحصر الميداني', route: 'dashboard.html' };

test('Lands-only identities keep their existing profile menu without extra actions', () => {
  const h = harness();
  h.showAuthorizedLandsServices([landsWorkspace]);
  assert.equal(h.menu.children.length, 1);
  assert.equal(h.menu.children[0].id, 'managerModeMenuItem');
});

test('Lands account menu shows only trusted extra services inside the approved UI', () => {
  const h = harness();
  h.showAuthorizedLandsServices([landsWorkspace, mobilityWorkspace, fieldWorkspace]);
  assert.equal(h.menu.children.length, 4);
  assert.equal(h.menu.children[0].textContent, 'خدماتي');
  const targets = h.menu.children.filter(n => n.dataset.hsrLandsShared === 'service');
  assert.deepEqual(Array.from(targets, x => x.dataset.workspace), ['mobility', 'field']);
  assert.deepEqual(Array.from(targets, x => x.attributes.role), ['menuitem', 'menuitem']);
  assert.equal(h.menu.children.at(-1).id, 'managerModeMenuItem');
});

test('Mobility link stays on the same origin and the account menu closes', () => {
  const h = harness();
  h.showAuthorizedLandsServices([landsWorkspace, mobilityWorkspace]);
  const item = h.menu.children.find(x => x.dataset.workspace === 'mobility');
  let stopped = false;
  item.onclick({stopPropagation() {stopped = true;}});
  assert.ok(stopped);
  assert.equal(h.menuCloses, 1);
  assert.deepEqual(h.assignedUrls, [
    'https://smart-hsr-preview.example.test/department-head.html?mode=mobility'
  ]);
});

test('Unsafe, duplicate, unknown or unauthenticated workspaces never create links', () => {
  const h = harness();
  h.showAuthorizedLandsServices([
    landsWorkspace,
    { id: 'mobility', title: 'MALICIOUS', route: 'https://malicious.example/' },
    { id: 'mobility', title: 'MALICIOUS', route: '../manager.html' },
    { id: 'unexpected', title: 'Unexpected', route: 'dashboard.html' },
    { id: 'field', title: 'الحصر', route: 'dashboard.html' },
    { id: 'field', title: 'duplicate', route: 'dashboard.html' }
  ]);
  const actions = h.menu.children.filter(x => x.dataset.hsrLandsShared === 'service');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].dataset.workspace, 'field');
  h.showAuthorizedLandsServices([landsWorkspace]);
  assert.equal(h.menu.children.length, 1);
});

test('Lands service rendering requires a verified live identity/municipality and fails closed', () => {
  assert.match(lands, /identity\.kind === "workforce" && Array\.isArray\(identity\.workspaces\)/);
  assert.match(lands, /identity\.allowed === true/);
  assert.match(lands, /identity\.organizationId !== municipalityId/);
  assert.match(lands, /client\.auth\.currentUser\?\.uid !== uid/);
  assert.match(lands, /clearAuthorizedLandsServices\(\)/);
  assert.match(lands, /async function handleLogout\(\) \{\s*clearAuthorizedLandsServices\(\)/);
  assert.doesNotMatch(helper, /\.innerHTML\s*=|localStorage|sessionStorage|\.setDoc\(/);
});

test('Lands retains its approved header and profile layout unchanged', () => {
  assert.match(lands, /<header class="topbar command-header manager-parity-header"/);
  assert.match(lands, /class="lands-head-v2"/);
  assert.match(lands, /id="accountMenu" class="account-menu" role="menu"/);
  assert.match(lands, /id="managerModeMenuItem"/);
});

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

test('Embedded Lands primary script still parses without changing its approved shell', () => {
  const open = lands.indexOf('<script>\n// ---- module bindings');
  assert.ok(open >= 0, 'expected Lands original inline module-binding script');
  const startAt = open + '<script>'.length;
  const endAt = lands.indexOf('</script>', startAt);
  assert.ok(endAt > startAt, 'expected closing main-script tag');
  const inline = lands.slice(startAt, endAt);
  assert.doesNotThrow(() => new vm.Script(inline, { filename: 'lands/index.html primary script' }));
});

test('Staff profile is an expandable read-only section of the existing right-side Lands account menu', () => {
  const htmlStart = lands.indexOf('<div id="accountMenu" class="account-menu"');
  const htmlEnd = lands.indexOf('</header>', htmlStart);
  assert.ok(htmlStart >= 0 && htmlEnd > htmlStart);
  const menuMarkup = lands.slice(htmlStart, htmlEnd);
  assert.match(menuMarkup, /id="landsReadOnlyProfileToggle"/);
  assert.match(menuMarkup, /aria-controls="landsReadOnlyProfileDetails"/);
  assert.match(menuMarkup, /id="landsReadOnlyProfileDetails"[^>]*hidden/);
  for (const id of [
    'landsReadOnlyName', 'landsReadOnlyMunicipality',
    'landsReadOnlyDepartment', 'landsReadOnlyJobTitle', 'landsReadOnlyLandsRole'
  ]) assert.ok(menuMarkup.includes('id="' + id + '"'), id + ' missing');
  assert.match(menuMarkup, /للعرض فقط/);
  assert.match(menuMarkup, /مركز المستخدمين/);
  const detailsMarkup = menuMarkup.slice(
    menuMarkup.indexOf('id="landsReadOnlyProfileDetails"'),
    menuMarkup.indexOf('id="managerModeMenuItem"')
  );
  assert.doesNotMatch(detailsMarkup, /<input\b|<textarea\b|<select\b|<form\b|contenteditable|حفظ التعديلات|\/api\/admin/);
  assert.match(lands, /\.lands-readonly-profile\[hidden\]\{display:none!important\}/);
});

test('Read-only profile disclosure opens and closes without writing data', () => {
  const from = lands.indexOf('function toggleReadOnlyLandsProfile(event) {');
  const to = lands.indexOf('// وضع المدير', from);
  assert.ok(from >= 0 && to > from);
  const fns = lands.slice(from, to);
  assert.doesNotMatch(fns, /fetch\s*\(|\.setDoc\s*\(|\.updateDoc\s*\(|localStorage|sessionStorage|\.post\s*\(/);
  const attributes = {};
  const menu = { classList: { remove(name) { assert.equal(name, 'open'); } } };
  const btn = { setAttribute(k,v) { assert.equal(k, 'aria-expanded'); attributes.button=v; } };
  const panel = { hidden:true };
  const toggler = { setAttribute(k,v) { assert.equal(k, 'aria-expanded'); attributes.toggler=v; } };
  const nodes = {
    accountMenu:menu, accountButton:btn,
    landsReadOnlyProfileDetails:panel, landsReadOnlyProfileToggle:toggler
  };
  const sandbox = { document:{getElementById(id){return nodes[id]??null;}} };
  vm.runInNewContext(fns, sandbox, {filename:'Lands profile disclosure'});
  let stopped=false;
  sandbox.toggleReadOnlyLandsProfile({stopPropagation(){stopped=true;}});
  assert.equal(stopped,true);
  assert.equal(panel.hidden,false);
  assert.equal(attributes.toggler,'true');
  sandbox.closeAccountMenu();
  assert.equal(panel.hidden,true);
  assert.equal(attributes.toggler,'false');
  assert.equal(attributes.button,'false');
});

test('Lands profile labels are read from verified identity and never update identity grants', () => {
  const start = lands.indexOf('function renderShellChrome() {');
  const end = lands.indexOf('function clearAuthorizedLandsServices()', start);
  const shell=lands.slice(start,end);
  assert.match(shell, /landsReadOnlyName:\s*displayName/);
  assert.match(shell, /landsReadOnlyJobTitle:\s*displayRole/);
  assert.match(shell, /landsReadOnlyLandsRole:\s*roleLabel/);
  assert.match(shell, /if \(el\) el\.textContent = value/);
  const syncStart = lands.indexOf('async function syncLandsIdentity() {');
  const syncEnd = lands.indexOf('window.addEventListener("focus"', syncStart);
  const sync = lands.slice(syncStart,syncEnd);
  assert.match(sync, /identity\.kind === "workforce"/);
  assert.match(sync, /identity\.organizationId !== municipalityId/);
  assert.match(sync, /client\.auth\.currentUser\?\.uid !== uid/);
  assert.match(sync, /session\.identityDepartment = profile\.department\.trim\(\)/);
  assert.match(sync, /if \(!response\.ok\) \{ clearAuthorizedLandsServices\(\); return; \}/);
  assert.doesNotMatch(shell,/fetch\s*\(|\.setDoc\s*\(|\.updateDoc\s*\(/);
});

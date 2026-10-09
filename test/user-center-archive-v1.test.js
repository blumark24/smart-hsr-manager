'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'manager-identity-command-center.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api/admin/employees.js'), 'utf8');
const usersApi = fs.readFileSync(path.join(root, 'api/admin/users.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'manager-identity-command-center.css'), 'utf8');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function harness(employees) {
  const node = () => ({
    dataset: {}, isConnected: true, parentElement: null, children: [],
    classList: { add() {}, remove() {} },
    setAttribute() {}, removeAttribute() {}, append() {}, appendChild() {},
    addEventListener() {}, focus() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  const body = node();
  const document = {
    body, documentElement: { dataset: { smartHsrManagerView: 'users' } },
    addEventListener() {}, querySelector() { return null; },
  };
  const window = {
    addEventListener() {},
    SmartHSRWorkspaceAccess: { resolveWorkspaces: () => ({ workspaces: [] }) },
    SmartHSRInstitutionalUC: {
      esc, state: () => ({ en: false }), inst: e => e.institutionalRole || 'employee',
      stale() {}, why: reason => reason, shell() { throw Error('not used in read-only tests'); },
    },
  };
  const views = ['registry', 'hierarchy', 'archive'].map(v => Object.assign(node(), { dataset: { view: v } }));
  const surface = node();
  surface.querySelectorAll = selector => selector === '[data-view]' ? views : [];
  const host = node();
  host.parentElement = body; body.children = [host];
  const context = vm.createContext({window,document,MutationObserver:class { observe() {} },console,Date});
  vm.runInContext(frontend, context, { filename: 'manager-identity-command-center.js' });
  const records = {org:'municipality-1',users:[],employees};
  window.SmartHSRInstitutionalUC.commandCenter.render(host,surface,records,async()=>{});
  return {surface,views};
}

const active = {
  employeeId:'e-active',name:'موظف نشط',employeeRef:'EMP-1',
  administration:'ادارة الاراضي والممتلكات',department:'قسم الأراضي',
  institutionalRole:'employee',employmentStatus:'active',
  authUid:'uid1',accountStatus:'ACTIVE',products:{},
};
const archived = {
  employeeId:'e-archive',name:'موظف مؤرشف',employeeRef:'EMP-2',
  administration:'إدارة الأراضي والممتلكات',department:'قسم الأراضي',
  institutionalRole:'employee',employmentStatus:'inactive',
  authUid:'uid2',accountStatus:'SUSPENDED',archivedAt:'2026-10-09T10:30:00.000Z',
  archivedReason:'انتهاء التكليف',products:{},
};

test('archive and API JavaScript parse, with no runtime imports added', () => {
  assert.doesNotThrow(() => new vm.Script(frontend));
  assert.doesNotThrow(() => new vm.Script(api));
  assert.doesNotThrow(() => new vm.Script(usersApi));
});

test('archived employee is excluded from active registry and counts', () => {
  const h = harness([active,archived]);
  assert.match(h.surface.innerHTML, /مركز الأرشفة \(1\)/);
  assert.match(h.surface.innerHTML, /موظف نشط/);
  assert.doesNotMatch(h.surface.innerHTML, /موظف مؤرشف/);
  assert.match(h.surface.innerHTML, /إدارة الأراضي والممتلكات/);
  h.views[1].onclick();
  assert.match(h.surface.innerHTML, /الهيكل المؤسسي/);
  assert.doesNotMatch(h.surface.innerHTML, /موظف مؤرشف/);
});

test('archive has its own read-only roster and restore action, not active user cards', () => {
  const h = harness([active,archived]);
  h.views[2].onclick();
  assert.match(h.surface.innerHTML, /مركز الأرشفة/);
  assert.match(h.surface.innerHTML, /موظف مؤرشف/);
  assert.doesNotMatch(h.surface.innerHTML, /موظف نشط/);
  assert.match(h.surface.innerHTML, /data-restore="e-archive"/);
  assert.doesNotMatch(h.surface.innerHTML, /data-purge="e-archive"/);
  assert.match(h.surface.innerHTML, /انتهاء التكليف/);
});

test('unlinked unused archive entry offers gated permanent deletion', () => {
  const h = harness([{
    ...archived,employeeId:'e-unused',authUid:null,accountStatus:'NO_ACCOUNT',
  }]);
  h.views[2].onclick();
  assert.match(h.surface.innerHTML, /data-purge="e-unused"/);
  assert.match(frontend, /deleteArchivedEmployee/);
  assert.match(frontend, /data-delete-confirm/);
});

test('API denies archived login activation and never auto-enables on restore', () => {
  assert.match(api, /employee_archived_restore_required/);
  assert.match(api, /case 'archiveEmployee':/);
  assert.match(api, /case 'restoreEmployee':/);
  assert.match(api, /case 'deleteArchivedEmployee':/);
  const start=api.indexOf("case 'restoreEmployee':");
  const end=api.indexOf('// ---- RC1: safe employee removal.',start);
  const block=api.slice(start,end);
  assert.match(block,/if \(!caller\.isManager\)/);
  assert.match(block,/targetOrganizationId: employee\.data\.organizationId/);
  assert.match(block,/auth\.updateUser\(employee\.data\.authUid, \{ disabled: true \}\)/);
  assert.doesNotMatch(block,/disabled: false/);
  assert.match(block,/archived_account_retention_required/);
  assert.match(block,/municipal_history_retention_required/);
  assert.match(block,/employee_restore/);
  assert.match(block,/delete_confirmation_mismatch/);
});

test('archive styling respects both themes and mobile viewport', () => {
  assert.match(css, /\.icc-archive-area/);
  assert.match(css, /html\[data-theme="light"\] \.icc-archive-actions/);
  assert.match(css, /@media\(max-width:700px\)/);
});

test('every admin activation and HR edit path respects the archive lifecycle', () => {
  assert.match(api, /employee_lifecycle_action_required/);
  assert.match(api, /reassign_direct_reports_first/);
  assert.match(api, /municipal_manager_record_protected/);
  const activation=usersApi.slice(usersApi.indexOf("case 'setActive':"),usersApi.indexOf("case 'revokeSessions':"));
  assert.match(activation, /employee_archived_restore_required/);
  assert.match(activation, /\.where\('authUid', '==', uid\)/);
  const hr=usersApi.slice(usersApi.indexOf("if (action === 'administrativeUpdateEmployee')"),usersApi.indexOf("if (action === 'listMobilityMissions')"));
  assert.match(hr, /employee_lifecycle_action_required/);
  assert.match(hr, /status !== \(employee\.employmentStatus \|\| 'active'\)/);
});

test('preview-only deep link enters existing manager user center without exposing arbitrary routes', () => {
  assert.ok(manager.includes("location.hostname.endsWith('.vercel.app')"));
  assert.ok(manager.includes("get('view') === 'users'"));
  assert.ok(frontend.includes("const previewArchive = window.location?.hostname?.endsWith('.vercel.app')"));
  assert.ok(frontend.includes("get('tab') === 'archive'"));
});

test('archive roster mirrors the live users table and preserves real archive metadata', () => {
  const h = harness([active, archived]);
  h.views[2].onclick();
  const html = h.surface.innerHTML;
  assert.match(html, /class="icc-table icc-archive-table"/);
  assert.deepEqual(
    [...html.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(m => m[1]),
    ['الموظف', 'التعيين المؤسسي', 'الدور / المسمى', 'الأرشفة', 'الإجراءات']
  );
  assert.match(html, /class="icc-archive-person"/);
  assert.match(html, /class="icc-avatar-mini"/);
  assert.match(html, /class="icc-role-title"/);
  assert.match(html, /icc-archive-date/);
  assert.match(html, /icc-archive-reason/);
  assert.match(html, /انتهاء التكليف/);
  assert.match(html, /data-restore="e-archive"/);
  assert.match(html, /class="icc-registry-controls icc-archive-controls"/);
  assert.match(html, /data-archive-search/);
  assert.match(html, /<details class="icc-archive-policy">/);
  assert.doesNotMatch(html, /icc-archive-note/);
});

test('archive search is constrained to one compact toolbar row, including mobile', () => {
  assert.match(css, /\.icc-archive-area \.icc-archive-controls\{/);
  assert.match(css, /\.icc-archive-area \.icc-archive-controls \.icc-archive-search\{/);
  assert.match(css, /flex:0 1 320px!important/);
  assert.match(css, /height:42px!important/);
  assert.match(css, /min-height:42px!important/);
  assert.match(css, /max-height:42px!important/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /font-size:16px!important/);
  assert.match(css, /\.icc-archive-table th:nth-child\(5\)/);
  assert.match(css, /html\[data-theme="light"\] \.icc-archive-actions/);
});

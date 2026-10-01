// SMART HSR — Unified Identity & Workspace Access (shared, pure, no I/O).
//
//   One Identity → One Login → Roles + Entitlements → Authorized Workspaces
//
// This module is loaded by BOTH the browser (login / workspace chooser /
// switcher / page guards — display & navigation only) and the trusted API
// (api/_lib/authz.js, api/admin/users.js — authoritative). It never reads
// Firestore itself: callers pass the already-fetched users/{uid} data.
//
// Capabilities (service entitlements, NOT roles and NOT administrations):
//   mobility.access  — may open the Mobility workspace
//   vehicle.checkout — may receive a vehicle / start an assigned mission
//   vehicle.drive    — may be the assigned vehicle operator (incl. incidents)
//   vehicle.return   — may return an assigned vehicle
//
// Dual-read compatibility (no data migration): once `entitlements` exists on
// a record it alone decides that record's capabilities (fail-closed, same
// "present key is authoritative" rule as mobilityAccess). A record that has
// never been touched by `entitlements` derives its capabilities from the
// legacy `mobilityAccess` / legacy mobility `role` and `vehicleEligible`.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SmartHSRWorkspaceAccess = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const CAPABILITIES = Object.freeze(['mobility.access', 'vehicle.checkout', 'vehicle.drive', 'vehicle.return']);
  const VEHICLE_CAPABILITIES = Object.freeze(['vehicle.checkout', 'vehicle.drive', 'vehicle.return']);
  const FIELD_ROLES = Object.freeze(['supervisor', 'inspector', 'contractor']);
  const MOBILITY_ROLES = Object.freeze(['mobility_head', 'department_head', 'administrative_affairs', 'employee']);
  const LANDS_ROLES = Object.freeze(['lands_employee', 'lands_department_manager']);
  const CANONICAL_ROLES = Object.freeze(['general_supervisor', 'department_head', 'employee']);

  const RE_FIELD = /الحصر|ميداني|field/i;
  const RE_LANDS = /الأراضي|الممتلكات|lands/i;
  const RE_MOBILITY = /حركة السير|الحركة الذكية|mobility|traffic/i;
  const RE_ADMIN = /الشؤون الإدارية|الشؤون الادارية|administrative/i;

  const WORKSPACE_ORDER = Object.freeze(['field', 'lands', 'admin_affairs', 'mobility']);
  const WORKSPACE_META = Object.freeze({
    field: { title: 'الحصر الميداني الذكي', desc: 'البلاغات والمراقبة الميدانية وعمليات القسم.' },
    lands: { title: 'حصر منح الأراضي الذكي', desc: 'سجل المنح والملفات الرقمية والبيانات المكانية.' },
    admin_affairs: { title: 'الشؤون الإدارية', desc: 'اعتماد طلبات الحركة والتفويضات الإدارية.' },
    mobility: { title: 'الحركة الذكية', desc: 'المهام والمركبات والتفويض والاستلام والإعادة.' },
  });
  const MOBILITY_ROUTE = 'department-head.html?mode=mobility';

  function hasOwn(o, k) { return o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }
  function str(v) { return typeof v === 'string' ? v.trim() : ''; }

  // The legacy (pre-capability) Mobility role, exactly as api/_lib/authz.js
  // resolved it: a present mobilityAccess key is authoritative.
  function legacyMobilityRole(d) {
    if (hasOwn(d, 'mobilityAccess')) {
      const a = d.mobilityAccess;
      const enabled = Boolean(a) && typeof a === 'object' && a.enabled === true;
      return enabled && MOBILITY_ROLES.includes(a.role) ? a.role : null;
    }
    const legacy = d && d.role;
    return MOBILITY_ROLES.includes(legacy) ? legacy : null;
  }

  function normalizeCapabilities(list) {
    const seen = new Set(Array.isArray(list) ? list.filter(x => typeof x === 'string') : []);
    return CAPABILITIES.filter(c => seen.has(c));
  }

  function resolveCapabilities(d) {
    if (hasOwn(d, 'entitlements')) {
      const ent = d.entitlements;
      const list = ent && typeof ent === 'object' && Array.isArray(ent.capabilities) ? normalizeCapabilities(ent.capabilities) : [];
      // vehicle.* is meaningless without mobility.access — fail closed.
      return Object.freeze(list.includes('mobility.access') ? list : []);
    }
    if (!legacyMobilityRole(d)) return Object.freeze([]);
    return Object.freeze(['mobility.access'].concat(d && d.vehicleEligible === true ? VEHICLE_CAPABILITIES : []));
  }

  function hasCapability(d, capability) { return resolveCapabilities(d).includes(capability); }

  // The effective operational Mobility role. The four legacy operational
  // roles (approval / allocation / request chains) are untouched; a user who
  // holds mobility.access without any legacy operational role is an
  // execution-only 'employee' (own missions only — least privilege).
  function resolveMobilityRole(d) {
    if (!hasCapability(d, 'mobility.access')) return null;
    return legacyMobilityRole(d) || 'employee';
  }

  function validateCapabilitySelection(list) {
    if (!Array.isArray(list) || list.some(x => typeof x !== 'string')) return { ok: false, reason: 'invalid_capabilities' };
    if (list.some(x => !CAPABILITIES.includes(x))) return { ok: false, reason: 'unknown_capability' };
    const caps = normalizeCapabilities(list);
    if (caps.some(c => VEHICLE_CAPABILITIES.includes(c)) && !caps.includes('mobility.access')) {
      return { ok: false, reason: 'mobility_access_required' };
    }
    return { ok: true, capabilities: caps };
  }

  function accountState(d) {
    if (!d || typeof d !== 'object') return { valid: false, reason: 'no_record' };
    if (d.active === false) return { valid: false, reason: 'inactive' };
    if (!str(d.organizationId)) return { valid: false, reason: 'no_organization' };
    return { valid: true, reason: null };
  }

  function fieldRouteFor(d, flags) {
    if (flags.hasFieldDepartmentHeadRole) return 'department-head.html';
    if (d.role === 'contractor') return 'mobile-map.html';
    if (d.role === 'supervisor') return 'manager.html';
    return 'dashboard.html';
  }

  function resolveWorkspaces(d) {
    const state = accountState(d);
    const empty = { valid: state.valid, reason: state.reason, kind: 'workforce', primary: null, workspaces: [], capabilities: [], mobilityRole: null };
    if (!state.valid) return empty;

    const administration = str(d.administration);
    const department = str(d.department);
    const institutionalRole = str(d.institutionalRole);
    const capabilities = resolveCapabilities(d);
    const mobilityRole = resolveMobilityRole(d);

    const la = d.landsAccess;
    const hasLands = Boolean(la && la.enabled === true && LANDS_ROLES.includes(la.role));
    const hasFieldRole = FIELD_ROLES.includes(d.role);
    const hasDepartmentHeadRole = institutionalRole === 'department_head' || mobilityRole === 'department_head';
    const hasFieldDepartmentHeadRole = hasDepartmentHeadRole
      && /الحصر|ميداني|field/i.test(administration || department);

    const canonical = CANONICAL_ROLES.includes(institutionalRole);
    const canonicalFieldPath = canonical && RE_FIELD.test(administration);
    const canonicalLandsPath = canonical && RE_LANDS.test(administration);
    const canonicalMobilityPath = canonical && RE_MOBILITY.test(administration);
    const canonicalAdministrativePath = canonical && RE_ADMIN.test(administration);

    const authorized = {
      field: hasFieldRole || hasFieldDepartmentHeadRole,
      lands: hasLands,
      admin_affairs: canonicalAdministrativePath && ['department_head','employee'].includes(institutionalRole),
      mobility: Boolean(mobilityRole),
    };

    // Primary workspace: the institutional (HR-owned) path wins when it is
    // actually authorized; otherwise the first authorized workspace in the
    // fixed order — Mobility is last, so it becomes the effective primary
    // only when nothing else is authorized (e.g. no department/administration).
    let primary = null;
    if (canonicalFieldPath && authorized.field) primary = 'field';
    else if (canonicalLandsPath && authorized.lands) primary = 'lands';
    else if (canonicalMobilityPath && authorized.mobility) primary = 'mobility';
    else if (canonicalAdministrativePath && authorized.admin_affairs) primary = 'admin_affairs';
    else primary = WORKSPACE_ORDER.find(id => authorized[id]) || null;

    const ids = WORKSPACE_ORDER.filter(id => authorized[id]);
    if (primary) ids.sort((a, b) => (a === primary ? -1 : b === primary ? 1 : 0));

    const flags = { hasFieldDepartmentHeadRole };
    const workspaces = ids.map(id => ({
      id,
      title: WORKSPACE_META[id].title,
      desc: WORKSPACE_META[id].desc,
      primary: id === primary,
      handoff: id === 'lands',
      route: id === 'lands' ? null
        : id === 'field' ? fieldRouteFor(d, flags)
        : id === 'mobility' ? MOBILITY_ROUTE
        : 'admin-affairs.html',
    }));

    return Object.assign(empty, { primary, workspaces, capabilities: Array.from(capabilities), mobilityRole });
  }

  function isWorkspaceAllowed(resolution, id) {
    return Boolean(resolution && resolution.valid && resolution.workspaces.some(w => w.id === id));
  }

  // Which workspace a given page belongs to (display/guard use only).
  function workspaceForPage(pathname, search) {
    const file = String(pathname || '').split('/').pop();
    const mode = new URLSearchParams(search || '').get('mode');
    if (file === 'department-head.html') return mode === 'mobility' ? 'mobility' : 'field';
    if (file === 'admin-affairs.html') return 'admin_affairs';
    if (['dashboard.html', 'mobile-map.html', 'manager.html'].includes(file)) return 'field';
    return null;
  }

  return Object.freeze({
    CAPABILITIES, VEHICLE_CAPABILITIES, FIELD_ROLES, MOBILITY_ROLES, LANDS_ROLES, MOBILITY_ROUTE,
    legacyMobilityRole, resolveCapabilities, hasCapability, resolveMobilityRole,
    validateCapabilitySelection, normalizeCapabilities, accountState,
    resolveWorkspaces, isWorkspaceAllowed, workspaceForPage,
  });
});

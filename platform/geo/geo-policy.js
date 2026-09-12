'use strict';
// ============================================================================
// SMART HSR GEO CORE — geo authorization policy.
//
// This module introduces NO new role system. It is a thin, explicit mapping
// from the EXISTING institutional roles (platform/contracts/role-contract.js)
// and the EXISTING tenant-boundary contract
// (platform/policies/organization-scope-policy.js) onto the two Phase 08
// concepts that don't have a direct existing analogue:
//
//   1. Twin admission — may this actor open the executive/strategic
//      SMART HSR Twin at all (as opposed to only the Operational Map)?
//   2. Municipality/layer scope — which organizationId's data, and which
//      registered layers, may this actor's map session show?
//
// Per the Phase 08 brief's "TWIN AUTHORIZATION" section: current role names
// map as follows. `employeeAssignments`' SECTION_HEAD concept
// (platform/contracts/employee-assignment-contract.js) is explicitly NOT
// yet a live authorization source anywhere in this codebase (its own header
// says so) — so this module does not introduce it as one either. A
// supervisor is scoped exactly as organization-scope-policy.js already
// scopes them today (organization-wide), not to a not-yet-wired section.
// Everything here fails closed: an unrecognized role or missing
// organizationId is always denied, never defaulted to "allow".
//
//   Mayor / municipal highest authority  -> ROLES.MANAGER
//   General Supervisor (Twin, when today's authority already allows it)
//                                         -> ROLES.SUPERVISOR
//   Section Head                         -> ROLES.SUPERVISOR (operational
//                                            scope only, pending the
//                                            employeeAssignments cutover)
//   Employee                             -> ROLES.INSPECTOR
//   Contractor                           -> ROLES.CONTRACTOR
//   Platform owner                       -> ROLES.OWNER
// ============================================================================

const { createDecision } = require('../contracts/decision');
const { ROLES } = require('../contracts/role-contract');
const { evaluateOrganizationScope, PLATFORM_OWNER_ROLE } = require('../policies/organization-scope-policy');
const { isLayerVisibleToRole } = require('./geo-layer-registry');

// Only these roles may ever open the Twin. Inspector/Contractor are
// Operational-Map-only by design (see brief: "Employee: primarily
// Operational Map ... Contractor: Operational Map only").
const TWIN_ADMITTED_ROLES = Object.freeze([ROLES.OWNER, ROLES.MANAGER, ROLES.SUPERVISOR]);

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function evaluateTwinAdmission({ actor } = {}) {
  if (!actor || typeof actor !== 'object' || !actor.role) {
    return createDecision(false, 'GEO_TWIN_ACTOR_REQUIRED', 'An authenticated actor with a resolved role is required.');
  }
  if (!TWIN_ADMITTED_ROLES.includes(actor.role)) {
    return createDecision(false, 'GEO_TWIN_ROLE_DENIED', 'This role may only use the Operational Map, not the Twin.', { role: actor.role });
  }
  if (actor.role !== PLATFORM_OWNER_ROLE && !normalizeId(actor.organizationId)) {
    return createDecision(false, 'GEO_TWIN_ORGANIZATION_REQUIRED', 'A non-owner actor must have a resolved organizationId to open the Twin.');
  }
  return createDecision(true, 'GEO_TWIN_ADMITTED', 'The actor role may open the Twin.', { role: actor.role });
}

// Combines the existing tenant-boundary check with the layer registry's
// role-minimum check. `resource` is `{ organizationId, layerId }` — a map
// session is denied a layer/municipality pairing unless BOTH pass.
function evaluateGeoResourceAccess({ actor, resource } = {}) {
  const scopeDecision = evaluateOrganizationScope({ actor, resource });
  if (!scopeDecision.allowed) return scopeDecision;

  if (resource && resource.layerId) {
    const layerDecision = isLayerVisibleToRole(resource.layerId, actor.role);
    if (!layerDecision.allowed) return layerDecision;
  }

  return createDecision(true, 'GEO_RESOURCE_ACCESS_ALLOWED', 'The actor may access this organization/layer pairing.');
}

// Open/global reference data (commercial_places, buildings) is never
// tenant-scoped — see the brief's TENANT ISOLATION section: "Open/global
// basemap data may be globally visible." Still requires an authenticated,
// recognized role (never anonymous), and still goes through the layer
// registry's role-minimum check.
function evaluateReferenceLayerAccess({ actor, layerId } = {}) {
  if (!actor || typeof actor !== 'object' || !actor.role) {
    return createDecision(false, 'GEO_REFERENCE_ACTOR_REQUIRED', 'An authenticated actor with a resolved role is required.');
  }
  return isLayerVisibleToRole(layerId, actor.role);
}

module.exports = Object.freeze({
  TWIN_ADMITTED_ROLES,
  evaluateTwinAdmission,
  evaluateGeoResourceAccess,
  evaluateReferenceLayerAccess,
});

'use strict';

const PLATFORM_OWNER_ROLE = 'owner';

function decision(allowed, code, reason) {
  return Object.freeze({ allowed, reason, code });
}

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Pure tenant-boundary contract. The existing owner role is the only role
 * allowed to select organizations across the platform. Operational policies
 * may still deny an owner a specific action after this scope check succeeds.
 */
function evaluateOrganizationScope({ actor, resource } = {}) {
  if (!actor || typeof actor !== 'object') {
    return decision(false, 'AUTHENTICATED_CONTEXT_REQUIRED', 'An authenticated actor context is required.');
  }

  if (actor.role === PLATFORM_OWNER_ROLE) {
    return decision(true, 'PLATFORM_OWNER_SCOPE', 'The existing platform owner role may select an organization explicitly.');
  }

  const authenticatedOrganizationId = normalizeId(actor.organizationId);
  if (!authenticatedOrganizationId) {
    return decision(false, 'AUTHENTICATED_ORGANIZATION_REQUIRED', 'The authenticated context has no organizationId.');
  }

  const resourceOrganizationId = normalizeId(resource && resource.organizationId);
  if (!resourceOrganizationId) {
    return decision(false, 'RESOURCE_ORGANIZATION_REQUIRED', 'The resource has no organizationId.');
  }

  if (authenticatedOrganizationId !== resourceOrganizationId) {
    return decision(false, 'CROSS_ORGANIZATION_DENIED', 'The authenticated and resource organizations do not match.');
  }

  return decision(true, 'ORGANIZATION_MATCH', 'The authenticated and resource organizations match.');
}

module.exports = Object.freeze({
  PLATFORM_OWNER_ROLE,
  evaluateOrganizationScope,
});

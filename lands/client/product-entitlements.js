export const SMART_HSR_PRODUCTS = Object.freeze(['field', 'lands']);
export const LANDS_ENTITLEMENT_ROLES = Object.freeze(['municipal_manager', 'lands_department_manager', 'lands_employee']);

/** Shared-account projection only: this never reads/writes the Field product. */
export function createProductEntitlements({ organizationId, firebaseUid, field = null, lands = null }) {
  if (typeof organizationId !== 'string' || !organizationId || typeof firebaseUid !== 'string' || !firebaseUid) throw new Error('IDENTITY_REQUIRED');
  if (lands && (!LANDS_ENTITLEMENT_ROLES.includes(lands.role) || typeof lands.enabled !== 'boolean')) throw new Error('INVALID_LANDS_ENTITLEMENT');
  return Object.freeze({ organizationId, firebaseUid, products: { field: field ? { enabled: Boolean(field.enabled), role: field.role ?? null } : null, lands: lands ? { enabled: lands.enabled, role: lands.role } : null } });
}

export const canAdministerLands = (role) => role === 'municipal_manager';

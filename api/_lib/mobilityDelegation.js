'use strict';

const WorkspaceAccess = require('../../workspace-access.js');

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'object' && Number.isFinite(value.seconds)) {
    return value.seconds * 1000 + Math.floor((Number(value.nanoseconds) || 0) / 1e6);
  }
  return null;
}

function normalizeCapabilities(list) {
  return WorkspaceAccess.normalizeCapabilities(Array.isArray(list) ? list : []);
}

function safeDelegation(raw, nowMs = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const startsAtMs = toMillis(raw.startsAt);
  const expiresAtMs = toMillis(raw.expiresAt);
  const storedStatus = str(raw.status) || 'UNKNOWN';
  const temporalStatus = storedStatus === 'ACTIVE' && expiresAtMs && expiresAtMs <= nowMs
    ? 'EXPIRED'
    : storedStatus;
  return {
    id: str(raw.id || raw.grantId),
    status: temporalStatus,
    capabilities: normalizeCapabilities(raw.capabilities),
    reason: str(raw.reason),
    startsAt: startsAtMs ? new Date(startsAtMs).toISOString() : null,
    expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
    missionId: str(raw.missionId) || null,
    vehicleId: str(raw.vehicleId) || null,
    grantedByUid: str(raw.grantedByUid) || null,
    grantedByRole: str(raw.grantedByRole) || null,
    revokedByUid: str(raw.revokedByUid) || null,
  };
}

function activeDelegation(data, nowMs = Date.now()) {
  const raw = data && data.mobilityDelegation;
  if (!raw || typeof raw !== 'object' || str(raw.status) !== 'ACTIVE') return null;
  const startsAtMs = toMillis(raw.startsAt);
  const expiresAtMs = toMillis(raw.expiresAt);
  if (!expiresAtMs || expiresAtMs <= nowMs) return null;
  if (startsAtMs && startsAtMs > nowMs) return null;
  const caps = normalizeCapabilities(raw.capabilities);
  if (!caps.includes('mobility.access')) return null;
  return {
    id: str(raw.id || raw.grantId),
    status: 'ACTIVE',
    capabilities: caps,
    reason: str(raw.reason),
    startsAt: startsAtMs ? new Date(startsAtMs).toISOString() : new Date(nowMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    missionId: str(raw.missionId) || null,
    vehicleId: str(raw.vehicleId) || null,
    grantedByUid: str(raw.grantedByUid) || null,
    grantedByRole: str(raw.grantedByRole) || null,
  };
}

function resolveEffectiveCapabilities(data, nowMs = Date.now()) {
  const baseCapabilities = Array.from(WorkspaceAccess.resolveCapabilities(data || {}));
  const delegation = activeDelegation(data, nowMs);
  const delegatedCapabilities = delegation ? delegation.capabilities : [];
  const merged = WorkspaceAccess.CAPABILITIES.filter(
    capability => baseCapabilities.includes(capability) || delegatedCapabilities.includes(capability)
  );
  const effectiveData = Object.assign({}, data || {}, {
    entitlements: Object.assign({}, (data && typeof data.entitlements === 'object' && data.entitlements) || {}, {
      capabilities: merged,
    }),
  });
  return {
    data: effectiveData,
    baseCapabilities,
    delegatedCapabilities,
    capabilities: merged,
    delegation,
  };
}

function authorizeCapability(data, capability, scope = {}, nowMs = Date.now()) {
  const effective = resolveEffectiveCapabilities(data, nowMs);
  if (effective.baseCapabilities.includes(capability)) {
    return { allowed: true, source: 'base', delegation: null, effective };
  }
  const delegation = effective.delegation;
  if (!delegation || !delegation.capabilities.includes(capability)) {
    return { allowed: false, reason: 'capability_required', source: null, delegation: null, effective };
  }
  const missionId = str(scope.missionId);
  const vehicleId = str(scope.vehicleId);
  if (delegation.missionId && delegation.missionId !== missionId) {
    return { allowed: false, reason: 'delegation_mission_scope_mismatch', source: 'delegation', delegation, effective };
  }
  if (delegation.vehicleId && delegation.vehicleId !== vehicleId) {
    return { allowed: false, reason: 'delegation_vehicle_scope_mismatch', source: 'delegation', delegation, effective };
  }
  return { allowed: true, source: 'delegation', delegation, effective };
}

function validateDelegationCapabilities(list) {
  const checked = WorkspaceAccess.validateCapabilitySelection(list);
  if (!checked.ok) return checked;
  if (!checked.capabilities.includes('mobility.access')) {
    return { ok: false, reason: 'mobility_access_required' };
  }
  return { ok: true, capabilities: checked.capabilities };
}

function validateDelegationWindow(startsAt, expiresAt, nowMs = Date.now()) {
  const startMs = startsAt ? toMillis(startsAt) : nowMs;
  const endMs = toMillis(expiresAt);
  if (!endMs) return { ok: false, reason: 'expires_at_required' };
  if (!startMs) return { ok: false, reason: 'invalid_starts_at' };
  if (endMs <= nowMs || endMs <= startMs) return { ok: false, reason: 'invalid_expiry_window' };
  return { ok: true, startsAtMs: startMs, expiresAtMs: endMs };
}

module.exports = {
  toMillis,
  safeDelegation,
  activeDelegation,
  resolveEffectiveCapabilities,
  authorizeCapability,
  validateDelegationCapabilities,
  validateDelegationWindow,
};

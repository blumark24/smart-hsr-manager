'use strict';
// ============================================================================
// Shared production Inspector authorization/access contract, reused by every
// endpoint that operates on an Inspector-owned observation:
// api/ai/analyze.js, api/report/root-cause.js, api/report/work-order.js,
// api/ai/bind-analysis.js. Previously duplicated verbatim per file; this is
// the single source of truth so the contract can never silently drift
// between endpoints.
// ============================================================================
const { activeIsNotFalse } = require('./authz');

// Reads the caller's OWN users/{uid} document only -- never a client-supplied
// value. Role must be 'inspector', active !== false, non-empty organizationId.
async function resolveInspectorContext(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const organizationId = typeof data.organizationId === 'string' ? data.organizationId.trim() : '';
  if (data.role !== 'inspector' || !activeIsNotFalse(data) || !organizationId) return null;
  return { uid, role: 'inspector', organizationId };
}

// The target observation must match the caller's organizationId AND
// createdByUid. Cross-org and non-owner requests are denied identically
// across every endpoint that calls this.
function evaluateObservationAccess(observation, caller) {
  if ((observation && observation.organizationId) !== (caller && caller.organizationId)) {
    return { allowed: false, code: 'AI_CROSS_ORGANIZATION_DENIED', reason: 'cross_organization_denied' };
  }
  if ((observation && observation.createdByUid) !== (caller && caller.uid)) {
    return { allowed: false, code: 'AI_REPORT_OWNER_DENIED', reason: 'not_report_owner' };
  }
  return { allowed: true, code: 'AI_REPORT_ACCESS_ALLOWED', reason: 'report_owner' };
}

module.exports = { resolveInspectorContext, evaluateObservationAccess };

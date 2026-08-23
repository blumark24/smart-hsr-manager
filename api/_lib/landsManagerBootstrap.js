'use strict';
// ============================================================================
// Shared institution-manager Lands bootstrap logic. Used two ways:
//  1. api/admin/lands-bootstrap.js — the existing manual one-time endpoint.
//  2. api/admin/users.js — automatically, right before the FIRST trusted
//     Lands entitlement mutation a manager ever triggers, so a manager never
//     needs to know this step exists.
//
// WHY: Lands' own trusted mutation endpoint forbids a caller from
// creating/altering their own entitlement record (anti-self-escalation —
// server/lands-authorization.js in the Lands repo), so the first
// municipal_manager for any municipality can never come from the normal
// trusted-mutation path. This is that one narrow, explicitly-audited escape
// hatch — and nothing else.
//
// SECURITY (unchanged from the original manual endpoint):
//  - caller must already be an ACTIVE organization manager (getCallerContext
//    only ever returns isManager:true for managers/{uid} with role==='manager'
//    and active !== false — an inactive/disabled manager never reaches here)
//  - idempotent and fail-closed: a second call performs NO mutation
//  - writes ONLY landsMunicipalities/{caller.organizationId}/userAccess/{caller.uid}
//    (the caller's own uid) and one matching auditLogs entry, atomically — no
//    Firestore path, uid, role, or municipality is ever accepted from a
//    request body; this module takes no request/body parameter at all
//  - the audit event is recorded as an explicit bootstrap/security-
//    administration action, never disguised as an ordinary entitlement event
// ============================================================================
const { FieldValue } = require('./firebaseAdmin');

const LANDS_NAMESPACE = 'landsMunicipalities';
// Fixed, valid-shaped request_id for this one deterministic bootstrap event
// per (municipality, manager) pair — never generated per-call, so a retried
// bootstrap can never create a second audit document.
const BOOTSTRAP_REQUEST_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Pure decision function — no I/O, fully unit-testable. Takes ONLY the
 * server-verified caller context (never anything from a request body) and
 * whether a membership document already exists, and decides what (if
 * anything) should be written. Since it accepts no uid/municipality/role
 * parameter of any kind, there is structurally no way for a call to target
 * any identity or municipality other than the caller's own.
 */
function computeBootstrapDecision(caller, accessAlreadyExists) {
  if (!caller || !caller.isManager) return { allowed: false, reason: 'manager_required' };
  if (accessAlreadyExists) return { allowed: true, alreadyBootstrapped: true, write: null };

  const municipalityId = caller.organizationId;
  const uid = caller.uid;
  return {
    allowed: true,
    alreadyBootstrapped: false,
    write: {
      municipalityId,
      uid,
      auditDocId: `lands_bootstrap_${municipalityId}_${uid}`,
      accessDoc: {
        firebase_uid: uid,
        municipality_id: municipalityId,
        lands_role: 'municipal_manager',
        enabled: true,
        bootstrapped: true,
        bootstrapped_by: uid,
      },
      // Deliberately NOT one of Lands' normal TRUSTED_AUDIT_ACTIONS/
      // TRUSTED_AUDIT_REASON_CODES values — this must read unambiguously as
      // an exceptional, one-time security-administration event, never
      // confusable with an ordinary employee entitlement grant.
      auditDoc: {
        schema_version: '1',
        actor_uid: uid,
        actor_role: 'municipal_manager',
        municipality_id: municipalityId,
        product: 'smart_hsr_lands',
        action: 'lands.manager_bootstrapped',
        domain: 'userAccess',
        record_id: uid,
        result: 'success',
        request_id: BOOTSTRAP_REQUEST_ID,
        safe_metadata: { reason_code: 'initial_municipality_lands_authority', source: 'web' },
      },
    },
  };
}

/**
 * Runs the actual (idempotent) Firestore transaction: reads the caller's own
 * membership doc, and only if absent, writes it plus one audit event.
 * Returns { decision } where decision is exactly computeBootstrapDecision's
 * output — allowed/alreadyBootstrapped/reason.
 */
async function runBootstrapTransaction(db, caller) {
  return db.runTransaction(async (tx) => {
    if (!caller || !caller.isManager) return { decision: computeBootstrapDecision(caller, false) };

    const probeRef = db.doc(`${LANDS_NAMESPACE}/${caller.organizationId}/userAccess/${caller.uid}`);
    const accessSnap = await tx.get(probeRef);
    const decision = computeBootstrapDecision(caller, accessSnap.exists);
    if (!decision.write) return { decision };

    const { write } = decision;
    const accessRef = db.doc(`${LANDS_NAMESPACE}/${write.municipalityId}/userAccess/${write.uid}`);
    const auditRef = db.doc(`${LANDS_NAMESPACE}/${write.municipalityId}/auditLogs/${write.auditDocId}`);
    const auditSnap = await tx.get(auditRef);

    tx.set(accessRef, { ...write.accessDoc, bootstrapped_at: FieldValue.serverTimestamp() });
    if (!auditSnap.exists) {
      tx.set(auditRef, { event_id: write.auditDocId, occurred_at: new Date().toISOString(), ...write.auditDoc });
    }
    return { decision };
  });
}

/**
 * Ensures the calling institution manager has their own Lands
 * municipal_manager membership BEFORE any Lands entitlement mutation is
 * attempted on someone else's behalf. No-op (does not touch Firestore at
 * all) for a non-manager caller or one with no organizationId — those
 * callers were never eligible to bootstrap in the first place, and the
 * normal trusted-mutation call right after this will fail/deny on its own
 * merits exactly as before. Never throws: a transaction failure here
 * surfaces as ok:false, which the caller treats as "could not sync yet" —
 * the same outcome an unbootstrapped manager already produced before this
 * automation existed, never a crash of the surrounding admin request.
 */
async function ensureManagerLandsBootstrap(db, caller) {
  if (!caller || !caller.isManager || typeof caller.organizationId !== 'string' || !caller.organizationId) {
    return { attempted: false };
  }
  try {
    const { decision } = await runBootstrapTransaction(db, caller);
    return { attempted: true, ok: decision.allowed === true, alreadyBootstrapped: Boolean(decision.alreadyBootstrapped) };
  } catch (_) {
    return { attempted: true, ok: false, reason: 'bootstrap_failed' };
  }
}

module.exports = { ensureManagerLandsBootstrap, runBootstrapTransaction, computeBootstrapDecision };

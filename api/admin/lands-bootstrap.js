'use strict';
// ============================================================================
// POST /api/admin/lands-bootstrap — ONE-TIME municipality setup operation.
// Grants the internal Smart HSR Lands institution-manager authority
// (lands_role: 'municipal_manager') to the CALLING organization manager's
// OWN account, for their OWN organizationId used as the Lands
// municipality_id. There is no target parameter in the request at all — it
// can never act on anyone or anything but the caller's own uid/organizationId.
// lands_municipal_manager is NEVER exposed as something selectable for any
// other user — see api/admin/users.js validateLandsSelection, which only
// ever allows lands_employee / lands_department_manager.
//
// WHY THIS ENDPOINT EXISTS: Lands' own trusted mutation endpoint deliberately
// forbids a caller from creating/altering their own entitlement record
// (server/lands-authorization.js: "a manager may never grant/alter/revoke
// their own entitlement here" — an explicit anti-self-escalation rule this
// endpoint must never weaken or route around). That rule makes the first
// municipal_manager for any municipality structurally impossible to create
// through the normal trusted-mutation path — a genuine bootstrap problem.
// This is the one narrow, explicitly-audited escape hatch for exactly that
// one case, and nothing else. After this succeeds once, EVERY subsequent
// Lands entitlement change for any employee goes through the regular
// trusted-mutation bridge (api/_lib/landsBridge.js), never through here.
//
// Guarantees:
//  - caller must already be an ACTIVE organization manager (managers/{uid},
//    role==='manager', active!==false, non-empty organizationId)
//  - idempotent and fail-closed: a second call performs NO mutation and
//    returns already_bootstrapped:true
//  - writes ONLY landsMunicipalities/{municipality_id}/userAccess/{uid} (the
//    caller's own uid) and one matching auditLogs entry, atomically — no
//    Firestore path, collection, uid, role, or municipality is ever accepted
//    from the request body
//  - the audit event is recorded as an explicit bootstrap/security-
//    administration action (lands.manager_bootstrapped), never disguised as
//    an ordinary employee entitlement event
//  - never invoked automatically by any other action; the dashboard only
//    ever calls this from a dedicated, explicitly-confirmed one-time setup
//    control, never a persistent/repeatable action once bootstrapped
// ============================================================================
const { getDb, FieldValue } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, getCallerContext } = require('../_lib/authz');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

const LANDS_NAMESPACE = 'landsMunicipalities';
// Fixed, valid-shaped request_id for this one deterministic bootstrap event
// per (municipality, manager) pair — never generated per-call, so a retried
// bootstrap can never create a second audit document.
const BOOTSTRAP_REQUEST_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Pure decision function — no I/O, fully unit-testable. Takes ONLY the
 * server-verified caller context (never anything from the request body) and
 * whether a membership document already exists, and decides what (if
 * anything) should be written. This is the single place that determines the
 * bootstrap target — since it accepts no uid/municipality/role parameter of
 * any kind, there is structurally no way for a request to target any
 * identity or municipality other than the caller's own.
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

async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  let decoded;
  try {
    decoded = await verifyRequestToken(req);
  } catch (e) {
    return sendJson(res, e.statusCode || 401, { error: 'unauthenticated' });
  }

  // No request body is ever read for identity/target purposes — the ONLY
  // inputs to this whole operation are the verified caller's own uid and
  // their own organizationId, resolved server-side from Firestore.
  const caller = await getCallerContext(decoded.uid);
  const db = getDb();

  try {
    const outcome = await db.runTransaction(async (tx) => {
      // A manager-only check against a not-yet-computed access path would
      // still need a read; do the cheapest possible check (whether ANY
      // write is even permitted) before touching Firestore for a denied
      // caller, then re-derive the real decision with the actual read.
      if (!caller.isManager) return { decision: computeBootstrapDecision(caller, false) };

      const probeRef = db.doc(`${LANDS_NAMESPACE}/${caller.organizationId}/userAccess/${caller.uid}`);
      const accessSnap = await tx.get(probeRef);
      const decision = computeBootstrapDecision(caller, accessSnap.exists);
      if (!decision.write) return { decision };

      const { write } = decision;
      const accessRef = db.doc(`${LANDS_NAMESPACE}/${write.municipalityId}/userAccess/${write.uid}`);
      const auditRef = db.doc(`${LANDS_NAMESPACE}/${write.municipalityId}/auditLogs/${write.auditDocId}`);
      const auditSnap = await tx.get(auditRef);

      // Field shape matches exactly what Lands' own entitlement.enable
      // mutation writes (server/lands-mutation-executor.js) — the four
      // canonical fields Lands' Firestore Rules and session() checks read
      // (firebase_uid, municipality_id, lands_role, enabled) — plus harmless
      // bootstrap-provenance fields Lands never reads but a human reviewer
      // can use to tell this record apart from a normally-granted one.
      tx.set(accessRef, { ...write.accessDoc, bootstrapped_at: FieldValue.serverTimestamp() });
      if (!auditSnap.exists) {
        tx.set(auditRef, { event_id: write.auditDocId, occurred_at: new Date().toISOString(), ...write.auditDoc });
      }
      return { decision };
    });

    if (!outcome.decision.allowed) {
      return sendJson(res, 403, { error: 'forbidden', reason: outcome.decision.reason });
    }
    return sendJson(res, 200, {
      municipalityId: caller.organizationId,
      landsRole: 'municipal_manager',
      alreadyBootstrapped: outcome.decision.alreadyBootstrapped,
    });
  } catch (_) {
    return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
  }
}

module.exports = handler;
module.exports._test = { computeBootstrapDecision };

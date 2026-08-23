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
const { getDb } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, getCallerContext } = require('../_lib/authz');
const { runBootstrapTransaction, computeBootstrapDecision } = require('../_lib/landsManagerBootstrap');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
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
  // their own organizationId, resolved server-side from Firestore. Shares
  // its actual decision/write logic with the automatic bootstrap performed
  // inline by api/admin/users.js (see api/_lib/landsManagerBootstrap.js) —
  // this endpoint is now just the manual, explicit way to trigger the exact
  // same idempotent operation.
  const caller = await getCallerContext(decoded.uid);
  const db = getDb();

  try {
    const outcome = await runBootstrapTransaction(db, caller);
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

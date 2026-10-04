import { randomBytes, createHash } from 'node:crypto';

// One-time, short-lived server-side SSO handoff so a Lands-only employee who
// already authenticated once at the Smart HSR Manager's unified employee
// gateway (/login.html) never sees a second Lands login screen, a
// municipality-ID field, or a service selector.
//
// This is a narrow, purpose-built bridge — deliberately NOT folded into the
// existing Trusted Audit action allowlist (trusted-audit.js). That system's
// verifyRequest/authorizeAction model assumes an ALREADY-Lands-authenticated
// caller acting on Lands business data (grants, documents, entitlements).
// The handoff exists specifically to establish that Lands session in the
// first place — there is no Lands session yet at the moment a handoff is
// registered OR consumed, so it cannot flow through a pipeline built around
// one without weakening it. The ssoHandoffs collection below is this
// feature's own complete, purpose-built record of who issued/consumed what
// and when — a real audit trail, just a separate one, for a separate trust
// phase (pre-authentication, not post-authentication business actions).
//
// Only a SHA-256 hash of the handoff code is ever stored in Firestore —
// never the raw code — the same principle as password hashing: even a
// compromised read of this collection cannot recover a usable code.

const HANDOFF_TTL_MS = 60 * 1000; // one minute: long enough for a redirect + page load, short enough to bound replay risk
export const SSO_ALLOWED_LANDS_ROLES = Object.freeze(['lands_employee', 'lands_department_manager']);

export function generateHandoffCode() {
  return randomBytes(32).toString('base64url');
}

export function hashHandoffCode(code) {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

function ssoError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

/**
 * Called by the Manager backend, forwarding the EMPLOYEE'S OWN already-
 * verified Firebase ID token (never a service credential, never a manager's
 * own token) — the same server-to-server forwarding pattern
 * api/_lib/landsBridge.js already uses for entitlement mutations.
 * `verifyRequest` (server/firebase-runtime.js) performs all identity,
 * entitlement, and municipality verification against the REAL membership
 * record; this function trusts nothing the request claims beyond what
 * verifyRequest itself derives from the token.
 */
export async function registerHandoff({ db, verifyRequest, request }) {
  const context = await verifyRequest(request); // throws TrustedAuditError on any auth/session problem — left to the caller to map
  if (!context.lands_entitled || !context.membership_enabled || !SSO_ALLOWED_LANDS_ROLES.includes(context.lands_role)) {
    throw ssoError('LANDS_SSO_NOT_ENTITLED');
  }

  const code = generateHandoffCode();
  const codeHash = hashHandoffCode(code);
  const now = Date.now();
  const expiresAt = now + HANDOFF_TTL_MS;

  await db.runTransaction(async (tx) => {
    tx.set(db.doc(`ssoHandoffs/${codeHash}`), {
      uid: context.actor_uid,
      municipality_id: context.municipality_id,
      lands_role: context.lands_role,
      created_at: now,
      expires_at: expiresAt,
      consumed: false,
      consumed_at: null,
    });
  });

  return { code, expiresAt };
}

/**
 * Called by the browser (Lands' own client) — the one step in this whole
 * flow with no Firebase session yet, by design; that is the point of it.
 * Every check re-runs against LIVE data at consumption time, independent of
 * whatever was true a few seconds earlier at registration — an entitlement
 * revoked or an account disabled in that window is denied here even though
 * the handoff record itself is still technically unexpired.
 */
export async function consumeHandoff({ db, auth, code }) {
  if (typeof code !== 'string' || code.length < 16 || code.length > 512) {
    throw ssoError('LANDS_SSO_HANDOFF_MALFORMED');
  }
  const codeHash = hashHandoffCode(code);
  const ref = db.doc(`ssoHandoffs/${codeHash}`);

  // Marking consumed happens in the SAME transaction as the existence/
  // expiry read — this is what makes replay impossible: a second consume
  // attempt for the same code either observes consumed:true already, or
  // loses the transaction's own optimistic-concurrency check.
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw ssoError('LANDS_SSO_HANDOFF_NOT_FOUND');
    const data = snap.data();
    if (data.consumed) throw ssoError('LANDS_SSO_HANDOFF_ALREADY_CONSUMED');
    if (typeof data.expires_at !== 'number' || Date.now() > data.expires_at) {
      throw ssoError('LANDS_SSO_HANDOFF_EXPIRED');
    }
    tx.update(ref, { consumed: true, consumed_at: Date.now() });
    return { uid: data.uid, municipalityId: data.municipality_id };
  });

  // Re-validate the underlying entitlement AFTER claiming the handoff, from
  // a fresh live Firestore read — never from anything the handoff record
  // itself asserted — so a revocation between issuance and consumption is
  // caught even though the handoff was technically still unexpired.
  const membershipSnap = await db.doc(`landsMunicipalities/${claim.municipalityId}/userAccess/${claim.uid}`).get();
  const membership = membershipSnap.exists ? membershipSnap.data() : null;
  const stillEntitled = Boolean(
    membership &&
    membership.municipality_id === claim.municipalityId &&
    membership.firebase_uid === claim.uid &&
    membership.enabled === true &&
    SSO_ALLOWED_LANDS_ROLES.includes(membership.lands_role)
  );
  if (!stillEntitled) throw ssoError('LANDS_SSO_ENTITLEMENT_REVOKED');

  // Re-validate the Firebase Auth account itself is not disabled — the same
  // shared-project account Manager's setActive()/toggleUser() flips via
  // auth.updateUser(uid, { disabled }). A handoff issued moments before a
  // manager disables the account must not still grant access.
  let userRecord;
  try {
    userRecord = await auth.getUser(claim.uid);
  } catch {
    throw ssoError('LANDS_SSO_ACCOUNT_NOT_FOUND');
  }
  if (userRecord.disabled) throw ssoError('LANDS_SSO_ACCOUNT_DISABLED');

  const customToken = await auth.createCustomToken(claim.uid, {
    municipality_id: claim.municipalityId,
    lands_role: membership.lands_role,
  });

  return { customToken, municipalityId: claim.municipalityId, landsRole: membership.lands_role };
}

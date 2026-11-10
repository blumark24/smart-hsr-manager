import { TrustedAuditError } from './trusted-audit.js';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Read-only trusted membership status lookup — never writes anything.
 * Reuses the exact same verifyRequest as the mutation path
 * (server/firebase-runtime.js): the caller must already be an entitled,
 * enabled member of the municipality they're querying, so this can never
 * read another organization's data, and grants nothing beyond what the
 * caller already has. Server-to-server only: called by Smart HSR Manager's
 * trusted bridge (api/_lib/landsBridge.js) to reconcile a
 * MUTATION_EXECUTION_FAILED response against the authoritative Lands
 * record — never a general read/query surface.
 */
export function createLandsMembershipStatusService({ verifyRequest, db }) {
  return Object.freeze({
    async read({ request, targetUid }) {
      const verifiedContext = await verifyRequest(request);
      if (verifiedContext.lands_entitled !== true || verifiedContext.membership_enabled !== true) {
        throw new TrustedAuditError('LANDS_ACCESS_DENIED');
      }
      if (typeof targetUid !== 'string' || !SAFE_ID.test(targetUid)) {
        throw new TrustedAuditError('INVALID_MUTATION_RECORD_ID');
      }

      // Always the CALLER's own verified municipality_id — never anything
      // the client could supply for the target — so this can never cross a
      // tenant boundary regardless of what target_uid is requested.
      const snap = await db.doc(`landsMunicipalities/${verifiedContext.municipality_id}/userAccess/${targetUid}`).get();
      if (!snap.exists) return { exists: false };

      const data = snap.data() || {};
      return {
        exists: true,
        firebase_uid: typeof data.firebase_uid === 'string' ? data.firebase_uid : null,
        municipality_id: typeof data.municipality_id === 'string' ? data.municipality_id : null,
        lands_role: typeof data.lands_role === 'string' ? data.lands_role : null,
        enabled: data.enabled === true,
      };
    },
  });
}

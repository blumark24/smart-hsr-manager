import { TrustedAuditError } from './trusted-audit.js';

/**
 * Real, fixed-path, create-if-absent Firestore writer for the trusted-audit
 * `appendEvent` dependency. Firestore's transaction supplies the required
 * idempotency guarantee under concurrent requests: the audit path and event
 * shape are entirely derived from the already-verified event, never from a
 * caller-controlled path.
 */
export function createAuditAppender({ db }) {
  return async function appendEvent(event) {
    const auditRef = db.doc(`landsMunicipalities/${event.municipality_id}/auditLogs/${event.event_id}`);
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(auditRef);
      if (existing.exists) throw new TrustedAuditError('AUDIT_EVENT_EXISTS');
      transaction.set(auditRef, event);
    });
  };
}

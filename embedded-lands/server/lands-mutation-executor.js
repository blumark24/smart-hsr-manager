import { TrustedAuditError } from './trusted-audit.js';

const DOMAIN_COLLECTION = {
  userAccess: 'userAccess',
  landGrants: 'landGrants',
  royalOrders: 'royalOrders',
  allocationDecisions: 'allocationDecisions',
  beneficiaries: 'beneficiaries',
  plans: 'plans',
  parcels: 'parcels',
  documents: 'documents'
};

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const TRUSTED_AUDIT_ROLES = ['municipal_manager', 'lands_department_manager', 'lands_employee'];
const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

// Mirrors client/lands-core.js COMMON_DOMAIN_KEYS, minus the host-controlled
// fields (municipality_id, created_by, created_at, updated_at). This is the
// only field surface a caller may edit on a regular-domain record update.
const EDITABLE_DOMAIN_KEYS = ['reference_id', 'name', 'description', 'land_grant_id', 'royal_order_id', 'allocation_decision_id', 'beneficiary_id', 'plan_id', 'parcel_id', 'document_ids'];

function fail(code) { throw new TrustedAuditError(code); }
function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }

function validateRegularDomainChanges(changes) {
  if (!isPlainObject(changes)) fail('INVALID_RECORD_CHANGES');
  const keys = Object.keys(changes);
  if (keys.length < 1 || keys.some((key) => !EDITABLE_DOMAIN_KEYS.includes(key))) fail('INVALID_RECORD_CHANGES');
  for (const key of keys) {
    const value = changes[key];
    if (key === 'reference_id' || key === 'name' || key === 'description') {
      if (typeof value !== 'string' || value.length < 1 || value.length > 512) fail('INVALID_RECORD_CHANGES');
    } else if (key === 'document_ids') {
      if (!Array.isArray(value) || value.length > 64 || value.some((id) => typeof id !== 'string' || !SAFE_ID.test(id))) fail('INVALID_RECORD_CHANGES');
    } else if (value !== null && (typeof value !== 'string' || !SAFE_ID.test(value))) {
      fail('INVALID_RECORD_CHANGES');
    }
  }
  return changes;
}

function validateDocumentReplaceChanges(changes) {
  if (!isPlainObject(changes)) fail('INVALID_RECORD_CHANGES');
  const allowedKeys = ['filename', 'mime_type', 'size_bytes', 'file_base64'];
  if (Object.keys(changes).some((key) => !allowedKeys.includes(key))) fail('INVALID_RECORD_CHANGES');
  const { filename, mime_type: mimeType, size_bytes: sizeBytes, file_base64: fileBase64 } = changes;
  if (typeof filename !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/.test(filename)) fail('INVALID_RECORD_CHANGES');
  if (!DOCUMENT_MIME_TYPES.includes(mimeType)) fail('INVALID_RECORD_CHANGES');
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_DOCUMENT_BYTES) fail('INVALID_RECORD_CHANGES');
  if (typeof fileBase64 !== 'string' || fileBase64.length === 0) fail('INVALID_RECORD_CHANGES');
  let buffer;
  try { buffer = Buffer.from(fileBase64, 'base64'); } catch { fail('INVALID_RECORD_CHANGES'); }
  if (buffer.length !== sizeBytes) fail('INVALID_RECORD_CHANGES');
  return { filename, mime_type: mimeType, size_bytes: sizeBytes, buffer };
}

function validateEntitlementRole(changes) {
  if (!isPlainObject(changes) || Object.keys(changes).some((key) => key !== 'lands_role')) fail('INVALID_RECORD_CHANGES');
  if (!TRUSTED_AUDIT_ROLES.includes(changes.lands_role)) fail('INVALID_RECORD_CHANGES');
  return changes.lands_role;
}

function validateArchiveReason(changes) {
  if (!isPlainObject(changes) || Object.keys(changes).some((key) => key !== 'reason')) fail('INVALID_RECORD_CHANGES');
  if (typeof changes.reason !== 'string') fail('INVALID_RECORD_CHANGES');
  const reason = changes.reason.trim();
  if (reason.length < 1 || reason.length > 500) fail('INVALID_RECORD_CHANGES');
  return reason;
}

// Gate 3 P0 fix: the same editable top-level key surface
// client/lands-client.js's DRAFT_GRANT_EDITABLE_KEYS already exposes for
// draft/incomplete content edits. `status` is deliberately never in this
// list — this operation can never change a grant's workflow status, only
// its business content. Internal shapes (beneficiary/royal_order/
// allocation_decision/conveyance) are intentionally not deep-validated
// here, matching the existing precedent already documented in
// firebase/firestore.rules' validLandGrant().
const LAND_GRANT_CONTENT_KEYS = ['beneficiary', 'royal_order', 'allocation_decision', 'conveyance', 'beneficiary_id', 'royal_order_id', 'allocation_decision_id', 'plan_id', 'parcel_id', 'plan_reference_number', 'parcel_reference_number', 'document_ids'];

function validateLandGrantContentChanges(changes) {
  if (!isPlainObject(changes)) fail('INVALID_RECORD_CHANGES');
  const keys = Object.keys(changes);
  if (keys.length < 1 || keys.some((key) => !LAND_GRANT_CONTENT_KEYS.includes(key))) fail('INVALID_RECORD_CHANGES');
  return changes;
}

const REGULAR_DOMAIN_UPDATE_OPS = new Set(['royal_order.update', 'allocation_decision.update', 'beneficiary.update', 'plan.update', 'parcel.update']);
const DELETE_OPS = new Set(['land_grant.delete', 'royal_order.delete', 'allocation_decision.delete', 'beneficiary.delete', 'plan.delete', 'parcel.delete', 'document.delete']);

/**
 * Real, one-Firestore-transaction implementation of the trusted-lands-mutations
 * `commitMutationAndAudit` dependency. Every operation's business effect is
 * either fully deterministic given the current record state, or parameterized
 * only through `recordChanges` — a narrowly-validated payload supplied by the
 * HTTP host layer, never part of the closed audit/mutation command contract.
 * Reads (record + audit) precede every write; any thrown error aborts the
 * whole transaction, so the business mutation and the audit event always
 * commit together or not at all.
 *
 * `documentStorage` (optional) lets document.replace write the new object
 * bytes to Storage from inside this already-authorized transaction, using
 * only the server-verified record's own `record_domain`/`record_id` — never
 * a caller-supplied path. See lands-document-storage.js for why Storage
 * itself cannot participate in the Firestore transaction, and the residual
 * limitation that follows from that.
 */
export function createLandsMutationExecutor({ db, documentStorage }) {
  return async function commitMutationAndAudit(context, mutationCommand, event, recordChanges) {
    const { operation, record_id: recordId, audit_command: auditCommand } = mutationCommand;
    const municipalityId = context.municipality_id;
    const collectionName = DOMAIN_COLLECTION[auditCommand.domain];
    if (!collectionName) fail('UNSUPPORTED_MUTATION_OPERATION');

    return db.runTransaction(async (transaction) => {
      const recordRef = db.doc(`landsMunicipalities/${municipalityId}/${collectionName}/${recordId}`);
      const auditRef = db.doc(`landsMunicipalities/${municipalityId}/auditLogs/${event.event_id}`);
      const [recordSnap, auditSnap] = await Promise.all([transaction.get(recordRef), transaction.get(auditRef)]);

      if (auditSnap.exists) fail('AUDIT_EVENT_EXISTS');

      const record = recordSnap.exists ? recordSnap.data() : null;
      if (record && record.municipality_id !== municipalityId) fail('MUTATION_EXECUTION_FAILED');
      if (!record && operation !== 'entitlement.enable') fail('MUTATION_EXECUTION_FAILED');

      const now = event.occurred_at;
      let write = null;
      let create = null;
      let del = false;

      switch (operation) {
        case 'entitlement.enable':
          if (!record) {
            const role = validateEntitlementRole(recordChanges);
            create = { firebase_uid: recordId, municipality_id: municipalityId, lands_role: role, enabled: true };
          } else {
            if (record.enabled === true) fail('MUTATION_EXECUTION_FAILED');
            write = { enabled: true };
          }
          break;
        case 'entitlement.disable':
          if (record.enabled === false) fail('MUTATION_EXECUTION_FAILED');
          write = { enabled: false };
          break;
        case 'entitlement.change_role': {
          const role = validateEntitlementRole(recordChanges);
          if (record.lands_role === role) fail('MUTATION_EXECUTION_FAILED');
          write = { lands_role: role };
          break;
        }
        case 'land_grant.transition': {
          const from = record.status;
          const to = from === 'draft' || from === 'incomplete' ? 'under_review' : null;
          if (!to) fail('MUTATION_EXECUTION_FAILED');
          write = { status: to, updated_at: now };
          break;
        }
        // Gate 3 P0 fix: real content edit to a draft or returned
        // (incomplete) grant — the write and its Trusted Audit event now
        // commit atomically, unlike the previous direct-client-SDK write
        // path (client/lands-client.js's updateDraftGrant()), which never
        // produced any audit trail at all. Never writes `status` — that key
        // is not in LAND_GRANT_CONTENT_KEYS, so no caller can smuggle a
        // status change through this operation.
        case 'land_grant.update': {
          if (record.status !== 'draft' && record.status !== 'incomplete') fail('MUTATION_EXECUTION_FAILED');
          const changes = validateLandGrantContentChanges(recordChanges);
          write = { ...changes, updated_at: now };
          break;
        }
        case 'land_grant.approve':
          if (record.status !== 'under_review') fail('MUTATION_EXECUTION_FAILED');
          write = { status: 'approved', updated_at: now };
          break;
        case 'land_grant.reject':
          if (record.status !== 'under_review') fail('MUTATION_EXECUTION_FAILED');
          write = { status: 'rejected', updated_at: now };
          break;
        // Gate 3: returns an under_review grant to its creator for
        // completion, with a mandatory reason. validateArchiveReason() is
        // intentionally reused as-is — despite the name, it only ever
        // validates a generic { reason: string, 1-500 chars } shape, the
        // exact same contract this operation needs; no second validator.
        case 'land_grant.return_for_completion': {
          if (record.status !== 'under_review') fail('MUTATION_EXECUTION_FAILED');
          const reason = validateArchiveReason(recordChanges);
          // return_origin distinguishes a normal reviewer return ('review')
          // from a post-approval controlled reopen ('approved') below —
          // both land on the same canonical 'incomplete' status, this field
          // is the only thing that tells the UI which one actually happened,
          // per the explicit "reuse INCOMPLETE, distinguish via metadata"
          // design decision (see client/lands-core.js's canTransitionGrant).
          write = { status: 'incomplete', return_reason: reason, return_origin: 'review', updated_at: now };
          break;
        }
        // Gate 3 P1: post-approval controlled reopen. Only valid from
        // 'approved' — an already-incomplete/under_review/draft/rejected
        // grant cannot be "reopened" (that's what return_for_completion/
        // transition are for). Reuses validateArchiveReason() exactly like
        // return_for_completion and archive already do — no second validator.
        case 'land_grant.reopen': {
          if (record.status !== 'approved') fail('MUTATION_EXECUTION_FAILED');
          const reason = validateArchiveReason(recordChanges);
          write = { status: 'incomplete', return_reason: reason, return_origin: 'approved', updated_at: now };
          break;
        }
        // Soft archive — never a Firestore delete. Idempotency guard (fails
        // rather than silently re-archiving) matches every other status
        // transition above.
        case 'land_grant.archive': {
          if (record.archived === true) fail('MUTATION_EXECUTION_FAILED');
          const reason = validateArchiveReason(recordChanges);
          write = { archived: true, archived_reason: reason, updated_at: now };
          break;
        }
        case 'allocation_decision.archive': {
          if (record.status === 'archived') fail('MUTATION_EXECUTION_FAILED');
          const reason = validateArchiveReason(recordChanges);
          write = { status: 'archived', archived_reason: reason, updated_at: now };
          break;
        }
        case 'document.replace': {
          const { buffer, ...metadataChanges } = validateDocumentReplaceChanges(recordChanges);
          if (!documentStorage) fail('DOCUMENT_STORAGE_UNAVAILABLE');
          // Runs inside the already-authorized, already-tenant-checked
          // transaction, using only the verified existing record's own
          // record_domain/record_id — never a caller-supplied path.
          await documentStorage.replaceObject({
            municipalityId,
            domain: record.record_domain,
            recordId: record.record_id,
            fileId: recordId,
            buffer,
            mimeType: metadataChanges.mime_type,
            customMetadata: { document_id: recordId, municipality_id: municipalityId, record_domain: record.record_domain, record_id: record.record_id }
          });
          write = { ...metadataChanges, updated_at: now };
          break;
        }
        default:
          if (DELETE_OPS.has(operation)) {
            del = true;
          } else if (REGULAR_DOMAIN_UPDATE_OPS.has(operation)) {
            write = { ...validateRegularDomainChanges(recordChanges), updated_at: now };
          } else {
            fail('UNSUPPORTED_MUTATION_OPERATION');
          }
      }

      const isDocumentDelete = del && collectionName === 'documents';
      if (create) transaction.set(recordRef, create);
      else if (del) transaction.delete(recordRef);
      else transaction.update(recordRef, write);
      transaction.set(auditRef, event);

      return Object.freeze({
        operation,
        record_id: recordId,
        deleted: del,
        // Only present for document.delete, and only ever the server-verified
        // values already read above — never caller-supplied — so the Storage
        // cleanup performed after this transaction commits (see app.js) can't
        // be pointed at an arbitrary path.
        ...(isDocumentDelete ? { storage_domain: record.record_domain, storage_record_id: record.record_id } : {})
      });
    });
  };
}

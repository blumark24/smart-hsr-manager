export const LAND_COLLECTIONS = Object.freeze(['landGrants', 'royalOrders', 'allocationDecisions', 'beneficiaries', 'plans', 'parcels', 'documents']);
export const GRANT_STATUS = Object.freeze({ DRAFT: 'draft', UNDER_REVIEW: 'under_review', INCOMPLETE: 'incomplete', APPROVED: 'approved', REJECTED: 'rejected' });
export const LANDS_STORAGE_NAMESPACE = 'landsMunicipalities';
export const LANDS_DOCUMENT_RECORD_DOMAINS = Object.freeze(['landGrants', 'royalOrders', 'allocationDecisions', 'beneficiaries', 'plans', 'parcels']);
export const LANDS_DOCUMENT_MIME_TYPES = Object.freeze(['application/pdf', 'image/jpeg', 'image/png']);
export const LANDS_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const DERIVED_KEYS = new Set(['completeness', 'completenessPercentage', 'completionPercentage', 'isComplete', 'percentage', 'missingRequirements', 'missingFields', 'completedRequirements', 'computedStatus']);
const SECURITY_KEYS = new Set(['organizationId', 'organization_id', 'role', 'landsRole', 'lands_role', 'enabled', 'approvedBy', 'approved_by', 'approvedAt', 'approved_at']);
const COMMON_DOMAIN_KEYS = new Set(['municipality_id', 'created_by', 'created_at', 'updated_at', 'reference_id', 'name', 'description', 'land_grant_id', 'royal_order_id', 'allocation_decision_id', 'beneficiary_id', 'plan_id', 'parcel_id', 'document_ids']);

export function assertMunicipalityId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('INVALID_MUNICIPALITY_ID');
  return value;
}
export function assertCollection(value) {
  if (!LAND_COLLECTIONS.includes(value)) throw new Error('INVALID_LANDS_DOMAIN');
  return value;
}
export function assertLandsStorageId(value, errorCode = 'INVALID_STORAGE_ID') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error(errorCode);
  return value;
}
export function assertDocumentRecordDomain(value) {
  if (!LANDS_DOCUMENT_RECORD_DOMAINS.includes(value)) throw new Error('INVALID_DOCUMENT_RECORD_DOMAIN');
  return value;
}
export function buildLandsStoragePath(municipalityId, recordDomain, recordId, fileId) {
  assertMunicipalityId(municipalityId); assertDocumentRecordDomain(recordDomain); assertLandsStorageId(recordId, 'INVALID_RECORD_ID'); assertLandsStorageId(fileId, 'INVALID_FILE_ID');
  return `${LANDS_STORAGE_NAMESPACE}/${municipalityId}/documents/${recordDomain}/${recordId}/${fileId}`;
}
export function assertLandsDocumentUpload(file) {
  if (!file || !Number.isInteger(file.size) || file.size <= 0 || file.size > LANDS_DOCUMENT_MAX_BYTES) throw new Error('INVALID_DOCUMENT_SIZE');
  if (!LANDS_DOCUMENT_MIME_TYPES.includes(file.type)) throw new Error('INVALID_DOCUMENT_MIME_TYPE');
  return file;
}
export function createLandsDocumentMetadata({ municipalityId, actorUid, recordDomain, recordId, fileId, filename, file }) {
  assertMunicipalityId(municipalityId); if (typeof actorUid !== 'string' || !actorUid || actorUid.length > 128) throw new Error('INVALID_ACTOR_UID'); assertDocumentRecordDomain(recordDomain);
  assertLandsStorageId(recordId, 'INVALID_RECORD_ID'); assertLandsStorageId(fileId, 'INVALID_FILE_ID'); assertLandsDocumentUpload(file);
  if (typeof filename !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/.test(filename)) throw new Error('INVALID_DOCUMENT_FILENAME');
  return Object.freeze({
    municipality_id: municipalityId,
    created_by: actorUid,
    record_domain: recordDomain,
    record_id: recordId,
    file_id: fileId,
    filename,
    mime_type: file.type,
    size_bytes: file.size,
    storage_path: buildLandsStoragePath(municipalityId, recordDomain, recordId, fileId)
  });
}
export function documentStorageMetadata(documentMetadata) {
  const { file_id: documentId, municipality_id: municipalityId, record_domain: recordDomain, record_id: recordId } = documentMetadata ?? {};
  assertLandsStorageId(documentId, 'INVALID_FILE_ID'); assertMunicipalityId(municipalityId); assertDocumentRecordDomain(recordDomain); assertLandsStorageId(recordId, 'INVALID_RECORD_ID');
  return Object.freeze({ document_id: documentId, municipality_id: municipalityId, record_domain: recordDomain, record_id: recordId });
}
export const canReplaceLandsDocument = (role) => role === 'municipal_manager' || role === 'lands_department_manager';
export const canDeleteLandsDocument = (role) => role === 'municipal_manager';
export function assertWritableEntity(collection, entity, municipalityId, actorUid) {
  assertCollection(collection); assertMunicipalityId(municipalityId);
  if (collection === 'documents') throw new Error('DOCUMENT_GATEWAY_REQUIRED');
  if (!entity || typeof entity !== 'object' || entity.municipality_id !== municipalityId) throw new Error('TENANT_BOUNDARY_VIOLATION');
  if (Object.keys(entity).some((key) => DERIVED_KEYS.has(key))) throw new Error('DERIVED_STATE_WRITE_DENIED');
  if (Object.keys(entity).some((key) => SECURITY_KEYS.has(key))) throw new Error('SECURITY_FIELD_WRITE_DENIED');
  if (collection !== 'landGrants' && Object.keys(entity).some((key) => !COMMON_DOMAIN_KEYS.has(key))) throw new Error('DOMAIN_FIELD_WRITE_DENIED');
  if (typeof entity.created_by !== 'string' || entity.created_by !== actorUid) throw new Error('ENTITY_ACTOR_REQUIRED');
  if (collection === 'landGrants' && entity.created_by !== actorUid) throw new Error('GRANT_ACTOR_REQUIRED');
  return entity;
}
// Gate 3 (Grant workflow): submit (draft->under_review) and resubmit
// (incomplete->under_review) are creator actions — any real Lands role may
// advance THEIR OWN grant into review. Ownership itself is not this
// function's concern (it only ever sees role/from/to): index.html combines
// this with `g.created_by === session.firebaseUid` for the UI gate, and
// server/lands-authorization.js's authorizeMutation() independently
// re-checks created_by for the 'land_grant.transition' operation — the real
// security boundary. Approve / reject / return-for-completion remain
// reviewer-only (manager roles), over ANY grant in the tenant.
export function canTransitionGrant(role, from, to) {
  if ((from === GRANT_STATUS.DRAFT || from === GRANT_STATUS.INCOMPLETE) && to === GRANT_STATUS.UNDER_REVIEW) {
    return ['municipal_manager', 'lands_department_manager', 'lands_employee'].includes(role);
  }
  if (!['municipal_manager', 'lands_department_manager'].includes(role)) return false;
  if (from === GRANT_STATUS.UNDER_REVIEW) return [GRANT_STATUS.APPROVED, GRANT_STATUS.REJECTED, GRANT_STATUS.INCOMPLETE].includes(to);
  // Post-approval controlled reopen: a reviewer/manager may return an
  // already-approved grant to INCOMPLETE for correction — deliberately
  // reusing the existing state rather than adding a second machine state,
  // per the same reasoning as return-for-completion above. Distinguished
  // from a normal under_review return via the grant's own return_origin
  // field ('review' vs 'approved'), never a new status value. Never a
  // creator action — reviewer-only, over any grant in the tenant.
  return from === GRANT_STATUS.APPROVED && to === GRANT_STATUS.INCOMPLETE;
}
// Gate 2: the second, conflicting completeness calculation that used to
// live here (computeCompleteness — a 6-field, *_id-based check) has been
// removed. It never matched the real grant shape (beneficiary/royal_order/
// allocation_decision are embedded objects, not id references — see
// client/lands-client.js's createGrant()), was unused by any UI, and was
// exactly the "two conflicting completeness systems" the Gate 0 audit
// flagged. The one canonical calculation now lives in lands-domain.js as
// computeGrantCompleteness(), re-exported from lands-client.js under the
// same public name every caller already used.
export const AUDIT_EVENT_CONTRACT = Object.freeze(['land_grant.created', 'land_grant.updated', 'land_grant.status_transitioned', 'entitlement.changed', 'document.changed', 'entity.deleted']);

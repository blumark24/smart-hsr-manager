/**
 * SMART HSR Lands — isolated document coordinator. NOT wired to HTTP.
 *
 * Production adapters do NOT exist in this change. The future host MUST:
 * (1) verify Firebase token, tenant, active membership independently;
 * (2) atomically persist document + idempotency index + typed audit;
 * (3) inspect and SHA-256 hash the exact Storage object and generation
 *     server-side, never accept a proof submitted from a browser.
 *
 * Storage inspection is always OUTSIDE retriable Firestore transactions.
 */
import { assertLandsStorageId } from '../../lands/client/lands-core.js';
import {
  DOCUMENT_PHASE, createPendingDocument, assertDocumentOperationScope,
  markDocumentReady, markDocumentFailed, retryFailedDocument
} from './document-lifecycle-policy.js';

function error(code) {
  const err=new Error(code);
  err.code=code;
  return err;
}
function checkedId(value) {
  try { return assertLandsStorageId(value); }
  catch { throw error('DOCUMENT_INVALID_ID'); }
}
function checkedRevision(value) {
  if (!Number.isSafeInteger(value)||value<1) throw error('DOCUMENT_INVALID_REVISION');
  return value;
}
function validateDependencies({verifyPrincipal,store,objectStore,ids,clock}={}) {
  if(typeof verifyPrincipal!=='function'||typeof store?.transaction!=='function'||
     typeof store?.readDocument!=='function'||typeof objectStore?.inspectAndHash!=='function'||
     typeof ids?.documentId!=='function'||typeof clock?.nowIso!=='function')
    throw error('DOCUMENT_TRUSTED_ADAPTER_REQUIRED');
}
function publicStatus(document) {
  return Object.freeze({
    documentId:document.file_id,
    status:document.status,
    attempt:document.attempt,
    revision:document.revision,
    ...(document.failure_code?{failureCode:document.failure_code}:{})
  });
}
function assertCurrent(document,principal,documentId,revision) {
  if(!document||document.file_id!==documentId)throw error('DOCUMENT_NOT_FOUND');
  assertDocumentOperationScope(document,principal,revision);
  return document;
}
function minimalAudit(action,document,now) {
  // The trusted adapter must append identity/tenant internally from the
  // verified principal (never from a client-supplied audit payload).
  return Object.freeze({
    action,document_id:document.file_id,document_phase:document.status,
    revision:document.revision,occurred_at:now
  });
}
function descriptorMatches(existing,{recordDomain,recordId,file}) {
  return existing.record_domain===recordDomain&&existing.record_id===recordId&&
    existing.mime_type===file?.mime_type&&existing.size_bytes===file?.size_bytes&&
    existing.sha256===file?.sha256;
}

/**
 * Store interface, to implement only after independent security approval:
 *
 * store.transaction(async tx => ...) must be an actual atomic transaction;
 * tx.findByRequest({municipalityId,actorUid,requestId}) -> doc/null
 * tx.readParent({municipalityId,recordDomain,recordId}) -> doc/null
 * tx.readDocument({municipalityId,documentId}) -> doc/null
 * tx.assertActiveMembership(verifiedPrincipal) -> true ONLY if the real
 *    account and tenant membership remain enabled inside this transaction.
 * tx.insertDocument(doc), tx.reserveRequest({municipalityId,actorUid,
 *    requestId,documentId}), tx.updateDocument(doc), tx.appendAudit(event).
 *
 * Unique request registration must be protected transactionally. No generic
 * client-initiated methods to set status or overwrite an object are allowed.
 */
async function requireActiveMembership(tx, principal) {
  // A fresh Firestore transaction read closes the permission-revocation
  // window between Storage byte verification and document finalization.
  if(typeof tx.assertActiveMembership!=='function')
    throw error('DOCUMENT_MEMBERSHIP_GATE_REQUIRED');
  if((await tx.assertActiveMembership(principal))!==true)
    throw error('DOCUMENT_ROLE_DENIED');
}

export function createTrustedDocumentCoordinator(dependencies) {
  validateDependencies(dependencies);
  const {verifyPrincipal,store,objectStore,ids,clock}=dependencies;
  async function principalFor(auth) {
    // Only the trusted host may turn opaque credentials into principal data.
    const principal=await verifyPrincipal(auth);
    if(!principal)throw error('DOCUMENT_AUTH_REQUIRED');
    return principal;
  }
  return Object.freeze({
    async begin({auth,recordDomain,recordId,requestId,file}) {
      const principal=await principalFor(auth);
      checkedId(requestId);checkedId(recordId);
      const now=clock.nowIso();
      // Once per request, OUTSIDE a transaction callback that may retry.
      const documentId=checkedId(ids.documentId());
      return store.transaction(async tx=>{
        await requireActiveMembership(tx,principal);
        const scope={municipalityId:principal.municipality_id,
          actorUid:principal.actor_uid,requestId};
        const previous=await tx.findByRequest(scope);
        if(previous) {
          assertDocumentOperationScope(previous,principal,previous.revision);
          if(!descriptorMatches(previous,{recordDomain,recordId,file}))
            throw error('DOCUMENT_IDEMPOTENCY_CONFLICT');
          return publicStatus(previous);
        }
        const sourceRecord=await tx.readParent({
          municipalityId:principal.municipality_id,recordDomain,recordId
        });
        const document=createPendingDocument({
          context:principal,sourceRecord,recordDomain,recordId,
          documentId,requestId,file,now
        });
        await tx.insertDocument(document);
        await tx.reserveRequest({...scope,documentId});
        await tx.appendAudit(minimalAudit('document.upload_pending',document,now));
        return publicStatus(document);
      });
    },

    async finish({auth,documentId,expectedRevision}) {
      const principal=await principalFor(auth);
      checkedId(documentId);checkedRevision(expectedRevision);
      // No object inspection for a different tenant/actor or stale revision.
      const document=assertCurrent(
        await store.readDocument(principal.municipality_id,documentId),
        principal,documentId,expectedRevision
      );
      if(document.status!==DOCUMENT_PHASE.PENDING)
        throw error('DOCUMENT_INVALID_TRANSITION');
      // The object adapter must independently hash verified BYTES of this
      // exact generation, not copy digest/metadata from client input.
      const proof=await objectStore.inspectAndHash(Object.freeze({
        municipalityId:principal.municipality_id,
        documentId,storagePath:document.storage_path,attempt:document.attempt
      }));
      const now=clock.nowIso();
      return store.transaction(async tx=>{
        await requireActiveMembership(tx,principal);
        // Compare-and-set AGAIN after the external read, to defeat stale
        // results from a previous attempt or concurrent retry/finalization.
        const latest=assertCurrent(
          await tx.readDocument({municipalityId:principal.municipality_id,documentId}),
          principal,documentId,expectedRevision
        );
        const updated=markDocumentReady({
          document:latest,context:principal,expectedRevision,proof,now
        });
        await tx.updateDocument(updated);
        await tx.appendAudit(minimalAudit('document.upload_verified',updated,now));
        return publicStatus(updated);
      });
    },

    // Internal trusted operation only. Do not expose direct client controls
    // for arbitrary status mutation without a separately authorized gateway.
    async fail({auth,documentId,expectedRevision,failureCode}) {
      const principal=await principalFor(auth);
      checkedId(documentId);checkedRevision(expectedRevision);
      const now=clock.nowIso();
      return store.transaction(async tx=>{
        await requireActiveMembership(tx,principal);
        const current=assertCurrent(
          await tx.readDocument({municipalityId:principal.municipality_id,documentId}),
          principal,documentId,expectedRevision
        );
        const updated=markDocumentFailed({
          document:current,context:principal,expectedRevision,failureCode,now
        });
        await tx.updateDocument(updated);
        await tx.appendAudit(minimalAudit('document.upload_failed',updated,now));
        return publicStatus(updated);
      });
    },

    async retry({auth,documentId,expectedRevision}) {
      const principal=await principalFor(auth);
      checkedId(documentId);checkedRevision(expectedRevision);
      const now=clock.nowIso();
      return store.transaction(async tx=>{
        await requireActiveMembership(tx,principal);
        const current=assertCurrent(
          await tx.readDocument({municipalityId:principal.municipality_id,documentId}),
          principal,documentId,expectedRevision
        );
        const updated=retryFailedDocument({
          document:current,context:principal,expectedRevision,now
        });
        await tx.updateDocument(updated);
        await tx.appendAudit(minimalAudit('document.upload_retried',updated,now));
        return publicStatus(updated);
      });
    },

    async status({auth,documentId}) {
      const principal=await principalFor(auth);
      checkedId(documentId);
      const doc=await store.readDocument(principal.municipality_id,documentId);
      if(!doc||doc.file_id!==documentId)throw error('DOCUMENT_NOT_FOUND');
      assertDocumentOperationScope(doc,principal,doc.revision);
      return publicStatus(doc);
    }
  });
}

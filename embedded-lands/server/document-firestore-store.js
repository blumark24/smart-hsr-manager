/**
 * SMART HSR — Firestore transaction adapter for the ISOLATED document
 * coordinator. Not imported by any live route, UI or Vercel function.
 *
 * Only use with a separately verified Firebase Admin principal. Admin SDK
 * bypasses Firestore Rules: every path and current membership is checked here.
 * This adapter does not manage Storage or issue upload URLs.
 */
import {
  assertMunicipalityId, assertDocumentRecordDomain, assertLandsStorageId
} from '../../lands/client/lands-core.js';

const ACTIONS=new Set([
  'document.upload_pending','document.upload_verified',
  'document.upload_failed','document.upload_retried'
]);
function deny(reason) {
  const error=new Error(reason);error.code=reason;throw error;
}
function safeId(value) {
  try {return assertLandsStorageId(value);}
  catch {deny('DOCUMENT_INVALID_ID');}
}
function safeTenant(value) {
  try {return assertMunicipalityId(value);}
  catch {deny('DOCUMENT_INVALID_SCOPE');}
}
function safeDomain(value) {
  try {return assertDocumentRecordDomain(value);}
  catch {deny('DOCUMENT_INVALID_DOMAIN');}
}
function requireDb(db) {
  if(typeof db?.doc!=='function'||
     typeof db?.collection!=='function'||
     typeof db?.runTransaction!=='function')
    deny('DOCUMENT_FIRESTORE_ADAPTER_REQUIRED');
}
function docPath(municipalityId,documentId) {
  return 'landsMunicipalities/'+safeTenant(municipalityId)+'/documents/'+safeId(documentId);
}
function requestPath(municipalityId,actorUid,requestId) {
  // Nested UID/requestId prevents ambiguous concatenation collisions.
  return 'landsMunicipalities/'+safeTenant(municipalityId)+
    '/documentUploadRequests/'+safeId(actorUid)+'/requests/'+safeId(requestId);
}
function grantPath(municipalityId,domain,recordId) {
  return 'landsMunicipalities/'+safeTenant(municipalityId)+'/'+
    safeDomain(domain)+'/'+safeId(recordId);
}
function membershipPath(municipalityId,actorUid) {
  return 'landsMunicipalities/'+safeTenant(municipalityId)+
    '/userAccess/'+safeId(actorUid);
}
function assertPrincipalShape(principal) {
  if(!principal||typeof principal!=='object')deny('DOCUMENT_AUTH_REQUIRED');
  safeTenant(principal.municipality_id);
  safeId(principal.actor_uid);
  if(principal.lands_entitled!==true||principal.membership_enabled!==true)
    deny('DOCUMENT_ROLE_DENIED');
  if(!['lands_employee','lands_department_manager','municipal_manager']
      .includes(principal.lands_role))deny('DOCUMENT_ROLE_DENIED');
}
function assertSamePrincipal(principal,{municipalityId,actorUid}={}) {
  if(!principal)deny('DOCUMENT_MEMBERSHIP_GATE_REQUIRED');
  if(municipalityId!==undefined&&municipalityId!==principal.municipality_id)
    deny('DOCUMENT_TENANT_DENIED');
  if(actorUid!==undefined&&actorUid!==principal.actor_uid)
    deny('DOCUMENT_ACTOR_DENIED');
}
function checkedDocument(principal,data) {
  assertSamePrincipal(principal,{municipalityId:data?.municipality_id,
    actorUid:data?.created_by});
  if(typeof data?.file_id!=='string')deny('DOCUMENT_INVALID_ID');
  safeId(data.file_id);
  if(!Number.isSafeInteger(data.revision)||data.revision<1)
    deny('DOCUMENT_INVALID_REVISION');
}
/**
 * The transaction callback may run repeatedly; no storage/network calls,
 * timestamp generation, external side effects or log delivery inside it.
 */
export function createFirestoreDocumentStore({db}) {
  requireDb(db);
  return Object.freeze({
    async readDocument(municipalityId,documentId) {
      // Caller is the coordinator after verifyPrincipal; the adapter never
      // returns another tenant's document under a different prefix.
      const snap=await db.doc(docPath(municipalityId,documentId)).get();
      const data=snap.exists?snap.data():null;
      if(data&&data.municipality_id!==municipalityId)
        deny('DOCUMENT_TENANT_DENIED');
      return data;
    },
    transaction(callback) {
      if(typeof callback!=='function')deny('DOCUMENT_TRANSACTION_REQUIRED');
      return db.runTransaction(async transaction=>{
        let principal=null;
        const assertMembership=()=>{
          if(!principal)deny('DOCUMENT_MEMBERSHIP_GATE_REQUIRED');
        };
        return callback(Object.freeze({
          async assertActiveMembership(candidate) {
            assertPrincipalShape(candidate);
            // Must be a transaction GET, not a prior cached membership
            // response, to defeat permission revocation during byte reads.
            const membership=await transaction.get(db.doc(
              membershipPath(candidate.municipality_id,candidate.actor_uid)
            ));
            const m=membership.exists?membership.data():null;
            const valid=Boolean(m&&m.enabled===true&&
              m.firebase_uid===candidate.actor_uid&&
              m.municipality_id===candidate.municipality_id&&
              m.lands_role===candidate.lands_role);
            if(valid)principal=candidate;
            return valid;
          },
          async findByRequest({municipalityId,actorUid,requestId}) {
            assertMembership();
            assertSamePrincipal(principal,{municipalityId,actorUid});
            const snap=await transaction.get(db.doc(requestPath(
              municipalityId,actorUid,requestId
            )));
            if(!snap.exists)return null;
            const index=snap.data();
            if(index.municipality_id!==municipalityId||
               index.actor_uid!==actorUid||
               index.request_id!==requestId)deny('DOCUMENT_REQUEST_INTEGRITY');
            const result=await transaction.get(db.doc(docPath(
              municipalityId,index.document_id
            )));
            if(!result.exists)deny('DOCUMENT_REQUEST_INTEGRITY');
            const doc=result.data();
            checkedDocument(principal,doc);
            if(doc.file_id!==index.document_id||doc.request_id!==requestId)
              deny('DOCUMENT_REQUEST_INTEGRITY');
            return doc;
          },
          async readParent({municipalityId,recordDomain,recordId}) {
            assertMembership();
            assertSamePrincipal(principal,{municipalityId});
            const snap=await transaction.get(db.doc(grantPath(
              municipalityId,recordDomain,recordId
            )));
            return snap.exists?{id:snap.id,...snap.data()}:null;
          },
          async readDocument({municipalityId,documentId}) {
            assertMembership();
            assertSamePrincipal(principal,{municipalityId});
            const snap=await transaction.get(db.doc(docPath(
              municipalityId,documentId
            )));
            if(!snap.exists)return null;
            const data=snap.data();
            checkedDocument(principal,data);
            if(data.file_id!==documentId)deny('DOCUMENT_INTEGRITY_ERROR');
            return data;
          },
          async insertDocument(document) {
            assertMembership();checkedDocument(principal,document);
            transaction.create(db.doc(docPath(document.municipality_id,
              document.file_id)),document);
          },
          async reserveRequest({municipalityId,actorUid,requestId,documentId}) {
            assertMembership();
            assertSamePrincipal(principal,{municipalityId,actorUid});
            transaction.create(db.doc(requestPath(municipalityId,
              actorUid,requestId)),{
              municipality_id:municipalityId,actor_uid:actorUid,
              request_id:safeId(requestId),document_id:safeId(documentId)
            });
          },
          async updateDocument(document) {
            assertMembership();checkedDocument(principal,document);
            transaction.update(db.doc(docPath(document.municipality_id,
              document.file_id)),document);
          },
          async appendAudit(event) {
            assertMembership();
            if(!event||!ACTIONS.has(event.action)||
               typeof event.document_id!=='string'||
               !Number.isSafeInteger(event.revision)||
               typeof event.occurred_at!=='string')
              deny('DOCUMENT_AUDIT_INVALID');
            // Only safe typed metadata; principal is server-verified within
            // this SAME transaction, never taken from HTTP JSON.
            const entry={
              action:event.action,document_id:safeId(event.document_id),
              document_phase:event.document_phase,
              revision:event.revision,occurred_at:event.occurred_at,
              municipality_id:principal.municipality_id,
              actor_uid:principal.actor_uid,actor_role:principal.lands_role
            };
            const ref=db.collection('landsMunicipalities/'+
              principal.municipality_id+'/auditLogs').doc();
            transaction.create(ref,entry);
          }
        }));
      });
    }
  });
}

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, connectAuthEmulator, onAuthStateChanged, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, signInWithCustomToken, signOut } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, setDoc, query, orderBy, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js';
import { sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { LANDS_ROLES, canCreateGrant, canManageEntitlements, canReviewGrant, presentGrant, computeGrantCompleteness } from './lands-domain.js';
import { LAND_COLLECTIONS, assertCollection, assertWritableEntity, buildLandsStoragePath, canDeleteLandsDocument, canReplaceLandsDocument, canTransitionGrant, createLandsDocumentMetadata, documentStorageMetadata, assertLandsDocumentUpload } from './lands-core.js';

const root = (db, municipalityId) => doc(db, 'landsMunicipalities', municipalityId);
const membershipRef = (db, municipalityId, uid) => doc(root(db, municipalityId), 'userAccess', uid);

const MUTATION_STATUS_TO_ERROR = { 400: 'LANDS_MUTATION_REJECTED', 401: 'LANDS_AUTH_REQUIRED', 403: 'LANDS_MUTATION_DENIED', 409: 'LANDS_MUTATION_CONFLICT', 410: 'LANDS_CLIENT_SDK_ONLY' };

const STAGING_PROJECT_ID = 'smart-hsr-staging-blumark24';
// The same existing Smart HSR Production Firebase project the unified
// employee gateway (smart-hsr-manager) already uses — not a new project.
const PRODUCTION_PROJECT_ID = 'smart-hsr-manager';
const ALLOWED_PROJECT_IDS = Object.freeze([STAGING_PROJECT_ID, PRODUCTION_PROJECT_ID]);

/**
 * Client-SDK-only Lands gateway. Supply emulator config for local work, or
 * one of the two real project configs (Staging or Production) with
 * useEmulators:false. No other project id is ever accepted here.
 */
export function createLandsClient({ firebaseConfig, useEmulators = false, emulatorHost = '127.0.0.1', authPort = 9100, firestorePort = 8085, storagePort = 9199, apiBaseUrl = '/api', fetchImpl = fetch }) {
  if (!useEmulators && !ALLOWED_PROJECT_IDS.includes(firebaseConfig?.projectId)) throw new Error('LANDS_ALLOWED_PROJECT_REQUIRED');
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const auth = getAuth(app); const db = getFirestore(app); const storage = getStorage(app);
  // Explicit, not relied-on-as-default: a real browser employee session
  // (from either the standalone form or the unified SSO handoff) must
  // survive a page refresh — the standard Firebase browser persistence
  // mechanism (IndexedDB-backed), never a custom token store. Fired
  // immediately on client creation, well before any sign-in call that would
  // actually establish a session (network round-trips to the SSO/mutation
  // endpoints give this ample time to resolve first).
  if (!useEmulators) setPersistence(auth, browserLocalPersistence).catch(() => {});
  if (useEmulators) { connectAuthEmulator(auth, `http://${emulatorHost}:${authPort}`, { disableWarnings: true }); connectFirestoreEmulator(db, emulatorHost, firestorePort); connectStorageEmulator(storage, emulatorHost, storagePort); }
  const requireUser = () => { if (!auth.currentUser) throw new Error('LANDS_AUTH_REQUIRED'); return auth.currentUser; };
  const requireId = (municipalityId) => { if (typeof municipalityId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(municipalityId)) throw new Error('INVALID_MUNICIPALITY_ID'); };

  // Every consequential mutation is routed through the trusted server runtime.
  // The Firestore/Storage Client SDK can no longer write these paths directly
  // (see firebase/firestore.rules and firebase/storage.rules).
  async function callTrustedMutation(municipalityId, body) {
    const user = requireUser();
    const idToken = await user.getIdToken();
    const response = await fetchImpl(`${apiBaseUrl}/lands-mutations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}`, 'x-municipality-id': municipalityId },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || MUTATION_STATUS_TO_ERROR[response.status] || 'LANDS_MUTATION_FAILED');
    }
    return response.json();
  }
  async function session(municipalityId) {
    requireId(municipalityId); const user = requireUser(); const snapshot = await getDoc(membershipRef(db, municipalityId, user.uid)); const data = snapshot.data();
    if (!snapshot.exists() || !data.enabled || data.firebase_uid !== user.uid || data.municipality_id !== municipalityId || !LANDS_ROLES.includes(data.lands_role)) throw new Error('LANDS_ACCESS_DENIED');
    return { firebaseUid: user.uid, municipalityId, role: data.lands_role };
  }
  const DRAFT_GRANT_EDITABLE_KEYS = ['beneficiary', 'royal_order', 'allocation_decision', 'conveyance', 'beneficiary_id', 'royal_order_id', 'allocation_decision_id', 'plan_id', 'parcel_id', 'plan_reference_number', 'parcel_reference_number', 'document_ids'];

  return {
    auth, storage, session,
    async signIn(email, password) { await signInWithEmailAndPassword(auth, email, password); },
    // Used ONLY by the unified SSO handoff (see index.html's boot-time
    // consumeSsoHandoff()): the short-lived custom token minted by Lands'
    // own /api/lands-sso-consume, after it independently re-verified the
    // employee's real membership record server-side. No password ever
    // touches this path.
    async signInWithHandoffToken(customToken) { await signInWithCustomToken(auth, customToken); },
    async signOutUser() { await signOut(auth); },
    // The correct way to observe Firebase's own async, persistence-backed
    // auth-state restoration (e.g. on a page refresh) — never a synchronous
    // auth.currentUser check, which races that restore. Returns the
    // unsubscribe function.
    onAuthChange(callback) { return onAuthStateChanged(auth, callback); },
    async resetPassword(email) { await sendPasswordResetEmail(auth, email); },
    collections: LAND_COLLECTIONS,
    async listLandsUsers(municipalityId) { const identity = await session(municipalityId); if (!canManageEntitlements(identity.role)) throw new Error('LANDS_ENTITLEMENT_DENIED'); const snapshots = await getDocs(collection(root(db, municipalityId), 'userAccess')); return snapshots.docs.map((item) => ({ id: item.id, ...item.data() })); },
    async listEntities(municipalityId, domain) { await session(municipalityId); assertCollection(domain); const snapshots = await getDocs(collection(root(db, municipalityId), domain)); return snapshots.docs.map((item) => ({ id: item.id, ...item.data() })); },
    async createEntity(municipalityId, domain, entity) { const identity = await session(municipalityId); assertWritableEntity(domain, entity, municipalityId, identity.firebaseUid); const reference = doc(collection(root(db, municipalityId), domain)); await setDoc(reference, { ...entity, municipality_id: municipalityId, updated_at: serverTimestamp() }); return reference.id; },
    async updateEntity(municipalityId, domain, entityId, entity) {
      await session(municipalityId); assertCollection(domain); if (domain === 'documents') throw new Error('DOCUMENT_GATEWAY_REQUIRED');
      const operation = { royalOrders: 'royal_order.update', allocationDecisions: 'allocation_decision.update', beneficiaries: 'beneficiary.update', plans: 'plan.update', parcels: 'parcel.update' }[domain];
      if (!operation) throw new Error('LANDS_ENTITY_UPDATE_UNSUPPORTED');
      const { municipality_id: _municipalityId, created_by: _createdBy, created_at: _createdAt, updated_at: _updatedAt, ...changes } = entity ?? {};
      await callTrustedMutation(municipalityId, { operation, record_id: entityId, record_changes: changes });
    },
    // Soft archive for a regular-domain entity (allocationDecisions today).
    // Real, trusted-audited, and reversible — never a Firestore delete.
    async archiveEntity(municipalityId, entityId, reason) {
      await session(municipalityId);
      await callTrustedMutation(municipalityId, { operation: 'allocation_decision.archive', record_id: entityId, record_changes: { reason } });
    },
    // Soft archive for a grant. Same reasoning as archiveEntity above; kept
    // separate because it targets the landGrants domain, not a regular
    // domain entity.
    async archiveGrant(municipalityId, grantId, reason) {
      await session(municipalityId);
      await callTrustedMutation(municipalityId, { operation: 'land_grant.archive', record_id: grantId, record_changes: { reason } });
    },
    async listGrants(municipalityId) { await session(municipalityId); const snapshots = await getDocs(query(collection(root(db, municipalityId), 'landGrants'), orderBy('updated_at', 'desc'))); return snapshots.docs.map((item) => presentGrant(item.id, item.data())); },
    async createGrant(municipalityId, { beneficiaryName, nationalId = null, royalOrderNumber = null, royalOrderDate = null }) {
      const identity = await session(municipalityId); if (!canCreateGrant(identity.role) || !beneficiaryName?.trim()) throw new Error('LANDS_GRANT_WRITE_DENIED');
      const grant = doc(collection(root(db, municipalityId), 'landGrants')); const batch = writeBatch(db);
      batch.set(grant, { municipality_id: municipalityId, beneficiary: { name: beneficiaryName.trim(), national_id: nationalId }, royal_order: { number: royalOrderNumber, date: royalOrderDate }, allocation_decision: null, status: 'draft', created_by: identity.firebaseUid, created_at: serverTimestamp(), updated_at: serverTimestamp() });
      await batch.commit(); return grant.id;
    },
    // Gate 3 P0 fix: editable on BOTH draft and incomplete (returned)
    // grants — never on under_review/approved/rejected. Ownership and the
    // draft-or-incomplete status guard are enforced authoritatively by the
    // server (server/lands-authorization.js's ownership check for
    // land_grant.update, and server/lands-mutation-executor.js's status
    // guard), not just by the UI gate that decides whether to show the edit
    // button. Routed through the trusted mutation pipeline (not a direct
    // Firestore write, unlike before this fix) so the content write and its
    // Trusted Audit event commit atomically in one Firestore transaction — a
    // real content edit used to leave no audit trail at all. This can never
    // change `status`: that key is not in DRAFT_GRANT_EDITABLE_KEYS, so no
    // caller of this function can smuggle a status change through it.
    async updateDraftGrant(municipalityId, grantId, changes) {
      await session(municipalityId);
      const keys = Object.keys(changes ?? {});
      if (!keys.length || keys.some((key) => !DRAFT_GRANT_EDITABLE_KEYS.includes(key))) throw new Error('INVALID_GRANT_CHANGES');
      await callTrustedMutation(municipalityId, { operation: 'land_grant.update', record_id: grantId, record_changes: changes, safe_metadata: { source: 'web' } });
    },
    // auditLogs reads are restricted by Rules to municipal_manager /
    // lands_department_manager; mirrored here so employees get a clean empty
    // list instead of a permission-denied round trip.
    async listAuditEvents(municipalityId, { recordId } = {}) {
      const identity = await session(municipalityId);
      if (!canReviewGrant(identity.role)) return [];
      const snapshots = await getDocs(query(collection(root(db, municipalityId), 'auditLogs'), orderBy('occurred_at', 'desc')));
      const events = snapshots.docs.map((item) => ({ id: item.id, ...item.data() }));
      return recordId ? events.filter((item) => item.record_id === recordId) : events;
    },
    async updateGrantStatus(municipalityId, grantId, fromStatus, toStatus) {
      const identity = await session(municipalityId); if (!canTransitionGrant(identity.role, fromStatus, toStatus)) throw new Error('INVALID_GRANT_TRANSITION');
      const operation = toStatus === 'approved' ? 'land_grant.approve' : toStatus === 'rejected' ? 'land_grant.reject' : 'land_grant.transition';
      await callTrustedMutation(municipalityId, { operation, record_id: grantId, safe_metadata: { previous_status: fromStatus, new_status: toStatus, changed_fields: ['status'], source: 'web' } });
    },
    // Reviewer-only: returns an under_review grant to the creator with a
    // mandatory reason — a dedicated operation (mirroring approve/reject),
    // not the generic land_grant.transition (which only ever derives a
    // single unambiguous destination from `from`; under_review has three
    // possible destinations, so it needs its own operation just like
    // approve/reject already do). Same real, trusted-audited pipeline.
    async returnGrantForCompletion(municipalityId, grantId, reason) {
      const identity = await session(municipalityId); if (!canTransitionGrant(identity.role, 'under_review', 'incomplete')) throw new Error('INVALID_GRANT_TRANSITION');
      await callTrustedMutation(municipalityId, { operation: 'land_grant.return_for_completion', record_id: grantId, record_changes: { reason }, safe_metadata: { previous_status: 'under_review', new_status: 'incomplete', changed_fields: ['status', 'return_reason'], source: 'web' } });
    },
    // Gate 3 P1: post-approval controlled reopen — a reviewer/manager
    // action over any grant in the tenant (no ownership restriction), same
    // real trusted-audited pipeline. Reuses the INCOMPLETE status; never a
    // second machine state.
    async reopenApprovedGrant(municipalityId, grantId, reason) {
      const identity = await session(municipalityId); if (!canTransitionGrant(identity.role, 'approved', 'incomplete')) throw new Error('INVALID_GRANT_TRANSITION');
      await callTrustedMutation(municipalityId, { operation: 'land_grant.reopen', record_id: grantId, record_changes: { reason }, safe_metadata: { previous_status: 'approved', new_status: 'incomplete', changed_fields: ['status', 'return_reason'], source: 'web' } });
    },
    async uploadDocument(municipalityId, { recordDomain, recordId, file }) {
      const identity = await session(municipalityId); assertLandsDocumentUpload(file);
      const metadataRef = doc(collection(root(db, municipalityId), 'documents'));
      const metadata = createLandsDocumentMetadata({ municipalityId, actorUid: identity.firebaseUid, recordDomain, recordId, fileId: metadataRef.id, filename: `document-${metadataRef.id}`, file });
      await setDoc(metadataRef, { ...metadata, created_at: serverTimestamp(), updated_at: serverTimestamp() });
      await uploadBytes(ref(storage, metadata.storage_path), file, { contentType: file.type, customMetadata: documentStorageMetadata(metadata) });
      return Object.freeze({ documentId: metadataRef.id });
    },
    async readDocument(municipalityId, documentId) {
      await session(municipalityId); const metadataSnapshot = await getDoc(doc(root(db, municipalityId), 'documents', documentId));
      if (!metadataSnapshot.exists()) throw new Error('DOCUMENT_NOT_FOUND');
      const metadata = metadataSnapshot.data(); const path = buildLandsStoragePath(municipalityId, metadata.record_domain, metadata.record_id, metadata.file_id);
      if (metadata.file_id !== documentId || metadata.storage_path !== path) throw new Error('DOCUMENT_METADATA_INTEGRITY_ERROR');
      return getBytes(ref(storage, path));
    },
    async replaceDocument(municipalityId, documentId, file) {
      const identity = await session(municipalityId); if (!canReplaceLandsDocument(identity.role)) throw new Error('DOCUMENT_REPLACE_DENIED');
      assertLandsDocumentUpload(file); const metadataSnapshot = await getDoc(doc(root(db, municipalityId), 'documents', documentId));
      if (!metadataSnapshot.exists()) throw new Error('DOCUMENT_NOT_FOUND');
      const metadata = metadataSnapshot.data(); const path = buildLandsStoragePath(municipalityId, metadata.record_domain, metadata.record_id, metadata.file_id);
      if (metadata.file_id !== documentId || metadata.storage_path !== path) throw new Error('DOCUMENT_METADATA_INTEGRITY_ERROR');
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      await callTrustedMutation(municipalityId, {
        operation: 'document.replace',
        record_id: documentId,
        record_changes: { filename: metadata.filename, mime_type: file.type, size_bytes: file.size, file_base64: btoa(binary) }
      });
    },
    async deleteDocument(municipalityId, documentId) {
      const identity = await session(municipalityId); if (!canDeleteLandsDocument(identity.role)) throw new Error('DOCUMENT_DELETE_DENIED');
      await callTrustedMutation(municipalityId, { operation: 'document.delete', record_id: documentId });
    },
    computeGrantCompleteness,
    async setUserEntitlement(municipalityId, firebaseUidOrInput, role, enabled) {
      const identity = await session(municipalityId);
      const input = typeof firebaseUidOrInput === 'object' ? firebaseUidOrInput : { firebaseUid: firebaseUidOrInput, landsRole: role, enabled };
      const { firebaseUid, landsRole, enabled: membershipEnabled } = input;
      if (!canManageEntitlements(identity.role) || firebaseUid === identity.firebaseUid || !LANDS_ROLES.includes(landsRole) || typeof membershipEnabled !== 'boolean') throw new Error('LANDS_ENTITLEMENT_DENIED');

      const existingSnapshot = await getDoc(membershipRef(db, municipalityId, firebaseUid));
      const existing = existingSnapshot.exists() ? existingSnapshot.data() : null;

      // Each closed-catalogue operation is a single audited fact (enabled,
      // disabled, or role-changed). Applying both a role change and an
      // enable/disable in one call means two sequential trusted mutations,
      // each independently audited.
      if (existing?.lands_role && existing.lands_role !== landsRole && existing.enabled === membershipEnabled) {
        await callTrustedMutation(municipalityId, { operation: 'entitlement.change_role', record_id: firebaseUid, record_changes: { lands_role: landsRole } });
        return;
      }
      if (existing?.lands_role && existing.lands_role !== landsRole) {
        await callTrustedMutation(municipalityId, { operation: 'entitlement.change_role', record_id: firebaseUid, record_changes: { lands_role: landsRole } });
      }
      await callTrustedMutation(municipalityId, {
        operation: membershipEnabled ? 'entitlement.enable' : 'entitlement.disable',
        record_id: firebaseUid,
        record_changes: !existing && membershipEnabled ? { lands_role: landsRole } : undefined
      });
    }
  };
}

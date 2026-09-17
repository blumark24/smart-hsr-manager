'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const analyze = fs.readFileSync(path.join(root, 'api', 'ai', 'analyze.js'), 'utf8');
const storageRead = require('../api/storage/read.js')._test;
const storageUpload = require('../api/storage/upload.js')._test;

test('Golden Observation wiring covers verified session, modal, GPS, image, save, reopen, and AI', () => {
  assert.match(dashboard, /onAuthStateChanged\(auth, async \(user\) =>/);
  assert.match(dashboard, /inspectorContext\.organizationId = verified\.organizationId/);
  assert.match(dashboard, /if \(id==='smartInputModal'\)[\s\S]*?window\.getLocation\(\);/);
  assert.match(dashboard, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(dashboard, /const hasImage = Boolean\(currentFile\) && ALLOWED_IMAGE_TYPES\.has\(currentFile\.type\)/);
  assert.match(dashboard, /uploadedUrl = await uploadImageToStorage/);
  assert.match(dashboard, /saveObservationToFirestore\(clientRequestId, payload\)/);
  assert.match(dashboard, /where\('createdByUid', '==', inspectorContext\.uid\)/);
  assert.match(dashboard, /showObservationDetail\(docId\)/);
  assert.match(dashboard, /analyzeSmartCaptureDraft/);
  assert.match(dashboard, /draftImageObjectKey:imageObjectKey/);
  assert.doesNotMatch(dashboard, /if\(!hasText\) missing\.push/);
  assert.match(dashboard, /pendingSmartCapture=\{clientRequestId,uploadedUrl,aiDraft:null\}/);
  assert.match(dashboard, /pendingSmartCapture\.aiDraft=aiDraft/);
  assert.match(dashboard, /حفظ الملاحظة بعد المراجعة/);
  assert.doesNotMatch(dashboard, /aiAnalysis:\s*aiDraft\?\.analysis/);
  assert.match(dashboard, /تعذر تجديد جلسة الدخول\. سجّل الدخول مرة أخرى/);
});

test('saved canonical observation can be reopened with its evidence fields intact', () => {
  assert.match(dashboard, /imageObjectKey: isLocalDemoReference\(uploadedUrl\) \? null : uploadedUrl/);
  assert.match(dashboard, /firstEvidenceReference\(data\.imageObjectKey, data\.imagePath, data\.imageUrl, data\.beforeImagePath\)/);
  assert.match(dashboard, /resolveObservationImage\(\{/);
  assert.deepEqual([...storageRead.EVIDENCE_FIELDS], [
    'imageObjectKey', 'imagePath', 'imageUrl', 'beforeImagePath', 'afterImagePath', 'afterImageUrl'
  ]);
});

test('pre-save upload uses a canonical tenant-and-observation-scoped private key', () => {
  assert.equal(storageUpload.buildObjectKey({
    prefix: 'ignored-for-canonical', organizationId: 'org-a', observationId: 'obs-1',
    scope: 'before', extension: 'jpg', uuid: 'image-1',
  }), 'observations/org-a/obs-1/before/image-1.jpg');
});

test('Manager receives canonical and legacy evidence plus the persisted advisory for the same record', () => {
  // manager.html's own inline script no longer maps raw Firestore documents
  // or talks to Firebase Storage directly — that now happens in
  // manager-dashboard-adapter.js's normalizeObservations()/
  // resolveEvidenceImage (same precedent as manager-login-preview-config.
  // test.js for Firebase config resolution), which manager.html's evidence
  // drawer calls into. The AI-vision rendering itself is declarative
  // (render() properties), not an imperative renderAiVisionSection()
  // function — see manager-phase3-functional-parity.test.js: "AI-vision
  // only renders the real persisted-analysis allowlist fields...".
  const adapter = fs.readFileSync(path.join(root, 'manager-dashboard-adapter.js'), 'utf8');
  assert.match(adapter, /imagePath: data\.imageObjectKey \|\| data\.imagePath \|\| data\.imageUrl \|\| data\.beforeImagePath \|\| null/);
  assert.match(adapter, /afterImagePath: data\.afterImagePath \|\| data\.afterImageUrl \|\| null/);
  assert.match(adapter, /aiAnalysis: data\.aiAnalysis && typeof data\.aiAnalysis === 'object' \? data\.aiAnalysis : null/);
  assert.match(adapter, /resolveObservationImage\(\{/);
  assert.match(manager, /evidenceHasAi: !!st\.selectedUser\?\.aiAnalysis|evidenceHasAi: !!st\.selectedObservation\?\.aiAnalysis/);
  assert.doesNotMatch(manager, /function renderAiVisionSection\(/, 'AI-vision rendering must stay declarative, never revert to an imperative DOM-writing function');
});

test('AI persists only an allowlisted advisory and leaves workflow mutation to explicit human actions', () => {
  assert.match(analyze, /const persistedAiAnalysis = buildPersistedAiAnalysis/);
  assert.match(analyze, /completeAiOperation\([\s\S]*?patch: \{ aiAnalysis: persistedAiAnalysis \}/);
  assert.match(analyze, /advisoryOnly: true/);
  assert.match(analyze, /requiresExplicitHumanAction: true/);
  assert.match(analyze, /persisted: !draftMode/);
  assert.match(analyze, /draftMode \? null : \{[\s\S]*?patch: \{ aiAnalysis: persistedAiAnalysis \}/);
  assert.match(analyze, /draft: draftMode/);
  const persistenceBlock = analyze.slice(analyze.indexOf('const persistedAiAnalysis'), analyze.indexOf('return sendJson(res, 200'));
  for (const forbidden of ['status:', 'assignedContractorUid', 'assignedAt', 'closedAt']) {
    assert.equal(persistenceBlock.includes(forbidden), false, `AI persistence must not include ${forbidden}`);
  }
});

test('Firestore keeps Inspector creation and Manager viewing tenant-scoped without rule changes', () => {
  assert.match(rules, /allow read: if \(isActiveManager\(\) && resource\.data\.organizationId == managerOrgId\(\)\)/);
  assert.match(rules, /allow create: if orgUserRole\(\) == 'inspector'[\s\S]*?validInspectorObservationCreate\(obsId\)/);
  assert.match(rules, /function validInspectorObservationCreate\(obsId\)[\s\S]*?data\.organizationId == orgUserOrgId\(\)[\s\S]*?data\.createdByUid == request\.auth\.uid/);
});

test('storage authorization admits same-tenant Manager and rejects cross-tenant evidence', async () => {
  const managerDb = {
    collection(name) {
      return {
        doc() {
          return { get: async () => name === 'managers'
            ? ({ exists: true, data: () => ({ role: 'manager', active: true, organizationId: 'org-a' }) })
            : ({ exists: false, data: () => ({}) }) };
        }
      };
    }
  };
  assert.deepEqual(await storageRead.resolveViewerContext(managerDb, 'manager-1'), {
    uid: 'manager-1', role: 'manager', organizationId: 'org-a'
  });

  const queriedOrganizations = [];
  const evidenceDb = {
    collection() {
      const query = {
        where(field, op, value) { if (field === 'organizationId') queriedOrganizations.push(value); return query; },
        limit() { return query; },
        get: async () => ({ empty: true })
      };
      return query;
    }
  };
  assert.equal(await storageRead.keyBelongsToOrganization(evidenceDb, 'observations/org-b/before/x.jpg', 'org-a'), false);
  assert.ok(queriedOrganizations.length > 0);
  assert.ok(queriedOrganizations.every(value => value === 'org-a'));
});

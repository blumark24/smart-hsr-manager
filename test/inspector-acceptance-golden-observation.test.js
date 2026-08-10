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
  assert.match(dashboard, /fetch\('\/api\/ai\/analyze'/);
});

test('saved canonical observation can be reopened with its evidence fields intact', () => {
  assert.match(dashboard, /imageObjectKey: isLocalDemoReference\(uploadedUrl\) \? null : uploadedUrl/);
  assert.match(dashboard, /firstEvidenceReference\(data\.imageObjectKey, data\.imagePath, data\.imageUrl, data\.beforeImagePath\)/);
  assert.match(dashboard, /resolveObservationImage\(\{/);
  assert.deepEqual([...storageRead.EVIDENCE_FIELDS], [
    'imageObjectKey', 'imagePath', 'imageUrl', 'beforeImagePath', 'afterImagePath', 'afterImageUrl'
  ]);
});

test('Manager receives canonical and legacy evidence plus the persisted advisory for the same record', () => {
  assert.match(manager, /imagePath: x\.imageObjectKey \|\| x\.imagePath \|\| x\.imageUrl \|\| x\.beforeImagePath \|\| null/);
  assert.match(manager, /afterImagePath: x\.afterImagePath \|\| x\.afterImageUrl \|\| null/);
  assert.match(manager, /aiAnalysis: x\.aiAnalysis && typeof x\.aiAnalysis === 'object' \? x\.aiAnalysis : null/);
  assert.match(manager, /resolveObservationImage\(\{/);
  assert.match(manager, /renderAiVisionSection\(o\)/);
});

test('AI persists only an allowlisted advisory and leaves workflow mutation to explicit human actions', () => {
  assert.match(analyze, /const persistedAiAnalysis = buildPersistedAiAnalysis/);
  assert.match(analyze, /observationSnap\.ref\.update\(\{ aiAnalysis: persistedAiAnalysis \}\)/);
  assert.match(analyze, /advisoryOnly: true/);
  assert.match(analyze, /requiresExplicitHumanAction: true/);
  assert.match(analyze, /persisted: true/);
  const persistenceBlock = analyze.slice(analyze.indexOf('const persistedAiAnalysis'), analyze.indexOf('return sendJson(res, 200'));
  for (const forbidden of ['status:', 'assignedContractorUid', 'assignedAt', 'closedAt']) {
    assert.equal(persistenceBlock.includes(forbidden), false, `AI persistence must not include ${forbidden}`);
  }
});

test('Firestore keeps Inspector creation and Manager viewing tenant-scoped without rule changes', () => {
  assert.match(rules, /allow read: if \(isActiveManager\(\) && resource\.data\.organizationId == managerOrgId\(\)\)/);
  assert.match(rules, /allow create: if orgUserRole\(\) == 'inspector'[\s\S]*?request\.resource\.data\.organizationId == orgUserOrgId\(\)[\s\S]*?request\.resource\.data\.createdByUid == request\.auth\.uid/);
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


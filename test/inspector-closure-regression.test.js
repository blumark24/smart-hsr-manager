'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const aiApi = fs.readFileSync(path.join(root, 'api', 'ai', 'analyze.js'), 'utf8');
const storageAdapter = fs.readFileSync(path.join(root, 'storage-adapter.js'), 'utf8');
const storageRead = require('../api/storage/read.js')._test;

test('GPS capture distinguishes denied permission and performs one bounded transient retry', () => {
  assert.match(dashboard, /navigator\.permissions\?\.query/);
  assert.match(dashboard, /Number\(error\?\.code\)===1/);
  assert.match(dashboard, /locationAttempt>=2/);
  assert.match(dashboard, /enableHighAccuracy:false,maximumAge:5000,timeout:18000/);
  assert.match(dashboard, /runToken!==locationRunToken/);
});

test('Inspector save policy accepts only explicit GPS or explicitly overridden weak GPS', () => {
  assert.match(dashboard, /locationConfirmed === true\s*&& acceptedGpsSource/);
  assert.match(dashboard, /locationVerified === true && locationSource === 'gps'/);
  assert.match(dashboard, /locationSource === 'gps_weak' && locationWarningOverride === true/);
  assert.doesNotMatch(dashboard, /locationSource === 'manual_map'[^\n]*hasLocation/);
});

test('closure UI stops on persistence failure and requires server confirmation before success', () => {
  const start = dashboard.indexOf('window.completeObservation = async function()');
  const end = dashboard.indexOf('window.generatePdfReport', start);
  const closeout = dashboard.slice(start, end);
  const write = closeout.indexOf('await updateObservationInFirestore');
  const failure = closeout.indexOf("Firestore closeout persistence failed", write);
  const failureReturn = closeout.indexOf('return;', failure);
  const readBack = closeout.indexOf('await getDocFromServer(doc(db, COLLECTION, currentSelectedObservation.docId))', failureReturn);
  const localCompletion = closeout.indexOf("currentSelectedObservation.status = 'COMPLETED'", readBack);
  const success = closeout.indexOf('تم إغلاق الملاحظة رقم', localCompletion);
  assert.ok(write > -1 && failure > write && failureReturn > failure);
  assert.ok(readBack > failureReturn && localCompletion > readBack && success > localCompletion);
  assert.match(closeout, /لم يتم تغيير حالة الملاحظة/);
  assert.match(closeout, /لم يتم تغيير الحالة المعروضة/);
});

test('every supported Firestore evidence field is authorized through the same tenant-scoped reader', () => {
  assert.deepEqual([...storageRead.EVIDENCE_FIELDS], [
    'imageObjectKey', 'imagePath', 'imageUrl', 'beforeImagePath', 'afterImagePath', 'afterImageUrl'
  ]);
  assert.match(storageAdapter, /fetchWithFirebaseAuth/);
  assert.match(storageAdapter, /\/api\/storage\/read\?key=/);
  assert.match(storageAdapter, /URL\.createObjectURL\(blob\)/);
});

test('AI analysis resolves canonical then legacy before-evidence fields', () => {
  const canonical = aiApi.indexOf('observation.imageObjectKey');
  const pathField = aiApi.indexOf('observation.imagePath', canonical);
  const urlField = aiApi.indexOf('observation.imageUrl', pathField);
  const beforeField = aiApi.indexOf('observation.beforeImagePath', urlField);
  assert.ok(canonical > -1 && canonical < pathField && pathField < urlField && urlField < beforeField);
});

test('image-first draft analysis is review-only and precedes explicit save', () => {
  const analyzeAt = dashboard.indexOf('aiDraft = await analyzeSmartCaptureDraft');
  const reviewAt = dashboard.indexOf('renderSmartCaptureDraft(aiDraft)', analyzeAt);
  const saveAt = dashboard.indexOf('pendingSmartInput = { payload, nextDisplayId, clientRequestId }', reviewAt);
  assert.ok(analyzeAt > -1 && analyzeAt < reviewAt && reviewAt < saveAt);
  assert.match(dashboard, /draftImageObjectKey:imageObjectKey/);
  const createPayload = dashboard.slice(dashboard.indexOf('const payload = {'), saveAt);
  assert.doesNotMatch(createPayload, /aiAnalysis|assignedContractorUid|resolutionNote|afterImagePath/);
});

test('Inspector AI is provider-neutral, authenticated, advisory-only, and persists no workflow mutation', () => {
  assert.match(dashboard, /input:'\/api\/ai\/analyze'/);
  assert.match(dashboard, /getIdToken:forceRefresh=>user\.getIdToken\(forceRefresh\)/);
  assert.match(dashboard, /AI Advisory/);
  assert.doesNotMatch(dashboard.slice(dashboard.indexOf('async function runVisionAnalysis'), dashboard.indexOf('window.generateCommunicationDraft')), /setDoc\(|updateDoc\(|ASSIGN|UPDATE_STATUS|CLOSE_OBSERVATION/);
  assert.match(aiApi, /advisoryOnly: true/);
  assert.match(aiApi, /requiresExplicitHumanAction: true/);
  assert.match(aiApi, /automation: routed\.automation/);
  assert.match(aiApi, /persisted: !draftMode/);
  assert.match(aiApi, /patch: \{ aiAnalysis: persistedAiAnalysis \}/);
  assert.match(aiApi, /completeAiOperation\(/);
  const responsePath = aiApi.slice(aiApi.indexOf('const routed = await'), aiApi.indexOf('module.exports'));
  assert.doesNotMatch(responsePath, /(?:status|assignedContractorUid|assignedAt|closedAt)\s*:/);
});

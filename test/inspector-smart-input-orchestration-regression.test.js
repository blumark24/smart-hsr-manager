'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
const flowStart = dashboard.indexOf('window.processSmartInput = async function()');
const flowEnd = dashboard.indexOf('async function commitPendingSmartInput()', flowStart);
const flow = dashboard.slice(flowStart, flowEnd);

test('successful evidence upload is persisted before AI analysis starts', () => {
  const upload = flow.indexOf('uploadedUrl = await uploadImageToStorage');
  const pending = flow.indexOf('pendingSmartCapture={clientRequestId,uploadedUrl,aiDraft:null}');
  const analyze = flow.indexOf('aiDraft = await analyzeSmartCaptureDraft');
  assert.ok(upload > -1 && upload < pending && pending < analyze);
});

test('AI failure has dedicated messaging and does not render upload failure', () => {
  const aiStart = flow.indexOf('if(!aiDraft)');
  const aiEnd = flow.indexOf('const nextDisplayId', aiStart);
  const aiStage = flow.slice(aiStart, aiEnd);
  assert.match(aiStage, /showSmartCaptureAiFailure\(aiError\)/);
  assert.doesNotMatch(aiStage, /showUploadFailure|uploadFailureMessage/);
  assert.match(dashboard, /تم رفع صورة الملاحظة بنجاح/);
});

test('AI retry reuses pending object key and save remains review-only', () => {
  assert.match(dashboard, /pendingSmartCapture\?\.uploadedUrl/);
  assert.match(dashboard, /retrySmartCaptureAnalysis/);
  assert.doesNotMatch(dashboard.slice(dashboard.indexOf('window.retrySmartCaptureAnalysis'), dashboard.indexOf('function saveErrorHTML')), /uploadImageToStorage/);
  const render = flow.indexOf('renderSmartCaptureDraft(aiDraft)');
  const savePayload = flow.indexOf('pendingSmartInput = { payload, nextDisplayId, clientRequestId }');
  assert.ok(render > -1 && render < savePayload);
  assert.doesNotMatch(flow.slice(flow.indexOf('const payload = {'), savePayload), /aiAnalysis|assignedContractorUid|resolutionNote|afterImagePath/);
});

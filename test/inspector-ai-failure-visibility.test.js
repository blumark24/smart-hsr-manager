'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
const aiEndpoint = fs.readFileSync(path.join(__dirname, '..', 'api', 'ai', 'analyze.js'), 'utf8');

test('Inspector AI failure UI distinguishes tenant activation and provider outage', () => {
  assert.match(dashboard, /SMART_CAPTURE_AI_ERROR_MESSAGES/);
  assert.match(dashboard, /AI_APPLICATION_ORGANIZATION_NOT_ENABLED:'التحليل الذكي غير مفعّل لهذه المؤسسة/);
  assert.match(dashboard, /AI_PROVIDER_UNAVAILABLE:'مزوّد التحليل الذكي لا يستجيب/);
  assert.match(dashboard, /AI_RATE_LIMITED:'تم بلوغ الحد المؤقت/);
  assert.match(dashboard, /AI_STORAGE_READ_FAILED:'تعذر قراءة الصورة المحفوظة/);
});
test('AI draft failure displays only a sanitized diagnostic code without resending evidence', () => {
  assert.match(dashboard, /\^AI_\[A-Z0-9_\]\{1,64\}\$/);
  assert.match(dashboard, /smartCaptureAiErrorHTML\(message,diagnosticCode\)/);
  const retry = dashboard.slice(dashboard.indexOf('window.retrySmartCaptureAnalysis=function()'), dashboard.indexOf('function saveErrorHTML'));
  assert.match(retry, /pendingSmartCapture\?\.uploadedUrl/);
  assert.doesNotMatch(retry, /uploadImageToStorage/);
});
test('AI endpoint logs reason class but never user identifiers or image references', () => {
  const fail = aiEndpoint.slice(aiEndpoint.indexOf('function fail('), aiEndpoint.indexOf('function cleanId('));
  assert.match(fail, /console\.warn\('smart hsr ai analysis failed', \{ statusCode, errorCode \}\)/);
  assert.doesNotMatch(fail, /organizationId|uid|imageReference|apiKey|objectKey/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const state = require('../platform/ai/inspector-human-review-state');
const { createLocalPreviewSuggestion } = require('../platform/ai/inspector-human-review-preview-service');
const { AUTOMATION_PROHIBITIONS, INSPECTOR_OPTIONS, advisoryEnvelope } = require('../platform/ai/human-approval-policy');
const browser = require('../preview-only/inspector-human-review-preview');
const { MUNICIPAL_INTELLIGENCE_FIXTURES } = require('./fixtures/municipal-intelligence-fixtures');

const previewServiceSource = fs.readFileSync(path.join(__dirname, '..', 'platform', 'ai', 'inspector-human-review-preview-service.js'), 'utf8');
const browserControllerSource = fs.readFileSync(path.join(__dirname, '..', 'preview-only', 'inspector-human-review-preview.js'), 'utf8');

const NETWORK_MARKERS = ['fetch(', 'XMLHttpRequest', 'https://generativelanguage.googleapis.com', 'https://openrouter.ai', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY'];
const PROVIDER_ADAPTER_MARKERS = ['local-ai-gateway-service', 'provider-router', 'mock-ai-provider', 'gemini-compatible-vision-provider', 'openrouter-compatible-vision-provider', 'createGeminiCompatibleVisionProvider', 'createOpenRouterCompatibleVisionProvider', 'createProviderRouter', 'createLocalAIGatewayService'];
const PERSISTENCE_MARKERS = ['setDoc(', 'addDoc(', 'updateDoc(', 'deleteDoc(', 'saveObservationToFirestore', 'commitPendingSmartInput', 'localStorage.setItem', 'sessionStorage.setItem'];
const FIRESTORE_MARKERS = ['firebase', 'Firestore', 'getFirestore', 'collection(', 'getDocs(', 'onSnapshot('];
const SENSITIVE_MARKERS = ['apiKey', 'API_KEY', 'imageBytes', 'rawPrompt', 'controlledImagePayload', 'private_key'];

function fixtureSuggestion() {
  const fixture = MUNICIPAL_INTELLIGENCE_FIXTURES[0];
  return createLocalPreviewSuggestion({ analysis: fixture.analysis, organizationId: 'org-demo', observationId: 'obs-local' });
}

test('1. Inspector Preview never calls fetch() or any network transport', () => {
  for (const source of [previewServiceSource, browserControllerSource]) {
    for (const marker of NETWORK_MARKERS) assert.equal(source.includes(marker), false, `unexpected network marker "${marker}"`);
  }
});

test('2. Inspector Preview never calls any AI provider', () => {
  const requireCalls = [...previewServiceSource.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(match => match[1]);
  assert.deepEqual(requireCalls, ['../intelligence/municipal-intelligence-engine']);
  assert.deepEqual(Object.keys(require('../platform/ai/inspector-human-review-preview-service')), ['createLocalPreviewSuggestion']);
  const result = fixtureSuggestion();
  assert.equal(result.providerCalled, false);
  assert.equal(result.networkRequested, false);
});

test('3. Inspector Preview never references the Gemini or OpenRouter vision adapters', () => {
  for (const source of [previewServiceSource, browserControllerSource]) {
    for (const marker of PROVIDER_ADAPTER_MARKERS) assert.equal(source.includes(marker), false, `unexpected provider adapter marker "${marker}"`);
  }
});

test('4. Inspector Preview never persists data', () => {
  for (const source of [previewServiceSource, browserControllerSource]) {
    for (const marker of PERSISTENCE_MARKERS) assert.equal(source.includes(marker), false, `unexpected persistence marker "${marker}"`);
  }
  const result = fixtureSuggestion();
  assert.equal(result.persisted, false);
  let value = state.createHumanReviewState();
  value = state.beginAnalysis(value, { hasValidImage: true }).state;
  value = state.receiveSuggestion(value, result).state;
  value = state.useSuggestion(value, { replaceConfirmed: true }).state;
  assert.equal(value.persisted, false);
  assert.equal(value.executable, false);
});

test('5. Inspector Preview never calls Firestore functions', () => {
  for (const source of [previewServiceSource, browserControllerSource]) {
    for (const marker of FIRESTORE_MARKERS) assert.equal(source.includes(marker), false, `unexpected Firestore marker "${marker}"`);
  }
});

test('6. Provider, model, API key, and raw image bytes stay hidden from the preview boundary', () => {
  for (const source of [previewServiceSource, browserControllerSource]) {
    for (const marker of SENSITIVE_MARKERS) assert.equal(source.includes(marker), false, `unexpected sensitive marker "${marker}"`);
  }
  const result = fixtureSuggestion();
  assert.deepEqual(Object.keys(result.suggestion), ['shortSummaryAr']);
  const fixtureAnalysis = browser.localFixtureAnalysis({ name: 'case.jpg' });
  const serialized = JSON.stringify(fixtureAnalysis);
  for (const field of ['imageBytes', 'rawPrompt', 'apiKey', 'private_key', 'model']) assert.equal(serialized.includes(field), false);
  assert.equal('provider' in fixtureAnalysis, false);
  assert.equal('model' in fixtureAnalysis, false);
  assert.equal(fixtureAnalysis.provenance.providerHidden, true);
});

test('7. Inspector Preview remains advisory-only and requires explicit human action', () => {
  assert.deepEqual(Object.values(AUTOMATION_PROHIBITIONS).every(value => value === false), true);
  const envelope = advisoryEnvelope({ ok: true });
  assert.equal(envelope.advisoryOnly, true);
  assert.equal(envelope.requiresExplicitHumanAction, true);
  assert.deepEqual([...envelope.inspectorOptions].sort(), [...INSPECTOR_OPTIONS].sort());
  const result = fixtureSuggestion();
  let value = state.createHumanReviewState();
  value = state.beginAnalysis(value, { hasValidImage: true }).state;
  value = state.receiveSuggestion(value, result).state;
  assert.equal(value.mode, 'SUGGESTION_READY');
  assert.equal(value.executable, false);
  for (const marker of ['ASSIGN_CONTRACTOR', 'UPDATE_STATUS', 'SAVE_OBSERVATION']) assert.equal(browserControllerSource.includes(marker), false);
});

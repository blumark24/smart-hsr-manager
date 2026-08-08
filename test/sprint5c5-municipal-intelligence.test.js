'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEPARTMENTS, MULTI_ISSUE_OPTIONS } = require('../platform/intelligence/municipal-intelligence-contract');
const { MUNICIPAL_TAXONOMY, resolveTaxonomy } = require('../platform/intelligence/municipal-taxonomy');
const { resolveExplainablePriority } = require('../platform/intelligence/explainable-priority-resolver');
const { createMunicipalIntelligence, MAX_DETECTED_ISSUES } = require('../platform/intelligence/municipal-intelligence-engine');
const { createMultiIssueDecisionSession, selectIssues, ignoreIssues, editIssue, setFinalManualDecision } = require('../platform/intelligence/multi-issue-decision-contract');
const { issue, analysis, MUNICIPAL_INTELLIGENCE_FIXTURES } = require('./fixtures/municipal-intelligence-fixtures');

const context = Object.freeze({ organizationId: 'org-demo-a', observationId: 'obs-demo-1' });
const fixture = id => MUNICIPAL_INTELLIGENCE_FIXTURES.find(value => value.fixtureId === id);
const evaluate = id => createMunicipalIntelligence({ analysis: fixture(id).analysis, ...context });

test('fixture corpus contains exactly 30 deterministic local cases', () => {
  assert.equal(MUNICIPAL_INTELLIGENCE_FIXTURES.length, 30);
  assert.deepEqual(MUNICIPAL_INTELLIGENCE_FIXTURES.reduce((counts, value) => ({ ...counts, [value.kind]: (counts[value.kind] || 0) + 1 }), {}), { SINGLE: 17, MULTI: 6, EDGE: 7 });
});

test('taxonomy codes are unique, Arabic-labelled, and mapped to known departments', () => {
  assert.equal(new Set(MUNICIPAL_TAXONOMY.map(value => value.code)).size, MUNICIPAL_TAXONOMY.length);
  for (const entry of MUNICIPAL_TAXONOMY) {
    assert.match(entry.labelAr, /[\u0600-\u06ff]/);
    assert.ok(Object.hasOwn(DEPARTMENTS, entry.department));
    assert.equal(typeof entry.humanReviewRequired, 'boolean');
  }
});

test('unsupported taxonomy values fail closed to UNKNOWN', () => {
  assert.equal(resolveTaxonomy('not-real').code, 'UNKNOWN');
  assert.equal(resolveTaxonomy(null).responseWindow, 'MANUAL_REVIEW_REQUIRED');
});

for (const [id, code, department] of [
  ['single-1', 'ASPHALT_POTHOLE', 'ROADS'],
  ['single-4', 'LEANING_LIGHTING_POLE', 'LIGHTING'],
  ['single-6', 'FALLEN_PALM_TREE', 'PARKS_AND_LANDSCAPING'],
  ['single-8', 'CONSTRUCTION_WASTE', 'CLEANLINESS'],
  ['single-14', 'OPEN_MANHOLE', 'MUNICIPAL_ASSETS'],
]) {
  test(`single issue ${code} resolves to its municipal owner`, () => {
    const result = evaluate(id);
    assert.equal(result.ok, true);
    assert.equal(result.intelligence.primaryIssue.issueCode, code);
    assert.equal(result.intelligence.suggestedDepartment, department);
    assert.equal(result.intelligence.requiresHumanReview, true);
  });
}

test('multi-issue result preserves detected issues and selects the highest-risk primary', () => {
  const result = evaluate('multi-pothole-pole');
  assert.equal(result.ok, true);
  assert.equal(result.intelligence.multipleIssuesDetected, true);
  assert.equal(result.intelligence.detectedIssues.length, 2);
  assert.equal(result.intelligence.primaryIssue.issueCode, 'LEANING_LIGHTING_POLE');
  assert.ok(result.intelligence.prioritySuggestion.reasonsAr.length > 1);
});

test('same-code detections are deduplicated using highest confidence', () => {
  const result = evaluate('edge-duplicate');
  assert.equal(result.intelligence.detectedIssues.length, 1);
  assert.equal(result.intelligence.detectedIssues[0].confidence, 0.95);
  assert.ok(result.intelligence.warnings.includes('DUPLICATE_ISSUES_SUPPRESSED'));
});

test('low-confidence secondary issue is retained but cannot be auto-selected', () => {
  const result = evaluate('edge-low-secondary');
  const secondary = result.intelligence.detectedIssues.find(value => value.issueCode === 'DAMAGED_SIGN');
  assert.ok(secondary.warnings.includes('LOW_CONFIDENCE_NOT_AUTO_SELECTABLE'));
  assert.ok(result.intelligence.warnings.includes('LOW_CONFIDENCE_SECONDARY_REQUIRES_REVIEW'));
  const session = createMultiIssueDecisionSession({ sessionId: 'session-1', intelligence: result.intelligence }).session;
  assert.equal(selectIssues(session, result.intelligence, [secondary.issueId]).allowed, false);
});

test('provider department conflict is overridden by canonical taxonomy', () => {
  const result = evaluate('edge-conflicting-department');
  assert.equal(result.intelligence.suggestedDepartment, 'ROADS');
  assert.ok(result.intelligence.warnings.includes('PROVIDER_DEPARTMENT_SUGGESTION_OVERRIDDEN_BY_TAXONOMY'));
});

test('malformed provider result is denied deterministically', () => {
  const result = evaluate('edge-malformed');
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'MUNICIPAL_ANALYSIS_ISSUE_INVALID');
});

test('unsupported and unclear observations require manual review', () => {
  for (const id of ['edge-unclear', 'edge-non-municipal', 'edge-unsupported-category']) {
    const result = evaluate(id);
    assert.equal(result.ok, true);
    assert.equal(result.intelligence.primaryIssue.issueCode, 'UNKNOWN');
    assert.equal(result.intelligence.suggestedResponseWindow, 'MANUAL_REVIEW_REQUIRED');
    assert.equal(result.intelligence.prioritySuggestion.prioritySuggestion, 'UNKNOWN');
  }
});

test('priority resolver escalates public-safety and electrical risk explainably', () => {
  const resolved = resolveExplainablePriority({ severity: 'CRITICAL', riskIndicators: ['PUBLIC_SAFETY', 'ELECTRICAL_HAZARD'], confidence: 0.98, imageQuality: 'GOOD' });
  assert.equal(resolved.prioritySuggestion, 'URGENT');
  assert.equal(resolved.score, 100);
  assert.ok(resolved.reasonsAr.every(reason => /[\u0600-\u06ff]/.test(reason)));
});

test('poor evidence and low confidence lower certainty and require review', () => {
  const resolved = resolveExplainablePriority({ severity: 'HIGH', riskIndicators: [], confidence: 0.4, imageQuality: 'POOR' });
  assert.equal(resolved.requiresHumanReview, true);
  assert.ok(resolved.score < 60);
  assert.ok(resolved.reasonsAr.length >= 3);
});

test('issue count is capped and reported without provider-controlled expansion', () => {
  const raw = Array.from({ length: 7 }, (_, index) => issue(['ASPHALT_POTHOLE','ROAD_CRACKING','GROUND_SUBSIDENCE','LEANING_LIGHTING_POLE','FALLEN_PALM_TREE','CONSTRUCTION_WASTE','OPEN_MANHOLE'][index]));
  const result = createMunicipalIntelligence({ analysis: analysis('a-cap', raw), ...context });
  assert.equal(result.intelligence.detectedIssues.length, MAX_DETECTED_ISSUES);
  assert.ok(result.intelligence.warnings.includes('MAX_ISSUES_TRUNCATED'));
});

test('multi-issue decisions remain advisory, immutable, and non-persistent', () => {
  const intelligence = evaluate('multi-palm-sidewalk').intelligence;
  const created = createMultiIssueDecisionSession({ sessionId: 'session-2', intelligence });
  assert.equal(created.allowed, true);
  assert.equal(created.session.persisted, false);
  assert.equal(created.session.executable, false);
  assert.equal(created.session.automaticObservationCreation, false);
  assert.ok(Object.isFrozen(created.session));
  const ids = intelligence.detectedIssues.map(value => value.issueId);
  const selected = selectIssues(created.session, intelligence, ids);
  const ignored = ignoreIssues(selected.session, intelligence, [ids[1]]);
  const edited = editIssue(ignored.session, intelligence, ids[0], 'تم تعديل الوصف يدوياً بعد التحقق الميداني.');
  const final = setFinalManualDecision(edited.session, 'CREATE_SINGLE');
  assert.equal(final.allowed, true);
  assert.equal(final.session.finalManualDecision, 'CREATE_SINGLE');
  assert.deepEqual(MULTI_ISSUE_OPTIONS, ['CREATE_SINGLE','CREATE_MULTIPLE','IGNORE_SECONDARY','MANUAL_REVIEW']);
});

test('invalid issue IDs and invalid manual decisions are denied', () => {
  const intelligence = evaluate('multi-sign-visual').intelligence;
  const session = createMultiIssueDecisionSession({ sessionId: 'session-3', intelligence }).session;
  assert.equal(selectIssues(session, intelligence, ['unknown-id']).allowed, false);
  assert.equal(ignoreIssues(session, intelligence, ['unknown-id']).allowed, false);
  assert.equal(editIssue(session, intelligence, 'unknown-id', 'وصف').allowed, false);
  assert.equal(setFinalManualDecision(session, 'AUTO_CREATE').allowed, false);
});

test('outputs contain no executable workflow or persistence commands', () => {
  for (const value of MUNICIPAL_INTELLIGENCE_FIXTURES.filter(item => item.fixtureId !== 'edge-malformed')) {
    const result = createMunicipalIntelligence({ analysis: value.analysis, ...context });
    assert.equal(result.ok, true);
    const serialized = JSON.stringify(result).toUpperCase();
    for (const forbidden of ['SAVE_OBSERVATION','CREATE_OBSERVATION','ASSIGN_CONTRACTOR','UPDATE_STATUS','DELETE']) assert.equal(serialized.includes(forbidden), false);
    assert.equal(result.intelligence.provenance.advisoryOnly, true);
    assert.equal(result.intelligence.provenance.automaticActions, false);
  }
});

test('image bytes, raw prompts, secrets, and executable actions are rejected', () => {
  const base = fixture('single-1').analysis;
  assert.equal(createMunicipalIntelligence({ analysis: { ...base, imageBytes: 'bytes' }, ...context }).errorCode, 'MUNICIPAL_ANALYSIS_SENSITIVE_INPUT');
  assert.equal(createMunicipalIntelligence({ analysis: { ...base, rawPrompt: 'prompt' }, ...context }).errorCode, 'MUNICIPAL_ANALYSIS_SENSITIVE_INPUT');
  for (const recommendedActionAr of ['API_KEY=secret', 'SAVE_OBSERVATION']) {
    const unsafe = analysis(`unsafe-${recommendedActionAr}`, issue('ASPHALT_POTHOLE', { recommendedActionAr }));
    assert.equal(createMunicipalIntelligence({ analysis: unsafe, ...context }).errorCode, 'MUNICIPAL_ANALYSIS_UNSAFE');
  }
});

test('missing tenant or observation context is denied', () => {
  const input = fixture('single-1').analysis;
  assert.equal(createMunicipalIntelligence({ analysis: input, organizationId: '', observationId: 'obs' }).ok, false);
  assert.equal(createMunicipalIntelligence({ analysis: input, organizationId: 'org', observationId: '' }).ok, false);
});

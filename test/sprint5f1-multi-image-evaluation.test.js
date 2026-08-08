'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EXIT, parseArguments, run } = require('../scripts/evaluate-multi-image-vision-local');

const validEnvironment = Object.freeze({
  GEMINI_API_KEY: 'unit-secret-never-output',
  REAL_VISION_LOCAL_EVALUATION: 'true',
  SYNTHETIC_DATA_ONLY: 'true',
  VISION_PROVIDER: 'gemini',
});

const validProviderOutput = Object.freeze({
  shortSummaryAr: 'تم رصد حفرة تتطلب إصلاح فوري.',
  categoryCode: 'ASPHALT_POTHOLE',
  categoryLabelAr: 'Asphalt pothole (placeholder)',
  subcategoryCode: null,
  subcategoryLabelAr: null,
  severity: 'HIGH',
  severityScore: 78,
  prioritySuggestion: 'URGENT',
  responsibleDepartmentSuggestion: 'Roads department (placeholder)',
  recommendedActionAr: 'Secure the site and repair the surface (placeholder).',
  confidence: 0.94,
  imageQuality: 'GOOD',
  requiresHumanReview: true,
  warnings: [],
});

function temporaryRepositoryWithFixtures(count) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-hsr-5f1-'));
  const fixtureDirectory = path.join(root, 'test', 'fixtures', 'vision');
  fs.mkdirSync(fixtureDirectory, { recursive: true });
  const relativePaths = [];
  for (let index = 0; index < count; index += 1) {
    const fileName = `local-fixture-${index + 1}.jpg`;
    fs.writeFileSync(path.join(fixtureDirectory, fileName), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    relativePaths.push(`test/fixtures/vision/${fileName}`);
  }
  return { root, relativePaths };
}

function argsFor(relativePaths, { model = 'gemini-3.6-flash', outputDir = 'evaluation/test-output' } = {}) {
  const args = [];
  for (const fixturePath of relativePaths) args.push('--fixture', fixturePath);
  args.push('--model', model, '--output-dir', outputDir);
  return args;
}

const expectCode = (operation, code) => assert.throws(operation, error => error?.code === code && error?.exitCode === EXIT.VALIDATION);

test('module exports a minimal API surface', () => {
  assert.deepEqual(Object.keys(require('../scripts/evaluate-multi-image-vision-local')).sort(), ['EXIT', 'parseArguments', 'run']);
});

test('at least one fixture is required', () => {
  expectCode(() => parseArguments(['--model', 'gemini-3.6-flash', '--output-dir', 'out']), 'AT_LEAST_ONE_FIXTURE_REQUIRED');
});

test('more than eight fixtures are rejected', () => {
  const { relativePaths } = temporaryRepositoryWithFixtures(9);
  expectCode(() => parseArguments(argsFor(relativePaths)), 'TOO_MANY_FIXTURES');
});

test('exactly eight fixtures are accepted by argument parsing', () => {
  const { relativePaths } = temporaryRepositoryWithFixtures(8);
  const parsed = parseArguments(argsFor(relativePaths));
  assert.equal(parsed.fixtures.length, 8);
});

test('duplicate fixture paths are rejected', () => {
  const { relativePaths } = temporaryRepositoryWithFixtures(1);
  expectCode(() => parseArguments(argsFor([relativePaths[0], relativePaths[0]])), 'DUPLICATE_FIXTURE');
});

test('model and output-dir remain mandatory', () => {
  const { relativePaths } = temporaryRepositoryWithFixtures(1);
  expectCode(() => parseArguments(['--fixture', relativePaths[0], '--output-dir', 'out']), 'MODEL_REQUIRED');
  expectCode(() => parseArguments(['--fixture', relativePaths[0], '--model', 'gemini-3.6-flash']), 'OUTPUT_DIRECTORY_REQUIRED');
});

test('unknown or malformed CLI arguments are rejected', () => {
  expectCode(() => parseArguments(['--unknown', 'value', '--model', 'gemini-3.6-flash', '--output-dir', 'out']), 'CLI_ARGUMENT_INVALID');
});

test('fixture path traversal and absolute paths fail closed before any transport call', async () => {
  const { root } = temporaryRepositoryWithFixtures(1);
  let calls = 0;
  await assert.rejects(
    () => run(argsFor(['../outside.jpg']), { repositoryRoot: root, readEnvironment: () => validEnvironment, isEnvironmentIgnored: () => true, transport: async () => { calls += 1; } }),
    error => error?.code === 'FIXTURE_PATH_DENIED',
  );
  assert.equal(calls, 0);
});

test('missing environment requirements fail before any transport call', async () => {
  const { root, relativePaths } = temporaryRepositoryWithFixtures(2);
  let calls = 0;
  await assert.rejects(
    () => run(argsFor(relativePaths), { repositoryRoot: root, readEnvironment: () => ({ ...validEnvironment, GEMINI_API_KEY: '' }), isEnvironmentIgnored: () => true, transport: async () => { calls += 1; } }),
    error => error?.code === 'GEMINI_API_KEY_REQUIRED',
  );
  assert.equal(calls, 0);
});

test('successful multi-fixture run calls transport exactly once per fixture and writes sanitized aggregate output', async () => {
  const { root, relativePaths } = temporaryRepositoryWithFixtures(3);
  let calls = 0;
  const transport = async () => {
    calls += 1;
    return Object.freeze({ ok: true, status: 200, body: { modelVersion: 'offline', candidates: [{ content: { parts: [{ text: JSON.stringify(validProviderOutput) }] } }] } });
  };
  const outcome = await run(argsFor(relativePaths), { repositoryRoot: root, readEnvironment: () => validEnvironment, isEnvironmentIgnored: () => true, transport });

  assert.equal(outcome.exitCode, EXIT.SUCCESS);
  assert.equal(calls, 3);
  assert.equal(outcome.perFixture.length, 3);
  assert.equal(outcome.aggregate.fixtureCount, 3);
  assert.equal(outcome.aggregate.successRate, 1);
  assert.equal(outcome.aggregate.schemaPassRate, 1);
  assert.equal(outcome.aggregate.arabicSummaryPassRate, 1);
  assert.equal(Number.isFinite(outcome.aggregate.averageLatencyMs), true);
  assert.equal(Number.isFinite(outcome.aggregate.medianLatencyMs), true);
  assert.equal(Number.isFinite(outcome.aggregate.maxLatencyMs), true);
  assert.equal(outcome.aggregate.maxLatencyMs >= outcome.aggregate.medianLatencyMs, true);
  // No independent ground truth exists yet, so category/severity/department
  // metrics correctly reflect zero labeled cases rather than a fabricated score.
  assert.deepEqual(outcome.aggregate.groundTruthLabeledCaseIds, []);
  assert.equal(outcome.aggregate.categoryAccuracy, 0);
  assert.equal(outcome.aggregate.severityAgreement, 0);
  assert.equal(outcome.aggregate.departmentAgreement, null);
  assert.equal(outcome.aggregate.hallucinationRate, null);
  assert.deepEqual(outcome.aggregate.hallucinationFlaggedCaseIds, []);

  const resultsJson = fs.readFileSync(path.join(root, 'evaluation', 'test-output', 'multi-image-results.sanitized.json'), 'utf8');
  const metricsJson = fs.readFileSync(path.join(root, 'evaluation', 'test-output', 'multi-image-metrics.sanitized.json'), 'utf8');
  assert.equal(resultsJson.includes(validEnvironment.GEMINI_API_KEY), false);
  assert.equal(resultsJson.includes('controlledImagePayload'), false);
  assert.equal(metricsJson.includes(validEnvironment.GEMINI_API_KEY), false);
});

test('a failing fixture does not stop the batch and is not retried', async () => {
  const { root, relativePaths } = temporaryRepositoryWithFixtures(2);
  let calls = 0;
  const transport = async () => {
    calls += 1;
    if (calls === 1) return Object.freeze({ ok: false, status: 503, body: null });
    return Object.freeze({ ok: true, status: 200, body: { modelVersion: 'offline', candidates: [{ content: { parts: [{ text: JSON.stringify(validProviderOutput) }] } }] } });
  };
  const outcome = await run(argsFor(relativePaths), { repositoryRoot: root, readEnvironment: () => validEnvironment, isEnvironmentIgnored: () => true, transport });

  assert.equal(calls, 2);
  assert.equal(outcome.exitCode, EXIT.OUTPUT);
  assert.equal(outcome.perFixture[0].success, false);
  assert.equal(outcome.perFixture[1].success, true);
});

test('runner reuses the existing Sprint 5E single-fixture module and contains no Firebase, browser, manifest, or fallback provider imports', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'evaluate-multi-image-vision-local.js'), 'utf8');
  assert.match(source, /require\(['"]\.\/evaluate-single-gemini-vision-local['"]\)/);
  assert.doesNotMatch(source, /require\([^)]*(?:firebase|firestore|openrouter|vision-evaluation-manifest)/i);
  assert.doesNotMatch(source, /\b(?:window|document)\b/);
  assert.match(source, /createGeminiCompatibleVisionProvider/);
  assert.equal((source.match(/\bfetch\(/g) || []).length, 1);
  assert.doesNotMatch(source, /\/models(?:\?|['"`])/);
});

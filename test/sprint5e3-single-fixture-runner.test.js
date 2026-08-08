'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  EXIT, parseArguments, resolveRepositoryPath, validateEnvironment, validateFixture, run,
} = require('../scripts/evaluate-single-gemini-vision-local');

const validEnvironment = Object.freeze({
  GEMINI_API_KEY: 'unit-secret-never-output',
  REAL_VISION_LOCAL_EVALUATION: 'true',
  SYNTHETIC_DATA_ONLY: 'true',
  VISION_PROVIDER: 'gemini',
});
const validArguments = Object.freeze([
  '--fixture', 'test/fixtures/vision/asphalt-pothole.jpg',
  '--model', 'gemini-2.5-flash',
  '--max-calls', '1',
  '--output-dir', 'evaluation/test-output',
]);
const validProviderOutput = Object.freeze({
  shortSummaryAr: 'تم رصد حفرة أسفلتية تتطلب معالجة عاجلة لحماية مستخدمي الطريق.',
  categoryCode: 'ASPHALT_POTHOLE',
  categoryLabelAr: 'حفرة أسفلتية',
  subcategoryCode: null,
  subcategoryLabelAr: null,
  severity: 'HIGH',
  severityScore: 78,
  prioritySuggestion: 'URGENT',
  responsibleDepartmentSuggestion: 'إدارة صيانة الطرق',
  recommendedActionAr: 'تأمين الموقع وإصلاح طبقات الأسفلت المتضررة.',
  confidence: 0.94,
  imageQuality: 'GOOD',
  requiresHumanReview: true,
  warnings: [],
});

function temporaryRepository(extension = '.jpg') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-hsr-5e3-'));
  const fixtureDirectory = path.join(root, 'test', 'fixtures', 'vision');
  fs.mkdirSync(fixtureDirectory, { recursive: true });
  const fixture = path.join(fixtureDirectory, `asphalt-pothole${extension}`);
  fs.writeFileSync(fixture, extension === '.jpg' ? Buffer.from([0xff, 0xd8, 0xff, 0xd9]) : Buffer.from('unsupported'));
  return root;
}

const expectCode = (operation, code) => assert.throws(operation, error => error?.code === code && error?.exitCode === EXIT.VALIDATION);

test('max-calls is mandatory and must equal one', () => {
  expectCode(() => parseArguments(validArguments.filter((_, index) => ![4, 5].includes(index))), 'MAX_CALLS_MUST_EQUAL_ONE');
  expectCode(() => parseArguments(validArguments.map(value => value === '1' ? '2' : value)), 'MAX_CALLS_MUST_EQUAL_ONE');
});

test('fixture and explicit model are mandatory', () => {
  expectCode(() => parseArguments(validArguments.slice(2)), 'FIXTURE_REQUIRED');
  expectCode(() => parseArguments(validArguments.filter((_, index) => ![2, 3].includes(index))), 'MODEL_REQUIRED');
});

test('repository path traversal and absolute paths fail closed', () => {
  const root = temporaryRepository();
  expectCode(() => resolveRepositoryPath(root, '../outside.jpg', 'FIXTURE_PATH_DENIED'), 'FIXTURE_PATH_DENIED');
  expectCode(() => resolveRepositoryPath(root, path.resolve(root, 'file.jpg'), 'FIXTURE_PATH_DENIED'), 'FIXTURE_PATH_DENIED');
});

test('missing and unsupported fixtures fail before transport', () => {
  const root = temporaryRepository('.txt');
  expectCode(() => validateFixture(path.join(root, 'missing.jpg')), 'FIXTURE_MISSING');
  expectCode(() => validateFixture(path.join(root, 'test', 'fixtures', 'vision', 'asphalt-pothole.txt')), 'FIXTURE_MIME_UNSUPPORTED');
});

test('environment requires key, Gemini, synthetic-only, and ignored env file', () => {
  expectCode(() => validateEnvironment({ ...validEnvironment, GEMINI_API_KEY: '' }, true), 'GEMINI_API_KEY_REQUIRED');
  expectCode(() => validateEnvironment({ ...validEnvironment, VISION_PROVIDER: 'other' }, true), 'GEMINI_PROVIDER_REQUIRED');
  expectCode(() => validateEnvironment({ ...validEnvironment, SYNTHETIC_DATA_ONLY: 'false' }, true), 'SYNTHETIC_DATA_ONLY_REQUIRED');
  expectCode(() => validateEnvironment(validEnvironment, false), 'ENV_FILE_MUST_BE_GIT_IGNORED');
});

test('valid configuration reaches mocked transport exactly once and writes sanitized output', async () => {
  const repositoryRoot = temporaryRepository();
  let calls = 0;
  const transport = async () => {
    calls += 1;
    return Object.freeze({ ok: true, status: 200, body: { modelVersion: 'offline', candidates: [{ content: { parts: [{ text: JSON.stringify(validProviderOutput) }] } }] } });
  };
  const outcome = await run(validArguments, { repositoryRoot, readEnvironment: () => validEnvironment, isEnvironmentIgnored: () => true, transport });
  assert.equal(outcome.exitCode, EXIT.SUCCESS);
  assert.equal(calls, 1);
  assert.equal(outcome.record.apiCallCount, 1);
  const output = fs.readFileSync(path.join(repositoryRoot, 'evaluation', 'test-output', 'single-result.sanitized.json'), 'utf8');
  assert.equal(output.includes(validEnvironment.GEMINI_API_KEY), false);
  assert.equal(output.includes('controlledImagePayload'), false);
});

test('provider failure is attempted once with no retry', async () => {
  const repositoryRoot = temporaryRepository();
  let calls = 0;
  const outcome = await run(validArguments, { repositoryRoot, readEnvironment: () => validEnvironment, isEnvironmentIgnored: () => true, transport: async () => { calls += 1; return { ok: false, status: 503, body: null }; } });
  assert.equal(outcome.exitCode, EXIT.PROVIDER);
  assert.equal(calls, 1);
  assert.equal(outcome.record.apiCallCount, 1);
});

test('validation failure makes no transport call', async () => {
  const repositoryRoot = temporaryRepository();
  let calls = 0;
  await assert.rejects(() => run(validArguments, { repositoryRoot, readEnvironment: () => ({ ...validEnvironment, GEMINI_API_KEY: '' }), isEnvironmentIgnored: () => true, transport: async () => { calls += 1; } }), error => error?.code === 'GEMINI_API_KEY_REQUIRED');
  assert.equal(calls, 0);
});

test('runner contains no Firebase, browser, manifest, or fallback provider imports', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'evaluate-single-gemini-vision-local.js'), 'utf8');
  assert.doesNotMatch(source, /require\([^)]*(?:firebase|firestore|openrouter|vision-evaluation-manifest)/i);
  assert.doesNotMatch(source, /\b(?:window|document)\b/);
  assert.match(source, /createGeminiCompatibleVisionProvider/);
  assert.equal((source.match(/\bfetch\(/g) || []).length, 1);
  assert.doesNotMatch(source, /\/models(?:\?|['"`])/);
});

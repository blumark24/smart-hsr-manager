'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createGeminiCompatibleVisionProvider } = require('../platform/ai/server/gemini-compatible-vision-provider');
const { validateShortSummaryAr } = require('../platform/ai/arabic-summary-policy');
const { buildProviderComparison } = require('../platform/ai/server/vision-evaluation-metrics');
const {
  EXIT, RunnerError, resolveRepositoryPath, readLocalEnvironment, validateEnvironment, validateFixture,
  decodeJsonResponseUtf8, sanitizeResult,
} = require('./evaluate-single-gemini-vision-local');
const LOCAL_GROUND_TRUTH = require('../test/fixtures/vision-local-ground-truth');

const MAX_FIXTURES = 8;

function parseArguments(argv = []) {
  const fixtures = [];
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith('--') || value === undefined || value.startsWith('--')) throw new RunnerError('CLI_ARGUMENT_INVALID', EXIT.VALIDATION);
    const name = token.slice(2);
    if (name === 'fixture') { fixtures.push(value); continue; }
    if (!['model', 'output-dir'].includes(name) || Object.hasOwn(values, name)) throw new RunnerError('CLI_ARGUMENT_INVALID', EXIT.VALIDATION);
    values[name] = value;
  }
  if (!fixtures.length) throw new RunnerError('AT_LEAST_ONE_FIXTURE_REQUIRED', EXIT.VALIDATION);
  if (fixtures.length > MAX_FIXTURES) throw new RunnerError('TOO_MANY_FIXTURES', EXIT.VALIDATION);
  if (new Set(fixtures).size !== fixtures.length) throw new RunnerError('DUPLICATE_FIXTURE', EXIT.VALIDATION);
  if (!values.model || !/^[A-Za-z0-9._-]{1,128}$/.test(values.model)) throw new RunnerError('MODEL_REQUIRED', EXIT.VALIDATION);
  if (!values['output-dir']) throw new RunnerError('OUTPUT_DIRECTORY_REQUIRED', EXIT.VALIDATION);
  return Object.freeze({ fixtures: Object.freeze(fixtures), model: values.model, outputDirectory: values['output-dir'] });
}

function isEnvironmentIgnored(repositoryRoot) {
  try {
    execFileSync('git', ['check-ignore', '-q', '.env.local'], { cwd: repositoryRoot, stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

// Pure network transport: no state, no counting, no limit logic. All call
// accounting lives in exactly one place — the wrapper built in run() below —
// regardless of whether this real transport or a test-injected one is used.
function createRealTransport() {
  return async request => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal,
      });
      const body = await decodeJsonResponseUtf8(response);
      return Object.freeze({ ok: response.ok, status: response.status, body });
    } finally {
      clearTimeout(timer);
    }
  };
}

function writeSanitizedArtifacts(outputDirectory, aggregate, perFixture) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const writeUtf8 = (fileName, value) => fs.writeFileSync(path.join(outputDirectory, fileName), Buffer.from(value, 'utf8'), { flag: 'wx' });
  writeUtf8('multi-image-results.sanitized.json', `${JSON.stringify(perFixture, null, 2)}\n`);
  writeUtf8('multi-image-metrics.sanitized.json', `${JSON.stringify(aggregate, null, 2)}\n`);
}

async function run(argv, dependencies = {}) {
  const repositoryRoot = dependencies.repositoryRoot || path.resolve(__dirname, '..');
  const args = parseArguments(argv);
  const outputDirectory = resolveRepositoryPath(repositoryRoot, args.outputDirectory, 'OUTPUT_PATH_DENIED');
  const envPath = path.join(repositoryRoot, '.env.local');
  const values = (dependencies.readEnvironment || readLocalEnvironment)(envPath);
  const envIgnored = (dependencies.isEnvironmentIgnored || isEnvironmentIgnored)(repositoryRoot);
  validateEnvironment(values, envIgnored);

  const resolved = args.fixtures.map(relativePath => ({
    relativePath,
    absolutePath: resolveRepositoryPath(repositoryRoot, relativePath, 'FIXTURE_PATH_DENIED'),
  }));
  const validated = resolved.map(entry => ({ ...entry, fixture: validateFixture(entry.absolutePath) }));

  // Single source of truth for call accounting: exactly one increment, one
  // limit check, applied identically whether `dependencies.transport` (tests)
  // or the real fetch-based transport is in use.
  const state = { calls: 0, maxCalls: validated.length };
  const baseTransport = dependencies.transport || createRealTransport();
  const providerFactory = dependencies.providerFactory || createGeminiCompatibleVisionProvider;
  const provider = providerFactory({
    enabled: true,
    environment: {
      GEMINI_API_KEY: values.GEMINI_API_KEY,
      GEMINI_VISION_MODEL: args.model,
      SMART_HSR_REAL_AI_EVALUATION: 'true',
      SMART_HSR_SYNTHETIC_DATA_ONLY: 'true',
      SMART_HSR_AI_PROVIDER: 'gemini',
      SMART_HSR_NO_APP_INTEGRATION: 'true',
    },
    transport: async request => {
      state.calls += 1;
      if (state.calls > state.maxCalls) throw new RunnerError('CALL_LIMIT_EXCEEDED', EXIT.PROVIDER);
      return baseTransport(request);
    },
    timeoutMs: 45000,
  });

  const perFixture = [];
  const cases = [];
  const groundTruth = {};
  const records = [];

  for (const entry of validated) {
    const caseId = path.basename(entry.relativePath);
    cases.push(Object.freeze({ caseId }));
    if (LOCAL_GROUND_TRUTH[caseId]) groundTruth[caseId] = LOCAL_GROUND_TRUTH[caseId];
    const started = Date.now();
    const result = await provider.analyzeObservationImage({
      organizationId: 'synthetic-evaluation',
      observationId: `multi-local-${caseId}`,
      actorId: 'local-evaluation-runner',
      actorRole: 'test',
      correlationId: `multi-local-${caseId}`,
      imageReference: null,
      imageContentType: entry.fixture.mimeType,
      controlledImagePayload: entry.fixture.bytes,
      existingDescription: '',
      locationContext: null,
    });
    const latencyMs = Date.now() - started;
    const summary = result.ok ? validateShortSummaryAr(result.shortSummaryAr, { confidence: result.confidence }) : null;
    perFixture.push(Object.freeze({
      caseId, fixturePath: entry.relativePath.replace(/\\/g, '/'), model: args.model,
      success: result.ok, latencyMs, schemaValidation: result.ok, arabicSummaryValidation: Boolean(summary?.allowed),
      structuredResult: sanitizeResult(result), errorCode: result.ok ? null : result.errorCode,
    }));
    // The full normalized `result` (never the raw provider response, never API
    // key/prompt/image bytes) stays in memory only, for aggregate scoring;
    // only the stricter `sanitizeResult()` view above is ever written to disk.
    records.push({ caseId, latencyMs, result, hallucinated: null, approximateCostUsd: null });
  }

  const aggregate = buildProviderComparison({ provider: 'GEMINI_COMPATIBLE', model: args.model, cases, groundTruth, records });
  const groundTruthLabeledCaseIds = Object.freeze(cases.map(c => c.caseId).filter(caseId => groundTruth[caseId]));
  const reportedAggregate = Object.freeze({ ...aggregate, groundTruthLabeledCaseIds, fixtureCount: validated.length });
  writeSanitizedArtifacts(outputDirectory, reportedAggregate, perFixture);

  const allSucceeded = perFixture.every(entry => entry.success && entry.arabicSummaryValidation);
  return Object.freeze({ exitCode: allSucceeded ? EXIT.SUCCESS : EXIT.OUTPUT, aggregate: reportedAggregate, perFixture });
}

async function main() {
  try {
    const outcome = await run(process.argv.slice(2));
    process.stdout.write(`Multi-image Gemini evaluation completed: fixtures=${outcome.perFixture.length}; successRate=${outcome.aggregate.successRate}\n`);
    process.exitCode = outcome.exitCode;
  } catch (error) {
    process.stderr.write(`Multi-image Gemini evaluation stopped: ${error?.code || 'RUNNER_FAILURE'}\n`);
    process.exitCode = error?.exitCode || EXIT.PROVIDER;
  }
}

if (require.main === module) main();

module.exports = Object.freeze({ EXIT, parseArguments, run });

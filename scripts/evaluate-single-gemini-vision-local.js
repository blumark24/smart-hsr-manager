'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createGeminiCompatibleVisionProvider } = require('../platform/ai/server/gemini-compatible-vision-provider');
const { validateShortSummaryAr } = require('../platform/ai/arabic-summary-policy');

const EXIT = Object.freeze({ SUCCESS: 0, VALIDATION: 2, PROVIDER: 3, OUTPUT: 4 });
const ALLOWED_ARGUMENTS = Object.freeze(['fixture', 'model', 'max-calls', 'output-dir']);

class RunnerError extends Error {
  constructor(code, exitCode) {
    super(code);
    this.name = 'RunnerError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function parseArguments(argv = []) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith('--') || value === undefined || value.startsWith('--')) throw new RunnerError('CLI_ARGUMENT_INVALID', EXIT.VALIDATION);
    const name = token.slice(2);
    if (!ALLOWED_ARGUMENTS.includes(name) || Object.hasOwn(values, name)) throw new RunnerError('CLI_ARGUMENT_INVALID', EXIT.VALIDATION);
    values[name] = value;
  }
  if (values['max-calls'] !== '1') throw new RunnerError('MAX_CALLS_MUST_EQUAL_ONE', EXIT.VALIDATION);
  if (!values.fixture) throw new RunnerError('FIXTURE_REQUIRED', EXIT.VALIDATION);
  if (!values.model || !/^[A-Za-z0-9._-]{1,128}$/.test(values.model)) throw new RunnerError('MODEL_REQUIRED', EXIT.VALIDATION);
  if (!values['output-dir']) throw new RunnerError('OUTPUT_DIRECTORY_REQUIRED', EXIT.VALIDATION);
  return Object.freeze(values);
}

function resolveRepositoryPath(repositoryRoot, relativePath, code) {
  if (!relativePath || path.isAbsolute(relativePath)) throw new RunnerError(code, EXIT.VALIDATION);
  const resolved = path.resolve(repositoryRoot, relativePath);
  const relative = path.relative(repositoryRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new RunnerError(code, EXIT.VALIDATION);
  return resolved;
}

function readLocalEnvironment(envPath) {
  if (!fs.existsSync(envPath)) throw new RunnerError('ENV_FILE_MISSING', EXIT.VALIDATION);
  const values = {};
  for (const line of fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    values[match[1]] = match[2].replace(/^(?:'|")|(?:'|")$/g, '');
  }
  return values;
}

function validateEnvironment(values, envIgnored) {
  if (!envIgnored) throw new RunnerError('ENV_FILE_MUST_BE_GIT_IGNORED', EXIT.VALIDATION);
  if (!values.GEMINI_API_KEY) throw new RunnerError('GEMINI_API_KEY_REQUIRED', EXIT.VALIDATION);
  if (String(values.REAL_VISION_LOCAL_EVALUATION).toLowerCase() !== 'true') throw new RunnerError('LOCAL_EVALUATION_REQUIRED', EXIT.VALIDATION);
  if (String(values.SYNTHETIC_DATA_ONLY).toLowerCase() !== 'true') throw new RunnerError('SYNTHETIC_DATA_ONLY_REQUIRED', EXIT.VALIDATION);
  if (String(values.VISION_PROVIDER).toLowerCase() !== 'gemini') throw new RunnerError('GEMINI_PROVIDER_REQUIRED', EXIT.VALIDATION);
}

function isEnvironmentIgnored(repositoryRoot) {
  try {
    execFileSync('git', ['check-ignore', '-q', '.env.local'], { cwd: repositoryRoot, stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

function validateFixture(fixturePath) {
  if (!fs.existsSync(fixturePath) || !fs.statSync(fixturePath).isFile()) throw new RunnerError('FIXTURE_MISSING', EXIT.VALIDATION);
  const extension = path.extname(fixturePath).toLowerCase();
  const bytes = fs.readFileSync(fixturePath);
  const jpeg = ['.jpg', '.jpeg'].includes(extension) && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  const png = extension === '.png' && bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!jpeg && !png) throw new RunnerError('FIXTURE_MIME_UNSUPPORTED', EXIT.VALIDATION);
  return Object.freeze({ bytes: new Uint8Array(bytes), mimeType: jpeg ? 'image/jpeg' : 'image/png' });
}

async function singleCallTransport(request, state) {
  state.calls += 1;
  if (state.calls !== 1) throw new RunnerError('CALL_LIMIT_EXCEEDED', EXIT.PROVIDER);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
    state.httpStatus = response.status;
    const body = await decodeJsonResponseUtf8(response);
    return Object.freeze({ ok: response.ok, status: response.status, body });
  } finally {
    clearTimeout(timer);
  }
}

async function decodeJsonResponseUtf8(response) {
  const bytes = await response.arrayBuffer();
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return text ? JSON.parse(text) : null;
}

function sanitizeResult(result) {
  if (!result?.ok) return null;
  return Object.freeze({
    shortSummaryAr: result.shortSummaryAr,
    categoryCode: result.categoryCode,
    categoryLabelAr: result.categoryLabelAr,
    subcategoryCode: result.subcategoryCode || null,
    subcategoryLabelAr: result.subcategoryLabelAr || null,
    severity: result.severity,
    severityScore: result.severityScore,
    prioritySuggestion: result.prioritySuggestion,
    responsibleDepartmentSuggestion: result.responsibleDepartmentSuggestion || null,
    recommendedActionAr: result.recommendedActionAr,
    confidence: result.confidence,
    imageQuality: result.imageQuality,
    requiresHumanReview: result.requiresHumanReview,
    warnings: result.warnings,
  });
}

function writeSanitizedArtifacts(outputDirectory, record) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const writeUtf8 = (fileName, value) => fs.writeFileSync(path.join(outputDirectory, fileName), Buffer.from(value, 'utf8'), { flag: 'wx' });
  writeUtf8('single-result.sanitized.json', `${JSON.stringify(record, null, 2)}\n`);
  const report = [
    '# Single Gemini Local Vision Run', '',
    `- Fixture: \`${record.fixturePath}\``,
    `- Model: \`${record.model}\``,
    `- API call count: ${record.apiCallCount}`,
    `- HTTP status: ${record.httpStatus ?? 'not received'}`,
    `- Success: ${record.success}`,
    `- Latency: ${record.latencyMs} ms`,
    `- Schema validation: ${record.schemaValidation}`,
    `- Arabic summary validation: ${record.arabicSummaryValidation}`,
    `- Arabic summary: ${record.structuredResult?.shortSummaryAr || 'not available'}`,
    '- Provider fallback: false',
    '- Model fallback: false',
    '- Firebase/Firestore activity: false',
    '- Persistence: false', '',
    'The structured result is stored only in `single-result.sanitized.json`.', '',
  ].join('\n');
  writeUtf8('SINGLE-GEMINI-LOCAL-RUN-REPORT.md', report);
}

async function run(argv, dependencies = {}) {
  const repositoryRoot = dependencies.repositoryRoot || path.resolve(__dirname, '..');
  const args = parseArguments(argv);
  const fixturePath = resolveRepositoryPath(repositoryRoot, args.fixture, 'FIXTURE_PATH_DENIED');
  const outputDirectory = resolveRepositoryPath(repositoryRoot, args['output-dir'], 'OUTPUT_PATH_DENIED');
  const envPath = path.join(repositoryRoot, '.env.local');
  const values = (dependencies.readEnvironment || readLocalEnvironment)(envPath);
  const envIgnored = (dependencies.isEnvironmentIgnored || isEnvironmentIgnored)(repositoryRoot);
  validateEnvironment(values, envIgnored);
  const fixture = validateFixture(fixturePath);
  const state = { calls: 0, httpStatus: null };
  const transport = dependencies.transport || (request => singleCallTransport(request, state));
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
      state.calls += dependencies.transport ? 1 : 0;
      if (state.calls > 1) throw new RunnerError('CALL_LIMIT_EXCEEDED', EXIT.PROVIDER);
      return transport(request);
    },
    timeoutMs: 45000,
  });
  const started = Date.now();
  const result = await provider.analyzeObservationImage({
    organizationId: 'synthetic-evaluation',
    observationId: 'single-local-evaluation',
    actorId: 'local-evaluation-runner',
    actorRole: 'test',
    correlationId: 'single-local-evaluation',
    imageReference: null,
    imageContentType: fixture.mimeType,
    controlledImagePayload: fixture.bytes,
    existingDescription: '',
    locationContext: null,
  });
  const latencyMs = Date.now() - started;
  const summary = result.ok ? validateShortSummaryAr(result.shortSummaryAr, { confidence: result.confidence }) : null;
  const record = Object.freeze({
    fixturePath: args.fixture.replace(/\\/g, '/'), model: args.model, apiCallCount: state.calls,
    httpStatus: state.httpStatus, success: result.ok, latencyMs,
    schemaValidation: result.ok, arabicSummaryValidation: Boolean(summary?.allowed),
    structuredResult: sanitizeResult(result), errorCode: result.ok ? null : result.errorCode,
    providerDiagnostics: result.ok ? null : Object.freeze({
      httpStatus: result.httpStatus ?? state.httpStatus,
      providerErrorStatus: result.providerErrorStatus || null,
      providerErrorMessageSanitized: result.providerErrorMessageSanitized || null,
      providerErrorCode: result.providerErrorCode || null,
    }),
  });
  writeSanitizedArtifacts(outputDirectory, record);
  if (result.ok && summary?.allowed) return Object.freeze({ exitCode: EXIT.SUCCESS, record });
  if (result.errorCode === 'AI_PROVIDER_OUTPUT_INVALID' || result.ok) return Object.freeze({ exitCode: EXIT.OUTPUT, record });
  return Object.freeze({ exitCode: EXIT.PROVIDER, record });
}

async function main() {
  try {
    const outcome = await run(process.argv.slice(2));
    process.stdout.write(`Single Gemini evaluation completed: success=${outcome.record.success}; calls=${outcome.record.apiCallCount}\n`);
    process.exitCode = outcome.exitCode;
  } catch (error) {
    process.stderr.write(`Single Gemini evaluation stopped: ${error?.code || 'RUNNER_FAILURE'}\n`);
    process.exitCode = error?.exitCode || EXIT.PROVIDER;
  }
}

if (require.main === module) main();

module.exports = Object.freeze({ EXIT, RunnerError, parseArguments, resolveRepositoryPath, readLocalEnvironment, validateEnvironment, validateFixture, decodeJsonResponseUtf8, sanitizeResult, writeSanitizedArtifacts, run });

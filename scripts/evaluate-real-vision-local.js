'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createGeminiCompatibleVisionProvider } = require('../platform/ai/server/gemini-compatible-vision-provider');
const { createOpenRouterCompatibleVisionProvider } = require('../platform/ai/server/openrouter-compatible-vision-provider');
const { buildProviderComparison } = require('../platform/ai/server/vision-evaluation-metrics');
const { EVALUATION_CASES, GROUND_TRUTH, PROVENANCE_REQUIREMENTS } = require('../test/fixtures/vision-evaluation-manifest');

async function optInTransport(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch(request.url, { method: request.method, headers: request.headers, body: JSON.stringify(request.body), signal: controller.signal });
    const body = await response.json().catch(() => null);
    return Object.freeze({ ok: response.ok, status: response.status, body });
  } finally { clearTimeout(timer); }
}

async function main() {
  const selected = process.env.SMART_HSR_AI_PROVIDER;
  const factory = selected === 'gemini' ? createGeminiCompatibleVisionProvider : selected === 'openrouter' ? createOpenRouterCompatibleVisionProvider : null;
  if (!factory) throw new Error('Explicit provider selection must be gemini or openrouter.');
  const provider = factory({ enabled: true, environment: process.env, transport: optInTransport });
  const health = await provider.healthCheck();
  if (!health.ok) throw new Error('Real evaluation activation guard denied execution.');
  if (!PROVENANCE_REQUIREMENTS.noAutomaticDownload || !PROVENANCE_REQUIREMENTS.personalDataProhibited) throw new Error('Dataset provenance policy is invalid.');

  const records = [];
  for (const testCase of EVALUATION_CASES) {
    const fixturePath = path.resolve(process.cwd(), testCase.localFixturePath);
    if (!fs.existsSync(fixturePath)) throw new Error(`Approved local fixture missing: ${testCase.caseId}`);
    const bytes = new Uint8Array(fs.readFileSync(fixturePath));
    const started = Date.now();
    const result = await provider.analyzeObservationImage({ organizationId: 'synthetic-evaluation', observationId: testCase.caseId, actorId: 'evaluation-runner', actorRole: 'test', correlationId: testCase.caseId,
      imageReference: null, imageContentType: testCase.contentType, controlledImagePayload: bytes, existingDescription: '', locationContext: null });
    records.push(Object.freeze({ caseId: testCase.caseId, result, latencyMs: Date.now() - started, hallucinated: null, approximateCostUsd: null }));
  }
  const model = selected === 'gemini' ? process.env.GEMINI_VISION_MODEL : process.env.OPENROUTER_VISION_MODEL;
  process.stdout.write(`${JSON.stringify(buildProviderComparison({ provider: selected, model, cases: EVALUATION_CASES, groundTruth: GROUND_TRUTH, records }), null, 2)}\n`);
}

if (require.main === module) main().catch(error => { process.stderr.write(`Evaluation stopped: ${error.message}\n`); process.exitCode = 1; });
module.exports = Object.freeze({ main });

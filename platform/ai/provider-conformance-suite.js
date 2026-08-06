'use strict';

const PROVIDER_CONFORMANCE_CASES = Object.freeze([
  ['VALID_POTHOLE','SUCCESS'], ['VALID_LEANING_POLE','SUCCESS'], ['VALID_FALLEN_PALM','SUCCESS'], ['VALID_CONSTRUCTION_WASTE','SUCCESS'], ['VALID_WATER_LEAK','SUCCESS'], ['VALID_UNCLEAR_IMAGE','SUCCESS'],
  ['UNSUPPORTED_IMAGE','DENIED'], ['MALFORMED_OUTPUT','DENIED'], ['TIMEOUT','DENIED'], ['PROVIDER_UNAVAILABLE','DENIED'], ['NON_ARABIC_SUMMARY','DENIED'], ['SUMMARY_UNDER_FIVE_WORDS','DENIED'],
  ['SUMMARY_OVER_FIFTEEN_WORDS','DENIED'], ['INVALID_SEVERITY','DENIED'], ['INVALID_CONFIDENCE','DENIED'], ['MISSING_HUMAN_REVIEW','DENIED'], ['WORKFLOW_ACTION_ATTEMPT','DENIED'], ['SECRET_OR_RAW_PROMPT_ATTEMPT','DENIED'],
].map(([caseId, expected]) => Object.freeze({ caseId, expected })));

async function runProviderConformance({ providerId, runCase } = {}) {
  if (!providerId || typeof runCase !== 'function') return Object.freeze({ ok: false, providerId: providerId || null, passed: 0, failed: PROVIDER_CONFORMANCE_CASES.length, results: Object.freeze([]), code: 'AI_CONFORMANCE_RUNNER_INVALID' });
  const results = [];
  for (const testCase of PROVIDER_CONFORMANCE_CASES) {
    try {
      const outcome = await runCase(testCase);
      results.push(Object.freeze({ ...testCase, passed: outcome?.passed === true, code: outcome?.code || null }));
    } catch (_) { results.push(Object.freeze({ ...testCase, passed: false, code: 'AI_CONFORMANCE_CASE_EXCEPTION' })); }
  }
  const passed = results.filter(item => item.passed).length;
  return Object.freeze({ ok: passed === results.length, providerId, passed, failed: results.length - passed, results: Object.freeze(results) });
}

module.exports = Object.freeze({ PROVIDER_CONFORMANCE_CASES, runProviderConformance });

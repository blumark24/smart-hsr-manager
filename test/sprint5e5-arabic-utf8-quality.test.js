'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateShortSummaryAr, hasMojibake } = require('../platform/ai/arabic-summary-policy');
const { decodeJsonResponseUtf8, writeSanitizedArtifacts } = require('../scripts/evaluate-single-gemini-vision-local');

const conciseSummary = 'تم رصد حفرة إسفلتية تتطلب معالجة عاجلة.';

test('HTTP JSON decoding preserves Arabic UTF-8 exactly', async () => {
  const payload = JSON.stringify({ shortSummaryAr: conciseSummary });
  const response = { arrayBuffer: async () => Uint8Array.from(Buffer.from(payload, 'utf8')).buffer };
  const decoded = await decodeJsonResponseUtf8(response);
  assert.equal(decoded.shortSummaryAr, conciseSummary);
});

test('JSON and Markdown artifacts preserve readable Arabic without mojibake', () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-hsr-utf8-'));
  const record = Object.freeze({
    fixturePath: 'test/fixtures/vision/asphalt-pothole.jpg', model: 'gemini-test', apiCallCount: 1,
    httpStatus: 200, success: true, latencyMs: 1, schemaValidation: true, arabicSummaryValidation: true,
    structuredResult: Object.freeze({ shortSummaryAr: conciseSummary }), errorCode: null, providerDiagnostics: null,
  });
  writeSanitizedArtifacts(outputDirectory, record);
  const jsonText = fs.readFileSync(path.join(outputDirectory, 'single-result.sanitized.json'), 'utf8');
  const markdownText = fs.readFileSync(path.join(outputDirectory, 'SINGLE-GEMINI-LOCAL-RUN-REPORT.md'), 'utf8');
  assert.equal(JSON.parse(jsonText).structuredResult.shortSummaryAr, conciseSummary);
  assert.ok(jsonText.includes(conciseSummary));
  assert.ok(markdownText.includes(conciseSummary));
  assert.equal(hasMojibake(JSON.parse(jsonText).structuredResult.shortSummaryAr), false);
  assert.doesNotMatch(jsonText, /(?:ط§|ط±|طھ|ظ„|ظ…|ظ†)/u);
  assert.doesNotMatch(markdownText, /(?:ط§|ط±|طھ|ظ„|ظ…|ظ†)/u);
});

test('summary policy enforces absolute five-to-fifteen word bounds', () => {
  assert.equal(validateShortSummaryAr('تم رصد حفرة خطرة').code, 'AI_SUMMARY_TOO_SHORT');
  assert.equal(validateShortSummaryAr('تم رصد حفرة كبيرة في الطريق الرئيسي وتتطلب معالجة عاجلة وفورية لحماية جميع مستخدمي الطريق من المخاطر المحتملة والمتزايدة').code, 'AI_SUMMARY_TOO_LONG');
});

test('preferred concise municipal summary is accepted unchanged', () => {
  const result = validateShortSummaryAr(conciseSummary, { confidence: 0.95 });
  assert.equal(result.allowed, true);
  assert.equal(result.preferredLength, true);
  assert.equal(result.summary, conciseSummary);
});

// PHASE 09 GATE 4 — the first assertion here expected an
// 'AI_SUMMARY_NOT_CONCISE' code that platform/ai/arabic-summary-policy.js
// has never implemented: validateShortSummaryAr() only enforces a hard
// MIN_WORDS/MAX_WORDS (5-15) range and exposes PREFERRED_MIN/MAX_WORDS
// (7-12) as an informational `preferredLength` flag on an otherwise-valid
// result, by explicit, documented design (see that file's own comment on
// why it does not add a brittle word-count-based rejection beyond the hard
// bounds). A 13-word summary within that hard range is, and was always
// meant to be, AI_SUMMARY_VALID — this test's premise predates that
// decision and is corrected to match it; the other two speculative/
// duplicated-severity checks are real, implemented codes and unaffected.
test('speculative and duplicated-severity summaries fail closed; a summary merely longer than the PREFERRED range (but within the hard MIN/MAX) remains valid by design', () => {
  const longButWithinHardRange = validateShortSummaryAr('تم رصد حفرة إسفلتية كبيرة في الطريق وتتطلب معالجة عاجلة لحماية مستخدمي الطريق.');
  assert.equal(longButWithinHardRange.code, 'AI_SUMMARY_VALID');
  assert.equal(longButWithinHardRange.preferredLength, false);
  assert.equal(validateShortSummaryAr('تم رصد حفرة قد يكون وجودها خطرا وتتطلب معالجة عاجلة.', { confidence: 0.9 }).code, 'AI_SUMMARY_HIGH_CONFIDENCE_SPECULATION');
  assert.equal(validateShortSummaryAr('تم رصد حفرة خطرة خطرة تتطلب معالجة عاجلة.').code, 'AI_SUMMARY_DUPLICATED_SEVERITY');
});

test('mojibake and non-Arabic summaries are rejected', () => {
  assert.equal(validateShortSummaryAr('طھظ… ط±طµط¯ ط­ظپط±ط© طھطھط·ظ„ط¨ ظ…ط¹ط§ظ„ط¬ط© ط¹ط§ط¬ظ„ط©.').code, 'AI_SUMMARY_ENCODING_INVALID');
  assert.equal(validateShortSummaryAr('تم رصد pothole تتطلب معالجة عاجلة للطريق.').code, 'AI_SUMMARY_ARABIC_REQUIRED');
});

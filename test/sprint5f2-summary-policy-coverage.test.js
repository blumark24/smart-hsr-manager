'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateShortSummaryAr } = require('../platform/ai/arabic-summary-policy');

test('rejects a summary missing municipal phrasing prefix with AI_SUMMARY_MUNICIPAL_PHRASING_REQUIRED', () => {
  const summary = '\u064a\u062a\u0637\u0644\u0628\u0020\u0625\u0635\u0644\u0627\u062d\u0020\u0627\u0644\u0631\u0635\u064a\u0641\u0020\u0627\u0644\u0645\u062a\u0636\u0631\u0631\u0020\u0628\u062c\u0627\u0646\u0628\u0020\u0627\u0644\u0645\u062f\u0631\u0633\u0629\u002e';
  const result = validateShortSummaryAr(summary);
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'AI_SUMMARY_MUNICIPAL_PHRASING_REQUIRED');
});

test('rejects a summary missing required action or impact language with AI_SUMMARY_ACTION_OR_IMPACT_REQUIRED', () => {
  const summary = '\u062a\u0645\u0020\u0631\u0635\u062f\u0020\u062d\u0641\u0631\u0629\u0020\u0641\u064a\u0020\u0627\u0644\u0634\u0627\u0631\u0639\u0020\u0627\u0644\u0631\u0626\u064a\u0633\u064a\u002e';
  const result = validateShortSummaryAr(summary);
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'AI_SUMMARY_ACTION_OR_IMPACT_REQUIRED');
});

test('rejects a summary containing more than one sentence with AI_SUMMARY_MULTIPLE_SENTENCES', () => {
  const summary = '\u062a\u0645\u0020\u0631\u0635\u062f\u0020\u062d\u0641\u0631\u0629\u002e\u0020\u0641\u064a\u0020\u0627\u0644\u0634\u0627\u0631\u0639\u0020\u0627\u0644\u0631\u0626\u064a\u0633\u064a\u002e';
  const result = validateShortSummaryAr(summary);
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'AI_SUMMARY_MULTIPLE_SENTENCES');
});

test('rejects a summary containing a URL with AI_SUMMARY_MARKUP_DENIED', () => {
  const summary = '\u062a\u0645\u0020\u0631\u0635\u062f\u0020\u0645\u0634\u0643\u0644\u0629\u0020\u0639\u0644\u0649\u0020\u0068\u0074\u0074\u0070\u0073\u003a\u002f\u002f\u0065\u0078\u0061\u006d\u0070\u006c\u0065\u002e\u0063\u006f\u006d\u0020\u0627\u0644\u064a\u0648\u0645';
  const result = validateShortSummaryAr(summary);
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'AI_SUMMARY_MARKUP_DENIED');
});

test('accepts a valid summary containing exactly 5 words', () => {
  const summary = '\u062a\u0645\u0020\u0631\u0635\u062f\u0020\u062a\u0633\u0631\u0628\u0020\u064a\u062a\u0637\u0644\u0628\u0020\u0625\u0635\u0644\u0627\u062d\u0627\u002e';
  const result = validateShortSummaryAr(summary);
  assert.equal(result.allowed, true);
  assert.equal(result.code, 'AI_SUMMARY_VALID');
  assert.equal(result.wordCount, 5);
});

test('accepts a valid summary containing exactly 11 words', () => {
  const summary = '\u062a\u0645\u0020\u0631\u0635\u062f\u0020\u062a\u0633\u0631\u0628\u0020\u0645\u064a\u0627\u0647\u0020\u0643\u0628\u064a\u0631\u0020\u064a\u062a\u0637\u0644\u0628\u0020\u0625\u0635\u0644\u0627\u062d\u0627\u0020\u0639\u0627\u062c\u0644\u0627\u0020\u0644\u062d\u0645\u0627\u064a\u0629\u0020\u0627\u0644\u0634\u0627\u0631\u0639\u0020\u0628\u0623\u0643\u0645\u0644\u0647\u002e';
  const result = validateShortSummaryAr(summary);
  assert.equal(result.allowed, true);
  assert.equal(result.code, 'AI_SUMMARY_VALID');
  assert.equal(result.wordCount, 11);
});

test('rejects a summary containing exactly 12 words with AI_SUMMARY_NOT_CONCISE', () => {
  const summary = '\u062a\u0645\u0020\u0631\u0635\u062f\u0020\u062a\u0633\u0631\u0628\u0020\u0645\u064a\u0627\u0647\u0020\u0643\u0628\u064a\u0631\u0020\u064a\u062a\u0637\u0644\u0628\u0020\u0625\u0635\u0644\u0627\u062d\u0627\u0020\u0639\u0627\u062c\u0644\u0627\u0020\u0644\u062d\u0645\u0627\u064a\u0629\u0020\u0627\u0644\u0634\u0627\u0631\u0639\u0020\u0628\u0623\u0643\u0645\u0644\u0647\u0020\u0627\u0644\u0622\u0646\u002e';
  const result = validateShortSummaryAr(summary);
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'AI_SUMMARY_NOT_CONCISE');
  assert.equal(result.wordCount, 12);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTaxonomy, resolveTaxonomyWithFallback, MUNICIPAL_TAXONOMY } = require('../platform/intelligence/municipal-taxonomy');
const { MUNICIPAL_VISION_OUTPUT_SCHEMA, VALID_CATEGORY_CODES } = require('../platform/ai/server/municipal-vision-prompt');
const { GEMINI_REST_VISION_OUTPUT_SCHEMA } = require('../platform/ai/server/gemini-compatible-vision-provider');

// --- schema/prompt contract: the allowlist is generated, not duplicated ---

test('VALID_CATEGORY_CODES is generated from the taxonomy module and includes UNKNOWN', () => {
  assert.deepEqual(VALID_CATEGORY_CODES, MUNICIPAL_TAXONOMY.map(e => e.code));
  assert.ok(VALID_CATEGORY_CODES.includes('UNKNOWN'));
  assert.ok(VALID_CATEGORY_CODES.includes('ASPHALT_POTHOLE'));
  assert.ok(VALID_CATEGORY_CODES.includes('DAMAGED_SIDEWALK'));
});

test('both provider output schemas constrain categoryCode to the same generated allowlist', () => {
  assert.deepEqual(MUNICIPAL_VISION_OUTPUT_SCHEMA.properties.categoryCode.enum, VALID_CATEGORY_CODES);
  assert.deepEqual(GEMINI_REST_VISION_OUTPUT_SCHEMA.properties.categoryCode.enum, VALID_CATEGORY_CODES);
});

// --- Golden Case C1: road pothole -> ASPHALT_POTHOLE ---

test('C1: exact allowlisted code for a road pothole resolves directly', () => {
  const { entry, usedFallback } = resolveTaxonomyWithFallback('ASPHALT_POTHOLE', 'تم رصد حفرة في الطريق تشكل خطراً على السلامة.');
  assert.equal(entry.code, 'ASPHALT_POTHOLE');
  assert.equal(usedFallback, false);
});

test('C4: an invalid provider code ("RD") with strong pothole evidence does NOT silently become UNKNOWN', () => {
  // Real captured provider output from live Sprint 3 testing: categoryCode "RD"
  // (not in the taxonomy) with shortSummaryAr clearly describing a pothole.
  const evidence = 'تم رصد حفرة في الطريق تشكل خطراً على السلامة وتتطلب إصلاحاً فورياً.';
  const { entry, usedFallback } = resolveTaxonomyWithFallback('RD', evidence);
  assert.equal(entry.code, 'ASPHALT_POTHOLE');
  assert.equal(usedFallback, true);
});

// --- Golden Case C2: damaged sidewalk -> DAMAGED_SIDEWALK ---

test('C2: exact allowlisted code for a damaged sidewalk resolves directly', () => {
  const { entry, usedFallback } = resolveTaxonomyWithFallback('DAMAGED_SIDEWALK', 'تم رصد رصيف متضرر يعيق حركة المشاة.');
  assert.equal(entry.code, 'DAMAGED_SIDEWALK');
  assert.equal(usedFallback, false);
});

test('C6: unsupported code with damaged-sidewalk evidence falls back to DAMAGED_SIDEWALK, never a lighting-pole category', () => {
  const evidence = 'تم رصد رصيف متضرر بشكل واضح مما يعيق حركة المشاة ويشكل خطر تعثر.';
  const { entry, usedFallback } = resolveTaxonomyWithFallback('SIDEWALK_DEFECT', evidence);
  assert.equal(entry.code, 'DAMAGED_SIDEWALK');
  assert.equal(usedFallback, true);
  assert.notEqual(entry.code, 'LEANING_LIGHTING_POLE');
  assert.notEqual(entry.code, 'DAMAGED_LIGHTING_POLE');
});

// --- Golden Case C3: standing water / road pooling ---

test('C3: standing water evidence does NOT get force-mapped to WATER_LEAKAGE (an unproven "leak" causal claim)', () => {
  // Real captured provider output from live Sprint 3 testing: categoryCode
  // "STREET_MAINTENANCE" (not in the taxonomy) with shortSummaryAr describing
  // pooled/standing water -- mentions "مياه" (water) but never "تسرب" (leak).
  const evidence = 'صيانة الشوارع تم رصد تجمع مياه على الطريق قد يعيق حركة المركبات ويشكل خطر انزلاق.';
  const { entry, usedFallback } = resolveTaxonomyWithFallback('STREET_MAINTENANCE', evidence);
  assert.equal(entry.code, 'UNKNOWN');
  assert.equal(usedFallback, false);
  // Confirms the deliberate design: the fallback requires the taxonomy's
  // HEAD word (the defect noun, "تسرب"/leak) to be present -- matching only
  // the modifier word ("مياه"/water) is not sufficient, precisely so this
  // case cannot be force-mapped to WATER_LEAKAGE without evidence of a leak.
});

// --- Golden Case C5: ambiguous/weak input remains UNKNOWN ---

test('C5: weak/ambiguous evidence with no taxonomy head-word present remains UNKNOWN', () => {
  const { entry, usedFallback } = resolveTaxonomyWithFallback('MISC', 'ملاحظة عامة غير محددة المعالم.');
  assert.equal(entry.code, 'UNKNOWN');
  assert.equal(usedFallback, false);
});

test('C5: a tie between two head-word matches without a disambiguating modifier remains UNKNOWN', () => {
  // "عمود" (pole) alone is the shared head word of both LEANING_LIGHTING_POLE
  // ("عمود إنارة مائل") and DAMAGED_LIGHTING_POLE ("عمود إنارة متضرر"); with
  // neither modifier word ("مائل" leaning / "متضرر" damaged) present, this
  // must not guess between them.
  const { entry, usedFallback } = resolveTaxonomyWithFallback('POLE_ISSUE', 'تم رصد عمود إنارة في الموقع.');
  assert.equal(entry.code, 'UNKNOWN');
  assert.equal(usedFallback, false);
});

test('a tie IS resolved when the modifier word disambiguates it', () => {
  const { entry, usedFallback } = resolveTaxonomyWithFallback('POLE_ISSUE', 'تم رصد عمود إنارة مائل بشكل خطير.');
  assert.equal(entry.code, 'LEANING_LIGHTING_POLE');
  assert.equal(usedFallback, true);
});

// --- exact match always wins over any fallback attempt, including for UNKNOWN itself ---

test('an explicit UNKNOWN code from the provider is honored directly, never fallback-matched', () => {
  const { entry, usedFallback } = resolveTaxonomyWithFallback('UNKNOWN', 'تم رصد حفرة في الطريق.');
  assert.equal(entry.code, 'UNKNOWN');
  assert.equal(usedFallback, false);
});

test('resolveTaxonomy (legacy exact-match-only export) is unchanged', () => {
  assert.equal(resolveTaxonomy('ASPHALT_POTHOLE').code, 'ASPHALT_POTHOLE');
  assert.equal(resolveTaxonomy('RD').code, 'UNKNOWN');
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONTRADICTION_CONFIDENCE_CEILING,
  GUARD_WARNINGS,
  clampSeverityToRange,
  evaluateMunicipalConsistency,
} = require('../platform/intelligence/municipal-consistency-guard');
const { resolveTaxonomy } = require('../platform/intelligence/municipal-taxonomy');

function evidence(affectedAsset, visibleDefect) {
  return { affectedAsset, visibleDefect, evidenceStatements: ['دليل بصري.'] };
}

// --- 1. SIDEWALK + BROKEN + DAMAGED_SIDEWALK -> unchanged PASS --------------

test('1. exact structured match (DAMAGED_SIDEWALK) is preserved unchanged', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'DAMAGED_SIDEWALK', severity: 'HIGH', confidence: 0.9, visualEvidence: evidence('SIDEWALK', 'BROKEN') });
  assert.equal(result.resolvedCategoryCode, 'DAMAGED_SIDEWALK');
  assert.equal(result.correctionApplied, false);
  assert.equal(result.contradictionDetected, false);
  assert.equal(result.confidence, 0.9);
  assert.deepEqual([...result.warnings], []);
  assert.equal(result.requiresHumanReview, true);
});

// --- 2. SIDEWALK + BROKEN + ASPHALT_POTHOLE -> corrected --------------------

test('2. SIDEWALK+BROKEN vs ASPHALT_POTHOLE is corrected to DAMAGED_SIDEWALK, confidence reduced, warning emitted', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'ASPHALT_POTHOLE', severity: 'HIGH', confidence: 0.92, visualEvidence: evidence('SIDEWALK', 'BROKEN') });
  assert.equal(result.originalCategoryCode, 'ASPHALT_POTHOLE');
  assert.equal(result.resolvedCategoryCode, 'DAMAGED_SIDEWALK');
  assert.equal(result.correctionApplied, true);
  assert.equal(result.contradictionDetected, true);
  assert.ok(result.confidence < 0.92);
  assert.equal(result.confidence, CONTRADICTION_CONFIDENCE_CEILING);
  assert.ok(result.warnings.includes(GUARD_WARNINGS.CATEGORY_CORRECTED_BY_STRUCTURED_EVIDENCE));
});

test('2b. no asphalt treatment survives downstream after the sidewalk correction', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'ASPHALT_POTHOLE', severity: 'HIGH', confidence: 0.9, visualEvidence: evidence('SIDEWALK', 'BROKEN') });
  const finalTaxonomy = resolveTaxonomy(result.resolvedCategoryCode);
  assert.equal(finalTaxonomy.treatmentGuidanceAr, resolveTaxonomy('DAMAGED_SIDEWALK').treatmentGuidanceAr);
  assert.notEqual(finalTaxonomy.treatmentGuidanceAr, resolveTaxonomy('ASPHALT_POTHOLE').treatmentGuidanceAr);
  assert.doesNotMatch(finalTaxonomy.treatmentGuidanceAr, /أسفلتي/);
});

// --- 3. CURB + BROKEN + DAMAGED_SIDEWALK -> corrected to DAMAGED_CURB -------

test('3. CURB+BROKEN vs DAMAGED_SIDEWALK is corrected to DAMAGED_CURB, not left at DAMAGED_SIDEWALK', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'DAMAGED_SIDEWALK', severity: 'MEDIUM', confidence: 0.88, visualEvidence: evidence('CURB', 'BROKEN') });
  assert.equal(result.resolvedCategoryCode, 'DAMAGED_CURB');
  assert.notEqual(result.resolvedCategoryCode, 'DAMAGED_SIDEWALK');
  assert.equal(result.correctionApplied, true);
  assert.ok(result.warnings.includes(GUARD_WARNINGS.CATEGORY_CORRECTED_BY_STRUCTURED_EVIDENCE));
});

// --- 4-8. exact-match unchanged-PASS regression cases -----------------------

test('4. ROAD_SURFACE+POTHOLE+ASPHALT_POTHOLE unchanged', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'ASPHALT_POTHOLE', severity: 'HIGH', confidence: 0.9, visualEvidence: evidence('ROAD_SURFACE', 'POTHOLE') });
  assert.equal(result.resolvedCategoryCode, 'ASPHALT_POTHOLE');
  assert.equal(result.correctionApplied, false);
  assert.equal(result.contradictionDetected, false);
  assert.equal(result.confidence, 0.9);
});

test('5. MANHOLE+OPEN+OPEN_MANHOLE unchanged', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'OPEN_MANHOLE', severity: 'CRITICAL', confidence: 0.95, visualEvidence: evidence('MANHOLE', 'OPEN') });
  assert.equal(result.resolvedCategoryCode, 'OPEN_MANHOLE');
  assert.equal(result.contradictionDetected, false);
  assert.equal(result.confidence, 0.95);
});

test('6. LIGHTING_POLE+LEANING+LEANING_LIGHTING_POLE unchanged', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'LEANING_LIGHTING_POLE', severity: 'HIGH', confidence: 0.85, visualEvidence: evidence('LIGHTING_POLE', 'LEANING') });
  assert.equal(result.resolvedCategoryCode, 'LEANING_LIGHTING_POLE');
  assert.equal(result.contradictionDetected, false);
});

test('7. PALM_TREE+FALLEN+FALLEN_PALM_TREE unchanged', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'FALLEN_PALM_TREE', severity: 'MEDIUM', confidence: 0.8, visualEvidence: evidence('PALM_TREE', 'FALLEN') });
  assert.equal(result.resolvedCategoryCode, 'FALLEN_PALM_TREE');
  assert.equal(result.contradictionDetected, false);
});

test('8. WATER_INFRASTRUCTURE+LEAKING+WATER_LEAKAGE unchanged', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'WATER_LEAKAGE', severity: 'MEDIUM', confidence: 0.87, visualEvidence: evidence('WATER_INFRASTRUCTURE', 'LEAKING') });
  assert.equal(result.resolvedCategoryCode, 'WATER_LEAKAGE');
  assert.equal(result.contradictionDetected, false);
});

// --- 9. severity outside taxonomy range -------------------------------------

test('9. severity above the resolved category max is not silently accepted (no unsafe escalation)', () => {
  // VISUAL_POLLUTION only permits LOW..MEDIUM; the model claiming CRITICAL
  // must not be allowed to push priority beyond what this category permits.
  const result = evaluateMunicipalConsistency({ categoryCode: 'VISUAL_POLLUTION', severity: 'CRITICAL', confidence: 0.9, visualEvidence: evidence('PUBLIC_SPACE', 'DEGRADED') });
  assert.equal(result.resolvedCategoryCode, 'VISUAL_POLLUTION');
  assert.equal(result.originalSeverity, 'CRITICAL');
  assert.notEqual(result.resolvedSeverity, 'CRITICAL');
  assert.equal(result.resolvedSeverity, 'MEDIUM');
  assert.ok(result.warnings.includes(GUARD_WARNINGS.SEVERITY_OUTSIDE_TAXONOMY_RANGE));
  assert.equal(result.contradictionDetected, true);
  assert.equal(result.confidence, CONTRADICTION_CONFIDENCE_CEILING);
  assert.equal(result.requiresHumanReview, true);
});

test('9b. severity below the resolved category min is also flagged, not silently accepted', () => {
  // OPEN_MANHOLE only permits HIGH..CRITICAL; a LOW claim is just as invalid
  // as an over-high one and must not be trusted at face value either.
  const result = evaluateMunicipalConsistency({ categoryCode: 'OPEN_MANHOLE', severity: 'LOW', confidence: 0.9, visualEvidence: evidence('MANHOLE', 'OPEN') });
  assert.equal(result.resolvedSeverity, 'HIGH');
  assert.ok(result.warnings.includes(GUARD_WARNINGS.SEVERITY_OUTSIDE_TAXONOMY_RANGE));
});

test('9c. clampSeverityToRange is a pure, independently testable function', () => {
  assert.equal(clampSeverityToRange('CRITICAL', ['LOW', 'MEDIUM']), 'MEDIUM');
  assert.equal(clampSeverityToRange('LOW', ['MEDIUM', 'CRITICAL']), 'MEDIUM');
  assert.equal(clampSeverityToRange('HIGH', ['LOW', 'CRITICAL']), 'HIGH');
});

// --- 10 & 11. UNKNOWN / ambiguous structured evidence -----------------------

test('10. structured evidence that maps to zero taxonomy candidates resolves to UNKNOWN, review required', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'ASPHALT_POTHOLE', severity: 'HIGH', confidence: 0.9, visualEvidence: evidence('VEHICLE', 'LEAKING') });
  assert.equal(result.resolvedCategoryCode, 'UNKNOWN');
  assert.equal(result.correctionApplied, false);
  assert.equal(result.contradictionDetected, true);
  assert.ok(result.warnings.includes(GUARD_WARNINGS.CATEGORY_CONTRADICTION_UNRESOLVED));
  assert.equal(result.confidence, CONTRADICTION_CONFIDENCE_CEILING);
  assert.equal(result.requiresHumanReview, true);
});

test('11. structured evidence that maps to MORE THAN ONE real taxonomy candidate resolves to UNKNOWN, never guesses', () => {
  // PUBLIC_SPACE+DEGRADED genuinely matches both PARKS_AND_LANDSCAPING and
  // VISUAL_POLLUTION -- a real ambiguous pair, not a contrived one. The
  // original categoryCode must NOT itself already be one of the two tied
  // candidates, otherwise this would be an exact-match Case A instead of the
  // intended Case D ambiguity.
  const result = evaluateMunicipalConsistency({ categoryCode: 'ASPHALT_POTHOLE', severity: 'LOW', confidence: 0.8, visualEvidence: evidence('PUBLIC_SPACE', 'DEGRADED') });
  assert.equal(result.resolvedCategoryCode, 'UNKNOWN');
  assert.equal(result.correctionApplied, false);
  assert.ok(result.warnings.includes(GUARD_WARNINGS.CATEGORY_CONTRADICTION_UNRESOLVED));
});

// --- 12. missing legacy visualEvidence --------------------------------------

test('12. missing visualEvidence preserves the original classification unchanged (backward compatibility)', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'ASPHALT_POTHOLE', severity: 'HIGH', confidence: 0.9 });
  assert.equal(result.resolvedCategoryCode, 'ASPHALT_POTHOLE');
  assert.equal(result.correctionApplied, false);
  assert.equal(result.affectedAsset, null);
  assert.equal(result.visibleDefect, null);
  assert.equal(result.confidence, 0.9);
  assert.deepEqual([...result.warnings].filter(w => w === GUARD_WARNINGS.CATEGORY_CORRECTED_BY_STRUCTURED_EVIDENCE || w === GUARD_WARNINGS.CATEGORY_CONTRADICTION_UNRESOLVED), []);
});

test('12b. a malformed visualEvidence (missing sub-fields) is treated identically to absent, never invents a correction', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'DAMAGED_SIDEWALK', severity: 'LOW', confidence: 0.7, visualEvidence: { affectedAsset: 'SIDEWALK' } });
  assert.equal(result.resolvedCategoryCode, 'DAMAGED_SIDEWALK');
  assert.equal(result.correctionApplied, false);
});

// --- confidence policy: never increased -------------------------------------

test('confidence is never increased above the original value in any code path', () => {
  const cases = [
    { categoryCode: 'DAMAGED_SIDEWALK', severity: 'HIGH', confidence: 0.3, visualEvidence: evidence('SIDEWALK', 'BROKEN') },
    { categoryCode: 'ASPHALT_POTHOLE', severity: 'HIGH', confidence: 0.3, visualEvidence: evidence('SIDEWALK', 'BROKEN') },
    { categoryCode: 'ASPHALT_POTHOLE', severity: 'HIGH', confidence: 0.1, visualEvidence: evidence('VEHICLE', 'LEAKING') },
    { categoryCode: 'VISUAL_POLLUTION', severity: 'CRITICAL', confidence: 0.05, visualEvidence: evidence('PUBLIC_SPACE', 'DEGRADED') },
  ];
  for (const input of cases) {
    const result = evaluateMunicipalConsistency(input);
    assert.ok(result.confidence <= input.confidence, `confidence ${result.confidence} must not exceed original ${input.confidence}`);
  }
});

test('a clean exact match never reduces confidence either', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'WATER_LEAKAGE', severity: 'HIGH', confidence: 0.99, visualEvidence: evidence('WATER_INFRASTRUCTURE', 'LEAKING') });
  assert.equal(result.confidence, 0.99);
});

// --- governance: no I/O, no workflow authority ------------------------------

test('the Guard module has no require() of any I/O module (Firestore, network, or otherwise)', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../platform/intelligence/municipal-consistency-guard'), 'utf8');
  // Check actual require(...) calls only, not prose in comments -- the file's
  // own explanatory comments legitimately say things like "no Firestore
  // write", which a comment-blind substring check would misfire on.
  const requiredModules = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
  assert.deepEqual(requiredModules.sort(), ['./explainable-priority-resolver', './municipal-taxonomy'].sort());
  assert.doesNotMatch(src, /\bfetch\s*\(/);
});

test('requiresHumanReview is always true regardless of outcome', () => {
  const allCases = [
    { categoryCode: 'DAMAGED_SIDEWALK', severity: 'HIGH', confidence: 0.9, visualEvidence: evidence('SIDEWALK', 'BROKEN') },
    { categoryCode: 'ASPHALT_POTHOLE', severity: 'HIGH', confidence: 0.9, visualEvidence: evidence('SIDEWALK', 'BROKEN') },
    { categoryCode: 'ASPHALT_POTHOLE', severity: 'HIGH', confidence: 0.9 },
  ];
  for (const input of allCases) assert.equal(evaluateMunicipalConsistency(input).requiresHumanReview, true);
});

test('the Guard output never contains a status/assignment/closure/save field', () => {
  const result = evaluateMunicipalConsistency({ categoryCode: 'ASPHALT_POTHOLE', severity: 'HIGH', confidence: 0.9, visualEvidence: evidence('SIDEWALK', 'BROKEN') });
  const serialized = JSON.stringify(result).toUpperCase();
  for (const forbidden of ['SAVE_OBSERVATION', 'ASSIGN_CONTRACTOR', 'UPDATE_STATUS', 'CLOSE', 'DELETE', 'DEPARTMENT', 'TREATMENT', 'RESPONSEWINDOW']) {
    assert.equal(serialized.includes(forbidden), false, `Guard output must not mention ${forbidden}`);
  }
});

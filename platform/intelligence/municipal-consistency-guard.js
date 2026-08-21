'use strict';
// ============================================================================
// Municipal Consistency Guard — deterministic, evidence-gated cross-check
// between an AI structured perception result (categoryCode + severity) and
// the same call's independently-stated structured evidence
// (visualEvidence.affectedAsset / visibleDefect), resolved EXCLUSIVELY
// against municipal-taxonomy.js — the single source of truth for
// category<->asset/defect/department/treatment/severityRange/responseWindow.
// This module never redefines, re-derives, or duplicates any of that data;
// it only queries it (resolveTaxonomy / candidatesForAssetDefect).
//
// Pure function, zero I/O: no Firestore write, no network call, no second
// AI/provider call, no workflow/assignment/status/closure mutation. It
// consumes only the already-validated Vision result already sitting in
// memory and returns a small additive decision object. Department,
// treatment, and response-window are deliberately NOT computed here —
// municipal-intelligence-engine.js re-resolves those from the FINAL
// resolvedCategoryCode against the taxonomy after calling this Guard, so
// there is exactly one place that ever derives those values.
//
// Confidence can only ever be preserved or reduced by this module, never
// raised — see CONTRADICTION_CONFIDENCE_CEILING, the single centralized
// ceiling applied uniformly to every contradiction this Guard detects
// (a corrected category, an unresolved/ambiguous category, or a severity
// claim outside the resolved category's taxonomy.severityRange).
// ============================================================================
const { resolveTaxonomy, candidatesForAssetDefect } = require('./municipal-taxonomy');
const { SEVERITY_SCORE } = require('./explainable-priority-resolver');

// One centralized ceiling for every contradiction case below — intentionally
// the single number this whole module can ever apply, so "how much does a
// contradiction cost confidence" has exactly one answer to audit and test.
const CONTRADICTION_CONFIDENCE_CEILING = 0.5;

const GUARD_WARNINGS = Object.freeze({
  CATEGORY_CORRECTED_BY_STRUCTURED_EVIDENCE: 'CATEGORY_CORRECTED_BY_STRUCTURED_EVIDENCE',
  CATEGORY_CONTRADICTION_UNRESOLVED: 'CATEGORY_CONTRADICTION_UNRESOLVED',
  SEVERITY_OUTSIDE_TAXONOMY_RANGE: 'SEVERITY_OUTSIDE_TAXONOMY_RANGE',
});

function clean(value) { return typeof value === 'string' ? value.trim() : ''; }

// Pulls an out-of-range severity back inside the FINAL (post-correction)
// category's own declared severityRange. This is enforcement of taxonomy
// policy that already exists per-entry (severityRange), not an invented new
// severity policy — see municipal-taxonomy.js. It can only ever move a
// severity toward the resolved category's own bounds, so it can never let an
// out-of-range model claim push priority any higher than that category's own
// documented maximum severity allows.
function clampSeverityToRange(severity, range) {
  const rank = Object.hasOwn(SEVERITY_SCORE, severity) ? SEVERITY_SCORE[severity] : null;
  if (rank === null || !Array.isArray(range) || range.length !== 2) return severity;
  const [minLabel, maxLabel] = range;
  if (!Object.hasOwn(SEVERITY_SCORE, minLabel) || !Object.hasOwn(SEVERITY_SCORE, maxLabel)) return severity;
  const minRank = SEVERITY_SCORE[minLabel];
  const maxRank = SEVERITY_SCORE[maxLabel];
  if (rank < minRank) return minLabel;
  if (rank > maxRank) return maxLabel;
  return severity;
}

// hasStructuredEvidence is deliberately strict: both affectedAsset and
// visibleDefect must be present, non-empty strings. Anything else (the whole
// visualEvidence object absent, malformed, or only partially populated) is
// treated identically to "no structured evidence at all" -- the safe,
// backward-compatible default of preserving the original classification
// unchanged, never inferring a contradiction from missing data.
function hasStructuredEvidence(visualEvidence) {
  return !!(visualEvidence && typeof visualEvidence === 'object' && !Array.isArray(visualEvidence)
    && clean(visualEvidence.affectedAsset) && clean(visualEvidence.visibleDefect));
}

function evaluateMunicipalConsistency({ categoryCode, severity, severityScore, confidence, visualEvidence } = {}) {
  const originalCategoryCode = clean(categoryCode) || 'UNKNOWN';
  const originalTaxonomy = resolveTaxonomy(originalCategoryCode);
  const originalSeverity = typeof severity === 'string' && severity ? severity : 'UNKNOWN';
  const originalConfidence = Number.isFinite(confidence) ? confidence : 0;

  const warnings = [];
  let resolvedTaxonomy = originalTaxonomy;
  let correctionApplied = false;
  let categoryContradiction = false;

  if (hasStructuredEvidence(visualEvidence)) {
    const affectedAsset = clean(visualEvidence.affectedAsset).toUpperCase();
    const visibleDefect = clean(visualEvidence.visibleDefect).toUpperCase();
    const exactMatch = originalTaxonomy.asset === affectedAsset && originalTaxonomy.defect === visibleDefect;

    if (!exactMatch) {
      categoryContradiction = true;
      // CASE B: structured evidence disagrees with categoryCode, but maps to
      // exactly one real taxonomy entry -- a deterministic, unambiguous
      // correction (never a guess between multiple plausible categories).
      const candidates = candidatesForAssetDefect(affectedAsset, visibleDefect);
      if (candidates.length === 1) {
        resolvedTaxonomy = candidates[0];
        correctionApplied = true;
        warnings.push(GUARD_WARNINGS.CATEGORY_CORRECTED_BY_STRUCTURED_EVIDENCE);
      } else {
        // CASE D: zero or multiple candidates -- never guess. Fall back to
        // UNKNOWN and require human review instead of silently picking one
        // of several plausible categories or inventing a new one.
        resolvedTaxonomy = resolveTaxonomy('UNKNOWN');
        warnings.push(GUARD_WARNINGS.CATEGORY_CONTRADICTION_UNRESOLVED);
      }
    }
    // CASE A (exactMatch === true): resolvedTaxonomy stays === originalTaxonomy,
    // no warning, confidence untouched by this check.
  }
  // No structured evidence at all (legacy/pre-hardening analyses, or a
  // malformed visualEvidence): resolvedTaxonomy stays === originalTaxonomy.
  // Never inferring a contradiction from absent data is the backward-
  // compatibility guarantee for every observation analyzed before this
  // Guard existed.

  // CASE E: severity is validated against the FINAL resolved category's own
  // severityRange -- the category that is actually being used downstream,
  // not the model's original (possibly now-corrected-away) claim.
  const resolvedSeverity = resolvedTaxonomy.code === 'UNKNOWN' ? 'UNKNOWN' : clampSeverityToRange(originalSeverity, resolvedTaxonomy.severityRange);
  const severityContradiction = resolvedSeverity !== originalSeverity;
  if (severityContradiction) warnings.push(GUARD_WARNINGS.SEVERITY_OUTSIDE_TAXONOMY_RANGE);

  const contradictionDetected = categoryContradiction || severityContradiction;
  // Confidence policy: preserve on a clean match, otherwise clamp down to the
  // single centralized ceiling -- never raised, never manufactured, and a
  // contradiction is never hidden by leaving confidence untouched.
  const resolvedConfidence = contradictionDetected ? Math.min(originalConfidence, CONTRADICTION_CONFIDENCE_CEILING) : originalConfidence;

  return Object.freeze({
    originalCategoryCode,
    resolvedCategoryCode: resolvedTaxonomy.code,
    affectedAsset: hasStructuredEvidence(visualEvidence) ? clean(visualEvidence.affectedAsset).toUpperCase() : null,
    visibleDefect: hasStructuredEvidence(visualEvidence) ? clean(visualEvidence.visibleDefect).toUpperCase() : null,
    originalSeverity,
    resolvedSeverity,
    severityScore: Number.isFinite(severityScore) ? severityScore : null,
    confidence: resolvedConfidence,
    warnings: Object.freeze([...new Set(warnings)]),
    contradictionDetected,
    correctionApplied,
    requiresHumanReview: true,
  });
}

module.exports = Object.freeze({
  CONTRADICTION_CONFIDENCE_CEILING,
  GUARD_WARNINGS,
  clampSeverityToRange,
  evaluateMunicipalConsistency,
});

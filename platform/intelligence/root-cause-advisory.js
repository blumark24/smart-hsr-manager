'use strict';
// ============================================================================
// Root Cause Advisory — deterministic, evidence-gated, NEVER a second AI/
// provider call. Consumes only the already-validated Vision result
// (observation.aiAnalysis) and observation metadata.
//
// The central rule this file exists to enforce: a resolved taxonomy category
// alone is NEVER sufficient evidence for a probable cause. A defect photo
// proves the defect, not its mechanism. Every candidate cause below is
// gated behind an explicit, narrow textual signal actually present in the
// Vision output; when no such signal exists (the normal case for image-only
// evidence), this returns an honest empty result with guidance on what
// field verification would be needed instead of guessing.
//
// Never inferred without an explicit matching signal: poor maintenance,
// lack of follow-up, lack of automation, contractor fault, negligence,
// collision, underground water leakage, aging/material fatigue, traffic
// loading, drainage failure. None of these appear as a default/unconditional
// hypothesis anywhere below.
//
// rootCauseProven is hardcoded false for Sprint 4 -- intentionally, not an
// oversight. A matched textual signal (see below) is a candidate hypothesis,
// not corroboration: nothing in this system's current observation data
// model can independently corroborate a SPECIFIC causeCode (e.g. a separate
// physical field-inspection record tied to that exact cause). A generic
// "some evidence field is truthy" boolean would not be cause-specific and
// was deliberately rejected. Proof must stay inactive until a real,
// cause-keyed corroboration contract exists; wiring that in later is a
// contract change to this function, not a flag flip.
// ============================================================================
const { resolveTaxonomy } = require('./municipal-taxonomy');

function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
function textContains(haystack, needle) { return typeof haystack === 'string' && haystack.includes(needle); }

// Each hypothesis only ever becomes a candidate if one of its narrow,
// literal supportingSignals phrases is actually present in the Vision
// output text -- never from category membership alone.
const CAUSE_HYPOTHESES = Object.freeze([
  Object.freeze({
    causeCode: 'IMPACT_COLLISION_DAMAGE',
    labelAr: 'تلف محتمل ناتج عن تصادم أو اصطدام',
    applicableCategories: Object.freeze(['ASPHALT_POTHOLE', 'DAMAGED_SIGN', 'DAMAGED_LIGHTING_POLE', 'DAMAGED_BARRIER', 'DAMAGED_SIDEWALK']),
    requiredEvidenceSignals: Object.freeze(['وصف تحليل الرؤية يذكر أثر تصادم أو اصطدام صراحة']),
    supportingSignals: Object.freeze(['تصادم', 'اصطدام']),
    verificationSteps: Object.freeze(['فحص ميداني لتأكيد وجود أثر تصادم فعلي.', 'توثيق أي أجزاء متضررة إن وُجدت.']),
    prohibitedAssumptions: Object.freeze(['لا يُفترض التصادم كسبب دون أثر مرئي موصوف صراحة في التحليل.']),
  }),
  Object.freeze({
    causeCode: 'VISIBLE_ACTIVE_WATER_AT_DEFECT',
    labelAr: 'وجود مياه ظاهرة داخل الملاحظة نفسها',
    applicableCategories: Object.freeze(['ASPHALT_POTHOLE', 'GROUND_SUBSIDENCE']),
    requiredEvidenceSignals: Object.freeze(['وصف تحليل الرؤية يذكر مياه أو رطوبة ظاهرة داخل الموقع نفسه صراحة']),
    supportingSignals: Object.freeze(['مياه داخل الحفرة', 'مياه ظاهرة في الموقع', 'رطوبة ظاهرة داخل']),
    verificationSteps: Object.freeze(['فحص ميداني لتأكيد وجود مياه فعلية وتحديد مصدرها المحتمل.']),
    prohibitedAssumptions: Object.freeze(['لا يُفترض وجود تسرب مياه جوفي دون دليل مباشر يُظهر المياه في التحليل.']),
  }),
  Object.freeze({
    causeCode: 'ROOT_INTRUSION_VISIBLE',
    labelAr: 'تأثير جذور أشجار ظاهرة',
    applicableCategories: Object.freeze(['DAMAGED_SIDEWALK']),
    requiredEvidenceSignals: Object.freeze(['وصف تحليل الرؤية يذكر جذر شجرة ظاهر صراحة']),
    supportingSignals: Object.freeze(['جذر شجرة', 'جذور ظاهرة']),
    verificationSteps: Object.freeze(['فحص ميداني لتأكيد وجود جذور مؤثرة فعلياً.']),
    prohibitedAssumptions: Object.freeze(['لا يُفترض تأثير الجذور دون ظهورها صراحة في التحليل.']),
  }),
]);

// Category-keyed guidance on what a defect-only photo cannot show -- these
// are things to CHECK, never presented as causes themselves.
const CATEGORY_VERIFICATION_GUIDANCE = Object.freeze({
  ASPHALT_POTHOLE: Object.freeze({
    missingEvidence: Object.freeze([
      'فحص طبقات الرصف في الموقع',
      'التحقق من وجود هبوط أو رطوبة أسفل طبقة الأسفلت',
      'مراجعة حالة التصريف المحيط بالموقع',
    ]),
    verificationSteps: Object.freeze([
      'فحص ميداني للحفرة ومحيطها',
      'التحقق من حالة الطبقات أسفل السطح',
      'التحقق من وجود تجمع أو تسرب مياه فقط إذا ظهر دليل ميداني',
    ]),
  }),
  DAMAGED_SIDEWALK: Object.freeze({
    missingEvidence: Object.freeze([
      'فحص مواد الرصف ومدى تأثرها بالتقادم',
      'التحقق من وجود جذور أشجار أو عوامل ضغط أسفل الرصيف',
      'مراجعة حالة الصرف والرطوبة حول الموقع',
    ]),
    verificationSteps: Object.freeze([
      'فحص ميداني للجزء المتضرر من الرصيف',
      'التحقق من وجود جذور ظاهرة أو ضغط سطحي',
      'توثيق مدى الضرر وامتداده',
    ]),
  }),
});
const DEFAULT_VERIFICATION_GUIDANCE = Object.freeze({
  missingEvidence: Object.freeze(['فحص ميداني مباشر للموقع لتحديد العوامل المرتبطة بالحالة.']),
  verificationSteps: Object.freeze(['إجراء مراجعة ميدانية لتوثيق أدلة إضافية قبل تحديد السبب.']),
});

const UNPROVEN_CONFIDENCE_CEILING = 0.4;
const MATCHED_HYPOTHESIS_CONFIDENCE_CEILING = 0.5;

// Sprint 4: no cause-specific corroboration contract exists. Always false.
// See the file-level comment above for why this is not a flag to flip.
const ROOT_CAUSE_PROVEN_SPRINT4 = false;

function unresolvedCategoryResult() {
  return Object.freeze({
    probableCauses: Object.freeze([]),
    evidenceForEachCause: Object.freeze([]),
    confidence: 0,
    missingEvidence: Object.freeze(['تحديد نوع الملاحظة بدقة من صورة أو دليل أوضح قبل تحليل السبب الجذري.']),
    verificationSteps: Object.freeze(['مراجعة ميدانية لتحديد نوع الملاحظة بدقة.']),
    rootCauseProven: ROOT_CAUSE_PROVEN_SPRINT4,
    optionalFiveWhys: Object.freeze([]),
  });
}

function createRootCauseAdvisory({ aiAnalysis, observation } = {}) {
  if (!aiAnalysis || typeof aiAnalysis !== 'object') {
    return { ok: false, errorCode: 'ROOT_CAUSE_VISION_REQUIRED', reason: 'A Vision analysis must exist before a root-cause advisory can be produced.' };
  }
  const taxonomy = resolveTaxonomy(clean(aiAnalysis.category));

  // Rule: standing-water/UNKNOWN never reaches the hypothesis catalog at
  // all -- structural, not just an absence of matches.
  if (taxonomy.code === 'UNKNOWN') {
    return { ok: true, rootCause: unresolvedCategoryResult() };
  }

  const evidenceText = [clean(aiAnalysis.explanation), clean(aiAnalysis.recommendedActionAr)].join(' ');
  const visionConfidence = Number.isFinite(aiAnalysis.confidence) ? aiAnalysis.confidence : 0;
  const applicable = CAUSE_HYPOTHESES.filter(h => h.applicableCategories.includes(taxonomy.code));
  const matched = applicable.filter(h => h.supportingSignals.some(signal => textContains(evidenceText, signal)));
  const guidance = CATEGORY_VERIFICATION_GUIDANCE[taxonomy.code] || DEFAULT_VERIFICATION_GUIDANCE;

  if (!matched.length) {
    return {
      ok: true,
      rootCause: Object.freeze({
        probableCauses: Object.freeze([]),
        evidenceForEachCause: Object.freeze([]),
        confidence: Math.min(visionConfidence, UNPROVEN_CONFIDENCE_CEILING),
        missingEvidence: guidance.missingEvidence,
        verificationSteps: guidance.verificationSteps,
        rootCauseProven: ROOT_CAUSE_PROVEN_SPRINT4,
        optionalFiveWhys: Object.freeze([]),
      }),
    };
  }

  // A matched textual signal is a CANDIDATE hypothesis, not a proven cause
  // -- explicitly labeled below, never asserted. rootCauseProven stays
  // false regardless (see ROOT_CAUSE_PROVEN_SPRINT4 above): a matched
  // Vision signal is not independent corroboration of that specific cause.
  const probableCauses = Object.freeze(matched.map(h => `${h.labelAr} — فرضية تتطلب التحقق الميداني`));
  const evidenceForEachCause = Object.freeze(matched.map(h => {
    const matchedSignal = h.supportingSignals.find(signal => textContains(evidenceText, signal));
    return `تحليل الرؤية ذكر: "${matchedSignal}" — دليل نصي أولي غير مؤكد ميدانياً.`;
  }));
  // Merge category-level guidance with hypothesis-specific steps so a
  // surfaced candidate never loses the general verification guidance.
  const verificationSteps = Object.freeze([...new Set([...guidance.verificationSteps, ...matched.flatMap(h => h.verificationSteps)])]);

  return {
    ok: true,
    rootCause: Object.freeze({
      probableCauses,
      evidenceForEachCause,
      confidence: Math.min(visionConfidence, MATCHED_HYPOTHESIS_CONFIDENCE_CEILING),
      missingEvidence: guidance.missingEvidence,
      verificationSteps,
      rootCauseProven: ROOT_CAUSE_PROVEN_SPRINT4,
      optionalFiveWhys: Object.freeze([]),
    }),
  };
}

module.exports = {
  createRootCauseAdvisory,
  CAUSE_HYPOTHESES,
  CATEGORY_VERIFICATION_GUIDANCE,
  DEFAULT_VERIFICATION_GUIDANCE,
  ROOT_CAUSE_PROVEN_SPRINT4,
  textContains,
};

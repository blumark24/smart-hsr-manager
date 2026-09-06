'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRootCauseAdvisory, ROOT_CAUSE_PROVEN_SPRINT4 } = require('../platform/intelligence/root-cause-advisory');

const PROHIBITED_TERMS = [
  'صيانة سيئة', 'تأخر صيانة', 'نقص متابعة', 'غياب آلية تنبيه',
  'إهمال', 'خطأ المقاول', 'تسرب مياه جوفي', 'تعب المواد', 'تقادم المواد',
  'أحمال مرورية', 'فشل الصرف', 'ضعف التصريف',
];

function serialize(rootCause) { return JSON.stringify(rootCause); }

test('ROOT_CAUSE_PROVEN_SPRINT4 constant is hardcoded false', () => {
  assert.equal(ROOT_CAUSE_PROVEN_SPRINT4, false);
});

test('missing aiAnalysis fails honestly with ROOT_CAUSE_VISION_REQUIRED', () => {
  const result = createRootCauseAdvisory({});
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'ROOT_CAUSE_VISION_REQUIRED');
});

// --- Golden Case: pothole, real captured evidence text (no matching signal) ---

test('golden pothole case: image-only evidence produces the exact expected empty-cause result', () => {
  const aiAnalysis = {
    category: 'ASPHALT_POTHOLE',
    confidence: 0.85,
    explanation: 'تم رصد حفرة في الطريق تشكل خطراً على السلامة وتتطلب إصلاحاً فورياً.',
    recommendedActionAr: 'تأمين الموقع وتنفيذ ترقيع أسفلتي ملائم.',
  };
  const { rootCause } = createRootCauseAdvisory({ aiAnalysis, observation: { location: '21.5,39.2' } });

  assert.equal(rootCause.rootCauseProven, false);
  assert.deepEqual(rootCause.probableCauses, []);
  assert.deepEqual(rootCause.optionalFiveWhys, []);
  assert.deepEqual(rootCause.missingEvidence, [
    'فحص طبقات الرصف في الموقع',
    'التحقق من وجود هبوط أو رطوبة أسفل طبقة الأسفلت',
    'مراجعة حالة التصريف المحيط بالموقع',
  ]);
  assert.deepEqual(rootCause.verificationSteps, [
    'فحص ميداني للحفرة ومحيطها',
    'التحقق من حالة الطبقات أسفل السطح',
    'التحقق من وجود تجمع أو تسرب مياه فقط إذا ظهر دليل ميداني',
  ]);
  assert.ok(rootCause.confidence < 0.5);
});

// --- Golden Case: standing-water / UNKNOWN never gets fabricated hypotheses ---

test('golden standing-water case: UNKNOWN taxonomy short-circuits before the hypothesis catalog', () => {
  const aiAnalysis = {
    category: 'STREET_MAINTENANCE', // real captured raw provider code, unsupported -> resolves UNKNOWN
    confidence: 0.8,
    explanation: 'تم رصد تجمع مياه على الطريق قد يعيق حركة المركبات ويشكل خطر انزلاق.',
    recommendedActionAr: 'تصريف المياه المتجمعة وتنظيف الموقع.',
  };
  const { rootCause } = createRootCauseAdvisory({ aiAnalysis, observation: {} });
  assert.equal(rootCause.rootCauseProven, false);
  assert.deepEqual(rootCause.probableCauses, []);
  assert.deepEqual(rootCause.optionalFiveWhys, []);
  assert.equal(rootCause.confidence, 0);
});

// --- Golden Case: damaged sidewalk ---

test('golden damaged-sidewalk case: image-only evidence produces sidewalk-specific empty-cause guidance', () => {
  const aiAnalysis = {
    category: 'DAMAGED_SIDEWALK',
    confidence: 0.82,
    explanation: 'تم رصد رصيف متضرر يعيق حركة المشاة.',
    recommendedActionAr: 'تأمين الجزء المتضرر وإصلاح الرصيف.',
  };
  const { rootCause } = createRootCauseAdvisory({ aiAnalysis, observation: {} });
  assert.equal(rootCause.rootCauseProven, false);
  assert.deepEqual(rootCause.probableCauses, []);
  assert.deepEqual(rootCause.optionalFiveWhys, []);
  assert.deepEqual(rootCause.missingEvidence, [
    'فحص مواد الرصف ومدى تأثرها بالتقادم',
    'التحقق من وجود جذور أشجار أو عوامل ضغط أسفل الرصيف',
    'مراجعة حالة الصرف والرطوبة حول الموقع',
  ]);
});

test('damaged sidewalk must never be misclassified as a lighting-pole cause even with a matched keyword elsewhere', () => {
  const aiAnalysis = {
    category: 'DAMAGED_SIDEWALK',
    confidence: 0.8,
    explanation: 'تم رصد رصيف متضرر بشكل واضح.',
    recommendedActionAr: 'إصلاح الرصيف.',
  };
  const { rootCause } = createRootCauseAdvisory({ aiAnalysis, observation: {} });
  const serialized = serialize(rootCause);
  assert.equal(serialized.includes('عمود'), false);
  assert.equal(serialized.includes('إنارة'), false);
});

// --- A matched textual signal is a candidate, never a proven cause ---

test('a matched supporting signal surfaces a labeled candidate hypothesis, but rootCauseProven stays false and optionalFiveWhys stays empty', () => {
  const aiAnalysis = {
    category: 'ASPHALT_POTHOLE',
    confidence: 0.9,
    explanation: 'تم رصد حفرة في الطريق ناتجة عن تصادم مركبة واضح في الموقع.',
    recommendedActionAr: 'تأمين الموقع وتنفيذ ترقيع أسفلتي ملائم.',
  };
  const { rootCause } = createRootCauseAdvisory({ aiAnalysis, observation: {} });

  assert.equal(rootCause.rootCauseProven, false);
  assert.deepEqual(rootCause.optionalFiveWhys, []);
  assert.equal(rootCause.probableCauses.length, 1);
  assert.match(rootCause.probableCauses[0], /فرضية تتطلب التحقق الميداني/);
  assert.equal(rootCause.evidenceForEachCause.length, 1);
  assert.match(rootCause.evidenceForEachCause[0], /تصادم/);
  assert.ok(rootCause.confidence <= 0.5);
  // Category-level guidance must still be present alongside the candidate.
  assert.ok(rootCause.missingEvidence.length > 0);
  assert.ok(rootCause.verificationSteps.length > 0);
});

// --- fieldVerificationEvidence (or any similarly-named generic flag) must NOT flip rootCauseProven ---

test('a generic truthy evidence-shaped field on the observation does not prove anything (no generic corroboration boolean exists)', () => {
  const aiAnalysis = {
    category: 'ASPHALT_POTHOLE',
    confidence: 0.9,
    explanation: 'تم رصد حفرة في الطريق ناتجة عن تصادم واضح.',
    recommendedActionAr: 'تأمين الموقع.',
  };
  const observation = { fieldVerificationEvidence: true, someOtherEvidenceFlag: true };
  const { rootCause } = createRootCauseAdvisory({ aiAnalysis, observation });
  assert.equal(rootCause.rootCauseProven, false);
  assert.deepEqual(rootCause.optionalFiveWhys, []);
});

// --- Prohibited hallucination assertions: none of these terms ever appear when no matching evidence exists ---

test('no prohibited unsupported-inference term ever appears in output for image-only evidence with no matching signal', () => {
  const cases = [
    { category: 'ASPHALT_POTHOLE', explanation: 'تم رصد حفرة في الطريق.', recommendedActionAr: 'إصلاح الحفرة.' },
    { category: 'DAMAGED_SIDEWALK', explanation: 'تم رصد رصيف متضرر.', recommendedActionAr: 'إصلاح الرصيف.' },
    { category: 'WATER_LEAKAGE', explanation: 'تم رصد بللٍ على الأرض.', recommendedActionAr: 'فحص الموقع.' },
  ];
  for (const aiAnalysis of cases) {
    const { rootCause } = createRootCauseAdvisory({ aiAnalysis: { ...aiAnalysis, confidence: 0.8 }, observation: {} });
    const serialized = serialize(rootCause);
    for (const term of PROHIBITED_TERMS) {
      assert.equal(serialized.includes(term), false, `prohibited term "${term}" leaked for category ${aiAnalysis.category}`);
    }
  }
});

test('resolveTaxonomy category membership alone never populates probableCauses (no keyword match)', () => {
  const aiAnalysis = {
    category: 'ASPHALT_POTHOLE',
    confidence: 0.85,
    explanation: 'تم رصد حفرة أسفلتية واضحة في منتصف الطريق.',
    recommendedActionAr: 'تنفيذ ترقيع أسفلتي.',
  };
  const { rootCause } = createRootCauseAdvisory({ aiAnalysis, observation: {} });
  assert.deepEqual(rootCause.probableCauses, []);
});

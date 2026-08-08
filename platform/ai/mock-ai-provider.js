'use strict';

const { LOW_CONFIDENCE_FALLBACK_AR } = require('./arabic-summary-policy');
const { MUNICIPAL_SUMMARY_FIXTURES } = require('./municipal-summary-fixtures');
const SUMMARY_BY_FIXTURE = new Map(MUNICIPAL_SUMMARY_FIXTURES.map(item => [item.fixtureId, item.shortSummaryAr]));

const FIXTURES = Object.freeze({
  ASPHALT_POTHOLE: Object.freeze({ summary: 'تم رصد حفرة أسفلتية تتطلب معالجة عاجلة لحماية مستخدمي الطريق.', categoryCode: 'ROAD_DEFECT', categoryLabelAr: 'عيب في الطريق', severity: 'HIGH', score: 78, priority: 'URGENT', action: 'تأمين الموقع وإصلاح طبقات الأسفلت المتضررة.', confidence: 0.94, quality: 'GOOD', department: 'إدارة صيانة الطرق' }),
  LEANING_LIGHTING_POLE: Object.freeze({ summary: 'تم رصد عمود إنارة مائل يستوجب المعالجة حفاظاً على السلامة.', categoryCode: 'LIGHTING_DEFECT', categoryLabelAr: 'خلل في الإنارة', severity: 'CRITICAL', score: 92, priority: 'URGENT', action: 'عزل الموقع وفحص العمود وتثبيته أو استبداله.', confidence: 0.92, quality: 'GOOD', department: 'إدارة الإنارة' }),
  FALLEN_PALM_TREE: Object.freeze({ summary: 'تم رصد نخلة ساقطة تعيق الحركة وتتطلب الإزالة الآمنة.', categoryCode: 'VEGETATION_HAZARD', categoryLabelAr: 'خطر نباتي', severity: 'HIGH', score: 80, priority: 'URGENT', action: 'تأمين المسار وإزالة النخلة ونقل المخلفات.', confidence: 0.93, quality: 'GOOD', department: 'إدارة الحدائق والتشجير' }),
  CONSTRUCTION_WASTE: Object.freeze({ summary: 'تم رصد مخلفات بناء متراكمة تستوجب الإزالة والتنظيف الآمن.', categoryCode: 'CONSTRUCTION_WASTE', categoryLabelAr: 'مخلفات بناء', severity: 'MEDIUM', score: 58, priority: 'HIGH', action: 'إزالة المخلفات وتنظيف الموقع والتحقق من مصدرها.', confidence: 0.9, quality: 'ACCEPTABLE', department: 'إدارة النظافة' }),
  WATER_LEAKAGE: Object.freeze({ summary: 'تم رصد تسرب مياه يتطلب إيقاف المصدر ومعالجة الأثر.', categoryCode: 'WATER_LEAK', categoryLabelAr: 'تسرب مياه', severity: 'HIGH', score: 82, priority: 'URGENT', action: 'تحديد المصدر وإيقاف التسرب ومعالجة الموقع.', confidence: 0.91, quality: 'GOOD', department: 'إدارة خدمات المياه' }),
  DAMAGED_SIGN: Object.freeze({ summary: 'تم رصد لوحة إرشادية متضررة تتطلب الإصلاح لضمان وضوح التوجيه.', categoryCode: 'SIGN_DAMAGE', categoryLabelAr: 'تلف لوحة إرشادية', severity: 'MEDIUM', score: 52, priority: 'NORMAL', action: 'فحص اللوحة وإصلاحها أو استبدالها وتثبيتها.', confidence: 0.88, quality: 'ACCEPTABLE', department: 'إدارة السلامة المرورية' }),
  UNCLEAR_IMAGE: Object.freeze({ summary: LOW_CONFIDENCE_FALLBACK_AR, categoryCode: 'UNKNOWN', categoryLabelAr: 'غير محدد', severity: 'UNKNOWN', score: 0, priority: 'UNKNOWN', action: 'إجراء مراجعة ميدانية والتقاط صورة أوضح.', confidence: 0.3, quality: 'POOR' }),
});

function createMockAIProvider({ fixture = 'ASPHALT_POTHOLE', mode = 'VALID' } = {}) {
  return Object.freeze({
    async analyzeObservationImage(input = {}) {
      if (mode === 'TIMEOUT') throw Object.assign(new Error('mock timeout'), { code: 'AI_TIMEOUT' });
      if (mode === 'FAILURE') throw new Error('mock provider failure');
      if (mode === 'INVALID_OUTPUT') return { ok: true, malformed: true, secret: 'must-not-pass' };
      if (fixture === 'UNSUPPORTED_IMAGE') throw Object.assign(new Error('unsupported fixture'), { code: 'AI_UNSUPPORTED_IMAGE' });
      const data = FIXTURES[fixture] || FIXTURES.UNCLEAR_IMAGE;
      return Object.freeze({
        ok: true, analysisId: `mock-${String(fixture).toLowerCase()}`, shortSummaryAr: SUMMARY_BY_FIXTURE.get(fixture) || data.summary,
        categoryCode: data.categoryCode, categoryLabelAr: data.categoryLabelAr,
        severity: data.severity, severityScore: data.score, prioritySuggestion: data.priority,
        responsibleDepartmentSuggestion: data.department, recommendedActionAr: data.action,
        confidence: data.confidence, imageQuality: data.quality, requiresHumanReview: true,
        warnings: Object.freeze(data.confidence < 0.65 ? ['LOW_CONFIDENCE'] : []),
        provider: 'MOCK', model: 'deterministic-fixture', modelVersion: '1', processingTimeMs: 1,
      });
    },
    async verifyBeforeAfter() { return Object.freeze({ ok: false, errorCode: 'MOCK_NOT_IMPLEMENTED', reason: 'No image comparison is performed.' }); },
    async suggestPriority() { return Object.freeze({ ok: false, errorCode: 'MOCK_NOT_IMPLEMENTED', reason: 'Use the analyzed fixture only.' }); },
    async healthCheck() { return Object.freeze({ ok: true, provider: 'MOCK', network: false }); },
  });
}

module.exports = Object.freeze({ FIXTURES, createMockAIProvider });

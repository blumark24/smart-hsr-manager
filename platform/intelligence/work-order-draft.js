'use strict';
// ============================================================================
// Work Order Draft — deterministic, from validated Municipal Intelligence
// (observation.aiAnalysis) + observation metadata only. NEVER a second AI/
// provider call. Independent of Root Cause: requires only that Vision has
// run, never rootCauseProven or any Root Cause output.
//
// DRAFT / ADVISORY ONLY: this module never produces a status, assignment,
// contractor-assignment, or completion/closure field. closureRequirements
// below explicitly states a manager must approve real closure through the
// existing workflow -- this draft cannot cause it.
// ============================================================================
const { resolveTaxonomy } = require('./municipal-taxonomy');
const { DEPARTMENTS, RISK_INDICATORS } = require('./municipal-intelligence-contract');

function clean(value) { return typeof value === 'string' ? value.trim() : ''; }

const SLA_LABELS_AR = Object.freeze({
  IMMEDIATE: 'فوري',
  WITHIN_4_HOURS: 'خلال 4 ساعات',
  WITHIN_24_HOURS: 'خلال 24 ساعة',
  WITHIN_72_HOURS: 'خلال 72 ساعة',
  PLANNED_MAINTENANCE: 'ضمن خطة الصيانة الدورية',
  MANUAL_REVIEW_REQUIRED: 'يتطلب مراجعة ميدانية لتحديد الإطار الزمني',
  UNKNOWN: 'غير محدد',
});

const REQUIRED_EVIDENCE = Object.freeze([
  'صورة "قبل" (متوفرة ضمن الملاحظة).',
  'صورة "بعد" المعالجة لإثبات الإغلاق.',
]);
const CLOSURE_REQUIREMENTS = Object.freeze([
  'إرفاق صورة "بعد" تُظهر اكتمال المعالجة.',
  'تأكيد مطابقة العمل المنفذ لنطاق العمل المحدد أعلاه.',
  'اعتماد المدير للإغلاق النهائي عبر مسار العمل الحالي — لا يتم الإغلاق آلياً من هذه المسودة.',
]);

function createWorkOrderDraft({ aiAnalysis, observation } = {}) {
  if (!aiAnalysis || typeof aiAnalysis !== 'object') {
    return { ok: false, errorCode: 'WORK_ORDER_VISION_REQUIRED', reason: 'A Vision analysis must exist before a work order draft can be produced.' };
  }
  const taxonomy = resolveTaxonomy(clean(aiAnalysis.category));
  const location = clean(observation && observation.location) || 'غير محدد';
  const priority = clean(aiAnalysis.prioritySuggestion) || 'UNKNOWN';

  if (taxonomy.code === 'UNKNOWN') {
    return {
      ok: true,
      workOrder: Object.freeze({
        workType: 'يتطلب تحديد ميداني',
        location,
        priority: 'UNKNOWN',
        targetSla: SLA_LABELS_AR.MANUAL_REVIEW_REQUIRED,
        scopeOfWork: 'تعذر تحديد نوع العمل آلياً؛ يتطلب مراجعة ميدانية لتحديد نطاق العمل قبل الإسناد.',
        recommendedDiscipline: DEPARTMENTS[taxonomy.department] || DEPARTMENTS.UNKNOWN,
        executionSteps: Object.freeze(['إجراء مراجعة ميدانية لتحديد نوع الملاحظة ونطاق العمل المطلوب.']),
        safetyConsiderations: Object.freeze(['اتخاذ الاحتياطات العامة للسلامة حتى تحديد طبيعة الملاحظة.']),
        requiredEvidence: REQUIRED_EVIDENCE,
        closureRequirements: CLOSURE_REQUIREMENTS,
      }),
    };
  }

  const executionSteps = [];
  const needsIsolation = taxonomy.safetyFlags.includes('PUBLIC_SAFETY') || taxonomy.safetyFlags.includes('TRAFFIC_OBSTRUCTION') || taxonomy.safetyFlags.includes('FALL_RISK');
  if (needsIsolation) executionSteps.push('تأمين الموقع وعزله عن حركة المشاة أو المركبات حسب الحاجة.');
  if (taxonomy.powerIsolation) executionSteps.push('فصل مصدر الكهرباء عن العنصر المتضرر قبل أي تدخل.');
  executionSteps.push(taxonomy.treatmentGuidanceAr);
  executionSteps.push('توثيق العمل بصورة "بعد" واضحة قبل إغلاق البلاغ.');

  const safetyConsiderations = taxonomy.safetyFlags.length
    ? taxonomy.safetyFlags.map(flag => RISK_INDICATORS[flag] || RISK_INDICATORS.UNKNOWN)
    : ['لا توجد مخاطر سلامة محددة لهذا التصنيف؛ اتباع الإجراءات العامة للسلامة.'];

  return {
    ok: true,
    workOrder: Object.freeze({
      workType: taxonomy.labelAr,
      location,
      priority,
      targetSla: SLA_LABELS_AR[taxonomy.responseWindow] || SLA_LABELS_AR.UNKNOWN,
      scopeOfWork: taxonomy.treatmentGuidanceAr,
      recommendedDiscipline: DEPARTMENTS[taxonomy.department] || DEPARTMENTS.UNKNOWN,
      executionSteps: Object.freeze(executionSteps),
      safetyConsiderations: Object.freeze(safetyConsiderations),
      requiredEvidence: REQUIRED_EVIDENCE,
      closureRequirements: CLOSURE_REQUIREMENTS,
    }),
  };
}

module.exports = { createWorkOrderDraft, SLA_LABELS_AR, REQUIRED_EVIDENCE, CLOSURE_REQUIREMENTS };

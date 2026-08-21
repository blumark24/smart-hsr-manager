'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MUNICIPAL_TAXONOMY, TAXONOMY_BY_CODE } = require('../platform/intelligence/municipal-taxonomy');

// Golden snapshot of every field that existed BEFORE the Municipal Decision
// Intelligence hardening's asset/defect enrichment. Locks these values so the
// enrichment (adding asset/defect) can never silently alter code, labelAr,
// parentCategory, department, severityRange, responseWindow,
// treatmentGuidanceAr, safetyFlags, or humanReviewRequired for any
// pre-existing entry.
const PRE_ENRICHMENT_FIELDS = Object.freeze({
  ROADS_AND_ASPHALT: { labelAr:'الطرق والأسفلت', parentCategory:'ROADS', department:'ROADS', severityRange:['LOW','HIGH'], responseWindow:'WITHIN_72_HOURS', treatmentGuidanceAr:'فحص الموقع وتنفيذ معالجة مناسبة لسطح الطريق.', safetyFlags:[], humanReviewRequired:true },
  ROAD_CRACKING: { labelAr:'تشققات الطريق', parentCategory:'ROADS_AND_ASPHALT', department:'ROADS', severityRange:['LOW','HIGH'], responseWindow:'WITHIN_72_HOURS', treatmentGuidanceAr:'تقييم امتداد التشققات ومعالجة طبقات الطريق المتأثرة.', safetyFlags:[], humanReviewRequired:true },
  ASPHALT_POTHOLE: { labelAr:'حفرة أسفلتية', parentCategory:'ROADS_AND_ASPHALT', department:'ROADS', severityRange:['MEDIUM','CRITICAL'], responseWindow:'WITHIN_24_HOURS', treatmentGuidanceAr:'تأمين الموقع وتنفيذ ترقيع أسفلتي ملائم.', safetyFlags:['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION'], humanReviewRequired:true },
  GROUND_SUBSIDENCE: { labelAr:'هبوط أرضي', parentCategory:'ROADS_AND_ASPHALT', department:'ROADS', severityRange:['HIGH','CRITICAL'], responseWindow:'WITHIN_4_HOURS', treatmentGuidanceAr:'عزل النطاق وتقييم الهبوط ومعالجة السبب الإنشائي.', safetyFlags:['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION','STRUCTURAL_RISK'], humanReviewRequired:true },
  STREET_LIGHTING: { labelAr:'إنارة الشوارع', parentCategory:'LIGHTING', department:'LIGHTING', severityRange:['LOW','HIGH'], responseWindow:'WITHIN_72_HOURS', treatmentGuidanceAr:'فحص مكونات الإنارة وتنفيذ الصيانة المناسبة.', safetyFlags:[], humanReviewRequired:true },
  LEANING_LIGHTING_POLE: { labelAr:'عمود إنارة مائل', parentCategory:'STREET_LIGHTING', department:'LIGHTING', severityRange:['HIGH','CRITICAL'], responseWindow:'IMMEDIATE', treatmentGuidanceAr:'عزل الموقع وفحص الكهرباء وتصحيح الوضع الإنشائي.', safetyFlags:['PUBLIC_SAFETY','ELECTRICAL_HAZARD','FALL_RISK','STRUCTURAL_RISK'], humanReviewRequired:true, powerIsolation:true, specialEquipment:true },
  DAMAGED_LIGHTING_POLE: { labelAr:'عمود إنارة متضرر', parentCategory:'STREET_LIGHTING', department:'LIGHTING', severityRange:['MEDIUM','CRITICAL'], responseWindow:'WITHIN_4_HOURS', treatmentGuidanceAr:'تأمين الموقع وفحص العمود وإصلاحه أو استبداله.', safetyFlags:['PUBLIC_SAFETY','ELECTRICAL_HAZARD'], humanReviewRequired:true, powerIsolation:true, specialEquipment:true },
  PARKS_AND_LANDSCAPING: { labelAr:'الحدائق والتشجير', parentCategory:'LANDSCAPING', department:'PARKS_AND_LANDSCAPING', severityRange:['LOW','MEDIUM'], responseWindow:'PLANNED_MAINTENANCE', treatmentGuidanceAr:'تنفيذ أعمال العناية والتشجير المناسبة.', safetyFlags:[], humanReviewRequired:true },
  FALLEN_PALM_TREE: { labelAr:'نخلة ساقطة', parentCategory:'PARKS_AND_LANDSCAPING', department:'PARKS_AND_LANDSCAPING', severityRange:['MEDIUM','HIGH'], responseWindow:'WITHIN_4_HOURS', treatmentGuidanceAr:'تأمين الموقع وإزالة العائق وفحص النباتات المحيطة.', safetyFlags:['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION','ACCESSIBILITY_IMPACT'], humanReviewRequired:true, specialEquipment:true },
  FALLEN_TREE: { labelAr:'شجرة ساقطة', parentCategory:'PARKS_AND_LANDSCAPING', department:'PARKS_AND_LANDSCAPING', severityRange:['MEDIUM','HIGH'], responseWindow:'WITHIN_4_HOURS', treatmentGuidanceAr:'تأمين الموقع وإزالة الشجرة وفحص الأشجار المجاورة.', safetyFlags:['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION','ACCESSIBILITY_IMPACT'], humanReviewRequired:true, specialEquipment:true },
  CONSTRUCTION_WASTE: { labelAr:'مخلفات بناء', parentCategory:'WASTE', department:'CLEANLINESS', severityRange:['LOW','HIGH'], responseWindow:'WITHIN_24_HOURS', treatmentGuidanceAr:'إزالة المخلفات وتنظيف المساحة المتأثرة.', safetyFlags:['ENVIRONMENTAL_IMPACT','ACCESSIBILITY_IMPACT'], humanReviewRequired:true, specialEquipment:true },
  OVERFLOWING_CONTAINER: { labelAr:'حاوية نفايات ممتلئة', parentCategory:'WASTE', department:'CLEANLINESS', severityRange:['LOW','MEDIUM'], responseWindow:'WITHIN_24_HOURS', treatmentGuidanceAr:'تفريغ الحاوية وتنظيف وتعقيم محيطها.', safetyFlags:['ENVIRONMENTAL_IMPACT'], humanReviewRequired:true },
  WATER_LEAKAGE: { labelAr:'تسرب مياه', parentCategory:'WATER', department:'WATER_SERVICES', severityRange:['MEDIUM','CRITICAL'], responseWindow:'WITHIN_4_HOURS', treatmentGuidanceAr:'تحديد المصدر وإيقاف التسرب ومعالجة الأثر.', safetyFlags:['FLOODING_RISK','TRAFFIC_OBSTRUCTION','ENVIRONMENTAL_IMPACT'], humanReviewRequired:true },
  DAMAGED_SIGN: { labelAr:'لوحة إرشادية متضررة', parentCategory:'MUNICIPAL_ASSETS', department:'TRAFFIC_SAFETY', severityRange:['LOW','HIGH'], responseWindow:'WITHIN_72_HOURS', treatmentGuidanceAr:'فحص اللوحة وإصلاحها أو استبدالها وتثبيتها.', safetyFlags:[], humanReviewRequired:true },
  VISUAL_POLLUTION: { labelAr:'تشوه بصري', parentCategory:'URBAN_APPEARANCE', department:'MUNICIPAL_ASSETS', severityRange:['LOW','MEDIUM'], responseWindow:'PLANNED_MAINTENANCE', treatmentGuidanceAr:'إزالة مصدر التشوه وتحسين المشهد الحضري.', safetyFlags:['VISUAL_POLLUTION'], humanReviewRequired:true },
  DAMAGED_SIDEWALK: { labelAr:'رصيف متضرر', parentCategory:'MUNICIPAL_ASSETS', department:'ROADS', severityRange:['LOW','HIGH'], responseWindow:'WITHIN_72_HOURS', treatmentGuidanceAr:'تأمين الجزء المتضرر وإصلاح الرصيف لاستعادة الوصول.', safetyFlags:['FALL_RISK','ACCESSIBILITY_IMPACT'], humanReviewRequired:true },
  EXPOSED_ELECTRICAL_CABLE: { labelAr:'كابل كهربائي مكشوف', parentCategory:'ELECTRICAL', department:'LIGHTING', severityRange:['HIGH','CRITICAL'], responseWindow:'IMMEDIATE', treatmentGuidanceAr:'عزل الموقع وفصل مصدر الخطر وفحص التمديدات.', safetyFlags:['PUBLIC_SAFETY','ELECTRICAL_HAZARD'], humanReviewRequired:true, powerIsolation:true, specialEquipment:true },
  OPEN_MANHOLE: { labelAr:'فتحة صرف مكشوفة', parentCategory:'MUNICIPAL_ASSETS', department:'MUNICIPAL_ASSETS', severityRange:['HIGH','CRITICAL'], responseWindow:'IMMEDIATE', treatmentGuidanceAr:'عزل الموقع فوراً وتركيب غطاء آمن وفحص الفتحة.', safetyFlags:['PUBLIC_SAFETY','FALL_RISK','TRAFFIC_OBSTRUCTION'], humanReviewRequired:true, specialEquipment:true },
  ABANDONED_VEHICLE: { labelAr:'مركبة مهجورة', parentCategory:'MUNICIPAL_ASSETS', department:'GENERAL_REVIEW', severityRange:['LOW','HIGH'], responseWindow:'MANUAL_REVIEW_REQUIRED', treatmentGuidanceAr:'التحقق الميداني من الحالة وتوجيهها للإجراء المختص.', safetyFlags:[], humanReviewRequired:true },
  DAMAGED_BARRIER: { labelAr:'حاجز مروري متضرر', parentCategory:'TRAFFIC', department:'TRAFFIC_SAFETY', severityRange:['MEDIUM','HIGH'], responseWindow:'WITHIN_24_HOURS', treatmentGuidanceAr:'تأمين المسار وإصلاح الحاجز أو استبداله.', safetyFlags:['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION'], humanReviewRequired:true },
  ILLEGAL_EXCAVATION: { labelAr:'حفر غير نظامي', parentCategory:'ROADS_AND_ASPHALT', department:'GENERAL_REVIEW', severityRange:['MEDIUM','CRITICAL'], responseWindow:'WITHIN_4_HOURS', treatmentGuidanceAr:'تأمين الموقع والتحقق الميداني ومعالجة أثر الحفر.', safetyFlags:['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION','STRUCTURAL_RISK'], humanReviewRequired:true },
  UNKNOWN: { labelAr:'ملاحظة غير واضحة', parentCategory:'UNKNOWN', department:'GENERAL_REVIEW', severityRange:['UNKNOWN','UNKNOWN'], responseWindow:'MANUAL_REVIEW_REQUIRED', treatmentGuidanceAr:'إجراء مراجعة ميدانية وجمع دليل أوضح.', safetyFlags:['UNKNOWN'], humanReviewRequired:true },
});

test('taxonomy has zero duplicate codes', () => {
  const codes = MUNICIPAL_TAXONOMY.map(e => e.code);
  assert.equal(new Set(codes).size, codes.length);
});

test('taxonomy entry count is exactly 23 (22 pre-existing + DAMAGED_CURB)', () => {
  assert.equal(MUNICIPAL_TAXONOMY.length, 23);
});

test('taxonomy unique code count is exactly 23', () => {
  assert.equal(new Set(MUNICIPAL_TAXONOMY.map(e => e.code)).size, 23);
});

test('every pre-existing taxonomy entry field is byte-for-byte unchanged by the asset/defect enrichment', () => {
  for (const [code, expected] of Object.entries(PRE_ENRICHMENT_FIELDS)) {
    const entry = TAXONOMY_BY_CODE[code];
    assert.ok(entry, `${code} must still exist`);
    assert.equal(entry.labelAr, expected.labelAr, `${code}.labelAr`);
    assert.equal(entry.parentCategory, expected.parentCategory, `${code}.parentCategory`);
    assert.equal(entry.department, expected.department, `${code}.department`);
    assert.deepEqual([...entry.severityRange], expected.severityRange, `${code}.severityRange`);
    assert.equal(entry.responseWindow, expected.responseWindow, `${code}.responseWindow`);
    assert.equal(entry.treatmentGuidanceAr, expected.treatmentGuidanceAr, `${code}.treatmentGuidanceAr`);
    assert.deepEqual([...entry.safetyFlags], expected.safetyFlags, `${code}.safetyFlags`);
    assert.equal(entry.humanReviewRequired, expected.humanReviewRequired, `${code}.humanReviewRequired`);
    if (expected.powerIsolation !== undefined) assert.equal(entry.powerIsolation, expected.powerIsolation, `${code}.powerIsolation`);
    if (expected.specialEquipment !== undefined) assert.equal(entry.specialEquipment, expected.specialEquipment, `${code}.specialEquipment`);
  }
});

test('every taxonomy entry (including UNKNOWN and the new DAMAGED_CURB) now has a non-empty asset and defect', () => {
  for (const entry of MUNICIPAL_TAXONOMY) {
    assert.ok(typeof entry.asset === 'string' && entry.asset.length, `${entry.code}.asset`);
    assert.ok(typeof entry.defect === 'string' && entry.defect.length, `${entry.code}.defect`);
  }
});

test('DAMAGED_CURB is the single new entry, correctly routed to ROADS/asset CURB', () => {
  const curb = TAXONOMY_BY_CODE.DAMAGED_CURB;
  assert.ok(curb, 'DAMAGED_CURB must exist');
  assert.equal(curb.parentCategory, 'MUNICIPAL_ASSETS');
  assert.equal(curb.department, 'ROADS');
  assert.deepEqual([...curb.severityRange], ['LOW','HIGH']);
  assert.equal(curb.responseWindow, 'WITHIN_72_HOURS');
  assert.equal(curb.asset, 'CURB');
  assert.equal(curb.defect, 'BROKEN');
  assert.notEqual(curb.code, 'DAMAGED_SIDEWALK');
});

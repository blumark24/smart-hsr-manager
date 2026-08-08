'use strict';

function item(code,labelAr,parentCategory,department,severityRange,responseWindow,treatmentGuidanceAr,safetyFlags=[],humanReviewRequired=true,extra={}) {
  return Object.freeze({ code,labelAr,parentCategory,department,severityRange:Object.freeze(severityRange),responseWindow,treatmentGuidanceAr,safetyFlags:Object.freeze(safetyFlags),humanReviewRequired,...extra });
}

const MUNICIPAL_TAXONOMY = Object.freeze([
  item('ROADS_AND_ASPHALT','الطرق والأسفلت','ROADS','ROADS',['LOW','HIGH'],'WITHIN_72_HOURS','فحص الموقع وتنفيذ معالجة مناسبة لسطح الطريق.'),
  item('ROAD_CRACKING','تشققات الطريق','ROADS_AND_ASPHALT','ROADS',['LOW','HIGH'],'WITHIN_72_HOURS','تقييم امتداد التشققات ومعالجة طبقات الطريق المتأثرة.',[],true),
  item('ASPHALT_POTHOLE','حفرة أسفلتية','ROADS_AND_ASPHALT','ROADS',['MEDIUM','CRITICAL'],'WITHIN_24_HOURS','تأمين الموقع وتنفيذ ترقيع أسفلتي ملائم.',['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION']),
  item('GROUND_SUBSIDENCE','هبوط أرضي','ROADS_AND_ASPHALT','ROADS',['HIGH','CRITICAL'],'WITHIN_4_HOURS','عزل النطاق وتقييم الهبوط ومعالجة السبب الإنشائي.',['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION','STRUCTURAL_RISK']),
  item('STREET_LIGHTING','إنارة الشوارع','LIGHTING','LIGHTING',['LOW','HIGH'],'WITHIN_72_HOURS','فحص مكونات الإنارة وتنفيذ الصيانة المناسبة.'),
  item('LEANING_LIGHTING_POLE','عمود إنارة مائل','STREET_LIGHTING','LIGHTING',['HIGH','CRITICAL'],'IMMEDIATE','عزل الموقع وفحص الكهرباء وتصحيح الوضع الإنشائي.',['PUBLIC_SAFETY','ELECTRICAL_HAZARD','FALL_RISK','STRUCTURAL_RISK'],true,{powerIsolation:true,specialEquipment:true}),
  item('DAMAGED_LIGHTING_POLE','عمود إنارة متضرر','STREET_LIGHTING','LIGHTING',['MEDIUM','CRITICAL'],'WITHIN_4_HOURS','تأمين الموقع وفحص العمود وإصلاحه أو استبداله.',['PUBLIC_SAFETY','ELECTRICAL_HAZARD'],true,{powerIsolation:true,specialEquipment:true}),
  item('PARKS_AND_LANDSCAPING','الحدائق والتشجير','LANDSCAPING','PARKS_AND_LANDSCAPING',['LOW','MEDIUM'],'PLANNED_MAINTENANCE','تنفيذ أعمال العناية والتشجير المناسبة.'),
  item('FALLEN_PALM_TREE','نخلة ساقطة','PARKS_AND_LANDSCAPING','PARKS_AND_LANDSCAPING',['MEDIUM','HIGH'],'WITHIN_4_HOURS','تأمين الموقع وإزالة العائق وفحص النباتات المحيطة.',['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION','ACCESSIBILITY_IMPACT'],true,{specialEquipment:true}),
  item('FALLEN_TREE','شجرة ساقطة','PARKS_AND_LANDSCAPING','PARKS_AND_LANDSCAPING',['MEDIUM','HIGH'],'WITHIN_4_HOURS','تأمين الموقع وإزالة الشجرة وفحص الأشجار المجاورة.',['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION','ACCESSIBILITY_IMPACT'],true,{specialEquipment:true}),
  item('CONSTRUCTION_WASTE','مخلفات بناء','WASTE','CLEANLINESS',['LOW','HIGH'],'WITHIN_24_HOURS','إزالة المخلفات وتنظيف المساحة المتأثرة.',['ENVIRONMENTAL_IMPACT','ACCESSIBILITY_IMPACT'],true,{specialEquipment:true}),
  item('OVERFLOWING_CONTAINER','حاوية نفايات ممتلئة','WASTE','CLEANLINESS',['LOW','MEDIUM'],'WITHIN_24_HOURS','تفريغ الحاوية وتنظيف وتعقيم محيطها.',['ENVIRONMENTAL_IMPACT']),
  item('WATER_LEAKAGE','تسرب مياه','WATER','WATER_SERVICES',['MEDIUM','CRITICAL'],'WITHIN_4_HOURS','تحديد المصدر وإيقاف التسرب ومعالجة الأثر.',['FLOODING_RISK','TRAFFIC_OBSTRUCTION','ENVIRONMENTAL_IMPACT']),
  item('DAMAGED_SIGN','لوحة إرشادية متضررة','MUNICIPAL_ASSETS','TRAFFIC_SAFETY',['LOW','HIGH'],'WITHIN_72_HOURS','فحص اللوحة وإصلاحها أو استبدالها وتثبيتها.'),
  item('VISUAL_POLLUTION','تشوه بصري','URBAN_APPEARANCE','MUNICIPAL_ASSETS',['LOW','MEDIUM'],'PLANNED_MAINTENANCE','إزالة مصدر التشوه وتحسين المشهد الحضري.',['VISUAL_POLLUTION']),
  item('DAMAGED_SIDEWALK','رصيف متضرر','MUNICIPAL_ASSETS','ROADS',['LOW','HIGH'],'WITHIN_72_HOURS','تأمين الجزء المتضرر وإصلاح الرصيف لاستعادة الوصول.',['FALL_RISK','ACCESSIBILITY_IMPACT']),
  item('EXPOSED_ELECTRICAL_CABLE','كابل كهربائي مكشوف','ELECTRICAL','LIGHTING',['HIGH','CRITICAL'],'IMMEDIATE','عزل الموقع وفصل مصدر الخطر وفحص التمديدات.',['PUBLIC_SAFETY','ELECTRICAL_HAZARD'],true,{powerIsolation:true,specialEquipment:true}),
  item('OPEN_MANHOLE','فتحة صرف مكشوفة','MUNICIPAL_ASSETS','MUNICIPAL_ASSETS',['HIGH','CRITICAL'],'IMMEDIATE','عزل الموقع فوراً وتركيب غطاء آمن وفحص الفتحة.',['PUBLIC_SAFETY','FALL_RISK','TRAFFIC_OBSTRUCTION'],true,{specialEquipment:true}),
  item('ABANDONED_VEHICLE','مركبة مهجورة','MUNICIPAL_ASSETS','GENERAL_REVIEW',['LOW','HIGH'],'MANUAL_REVIEW_REQUIRED','التحقق الميداني من الحالة وتوجيهها للإجراء المختص.'),
  item('DAMAGED_BARRIER','حاجز مروري متضرر','TRAFFIC','TRAFFIC_SAFETY',['MEDIUM','HIGH'],'WITHIN_24_HOURS','تأمين المسار وإصلاح الحاجز أو استبداله.',['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION']),
  item('ILLEGAL_EXCAVATION','حفر غير نظامي','ROADS_AND_ASPHALT','GENERAL_REVIEW',['MEDIUM','CRITICAL'],'WITHIN_4_HOURS','تأمين الموقع والتحقق الميداني ومعالجة أثر الحفر.',['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION','STRUCTURAL_RISK']),
  item('UNKNOWN','ملاحظة غير واضحة','UNKNOWN','GENERAL_REVIEW',['UNKNOWN','UNKNOWN'],'MANUAL_REVIEW_REQUIRED','إجراء مراجعة ميدانية وجمع دليل أوضح.',['UNKNOWN'],true),
]);
const TAXONOMY_BY_CODE = Object.freeze(Object.fromEntries(MUNICIPAL_TAXONOMY.map(value => [value.code,value])));
function resolveTaxonomy(code) { return TAXONOMY_BY_CODE[String(code||'').trim().toUpperCase()] || TAXONOMY_BY_CODE.UNKNOWN; }

module.exports = Object.freeze({ MUNICIPAL_TAXONOMY, TAXONOMY_BY_CODE, resolveTaxonomy });

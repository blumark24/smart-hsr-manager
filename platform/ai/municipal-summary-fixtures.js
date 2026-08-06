'use strict';

const MUNICIPAL_SUMMARY_FIXTURES = Object.freeze([
  ['ASPHALT_POTHOLE','تم رصد حفرة أسفلتية تتطلب معالجة عاجلة لحماية مستخدمي الطريق.'],
  ['ROAD_CRACKING','تم رصد تشققات طريق تستوجب الصيانة لمنع توسع الضرر.'],
  ['GROUND_SUBSIDENCE','تم رصد هبوط أرضي يتطلب تأمين الموقع والمعالجة الهندسية.'],
  ['LEANING_LIGHTING_POLE','تم رصد عمود إنارة مائل يستوجب المعالجة حفاظاً على السلامة.'],
  ['DAMAGED_LIGHTING_POLE','تم رصد عمود إنارة متضرر يتطلب العزل والإصلاح الآمن.'],
  ['FALLEN_PALM_TREE','تم رصد نخلة ساقطة تعيق الحركة وتتطلب الإزالة الآمنة.'],
  ['FALLEN_TREE','تم رصد شجرة ساقطة تستوجب الإزالة وفتح المسار المتأثر.'],
  ['CONSTRUCTION_WASTE','تم رصد مخلفات بناء متراكمة تستوجب الإزالة والتنظيف الآمن.'],
  ['OVERFLOWING_CONTAINER','تم رصد حاوية نفايات ممتلئة تتطلب التفريغ وتنظيف محيطها.'],
  ['WATER_LEAKAGE','تم رصد تسرب مياه يتطلب إيقاف المصدر ومعالجة الأثر.'],
  ['DAMAGED_SIGN','تم رصد لوحة إرشادية متضررة تتطلب الإصلاح لضمان وضوح التوجيه.'],
  ['VISUAL_POLLUTION','تم رصد تشوه بصري يستوجب الإزالة وتحسين المشهد الحضري.'],
  ['DAMAGED_SIDEWALK','تم رصد رصيف متضرر يتطلب الإصلاح لضمان سلامة المشاة.'],
  ['EXPOSED_ELECTRICAL_CABLE','تم رصد كابل كهربائي مكشوف يستوجب العزل والمعالجة الفورية.'],
  ['OPEN_MANHOLE','تم رصد فتحة صرف مكشوفة تتطلب التأمين والإغلاق العاجل.'],
  ['ABANDONED_VEHICLE','تم رصد مركبة مهجورة تستوجب التحقق والإزالة وفق الإجراءات.'],
  ['DAMAGED_BARRIER','تم رصد حاجز مروري متضرر يتطلب الاستبدال لحماية الطريق.'],
  ['ILLEGAL_EXCAVATION','تم رصد حفر غير نظامي يستوجب التأمين والتحقق الميداني.'],
  ['UNCLEAR_IMAGE','تعذر تأكيد نوع الملاحظة، وتحتاج مراجعة ميدانية قبل اتخاذ الإجراء.'],
  ['UNSUPPORTED_NON_MUNICIPAL_IMAGE',null],
].map(([fixtureId, shortSummaryAr]) => Object.freeze({ fixtureId, shortSummaryAr, supported: shortSummaryAr !== null })));

module.exports = Object.freeze({ MUNICIPAL_SUMMARY_FIXTURES });

'use strict';

function item(code,labelAr,parentCategory,department,severityRange,responseWindow,treatmentGuidanceAr,safetyFlags=[],humanReviewRequired=true,extra={}) {
  return Object.freeze({ code,labelAr,parentCategory,department,severityRange:Object.freeze(severityRange),responseWindow,treatmentGuidanceAr,safetyFlags:Object.freeze(safetyFlags),humanReviewRequired,...extra });
}

const MUNICIPAL_TAXONOMY = Object.freeze([
  item('ROADS_AND_ASPHALT','الطرق والأسفلت','ROADS','ROADS',['LOW','HIGH'],'WITHIN_72_HOURS','فحص الموقع وتنفيذ معالجة مناسبة لسطح الطريق.',[],true,{asset:'ROAD_SURFACE',defect:'DEGRADED'}),
  item('ROAD_CRACKING','تشققات الطريق','ROADS_AND_ASPHALT','ROADS',['LOW','HIGH'],'WITHIN_72_HOURS','تقييم امتداد التشققات ومعالجة طبقات الطريق المتأثرة.',[],true,{asset:'ROAD_SURFACE',defect:'CRACKED'}),
  item('ASPHALT_POTHOLE','حفرة أسفلتية','ROADS_AND_ASPHALT','ROADS',['MEDIUM','CRITICAL'],'WITHIN_24_HOURS','تأمين الموقع وتنفيذ ترقيع أسفلتي ملائم.',['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION'],true,{asset:'ROAD_SURFACE',defect:'POTHOLE'}),
  item('GROUND_SUBSIDENCE','هبوط أرضي','ROADS_AND_ASPHALT','ROADS',['HIGH','CRITICAL'],'WITHIN_4_HOURS','عزل النطاق وتقييم الهبوط ومعالجة السبب الإنشائي.',['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION','STRUCTURAL_RISK'],true,{asset:'ROAD_SURFACE',defect:'SUBSIDENCE'}),
  item('STREET_LIGHTING','إنارة الشوارع','LIGHTING','LIGHTING',['LOW','HIGH'],'WITHIN_72_HOURS','فحص مكونات الإنارة وتنفيذ الصيانة المناسبة.',[],true,{asset:'LIGHTING_POLE',defect:'DEGRADED'}),
  item('LEANING_LIGHTING_POLE','عمود إنارة مائل','STREET_LIGHTING','LIGHTING',['HIGH','CRITICAL'],'IMMEDIATE','عزل الموقع وفحص الكهرباء وتصحيح الوضع الإنشائي.',['PUBLIC_SAFETY','ELECTRICAL_HAZARD','FALL_RISK','STRUCTURAL_RISK'],true,{powerIsolation:true,specialEquipment:true,asset:'LIGHTING_POLE',defect:'LEANING'}),
  item('DAMAGED_LIGHTING_POLE','عمود إنارة متضرر','STREET_LIGHTING','LIGHTING',['MEDIUM','CRITICAL'],'WITHIN_4_HOURS','تأمين الموقع وفحص العمود وإصلاحه أو استبداله.',['PUBLIC_SAFETY','ELECTRICAL_HAZARD'],true,{powerIsolation:true,specialEquipment:true,asset:'LIGHTING_POLE',defect:'BROKEN'}),
  item('PARKS_AND_LANDSCAPING','الحدائق والتشجير','LANDSCAPING','PARKS_AND_LANDSCAPING',['LOW','MEDIUM'],'PLANNED_MAINTENANCE','تنفيذ أعمال العناية والتشجير المناسبة.',[],true,{asset:'PUBLIC_SPACE',defect:'DEGRADED'}),
  item('FALLEN_PALM_TREE','نخلة ساقطة','PARKS_AND_LANDSCAPING','PARKS_AND_LANDSCAPING',['MEDIUM','HIGH'],'WITHIN_4_HOURS','تأمين الموقع وإزالة العائق وفحص النباتات المحيطة.',['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION','ACCESSIBILITY_IMPACT'],true,{specialEquipment:true,asset:'PALM_TREE',defect:'FALLEN'}),
  item('FALLEN_TREE','شجرة ساقطة','PARKS_AND_LANDSCAPING','PARKS_AND_LANDSCAPING',['MEDIUM','HIGH'],'WITHIN_4_HOURS','تأمين الموقع وإزالة الشجرة وفحص الأشجار المجاورة.',['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION','ACCESSIBILITY_IMPACT'],true,{specialEquipment:true,asset:'TREE',defect:'FALLEN'}),
  item('CONSTRUCTION_WASTE','مخلفات بناء','WASTE','CLEANLINESS',['LOW','HIGH'],'WITHIN_24_HOURS','إزالة المخلفات وتنظيف المساحة المتأثرة.',['ENVIRONMENTAL_IMPACT','ACCESSIBILITY_IMPACT'],true,{specialEquipment:true,asset:'PUBLIC_SPACE',defect:'ACCUMULATED'}),
  item('OVERFLOWING_CONTAINER','حاوية نفايات ممتلئة','WASTE','CLEANLINESS',['LOW','MEDIUM'],'WITHIN_24_HOURS','تفريغ الحاوية وتنظيف وتعقيم محيطها.',['ENVIRONMENTAL_IMPACT'],true,{asset:'WASTE_CONTAINER',defect:'OVERFLOWING'}),
  item('WATER_LEAKAGE','تسرب مياه','WATER','WATER_SERVICES',['MEDIUM','CRITICAL'],'WITHIN_4_HOURS','تحديد المصدر وإيقاف التسرب ومعالجة الأثر.',['FLOODING_RISK','TRAFFIC_OBSTRUCTION','ENVIRONMENTAL_IMPACT'],true,{asset:'WATER_INFRASTRUCTURE',defect:'LEAKING'}),
  item('DAMAGED_SIGN','لوحة إرشادية متضررة','MUNICIPAL_ASSETS','TRAFFIC_SAFETY',['LOW','HIGH'],'WITHIN_72_HOURS','فحص اللوحة وإصلاحها أو استبدالها وتثبيتها.',[],true,{asset:'SIGN',defect:'BROKEN'}),
  item('VISUAL_POLLUTION','تشوه بصري','URBAN_APPEARANCE','MUNICIPAL_ASSETS',['LOW','MEDIUM'],'PLANNED_MAINTENANCE','إزالة مصدر التشوه وتحسين المشهد الحضري.',['VISUAL_POLLUTION'],true,{asset:'PUBLIC_SPACE',defect:'DEGRADED'}),
  item('DAMAGED_SIDEWALK','رصيف متضرر','MUNICIPAL_ASSETS','ROADS',['LOW','HIGH'],'WITHIN_72_HOURS','تأمين الجزء المتضرر وإصلاح الرصيف لاستعادة الوصول.',['FALL_RISK','ACCESSIBILITY_IMPACT'],true,{asset:'SIDEWALK',defect:'BROKEN'}),
  item('DAMAGED_CURB','حافة رصيف متضررة','MUNICIPAL_ASSETS','ROADS',['LOW','HIGH'],'WITHIN_72_HOURS','تأمين الجزء المتضرر من حافة الرصيف وإصلاحها أو استبدالها.',['FALL_RISK','ACCESSIBILITY_IMPACT'],true,{asset:'CURB',defect:'BROKEN'}),
  item('EXPOSED_ELECTRICAL_CABLE','كابل كهربائي مكشوف','ELECTRICAL','LIGHTING',['HIGH','CRITICAL'],'IMMEDIATE','عزل الموقع وفصل مصدر الخطر وفحص التمديدات.',['PUBLIC_SAFETY','ELECTRICAL_HAZARD'],true,{powerIsolation:true,specialEquipment:true,asset:'ELECTRICAL_CABLE',defect:'EXPOSED'}),
  item('OPEN_MANHOLE','فتحة صرف مكشوفة','MUNICIPAL_ASSETS','MUNICIPAL_ASSETS',['HIGH','CRITICAL'],'IMMEDIATE','عزل الموقع فوراً وتركيب غطاء آمن وفحص الفتحة.',['PUBLIC_SAFETY','FALL_RISK','TRAFFIC_OBSTRUCTION'],true,{specialEquipment:true,asset:'MANHOLE',defect:'OPEN'}),
  item('ABANDONED_VEHICLE','مركبة مهجورة','MUNICIPAL_ASSETS','GENERAL_REVIEW',['LOW','HIGH'],'MANUAL_REVIEW_REQUIRED','التحقق الميداني من الحالة وتوجيهها للإجراء المختص.',[],true,{asset:'VEHICLE',defect:'ABANDONED'}),
  item('DAMAGED_BARRIER','حاجز مروري متضرر','TRAFFIC','TRAFFIC_SAFETY',['MEDIUM','HIGH'],'WITHIN_24_HOURS','تأمين المسار وإصلاح الحاجز أو استبداله.',['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION'],true,{asset:'TRAFFIC_BARRIER',defect:'BROKEN'}),
  item('ILLEGAL_EXCAVATION','حفر غير نظامي','ROADS_AND_ASPHALT','GENERAL_REVIEW',['MEDIUM','CRITICAL'],'WITHIN_4_HOURS','تأمين الموقع والتحقق الميداني ومعالجة أثر الحفر.',['PUBLIC_SAFETY','TRAFFIC_OBSTRUCTION','STRUCTURAL_RISK'],true,{asset:'ROAD_SURFACE',defect:'EXCAVATED'}),
  item('UNKNOWN','ملاحظة غير واضحة','UNKNOWN','GENERAL_REVIEW',['UNKNOWN','UNKNOWN'],'MANUAL_REVIEW_REQUIRED','إجراء مراجعة ميدانية وجمع دليل أوضح.',['UNKNOWN'],true,{asset:'UNKNOWN',defect:'UNKNOWN'}),
]);
const TAXONOMY_BY_CODE = Object.freeze(Object.fromEntries(MUNICIPAL_TAXONOMY.map(value => [value.code,value])));
function resolveTaxonomy(code) { return TAXONOMY_BY_CODE[String(code||'').trim().toUpperCase()] || TAXONOMY_BY_CODE.UNKNOWN; }

// Arabic normalization: strip diacritics/tatweel and punctuation, collapse
// whitespace, so token comparison isn't defeated by formatting noise.
function normalizeArabicText(value) {
  return String(value || '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[^؀-ۿݐ-ݿ\sA-Za-z0-9]/g, ' ')
    .trim();
}
function tokenSet(value) {
  return new Set(normalizeArabicText(value).split(/\s+/).filter(Boolean));
}

// Deterministic, taxonomy-derived fallback for when the provider returns a
// categoryCode outside the allowlist (schema/prompt now constrain new calls,
// but this stays as defense in depth -- e.g. against a provider that ignores
// the enum). Matches on each label's HEAD word only (Arabic noun phrases in
// this taxonomy are head-initial: the defect noun comes first, e.g. "حفرة
// أسفلتية" = pothole[head] + asphalt[modifier], "تسرب مياه" = leak[head] +
// water[modifier]) -- this deliberately requires the defect noun itself, not
// just an associated substance/material word, so "standing water" evidence
// (which mentions مياه/water but never تسرب/leak) does NOT get force-mapped
// to WATER_LEAKAGE. A tie between multiple head-word matches (e.g. two
// lighting-pole entries sharing "عمود") is resolved only by a word exclusive
// to one tied candidate (shared words like "إنارة" can't disambiguate
// anything); an unresolved tie or zero matches returns null, which the
// caller must treat as UNKNOWN.
function attemptDeterministicFallbackMatch(evidenceText) {
  const tokens = tokenSet(evidenceText);
  if (!tokens.size) return null;
  const candidates = MUNICIPAL_TAXONOMY.filter(entry => {
    if (entry.code === 'UNKNOWN') return false;
    const headWord = entry.labelAr.split(/\s+/)[0];
    return headWord && tokens.has(headWord);
  });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    // Words shared by more than one tied candidate (e.g. both lighting-pole
    // entries share "إنارة") can't disambiguate anything; only a word
    // exclusive to one candidate among the tied set counts as a signal.
    const wordSets = candidates.map(entry => new Set(entry.labelAr.split(/\s+/).slice(1)));
    const refined = candidates.filter((entry, i) => {
      const exclusiveWords = [...wordSets[i]].filter(word => !wordSets.some((other, j) => j !== i && other.has(word)));
      return exclusiveWords.some(word => tokens.has(word));
    });
    if (refined.length === 1) return refined[0];
  }
  return null;
}

// Exact code match stays first priority (unchanged existing behavior). Only
// when the provider's code is unsupported does this attempt the conservative
// fallback match against the provider's own Arabic label/summary text; never
// invents a category from weak or ambiguous evidence.
function resolveTaxonomyWithFallback(code, evidenceText) {
  const exact = TAXONOMY_BY_CODE[String(code||'').trim().toUpperCase()];
  if (exact) return { entry: exact, usedFallback: false };
  const fallback = attemptDeterministicFallbackMatch(evidenceText);
  if (fallback) return { entry: fallback, usedFallback: true };
  return { entry: TAXONOMY_BY_CODE.UNKNOWN, usedFallback: false };
}

// Generated, not hand-duplicated -- same principle as VALID_CATEGORY_CODES in
// municipal-vision-prompt.js. These are the only two arrays the Vision output
// schema and its validators may treat as the closed affectedAsset/
// visibleDefect vocabularies; every value already exists on some taxonomy
// entry above (including UNKNOWN), so there is no second, independently
// maintained mapping to drift out of sync.
const ASSET_VALUES = Object.freeze([...new Set(MUNICIPAL_TAXONOMY.map(entry => entry.asset))]);
const DEFECT_VALUES = Object.freeze([...new Set(MUNICIPAL_TAXONOMY.map(entry => entry.defect))]);

// Municipal Consistency Guard support: the taxonomy is the only place that
// knows which (asset, defect) pairs exist and how many real categories share
// a given pair, so this query lives here rather than being reimplemented
// inside the Guard. UNKNOWN is deliberately never a candidate (asset/defect
// values of 'UNKNOWN' mean "insufficient evidence", never a real match), so
// this can only ever return concrete, addressable taxonomy entries.
function candidatesForAssetDefect(asset, defect) {
  const a = String(asset || '').trim().toUpperCase();
  const d = String(defect || '').trim().toUpperCase();
  if (!a || !d || a === 'UNKNOWN' || d === 'UNKNOWN') return [];
  return MUNICIPAL_TAXONOMY.filter(entry => entry.code !== 'UNKNOWN' && entry.asset === a && entry.defect === d);
}

module.exports = Object.freeze({ MUNICIPAL_TAXONOMY, TAXONOMY_BY_CODE, resolveTaxonomy, resolveTaxonomyWithFallback, ASSET_VALUES, DEFECT_VALUES, candidatesForAssetDefect });

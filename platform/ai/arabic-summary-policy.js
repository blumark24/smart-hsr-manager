'use strict';

const LOW_CONFIDENCE_FALLBACK_AR = 'تعذر تأكيد نوع الملاحظة، وتحتاج مراجعة ميدانية قبل اتخاذ الإجراء.';
const MIN_WORDS = 5;
const MAX_WORDS = 15;
const PREFERRED_MIN_WORDS = 7;
const PREFERRED_MAX_WORDS = 11;

function words(value) { return String(value || '').trim().split(/\s+/u).filter(Boolean); }

function hasMojibake(value) {
  const text = String(value || '');
  if (!text) return false;
  const markerCount = (text.match(/[طظ]/gu) || []).length;
  return markerCount / [...text].length > 0.18 && /(?:ط§|ط±|طھ|ظ„|ظ…|ظ†)/u.test(text);
}

function decision(allowed, code, reason, details = {}) {
  return Object.freeze({ allowed, code, reason, ...details });
}

function validateShortSummaryAr(value, { confidence = null } = {}) {
  const summary = typeof value === 'string' ? value.trim() : '';
  if (!summary) return decision(false, 'AI_SUMMARY_EMPTY', 'Arabic summary is required.');
  const count = words(summary).length;
  if (count < MIN_WORDS) return decision(false, 'AI_SUMMARY_TOO_SHORT', `Summary must contain at least ${MIN_WORDS} words.`, { wordCount: count });
  if (count > MAX_WORDS) return decision(false, 'AI_SUMMARY_TOO_LONG', `Summary must contain at most ${MAX_WORDS} words.`, { wordCount: count });
  if (hasMojibake(summary)) return decision(false, 'AI_SUMMARY_ENCODING_INVALID', 'Arabic summary contains invalid encoding markers.', { wordCount: count });
  if (/[*_`#\[\]<>]|https?:\/\//u.test(summary)) return decision(false, 'AI_SUMMARY_MARKUP_DENIED', 'Markdown and links are prohibited.', { wordCount: count });
  if (/\p{Extended_Pictographic}/u.test(summary)) return decision(false, 'AI_SUMMARY_EMOJI_DENIED', 'Emoji is prohibited.', { wordCount: count });
  if (/[^\p{Script=Arabic}\p{Mark}\p{N}\s،؛؟.!]/u.test(summary)) return decision(false, 'AI_SUMMARY_ARABIC_REQUIRED', 'Summary must contain Arabic text and necessary numbers only.', { wordCount: count });
  const sentenceMarks = summary.match(/[.!؟]/gu) || [];
  if (sentenceMarks.length > 1 || (sentenceMarks.length === 1 && !/[.!؟]$/u.test(summary))) return decision(false, 'AI_SUMMARY_MULTIPLE_SENTENCES', 'Summary must contain no more than one sentence.', { wordCount: count });
  const lowConfidenceFallback = summary === LOW_CONFIDENCE_FALLBACK_AR;
  if (!lowConfidenceFallback && !summary.startsWith('تم رصد ')) return decision(false, 'AI_SUMMARY_MUNICIPAL_PHRASING_REQUIRED', 'Summary must begin with professional municipal phrasing.', { wordCount: count });
  if (!lowConfidenceFallback && !/(?:يتطلب|تتطلب|يستوجب|تستوجب|يعيق|تعيق|لحماية|لضمان|معالجة|إصلاح|إزالة|تأمين)/u.test(summary)) return decision(false, 'AI_SUMMARY_ACTION_OR_IMPACT_REQUIRED', 'Summary must include a required action or operational impact.', { wordCount: count });
  if (/(?:عاجل\S*.*عاجل|خطر\S*.*خطر|حرج\S*.*حرج)/u.test(summary)) return decision(false, 'AI_SUMMARY_DUPLICATED_SEVERITY', 'Duplicated severity language is prohibited.', { wordCount: count });
  if (Number(confidence) >= 0.65 && /(?:ربما|قد يكون|يحتمل|يبدو)/u.test(summary)) return decision(false, 'AI_SUMMARY_HIGH_CONFIDENCE_SPECULATION', 'High-confidence summaries must not use speculative wording.', { wordCount: count });
  if (!lowConfidenceFallback && count > PREFERRED_MAX_WORDS) return decision(false, 'AI_SUMMARY_NOT_CONCISE', `Summary should contain no more than ${PREFERRED_MAX_WORDS} words.`, { wordCount: count });
  return decision(true, 'AI_SUMMARY_VALID', 'Arabic municipal summary is valid.', { wordCount: count, preferredLength: count >= PREFERRED_MIN_WORDS && count <= PREFERRED_MAX_WORDS, summary });
}

module.exports = Object.freeze({ LOW_CONFIDENCE_FALLBACK_AR, MIN_WORDS, MAX_WORDS, PREFERRED_MIN_WORDS, PREFERRED_MAX_WORDS, hasMojibake, validateShortSummaryAr });

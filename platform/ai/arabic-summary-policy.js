'use strict';

const LOW_CONFIDENCE_FALLBACK_AR = 'تعذر تأكيد نوع الملاحظة، وتحتاج مراجعة ميدانية قبل اتخاذ الإجراء.';
const MIN_WORDS = 5;
const MAX_WORDS = 15;

function words(value) { return String(value || '').trim().split(/\s+/u).filter(Boolean); }

function validateShortSummaryAr(value) {
  const summary = typeof value === 'string' ? value.trim() : '';
  if (!summary) return Object.freeze({ allowed: false, code: 'AI_SUMMARY_EMPTY', reason: 'Arabic summary is required.' });
  const count = words(summary).length;
  if (count < MIN_WORDS) return Object.freeze({ allowed: false, code: 'AI_SUMMARY_TOO_SHORT', reason: `Summary must contain at least ${MIN_WORDS} words.`, wordCount: count });
  if (count > MAX_WORDS) return Object.freeze({ allowed: false, code: 'AI_SUMMARY_TOO_LONG', reason: `Summary must contain at most ${MAX_WORDS} words.`, wordCount: count });
  if (!/[\u0600-\u06FF]/u.test(summary) || /^[\x00-\x7F\s]+$/.test(summary)) return Object.freeze({ allowed: false, code: 'AI_SUMMARY_ARABIC_REQUIRED', reason: 'Summary must be written in Arabic.' });
  if (/[*_`#\[\]<>]|https?:\/\//u.test(summary)) return Object.freeze({ allowed: false, code: 'AI_SUMMARY_MARKUP_DENIED', reason: 'Markdown and links are prohibited.' });
  if (/\p{Extended_Pictographic}/u.test(summary)) return Object.freeze({ allowed: false, code: 'AI_SUMMARY_EMOJI_DENIED', reason: 'Emoji is prohibited.' });
  if (/\b(?:OpenAI|Gemini|Claude|OpenRouter|GPT)\b/iu.test(summary)) return Object.freeze({ allowed: false, code: 'AI_SUMMARY_PROVIDER_NAME_DENIED', reason: 'Provider or model names are prohibited.' });
  if (/(?:مؤكد تماماً|بالتأكيد المطلق|دون شك|100%)/u.test(summary)) return Object.freeze({ allowed: false, code: 'AI_SUMMARY_UNSUPPORTED_CERTAINTY', reason: 'Unsupported certainty is prohibited.' });
  return Object.freeze({ allowed: true, code: 'AI_SUMMARY_VALID', reason: 'Arabic municipal summary is valid.', wordCount: count, summary });
}

module.exports = Object.freeze({ LOW_CONFIDENCE_FALLBACK_AR, MIN_WORDS, MAX_WORDS, validateShortSummaryAr });

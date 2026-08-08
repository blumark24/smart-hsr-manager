# Sprint 5E.2 — Gemini Adapter Transport Diagnosis

## النتيجة التنفيذية

تم إصلاح Gemini request shape في server adapter ليستخدم `inlineData.mimeType` بالشكل canonical. نجحت جميع اختبارات Offline، لكن محاولة Vision الحقيقية الوحيدة توقفت قبل HTTP بسبب `TypeError / EACCES` من Codex sandbox network policy.

## Root cause

- `.env.local` تم تحميله بنجاح، والمفتاح موجود دون كشفه.
- `fetch` و`AbortController` متاحان في Node runtime.
- endpoint، API version، model، header، prompt part، structured response schema، JPEG MIME، وbase64 payload اجتازت mocked transport validation.
- لم يكن هناك missing transport injection أو timeout/response parsing failure.
- الاتصال المباشر من نفس Codex execution sandbox مُنع بـ`EACCES` قبل استلام HTTP status. يتوافق ذلك مع نجاح الاتصال الذي تحقّق خارجيًا من PowerShell، ويعزل المشكلة في صلاحية شبكة جلسة Codex.
- كان request body يستخدم سابقًا `inline_data.mime_type`. عُدّل إلى `inlineData.mimeType` وفق الشكل canonical، لكنه ليس سبب `EACCES` لأن المنع حدث قبل HTTP.

## الملفات المتغيرة

- `platform/ai/server/gemini-compatible-vision-provider.js`: تصحيح أسماء حقول inline image فقط.
- `test/sprint5e2-gemini-transport-regression.test.js`: اختبار Offline للـendpoint، model، header، prompt، image MIME/data، وstructured schema.
- `evaluation/real-vision/sprint-5e1/single-result.sanitized.json`: نتيجة المحاولة المعقّمة.
- `evaluation/real-vision/sprint-5e1/SINGLE-GEMINI-SMOKE-REPORT.md`: هذا التقرير.

## Smoke test

| الحقل | النتيجة |
|---|---|
| Fixture | `test/fixtures/vision/asphalt-pothole.jpg` |
| Provenance | صورة قدمها المستخدم وصرّح باستخدامها للتقييم المحلي |
| Model | `gemini-2.5-flash` |
| generateContent calls | 1، دون retry أو fallback |
| HTTP status | غير متاح؛ لم تُستلم استجابة HTTP |
| Success | false |
| Latency | 111 ms |
| Transport diagnostic | `TypeError / EACCES` |
| Structured Arabic result | غير متاح لعدم وجود provider output |
| Schema validation | لم تُنفذ على output؛ request schema نجح Offline |
| Arabic summary validation | لم تُنفذ لعدم وجود summary |
| Hallucination review | غير منطبق لعدم وجود output |

## الاختبارات والأمان

- Sprint 5A–5D وGemini adapter/regression: `136 passed`, `0 failed`.
- لم يُكشف أو يُحفظ API key، raw environment، raw prompt، image bytes، raw response، أو stack trace.
- لم يحدث Firebase/Firestore activity أو persistence أو observation creation.
- لم تتغير application pages أو Firebase configuration أو Firestore rules.
- لم يحدث commit أو push أو merge أو deploy.

## GO / NO-GO

**NO-GO للتقييم متعدد الصور داخل Codex sandbox.** الـadapter أصبح متوافقًا Offline، لكن التشغيل الحقيقي يحتاج تنفيذ runner نفسه من local PowerShell المسموح له بالشبكة أو توفير network permission لهذه الجلسة. لا تُنفذ محاولة أخرى ضمن Sprint 5E.2 لأن حد `generateContent` الواحد استُهلك.

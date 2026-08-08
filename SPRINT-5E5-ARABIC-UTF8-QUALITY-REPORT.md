# Sprint 5E.5 — Arabic UTF-8 and Summary Quality

## النتيجة

تم تثبيت UTF-8 end-to-end وتشديد سياسة `shortSummaryAr`. لم يحدث أي اتصال حقيقي بـGemini داخل Codex.

## Root cause

فحص artifacts الناتجة عن التشغيل الحقيقي أثبت أن JSON bytes صحيحة UTF-8، وأن `JSON.parse` في Node يعيد Unicode عربيًا سليمًا. لم يحدث double encoding أثناء HTTP parsing أو file writing.

سبب العرض المشوه هو Windows PowerShell، خصوصًا الإصدارات التي تقرأ ملف UTF-8 بلا BOM باستخدام default ANSI encoding عند استعمال `Get-Content` دون `-Encoding UTF8`. لذلك كان التشويه في terminal rendering/read path وليس داخل JSON artifact.

كما وُجدت بعض النصوص المرجعية القديمة في source محفوظة بصيغة mojibake؛ تم استبدال fallback وmunicipal summary fixtures بنصوص عربية UTF-8 سليمة بدل محاولة إصلاحها بتحويلات تخمينية وقت التشغيل.

## UTF-8 handling

- HTTP response bytes تُفك الآن صراحة عبر `TextDecoder('utf-8', { fatal: true })` ثم `JSON.parse` مرة واحدة.
- JSON وMarkdown يُكتبان باستخدام `Buffer.from(value, 'utf8')`، دون ANSI conversion أو decode/encode cycle.
- JSON يبقى UTF-8 قياسيًا بلا BOM.
- الملخص العربي المعقّم يُدرج في JSON وMarkdown دون تغيير.
- أي mojibake مكتشف يُرفض بـ`AI_SUMMARY_ENCODING_INVALID` بدل تحويله تلقائيًا.

## PowerShell reading

استخدم قراءة UTF-8 الصريحة، دون تغيير إعدادات Windows العامة:

```powershell
Get-Content -Encoding UTF8 "evaluation/real-vision/sprint-5e5-utf8-retry/single-result.sanitized.json" -Raw
Get-Content -Encoding UTF8 "evaluation/real-vision/sprint-5e5-utf8-retry/SINGLE-GEMINI-LOCAL-RUN-REPORT.md" -Raw
```

## Summary policy

- absolute bounds: من 5 إلى 15 كلمة مفصولة بمسافات.
- preferred and enforced concise ceiling: من 7 إلى 11 كلمة للملخص المعتاد.
- يبدأ الملخص المعتاد بـ`تم رصد`.
- يحدد مشكلة مرئية واحدة ويتضمن الإجراء المطلوب أو الأثر التشغيلي.
- جملة واحدة فقط، دون Markdown أو emoji.
- Arabic script والأرقام الضرورية فقط؛ يُسمح بعلامات الترقيم والتشكيل العربي.
- يمنع تكرار لغة الشدة.
- يمنع `ربما` و`قد يكون` و`يحتمل` و`يبدو` عند confidence مرتفع.
- low-confidence fallback مستقل ومهني ومختصر.

لم تتغير حقول `categoryCode`, `severity`, `prioritySuggestion`, `confidence`, `imageQuality`, أو `responsibleDepartmentSuggestion`.

## الملفات المتغيرة

- `scripts/evaluate-single-gemini-vision-local.js`
- `platform/ai/arabic-summary-policy.js`
- `platform/ai/ai-security-policy.js`
- `platform/ai/server/municipal-vision-prompt.js`
- `platform/intelligence/municipal-intelligence-engine.js`
- `platform/ai/municipal-summary-fixtures.js`
- `platform/ai/mock-ai-provider.js`
- `test/sprint5a-ai-gateway.test.js`
- `test/sprint5e5-arabic-utf8-quality.test.js`
- `SPRINT-5E5-ARABIC-UTF8-QUALITY-REPORT.md`

## Tests

- 154 passed، 0 failed.
- شملت UTF-8 HTTP decode، JSON/Markdown round-trip، unchanged original Arabic، mojibake rejection، word bounds، concise phrasing، verbose rejection، high-confidence speculation، Gemini adapter، وSprint 5A–5E regressions.

## Local retry command

يُنفذ مرة واحدة خارج Codex sandbox من repository root:

```powershell
node .\scripts\evaluate-single-gemini-vision-local.js --fixture "test/fixtures/vision/asphalt-pothole.jpg" --model "gemini-3.6-flash" --max-calls 1 --output-dir "evaluation/real-vision/sprint-5e5-utf8-retry"
```

## Safety

- Real Gemini calls inside Codex: 0.
- لا Firebase أو Firestore أو persistence أو observations.
- لا API key أو raw prompt أو image bytes أو raw provider response مخزن.
- لا retry أو provider/model fallback.
- لا commit أو push أو deploy.

## Recommendation

**GO لمحاولة محلية واحدة للتحقق من جودة الملخص والعرض عبر `Get-Content -Encoding UTF8`.** يبقى التقييم متعدد الصور NO-GO حتى مراجعة النتيجة الجديدة.

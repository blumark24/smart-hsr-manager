# Sprint 5E.3 — Single-Fixture Local Gemini Runner

## النتيجة

تم إنشاء runner محلي معزول لمعالجة fixture واحدة وطلب `generateContent` واحد بحد أقصى. لم يُنفذ أي اتصال حقيقي بـGemini داخل Codex.

## الملفات المنشأة

- `scripts/evaluate-single-gemini-vision-local.js`
- `test/sprint5e3-single-fixture-runner.test.js`
- `SPRINT-5E3-SINGLE-FIXTURE-RUNNER-REPORT.md`

## CLI المدعوم

```text
--fixture <repository-relative-path>
--model <explicit-model-name>
--max-calls 1
--output-dir <repository-relative-path>
```

لا توجد arguments إضافية أو defaults للـfixture أو model أو call limit.

## Safety gates

- يرفض التشغيل إذا غاب `--max-calls` أو لم يساوِ `1`.
- يمنع absolute paths وpath traversal للـfixture والـoutput directory.
- يقبل JPEG وPNG فقط بعد فحص extension وmagic bytes.
- يتطلب fixture موجودة وmodel صريحًا.
- يحمّل `.env.local` بparser محلي دون dependency إضافية.
- يتطلب `GEMINI_API_KEY` و`REAL_VISION_LOCAL_EVALUATION=true` و`SYNTHETIC_DATA_ONLY=true` و`VISION_PROVIDER=gemini`.
- يرفض التشغيل إذا لم تكن `.env.local` ignored بواسطة Git.
- يستخدم Gemini adapter والـmunicipal prompt والـcanonical schema الحاليين.
- لا يكرر الطلب، ولا يفحص model listing، ولا يملك provider أو model fallback.
- لا يستورد Firebase أو Firestore أو browser modules أو evaluation manifest.
- لا يحفظ raw prompt أو provider response أو image bytes أو API key أو absolute paths أو stack trace.
- يكتب ملفي output معقّمين فقط، ويرفض overwrite للملفات الموجودة.

## Exit codes

| Code | Meaning |
|---:|---|
| 0 | Success |
| 2 | Validation/configuration failure before network |
| 3 | Provider/network failure |
| 4 | Schema or Arabic validation failure |

## الاختبارات

- Sprint 5E.3 runner tests: 9 passed.
- Sprint 5A–5D وGemini adapter/regression مع الاختبارات الجديدة: 145 passed، 0 failed.
- جميع provider calls في الاختبارات mocked وOffline.

غطت الاختبارات missing fixture، path traversal، MIME غير مدعوم، missing model، max-calls، missing key، wrong provider، synthetic-only false، tracked env، single mocked call، منع retry/fallback، sanitization، وغياب Firebase imports.

## أمر PowerShell المحلي

يُنفذ من repository root في PowerShell محلي مسموح له بالشبكة:

```powershell
node .\scripts\evaluate-single-gemini-vision-local.js --fixture "test/fixtures/vision/asphalt-pothole.jpg" --model "gemini-2.5-flash" --max-calls 1 --output-dir "evaluation/real-vision/sprint-5e3-local-run"
```

الـrunner يحمّل `.env.local` مباشرة؛ لا يلزم تصدير أو طباعة environment variables.

## GO / NO-GO

**GO للتنفيذ المحلي الفردي خارج Codex sandbox** بعد التأكد أن output directory المحدد لا يحتوي artifacts سابقة. **NO-GO** للتشغيل داخل Codex أو للتقييم متعدد الصور أو لأي UI/Firebase integration.

لم يحدث commit أو push أو merge أو deploy.

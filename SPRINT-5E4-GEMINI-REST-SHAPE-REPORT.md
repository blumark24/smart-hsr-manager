# Sprint 5E.4 — Gemini REST Request Shape

## النتيجة

تم تصحيح Gemini raw REST serialization وإضافة HTTP 400 diagnostics معقّمة. لم يحدث أي اتصال حقيقي بـGemini داخل Codex.

## Transport type

`gemini-compatible-vision-provider.js` لا يستخدم Google GenAI JavaScript SDK. الـadapter ينشئ plain JSON request ويسلمه إلى injected transport، والـlocal runner ينفذ هذا النقل باستخدام raw `fetch` إلى:

```text
https://generativelanguage.googleapis.com/v1beta/models/<MODEL>:generateContent
```

لذلك يجب أن تتبع image fields صيغة Gemini REST وليست SDK object naming.

## Root cause

تم تأكيد وجود request-shape mismatch قبل Sprint 5E.4: payload الخام كان يستخدم `inlineData.mimeType`. هذا غير متوافق مع REST example المعتمد للمراجعة، وتم تصحيحه إلى:

```text
contents[].parts[].inline_data.mime_type
contents[].parts[].inline_data.data
contents[].parts[].text
```

هذا mismatch سبب مرجح بقوة لـHTTP 400 السابق، لكن لا يمكن إثبات أنه السبب الوحيد لأن raw provider error لم يُحفظ. المحاولة المحلية اللاحقة ستستخدم diagnostics المعقّمة لتحديد أي رفض متبقٍ.

## Structured-output schema review

- بقي `generationConfig.responseMimeType` بقيمة `application/json`.
- بقي `generationConfig.responseSchema` ضمن REST JSON generation configuration.
- استُبدل JSON Schema العام بنسخة Gemini REST/OpenAPI subset:
  - الأنواع `OBJECT`, `STRING`, `NUMBER`, `BOOLEAN`, و`ARRAY`.
  - لا يوجد `additionalProperties`.
  - لا توجد union type arrays مثل `type: ['string', 'null']`.
  - الحقول الاختيارية تستخدم `nullable: true`.
  - enums وrequired properties بقيت صريحة.
  - لا توجد keywords غير لازمة أو nesting إضافي.

لم تُستخدم minimal five-field schema لأن الـfull contract أمكن تمثيله بالكامل ضمن REST-supported subset دون keywords المشكوك فيها. إذا استمر HTTP 400، ستحدد الرسالة المعقّمة ما إذا كان يلزم Sprint تشخيص مستقل للـminimal schema، دون fallback تلقائي.

## Sanitized HTTP errors

HTTP 400 لم يعد يُختزل إلى `AI_PROVIDER_UNAVAILABLE`. النتيجة الآن تستخدم:

```text
AI_PROVIDER_REQUEST_INVALID
```

وتحفظ فقط `httpStatus`, `providerErrorStatus`, `providerErrorMessageSanitized`, و`providerErrorCode`. الرسالة محدودة بـ300 حرف، مع حذف API key وprompt وbase64 image data. لا يُحفظ request body أو response body أو stack trace.

## الملفات المتغيرة

- `platform/ai/server/gemini-compatible-vision-provider.js`
- `scripts/evaluate-single-gemini-vision-local.js`
- `test/sprint5c-real-vision-evaluation.test.js`
- `test/sprint5e-real-gemini-evaluation.test.js`
- `test/sprint5e2-gemini-transport-regression.test.js`
- `test/sprint5e4-gemini-rest-shape.test.js`
- `SPRINT-5E4-GEMINI-REST-SHAPE-REPORT.md`

## Offline tests

- Gemini adapter وSprint 5E.2–5E.4: 47 passed، 0 failed.
- تحققت snake_case REST fields، غياب camelCase SDK fields، وجود base64 وprompt داخل request فقط، sanitization، HTTP 400 classification، single transport invocation، وعدم وجود retry أو provider fallback.

## أمر PowerShell للمحاولة المحلية اللاحقة

يُنفذ مرة واحدة من repository root خارج Codex sandbox:

```powershell
node .\scripts\evaluate-single-gemini-vision-local.js --fixture "test/fixtures/vision/asphalt-pothole.jpg" --model "gemini-2.5-flash" --max-calls 1 --output-dir "evaluation/real-vision/sprint-5e4-local-retry"
```

## Safety confirmation

- Real Gemini calls inside Codex: 0.
- لا Firebase أو Firestore أو persistence أو observation creation.
- لا API key أو raw prompt أو base64 أو raw provider response مخزن.
- لا retry أو model/provider fallback.
- لا commit أو push أو deploy.

## Recommendation

**GO لمحاولة محلية واحدة لاحقة** باستخدام الأمر أعلاه. **NO-GO** لأي multi-image run حتى نجاح هذه المحاولة والتحقق من schema والملخص العربي.

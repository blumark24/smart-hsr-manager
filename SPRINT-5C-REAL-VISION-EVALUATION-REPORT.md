# Smart HSR — Sprint 5C Real Vision Provider Evaluation

## Executive decision

**GO for a controlled, manually approved Gemini-compatible local evaluation after synthetic/public fixture provenance is completed. NO-GO for Preview UI integration, real municipal data, Production, or provider selection based on accuracy.**

No real provider call was run in Sprint 5C. The adapters and evaluation path were tested entirely offline with injected transports. There were no keys and the 40 manifest entries intentionally point to absent local placeholders, so the opt-in CLI cannot proceed accidentally.

## 1. Server-only adapters

Created:

- `platform/ai/server/gemini-compatible-vision-provider.js`
- `platform/ai/server/openrouter-compatible-vision-provider.js`
- `platform/ai/server/provider-adapter-utils.js`
- `platform/ai/server/real-provider-activation-guard.js`
- `platform/ai/server/municipal-vision-prompt.js`
- `platform/ai/server/vision-evaluation-metrics.js`

Both adapters implement the Sprint 5A provider methods:

```text
analyzeObservationImage()
verifyBeforeAfter()
suggestPriority()
healthCheck()
```

Only image analysis is activated for evaluation. Before/after and standalone priority return `AI_OPERATION_NOT_ACTIVATED`.

The adapters:

- are disabled by default;
- are server-only CommonJS modules;
- use injected transports;
- import no vendor SDK;
- read keys only from the supplied server environment;
- require one explicit model;
- enforce bounded timeout and controlled local bytes;
- normalize output into the canonical Sprint 5A schema;
- never expose raw provider responses, upstream errors, keys or stacks.

Gemini uses the official-style `generateContent` REST envelope with inline image data, `responseMimeType: application/json`, and a response schema. OpenRouter uses one explicitly named model, multimodal message content, and `response_format.type: json_schema`. The design follows the current official [Gemini GenerateContent reference](https://ai.google.dev/api/generate-content) and [OpenRouter structured-output documentation](https://openrouter.ai/docs/guides/features/structured-outputs).

## 2. Activation guard

Every condition is mandatory:

```text
localEvaluationEnabled: true
syntheticDataOnly: true
providerExplicitlySelected: true
apiKeyPresent: true
noApplicationIntegration: true
runtimeTarget: server
browser global absent
```

Environment flags:

```text
SMART_HSR_REAL_AI_EVALUATION=true
SMART_HSR_SYNTHETIC_DATA_ONLY=true
SMART_HSR_NO_APP_INTEGRATION=true
SMART_HSR_AI_PROVIDER=gemini | openrouter
```

Keys/models are provider-specific and are documented with blank values in `.env.example`. Defaults keep evaluation disabled. Missing flag, key, model, capability declaration, server isolation or explicit selection fails before transport invocation.

`.gitignore` adds only `!.env.example` after the existing `.env.*` rule so the variable-name template remains reviewable while real environment files stay ignored.

There is no silent cross-provider fallback. OpenRouter additionally requires explicit declarations that the selected model supports vision and structured output; `auto`, multiple models and undeclared text-only models are rejected.

## 3. Controlled prompt and schema

The controlled Arabic municipal instruction requests only:

- short Arabic summary;
- category/subcategory suggestion;
- severity and score;
- priority suggestion;
- responsible department suggestion;
- recommended action;
- confidence and image quality;
- human-review flag and warnings.

It requires JSON only, formal Arabic of 5–15 words, no unsupported certainty and no application command. `requiresHumanReview` remains mandatory.

Existing description is bounded and enclosed in an explicit `UNTRUSTED_EXISTING_DESCRIPTION` block. Embedded text/image metadata has no instruction or tool authority. Raw prompt, image bytes and description are never added to audit metadata.

Confidence below 0.65 is normalized to the approved fallback:

```text
تعذر تأكيد نوع الملاحظة، وتحتاج مراجعة ميدانية قبل اتخاذ الإجراء.
```

The adapter validates advisory fields before normalization. Workflow commands, unknown mutation fields, secrets, invalid enums, malformed JSON, non-Arabic summaries and schema violations deny the entire result.

## 4. Dataset manifest

Created `test/fixtures/vision-evaluation-manifest.js` with **40 cases**: two variants for each of 20 categories covering the full requested catalogue.

The manifest separates:

- `EVALUATION_CASES`: fixture path, MIME and provenance requirements only;
- `GROUND_TRUTH`: category, severity, low-confidence expectation and municipal/non-municipal label;
- provider output: held only in memory by the CLI.

No image was downloaded or created. Paths are placeholders under:

```text
test/fixtures/vision-evaluation-assets/
```

Before any real run, every asset requires manual placement plus provenance, license review where applicable, checksum, and confirmation of no faces, names, plates, personal data or operational coordinates. The harness never downloads fixtures.

## 5. Local opt-in harness

Created `scripts/evaluate-real-vision-local.js`.

Execution flow:

1. Require exact provider selection.
2. Instantiate only that adapter.
3. Pass activation/health guard.
4. Verify provenance policy.
5. Require each local fixture to exist.
6. Read controlled bytes locally.
7. Evaluate sequentially.
8. Keep canonical output records in memory.
9. Print aggregate comparison only.

No raw provider output, prompt, image, key or header is printed. Missing fixture stops the run; nothing is downloaded automatically.

## 6. Evaluation metrics

Implemented metrics:

- schema-valid response rate;
- Arabic-summary validity rate;
- category accuracy;
- severity agreement;
- low-confidence correctness;
- human-reviewed hallucination rate;
- average latency;
- provider failure rate;
- average canonical response size;
- approximate request cost when explicitly supplied.

Hallucination rate remains `null` without explicit human review labels. Cost remains `null` without verified provider price data. Missing information is never converted to zero.

Deterministic comparison format:

```text
provider
model
totalCases
successfulCases
schemaPassRate
arabicSummaryPassRate
categoryAccuracy
severityAgreement
lowConfidenceCorrectness
hallucinationRate
averageLatencyMs
providerFailureRate
averageResponseSizeBytes
approximateAverageRequestCostUsd
```

A 40-case synthetic/public evaluation is a compatibility signal, not production accuracy evidence.

## 7. Offline tests

- Sprint 5C offline tests: **24 passed, 0 failed**.
- Gemini-compatible conformance: **18/18 passed** using mocked transport.
- OpenRouter-compatible conformance: **18/18 passed** using mocked transport.
- Sprint 5A + 5B + 5C focused suites: **87 passed after correction, 0 failed**.
- Full isolated policy/security regression: **240 passed, 0 failed, 0 skipped/todo**.

Covered security scenarios:

- missing key/flag and `syntheticDataOnly:false`;
- browser environment;
- disabled-by-default/no transport invocation;
- text-only/unstructured OpenRouter model;
- key absence from result/health;
- raw prompt/image absence from audit;
- normalized stack, timeout and provider failure;
- malformed JSON;
- workflow command;
- public URL and private municipal reference denial;
- low-confidence fallback;
- 40-case manifest/provenance separation;
- deterministic metrics and both provider conformance runs.

## 8. Real evaluation and comparison

**Real network evaluation was not run.** No API key or approved image fixture was present, and no explicit authorization to incur an external provider call was supplied.

| Provider | Model | Cases | Result |
|---|---|---:|---|
| Gemini-compatible | Not configured | 0 | NOT RUN |
| OpenRouter-compatible | Not configured | 0 | NOT RUN |

No accuracy, latency, hallucination, cost or provider-quality conclusion is claimed.

## 9. Provider recommendation for Preview evaluation

**Primary candidate: Gemini-compatible**, only for the first controlled local evaluation. Rationale: it is the requested primary provider and supports an official direct multimodal structured-output path without an SDK.

This is not a production recommendation and is not based on measured accuracy. OpenRouter remains a secondary comparison option only after a single exact vision model is selected and its structured-output capability, free-tier availability, routing behavior, data handling and price are reverified.

Free-tier limitations:

- quotas, eligible models, rate limits and pricing can change;
- a “free” routed model may be unavailable, throttled or replaced;
- structured output and vision support vary by exact model;
- provider/model availability must be checked immediately before an approved run;
- the harness does not retry through another provider or model.

## 10. Sprint 5D UI boundary

Sprint 5D must not start until a provider completes a reviewed evaluation. The exact later boundary is:

1. A server-only Preview endpoint verifies Firebase identity and tenant role.
2. The server resolves a private image after observation/organization ownership checks.
3. It sends controlled bytes to one explicitly configured provider adapter.
4. The gateway validates and returns an advisory result.
5. A new isolated inspector controller displays Manual / Accept / Edit / Ignore choices.
6. Accept/Edit updates local form state only; it does not call save or Firestore.
7. Existing submission remains a separate explicit inspector action.
8. No integration occurs inside the current `processSmartInput()` auto-write path.

## 11. Risks and GO/NO-GO

Remaining blockers:

- no approved/provenanced fixture assets;
- no real metrics;
- no provider DPA, residency, retention or municipal security approval;
- no verified production taxonomy;
- no cost/rate budget or kill switch;
- no human hallucination review protocol;
- no server private-image transport approved for real municipal data.

Recommendation: **GO for one explicitly authorized, synthetic-only Gemini local evaluation after all 40 fixtures pass provenance review. NO-GO for Sprint 5D UI work, municipal imagery, Production, persistence or deployment.**

## 12. Safety confirmation

- No application page, login page, Firebase configuration, Firestore rule, Auth behavior, workflow, observation or protected adapter changed.
- No real municipal/personal image was processed.
- No external provider call was made.
- No API key or credential was created, read from a real environment, logged or committed.
- No provider is enabled by default.
- No fixture was automatically downloaded.
- No paid/cloud resource, dependency install, deploy, commit, push, merge, reset or clean occurred.
- Existing workspace changes remain preserved.

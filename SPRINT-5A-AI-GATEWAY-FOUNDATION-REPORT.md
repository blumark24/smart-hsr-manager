# Smart HSR — Sprint 5A AI Gateway Contracts and Safety Foundation

## Executive decision

**GO for Sprint 5B design/local validation; NO-GO for provider activation or application integration.** The new foundation is isolated, deterministic, advisory-only, provider-neutral, and network-free. No existing behavior or protected file was changed.

The highest-ROI outcome is a single validated AI boundary that prevents vendor lock-in and stops AI suggestions from silently becoming municipal workflow decisions. A real provider remains prohibited until a server-side private-image resolver, credentials boundary, DPIA/security review, and human-approval UI are separately approved.

## 1. Current AI presentation audit

| File and lines | Item | Classification | Evidence / risk |
|---|---|---|---|
| `dashboard.html:2054` | Collapsible AI capabilities card | `PRESENTATION_ONLY` | Explicitly says it is a future roadmap and no Gemini calls/results exist. |
| `dashboard.html:2192-2194`, `2227-2229` | “AI Insights” and Gemini action-plan labels | `PRESENTATION_ONLY` | Labels wrap existing observation fields; no provider call. |
| `dashboard.html:2262-2282` | Vision, root-cause, communication and PDF buttons/result container | `SIMULATION` | Buttons are wired to local handlers below. |
| `dashboard.html:2335-2340` | Gemini KPI summary button | `SIMULATION` | `generateKpiInsights()` uses locally counted open reports. |
| `dashboard.html:2344-2391` | Hidden legacy AI feature catalogue | `UNUSED` | Entire section is hidden and only describes planned capabilities. |
| `dashboard.html:2431-2435` | Future AI capabilities disclosure | `PRESENTATION_ONLY` | Text explicitly avoids imaginary data/results. |
| `dashboard.html:2529-2582` | “Smart input” modal and “start AI analysis” button | `AMBIGUOUS` UI; `REAL` write path with `SIMULATION` analysis | Naming implies AI, but handler uploads evidence and writes Firestore using fixed generated fields. |
| `dashboard.html:4167-4216` | Smart-input readiness/file validation | `REAL` | Validates text/image/location locally; no model analysis. |
| `dashboard.html:4219-4308` | `processSmartInput()` | `REAL` storage/Firestore behavior; `SIMULATION` AI fields | Uploads the image and creates an observation. `actionPlan` and `riskAssessment` are fixed at `4283-4284`, not inferred. This must not be reused as an AI auto-save boundary. |
| `dashboard.html:4591-4609` | `analyzeImage()` | `SIMULATION` | Marked `AI BUTTONS (DUMMY)`; `setTimeout(1200)` returns fixed vision/root-cause HTML. |
| `dashboard.html:4611-4633` | `generateCommunicationDraft()` | `SIMULATION` | `setTimeout(900)` formats existing title/id/priority. |
| `dashboard.html:4635-4644` | `generateKpiInsights()` | `SIMULATION` | Deterministic text from local KPI count. |
| `dashboard.html:4646-4648` | `generatePdfReport()` | `PRESENTATION_ONLY` | Calls browser print only; no AI report generation. |
| `manager.html:1177-1192` | `generateAiSummary()` | `SIMULATION` | Explicit AI Demo; computes totals/top inspector locally and renders fixed recommendation. |
| `manager.html:599-602`, `1921-1983`, `2064-2074` | Smart Observation AI card, priority and recommendations | `PRESENTATION_ONLY` | Comments explicitly say no new Firestore calls. Priority/recommendations are local heuristics from status, elapsed time, location proximity and evidence. |
| `manager.html:1985-2020` | Before/after comparison | `REAL` presentation, not AI | Image slider only; no verification model. |
| `mobile-map.html:545` | Contractor AI assistant card | `UNUSED` | Hidden card with future labels only. |
| `owner.html` | AI behavior | `UNUSED` / none found | No AI call site or provider logic found. |

No confidence badge or real confidence computation was found. No OpenAI, Gemini, Claude, OpenRouter, or other model SDK/call site was found in the active repository code.

## 2. Contracts created

Files under `platform/ai/`:

- `ai-provider-contract.js`: four required methods, canonical enums and normalized failure result.
- `arabic-summary-policy.js`: strict 5–15 word formal Arabic summary validation and low-confidence fallback.
- `ai-security-policy.js`: input/output validation, private-reference policy, payload cap, prompt-context separation, timeout/retry policy, confidence gate and audit-safe metadata.
- `human-approval-policy.js`: advisory envelope, automation prohibitions and future suggestion provenance.
- `provider-router.js`: disabled-by-default deterministic selection, capability check, enforced timeout, normalized failures and schema validation.
- `mock-ai-provider.js`: deterministic, network-free municipal fixtures and failure modes.

Provider interface:

```text
analyzeObservationImage(input)
verifyBeforeAfter(input)
suggestPriority(input)
healthCheck()
```

The contract imports no vendor SDK.

## 3. Canonical analyze input

```text
organizationId
observationId
actorId
actorRole
imageReference
imageContentType
existingDescription?       (untrusted context)
locationContext?           (untrusted context)
correlationId
controlledImagePayload?    (server-controlled only; never audit metadata)
```

Organization, observation, actor, role and correlation id are mandatory. Authenticated organization must exactly match request organization; actor identity is also matched when available. Accepted images are JPEG, PNG and WebP up to 716,800 bytes.

Public HTTP(S) URLs are denied. The foundation accepts only a validated private canonical/legacy key, a tenant-scoped local-demo reference for deterministic development, or a controlled payload. A production provider must receive bytes only after a server-side authorization check and private storage resolution; browsers must never send provider secrets.

Existing descriptions and location metadata are placed in `untrustedContext` with `instructionsAuthoritative: false`. Embedded instructions cannot grant tools, workflow authority, or override system policy.

## 4. Canonical Arabic output

```text
ok
analysisId
shortSummaryAr
categoryCode
categoryLabelAr
subcategoryCode?
subcategoryLabelAr?
severity
severityScore
prioritySuggestion
responsibleDepartmentSuggestion?
recommendedActionAr
confidence
imageQuality
requiresHumanReview
warnings
provider
model
modelVersion
processingTimeMs
errorCode?
reason?
```

Verified values only:

- Severity: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, `UNKNOWN`.
- Priority suggestion: `LOW`, `NORMAL`, `HIGH`, `URGENT`, `UNKNOWN`.
- Image quality: `GOOD`, `ACCEPTABLE`, `POOR`, `UNUSABLE`.

These are advisory classifications and do not add or alter application workflow statuses.

## 5. Arabic short-summary policy

- Formal Arabic; 5–15 whitespace-delimited words.
- Must identify the visible issue and express required action or operational impact through the provider’s controlled instruction contract.
- No Markdown, URL, emoji, vendor/model name or unsupported absolute certainty.
- Never communicates an automatic status/workflow decision.
- Confidence below `0.65` must use:
  `تعذر تأكيد نوع الملاحظة، وتحتاج مراجعة ميدانية قبل اتخاذ الإجراء.`
- Low confidence always sets `requiresHumanReview: true` and a warning.

The validator enforces language, word count, formatting, certainty and the confidence/fallback relationship. Semantic issue/action coverage remains a human/provider-evaluation gate for Sprint 5B.

## 6. Human-in-the-loop policy

Every routed result is enclosed as `advisoryOnly: true` and `requiresExplicitHumanAction: true`. All automation permissions are explicitly false:

- automatic save or observation creation;
- automatic classification or priority application;
- automatic assignment;
- automatic status transition;
- automatic completion or closure.

Inspector options are preserved: use, edit, ignore, or write manually.

Future provenance, not persisted in this sprint:

```text
descriptionSource: MANUAL | AI_ASSISTED
aiSuggestionUsed: boolean
aiSuggestionEdited: boolean
analysisId?
```

Contradictory provenance—such as edited but unused, or AI metadata on a manual description—is rejected.

## 7. Security policy

- Exact tenant and actor scope; private image reference only.
- JPEG/PNG/WebP and 700 KiB maximum, aligned with current evidence constraints.
- Image bytes/reference, existing text, location, prompt content and secrets are excluded from audit metadata.
- Provider output is schema-validated, enum-bounded, Arabic-summary validated and scanned for secret-shaped fields.
- Existing text/image metadata is untrusted data, never instruction authority.
- Default timeout: 15 seconds; router enforces it. Timeout, unavailable and rate-limit errors alone are retry-eligible, with one retry maximum.
- Confidence threshold: 0.65; lower results fail into a fixed human-review fallback.
- Raw provider errors and malformed fields never reach callers.
- No AI result has workflow authority.

## 8. Provider router design

Future declared kinds:

- Mock
- OpenRouter-compatible
- OpenAI-compatible
- Gemini-compatible
- Saudi/private
- On-premises

No provider is registered or enabled by default. Selection is an exact configured identifier—no ordering, random choice or silent fallback. Missing, disabled, unknown, incomplete or non-vision providers fail closed. Vision capability is mandatory for image analysis.

Provider credentials belong only in a future server-side secret boundary. They must never appear in frontend bundles, results, audit events or stored observation documents.

## 9. Mock provider

Deterministic fixtures:

- asphalt pothole;
- leaning lighting pole;
- fallen palm tree;
- construction waste;
- water leakage;
- damaged sign;
- unclear image with low-confidence fallback;
- unsupported image failure mode.

It also simulates malformed output, timeout, hanging provider and provider failure. It performs no network, image processing, application mutation, persistence or external call.

## 10. Tests and checks

New suite: `test/sprint5a-ai-gateway.test.js`.

- Sprint 5A: **33 passed, 0 failed, 0 skipped/todo**.
- Combined isolated policy/security regression: **186 passed, 0 failed, 0 skipped/todo**.
- Covers all required summary, security, provider, timeout, human approval and provenance scenarios.
- All municipal mock fixtures pass the canonical output validator.
- Syntax checks pass for every new module and test.
- Existing isolated policy/security regression suite passed in the same workspace without contacting external services.

## 11. Future integration boundaries

Safest Sprint 5B sequence:

1. Add a server-only gateway endpoint with Firebase token verification and organization/role resolution using existing auth helpers.
2. Resolve `imageReference` through the private evidence authorization boundary; never ask a provider to fetch a municipal URL.
3. Call `validateAnalyzeInput`, create a controlled provider input, then route to one explicitly enabled Preview/mock provider.
4. Validate output before any response or audit write.
5. Return advisory data to a new isolated UI controller; do not call current `processSmartInput()` because it uploads and writes immediately.
6. Present suggestion beside manual input with explicit Use/Edit/Ignore actions.
7. Save only after the inspector’s existing explicit submission action; record provenance separately after rules/schema approval.
8. Keep existing simulations untouched behind the legacy path until the Preview path passes security and usability gates.

Likely future call-site candidates—**not modified now**:

- Inspector pre-save suggestion boundary near `dashboard.html:4167-4218`, before `processSmartInput()`.
- Observation-detail advisory analysis near `dashboard.html:2262-2282`, replacing dummy handlers only after Preview approval.
- Before/after verification near the display boundary, never inside workflow completion logic.

## 12. Risks, rollback and GO/NO-GO

Blockers for real AI:

1. Current smart-input wording suggests AI but writes fixed category/risk fields and immediately saves.
2. No approved server-side AI endpoint, secret manager, provider DPA/data-residency decision or municipal image-processing approval.
3. No authorized private-image-to-provider transport boundary.
4. Category taxonomy and department mappings are not yet verified business master data; mock codes must not become production defaults.
5. Semantic Arabic quality, bias, hallucination, adversarial-image and prompt-injection evaluation datasets are not yet approved.
6. No cost/rate-limit budget, observability sink, retention policy or incident kill switch exists.

Rollback: these files have no imports from application code. Removing or ignoring `platform/ai/`, its test, and this report fully removes Sprint 5A behavior. There is no flag, provider, data or migration to unwind.

Recommendation: **GO for Sprint 5B server-boundary and Preview mock integration design only. NO-GO for real provider calls, production image processing, automatic field application, persistence or deployment.**

## 13. Safety confirmation

- No application page, Firebase configuration, Firestore rule, Auth path, workflow, `storage-adapter.js`, or `spatial-map.js` was changed.
- No real municipal image was read, uploaded or processed.
- No external AI provider, API key, cloud resource, Production service or network call was used.
- No dependency was installed.
- No deploy, commit, push, merge, reset or clean occurred.
- Existing pre-Sprint workspace changes were preserved.

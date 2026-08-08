# Smart HSR — Sprint 5F.4 Preview/Gateway Isolation Regression

## 1. Objective

Sprint 5F.1 (multi-image vision evaluation) and Sprint 5E's real-provider evaluation code now sit in the same repository as the Sprint 5D Inspector AI Preview surface. Sprint 5F.4 adds a permanent regression test that locks in the boundary between the two: the Inspector Preview (`platform/ai/inspector-human-review-preview-service.js` and `preview-only/inspector-human-review-preview.js`) must never call the real AI gateway, a real provider adapter, the network, or persistence, regardless of what real-provider code exists elsewhere in the codebase. This is a read-only, additive verification step — no preview or gateway behavior was changed.

## 2. Files created

- `test/sprint5f4-preview-gateway-isolation.test.js` — 7 deterministic tests, one per isolation requirement (see below).
- `SPRINT-5F4-PREVIEW-GATEWAY-ISOLATION-REPORT.md` — this report.

No other file was created or modified. `platform/ai/arabic-summary-policy.js`, `platform/ai/local-ai-gateway-service.js`, and `preview-only/inspector-human-review-preview.js` were read-only inputs and remain unchanged.

## 3. Isolation guarantees verified

| # | Guarantee | How it is verified |
|---|---|---|
| 1 | Preview never calls `fetch()` or any network transport | Source-scans `inspector-human-review-preview-service.js` and `inspector-human-review-preview.js` for `fetch(`, `XMLHttpRequest`, the Gemini/OpenRouter endpoint URLs, and the raw API key env-var names. |
| 2 | Preview never calls any AI provider | Asserts the preview service's only `require()` is `../intelligence/municipal-intelligence-engine`, that its export surface is exactly `{ createLocalPreviewSuggestion }`, and that a fixture run returns `providerCalled:false` / `networkRequested:false`. |
| 3 | Preview never references the Gemini or OpenRouter adapters | Source-scans both files for `local-ai-gateway-service`, `provider-router`, `mock-ai-provider`, `gemini-compatible-vision-provider`, `openrouter-compatible-vision-provider`, and their factory function names. |
| 4 | Preview never persists data | Source-scans for `setDoc(`, `addDoc(`, `updateDoc(`, `deleteDoc(`, `saveObservationToFirestore`, `commitPendingSmartInput`, `localStorage.setItem`, `sessionStorage.setItem`; also drives a fixture through `beginAnalysis → receiveSuggestion → useSuggestion` and asserts `persisted:false` and `executable:false` throughout. |
| 5 | Preview never calls Firestore functions | Source-scans for `firebase`, `Firestore`, `getFirestore`, `collection(`, `getDocs(`, `onSnapshot(`. |
| 6 | Provider, model, API key, and raw image bytes stay hidden | Source-scans for `apiKey`, `API_KEY`, `imageBytes`, `rawPrompt`, `controlledImagePayload`, `private_key`; asserts the returned `suggestion` object exposes only `shortSummaryAr`; asserts the browser fixture-analysis result has no `provider` or `model` key and `provenance.providerHidden === true`. |
| 7 | Preview stays advisory-only with explicit human action required | Asserts every `AUTOMATION_PROHIBITIONS` flag is `false`, that `advisoryEnvelope()` sets `advisoryOnly:true` and `requiresExplicitHumanAction:true` with the full `INSPECTOR_OPTIONS` set, and that a fixture-driven state transition reaches `SUGGESTION_READY` with `executable:false`; also confirms the browser controller source contains no `ASSIGN_CONTRACTOR`, `UPDATE_STATUS`, or `SAVE_OBSERVATION` markers. |

One correctness note from building the test: an early draft flagged the legitimate `provenance.providerHidden:true` field as a "provider" leak because it does a plain substring match. It was corrected to an explicit key-absence check (`'provider' in fixtureAnalysis === false`) so the test verifies the real guarantee instead of the field's own name — consistent with how the pre-existing Sprint 5D suite already excludes `'provider'` from its own substring scan for the same reason.

## 4. Test results

- `node --check test/sprint5f4-preview-gateway-isolation.test.js`: **passed**.
- `node --test test/sprint5f4-preview-gateway-isolation.test.js`: **7/7 passed, 0 failed**.
- Validated first as a temporary in-repo scratch copy (deleted after validation), then re-verified identically against the final committed-path file.
- No change was made to any Sprint 5A–5F2 test file; this is a purely additive suite.

## 5. Security boundaries

- **No real network call is made by this test or by the code it exercises.** All assertions are static source scans plus calls into the existing deterministic, offline preview service and state machine.
- **No Firebase/Firestore, persistence, or workflow action** (`ASSIGN_CONTRACTOR`, `UPDATE_STATUS`, `SAVE_OBSERVATION`) is reachable from the preview surface, confirmed by both source inspection and behavioral assertions on `persisted`/`executable`.
- **No credential or raw payload material** (API keys, raw prompts, raw image bytes, provider/model identity) is present in anything the preview surface returns or in its source.
- **Advisory-only enforcement is structural, not incidental**: `AUTOMATION_PROHIBITIONS` is asserted all-`false` and every state-machine transition is asserted to leave `persisted:false` / `executable:false`, requiring an explicit human action (`useSuggestion`/`editSuggestion`/`ignoreSuggestion`) to proceed at all.

## 6. GO/NO-GO recommendation

**GO** — for continued reliance on this isolation boundary as regression coverage. The Inspector AI Preview surface is now permanently and automatically verified to stay disconnected from the real AI gateway, real provider adapters, the network, Firestore, and persistence, independent of any future changes to the real-provider evaluation code (Sprint 5C/5E/5F.1) elsewhere in the repository.

This report does not change the Production/Preview activation status established in prior sprints: the Inspector AI Preview remains **NO-GO for Production or real-provider activation** (per `SPRINT-5D-INSPECTOR-HUMAN-REVIEW-REPORT.md`), and no work in this sprint slice alters that.

## Safety confirmation

- Real Gemini/OpenRouter API calls made inside Codex during Sprint 5F.4: **0**.
- No Firebase, Firestore, persistence, or observation writes performed by this sprint's test or by this report.
- No production file, existing test file, or `arabic-summary-policy.js` was modified.
- No commit, push, merge, or deploy performed.

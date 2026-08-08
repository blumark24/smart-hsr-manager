# Smart HSR — Sprint 5F.1 Multi-Image Vision Evaluation

## Executive result

Sprint 5F.1 built a multi-image evaluation harness (`scripts/evaluate-multi-image-vision-local.js`) that reuses the existing Sprint 5E single-fixture runner and provider stack to evaluate up to 8 local vision fixtures in one local run, one Gemini call per fixture, no retry, no fallback.

**No real Gemini API call was made from inside Codex during this sprint.** Only **1 of the up to 8 fixture slots** currently has a committed, available local image (`test/fixtures/vision/asphalt-pothole.jpg`); no additional fixtures were fabricated to fill the remaining slots. The metrics table below is computed from the one genuinely existing, previously-validated real result for that fixture (produced by an authorized local run outside Codex, Sprint 5E.5 retry, model `gemini-3.6-flash`) — it illustrates what the new aggregation now reports, but is **not** a new evaluation run.

Recommendation: **NO-GO for Preview evaluation** on the current dataset (n=1, no independent ground truth). See "Sufficiency for Preview evaluation" below.

## Files created

- `scripts/evaluate-multi-image-vision-local.js` — CLI runner, up to 8 `--fixture` flags, one provider call per fixture (single accounting site, no retry), reuses `createGeminiCompatibleVisionProvider`, `validateShortSummaryAr`, and `buildProviderComparison` unmodified logic paths, plus the existing `.env.local` / path-safety / sanitization helpers from `scripts/evaluate-single-gemini-vision-local.js`.
- `test/fixtures/vision-local-ground-truth.js` — filename-keyed ground-truth table for `test/fixtures/vision/`, intentionally empty (see "Ground truth").
- `test/sprint5f1-multi-image-evaluation.test.js` — 12 offline tests, mocked transport only.
- `SPRINT-5F-MULTI-IMAGE-EVALUATION-REPORT.md` — this report.

## Files modified

- `platform/ai/server/vision-evaluation-metrics.js` — `buildProviderComparison` extended additively with `successRate`, `medianLatencyMs`, `maxLatencyMs`, `departmentAgreement`, `hallucinationFlaggedCaseIds`. All previously-returned fields and the module's export shape (`{ buildProviderComparison }`) are unchanged.

No other file was modified. No Sprint 5E file's logic was changed — only reused via `require()`.

## Evaluated fixtures

| # | Fixture | Status |
|---|---|---|
| 1 | `test/fixtures/vision/asphalt-pothole.jpg` | Available. Real result exists from a prior authorized local run outside Codex (Sprint 5E.5 retry). |
| 2–8 | — | Not available. No fixture files exist at these slots; none were fabricated. |

## Metrics (n = 1, from the existing validated real result)

Source: `evaluation/real-vision/sprint-5e5-utf8-retry/single-result.sanitized.json` (model `gemini-3.6-flash`, HTTP 200, `apiCallCount: 1`).

| Metric | Value | Basis |
|---|---:|---|
| Fixtures evaluated | 1 of up to 8 | Only 1 fixture file exists |
| Success rate | 100% (1/1) | `success: true` |
| Schema validity | 100% (1/1) | `schemaValidation: true`, computed by the original runner against the full (pre-sanitization) result |
| Arabic summary validity | 100% (1/1) | `arabicSummaryValidation: true` |
| Category correctness | N/A | No independently-validated ground truth exists for this fixture — see "Ground truth" |
| Severity agreement | N/A | Same reason |
| Department agreement | N/A | Same reason |
| Hallucination flags | Not assessed | No manual hallucination review has been performed; left `null`, never fabricated as `true`/`false` |
| Average latency | 22,961 ms | Single sample |
| Median latency | 22,961 ms | Single sample |
| Maximum latency | 22,961 ms | Single sample |

With n=1, average/median/maximum latency are necessarily identical.

## Failed cases

None. The one available fixture succeeded on its one recorded real run. The other 7 of 8 slots are unfilled fixture slots (no local image available), not evaluation failures.

## Ground truth

`test/fixtures/vision-local-ground-truth.js` is intentionally empty. The only candidate label found — `evaluation/real-vision/sprint-5e/manifest.json`, case `s5e-asphalt-pothole` — has `provenance.status: "MISSING"` and points at a different, never-obtained fixture (a `.png` under `evaluation/real-vision/sprint-5e/fixtures/`) than the `.jpg` actually committed at `test/fixtures/vision/asphalt-pothole.jpg`. No verified chain of custody links that frozen entry to the fixture actually evaluated, so no category, severity, or department label is asserted for it. Category/severity/department metrics correctly report as excluded rather than a fabricated score.

## Tests

- New offline tests (`test/sprint5f1-multi-image-evaluation.test.js`): **12 passed, 0 failed.** Mocked transport only, no network access.
- Sprint 5A–5E regression (154 pre-existing tests): **154 passed, 0 failed** — unchanged from the pre-Sprint-5F baseline, confirming the additive `vision-evaluation-metrics.js` change did not affect `sprint5c-real-vision-evaluation.test.js` or any other existing suite.
- Combined: **166 of 166 tests passing**, zero real network calls made from inside Codex.

## Local command for a real multi-image run

To be executed once, **outside Codex sandbox**, from the repository root, after adding more provenance-reviewed local fixtures (up to 8 total) under `test/fixtures/vision/`:

```powershell
node .\scripts\evaluate-multi-image-vision-local.js --fixture "test/fixtures/vision/asphalt-pothole.jpg" --model "gemini-3.6-flash" --output-dir "evaluation/real-vision/sprint-5f1-local-run"
```

Add one `--fixture "<path>"` per additional local image (up to 8 total) to evaluate more fixtures in the same run. The runner loads `.env.local` directly; no environment variables need to be exported or printed.

## Limitations

- n=1 real sample; not statistically meaningful for any accuracy claim.
- No independent category/severity/department ground truth exists for any current fixture.
- The metrics table above was computed from an already-existing validated artifact, not a fresh execution of the new script — no real Gemini call was made in this Codex session.
- Hallucination review has never been performed; the field is intentionally left `null`/excluded rather than fabricated.
- When ground truth does exist, `departmentAgreement` uses a keyword-containment heuristic (`vision-evaluation-metrics.js`), not exact taxonomy matching.
- Real evaluation is local-execution only, exactly like every prior Sprint 5E runner: it requires a valid, git-ignored `.env.local` and must be run manually outside Codex.

## Sufficiency for Preview evaluation

**NO-GO.** n=1 with no independent ground truth cannot support any accuracy, category-correctness, severity-agreement, or department-agreement claim, and a single latency observation is not a distribution. Consistent with every prior Sprint 5E report, real multi-image evaluation first requires: (1) additional provenance-reviewed local fixtures (up to 8), (2) independently-established ground-truth labels reviewed by someone other than the AI provider, and (3) an actual local run of `scripts/evaluate-multi-image-vision-local.js` outside Codex.

## Safety confirmation

- Real Gemini API calls made inside Codex during Sprint 5F.1: **0**.
- No Firebase, Firestore, persistence, or observation writes.
- No API key, raw prompt, image bytes, or raw provider response leaves the sanitized artifact boundary — enforced identically to the single-fixture runner and verified by the credential/payload assertions in `test/sprint5f1-multi-image-evaluation.test.js`.
- No commit, push, merge, or deploy performed.

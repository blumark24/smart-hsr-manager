# Smart HSR — Sprint 5E Real Gemini Vision Local Evaluation

## Executive result

**Run status: BLOCKED — fail closed before model discovery and before any API call.**

The local environment did not satisfy two mandatory activation requirements, and no approved local evaluation images were available. No Gemini request was sent and no quality metric was fabricated.

Recommendation: **NO-GO for Sprint 5F or any UI connection.** Correct the local-only activation configuration and supply a provenance-reviewed synthetic/licensed fixture set first.

## Checkpoint and scope

- Starting checkpoint: `9849bed03f0a082d944f8899879c51dbeff9eb06`.
- Branch: `codex/smart-hsr-rules-test-harness`.
- Application integration: prohibited and unchanged.
- Firebase/Firestore: not used.
- Municipal Production data processed: **none**.

## Activation safety result

Only safe booleans were emitted:

| Requirement | Result |
|---|---:|
| `GEMINI_API_KEY` present under the adapter-required name | false |
| Real vision local evaluation enabled | true |
| Synthetic-only mode | true |
| Provider explicitly Gemini | true |
| Runtime local | true |
| Application integration explicitly disabled | false |

No key value, prefix, suffix, length, hash, environment dump, or secret-derived value was printed or stored.

Blocking codes:

- `AI_REAL_API_KEY_REQUIRED`
- `AI_REAL_APPLICATION_ISOLATION_REQUIRED`
- `EVALUATION_FIXTURES_MISSING`

## Selected Gemini model

**None.** Model listing and safe test-call discovery were intentionally not attempted because the activation guard failed. No obsolete/default model was assumed, and no automatic fallback occurred.

## Dataset and provenance

A frozen ground-truth manifest was created for 17 required cases before any provider output:

- asphalt pothole;
- road cracking and subsidence;
- leaning/damaged lighting poles;
- fallen palm/tree;
- construction waste and overflowing container;
- water leakage;
- damaged road sign and sidewalk;
- open manhole;
- illegal excavation;
- visual pollution;
- unclear image;
- non-municipal image.

Validated fixtures available: **0 of 17**.

Every manifest entry is marked `MISSING` and uses a repository-relative expected fixture path. No automatic download, arbitrary public source, real municipal image, face, plate, personal data, or operational coordinate was used. Expected issue/category/severity/department/human-review labels were frozen independently from AI output.

## Real API execution

- Model-list calls: 0.
- Image-analysis calls: 0.
- Total real Gemini API calls: **0**.
- Provider switching/fallback: none.
- Firebase calls: 0.
- Firestore writes: 0.

## Evaluation metrics

No statistical rates can be calculated with zero validated cases and zero provider responses.

| Metric | Result |
|---|---:|
| Total manifest cases | 17 |
| Total validated cases | 0 |
| Successful responses | 0 |
| Provider/schema/Arabic validity rates | Not calculated |
| Issue/category accuracy | Not calculated |
| Department agreement | Not calculated |
| Severity agreement | Not calculated |
| Low-confidence correctness | Not calculated |
| Human-review correctness | Not calculated |
| Hallucinations | Not assessed |
| Unsupported certainty | Not assessed |
| Latency average/median/max | Not available |
| Average response size | Not available |
| Token usage/cost | Not available |
| Free-tier quota errors | 0 |

Zero quota errors does not imply quota availability; no request was made.

## Arabic summary examples

No real Gemini summary was produced. Existing policy examples and synthetic offline test outputs were not presented as real-model results.

## Failed cases

All 17 cases were not executed because their fixtures are absent. This is a dataset-readiness blocker, not a provider-quality failure.

## Hallucination and multi-issue review

No provider output exists, so no hallucination or multi-issue judgment can be made. The sanitized manual-review artifact explicitly records this state rather than treating unexecuted cases as correct or incorrect.

No location, person, vehicle detail, measurement, legal violation, repair duration, cost, workflow command, assignment, observation split, or closure instruction was generated.

## Offline error handling

Deterministic tests cover:

- invalid MIME denied before transport;
- oversize payload denied before transport;
- corrupted-image/provider rejection normalized without raw response;
- provider timeout normalized;
- malformed JSON normalized;
- unclear/non-municipal low-confidence output requires human review;
- sanitized artifacts contain no bytes, prompt, secret, absolute path, or raw provider response.

These are adapter safety tests, not evidence of Gemini accuracy.

## Sanitized artifacts

- `evaluation/real-vision/sprint-5e/manifest.json`
- `evaluation/real-vision/sprint-5e/results.sanitized.json`
- `evaluation/real-vision/sprint-5e/metrics.json`
- `evaluation/real-vision/sprint-5e/manual-review.md`

Artifacts contain no key, image bytes, raw prompt, raw response, personal data, or absolute local path.

## Privacy limitations

The planned first run must remain synthetic/owned/safely licensed. Even after activation succeeds, 17–20 controlled images are only an engineering evaluation and cannot establish Production accuracy, demographic safety, geographic generalization, government-pilot readiness, or operational SLA performance.

## Suitability for Preview

Not assessable. With zero real calls and zero validated images, the Gemini adapter cannot be recommended for Preview based on model quality.

## Exact blockers before UI connection

1. Make `GEMINI_API_KEY` available locally under the exact server-adapter name without exposing or committing it.
2. Explicitly prove no application integration through the approved local variable.
3. Configure and verify one current vision-capable Gemini model through an official listing or safe call—without fallback.
4. Add at least 12, preferably 17–20, provenance-reviewed local fixtures.
5. Freeze checksums and provenance before the first output.
6. Complete the real run and manual hallucination review.
7. Meet separately approved quality thresholds; do not infer them from a small dataset.
8. Preserve human approval and no-persistence boundaries.

## GO / NO-GO

- Repeat Sprint 5E after prerequisites: **GO**, once the local gate and fixture provenance pass.
- Sprint 5F / Preview connection now: **NO-GO**.
- Production integration: **NO-GO**.

## Safety confirmation

- `.env.local` remained ignored and untracked.
- No API key was displayed, logged, written to artifacts, or added to Git diff.
- No protected application page, Firebase config, Firestore rule, Auth behavior, or workflow transition changed.
- No observation was created or saved.
- No Firebase Production connection occurred.
- No external API call, deploy, push, merge, or commit occurred.
- No municipal Production data was processed.

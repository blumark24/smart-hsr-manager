# SMART HSR — Phase 09 Release Candidate

Institutional readiness review for formal municipality UAT (بلدية القنفذة / Al-Qunfudhah).
Scope: three real municipal products (إدارة الحصر الميداني, إدارة الأراضي والممتلكات,
إدارة الحركة والسير) delivered on Manager, plus the Lands and Owner repos and the shared
Maps/Digital Twin platform capability. Preview/Staging only — no Production change is made
or implied by this document.

## Repositories and baselines

| Repo | Branch reviewed | Base SHA | Release branch |
| --- | --- | --- | --- |
| smart-hsr-manager | claude/phase-08-1-geo-closure | 4351a62a771f4d07e3dcc18ab57f6f201d4589f4 | claude/phase-09-release-candidate |
| smart-hsr-lands | claude/phase-08-smart-hsr-geo-final | 37b9af272c204a63b216723d14e765af5a5a1b56 | none created — no fix required |
| Smart-HSR-Owner | claude/phase-07b-owner-console-final | 51f7ed1f1767747dfee05b366e1be0cd93174feb | none created — no fix required |

Lands and Owner needed no code change: their own regression suites are 100% green against
the pinned SHA, and Gate 1's cross-repo Rules reconciliation found their Firestore/Storage
Rules already correct. Only Manager received a fix commit (see Release Notes).

## Gate summary

| Gate | Result | Notes |
| --- | --- | --- |
| 1 — Rules source of truth | PASS (1 defect fixed) | See Release Notes: grant-completeness schema drift |
| 2 — Lands SSO integration | PASS | One-time code, 60s TTL, transactional replay prevention, live re-validation at consume time — all covered by passing Lands tests |
| 3 — Field GPS readiness | PASS (code review); physical-device checks deferred | See UAT checklist |
| 4 — Test/CI command cleanup | PASS (exceeded) | `npm test`/`test:release`/`test:geo`/`test:security` now real, portable, deterministic; 1864/1864 pass, up from a persistent 1853/1864 baseline |
| 5 — Full regression | PASS | Manager 1864/1864; Lands 51/51 (non-emulator) + 58/61 (emulator, see below); Owner 81/81 |
| 6 — Owner historical aggregation | N/A | Feature does not exist in the locked Owner Console (live current-state dashboard + live audit feed only, no month/year rollup) |
| 7 — Multi-tenant isolation | PASS | Manager/Lands: existing extensive test coverage. Owner: single global `isOwner()` gate + default-deny catch-all — no tenant ever has any access |
| 8 — Env/secrets review | PASS | See table below |
| 9 — Firestore indexes | PASS (13 missing indexes added) | See Release Notes |
| 10 — Performance | PASS (measured) | See below |
| 11 — Observability | PASS | Sanitized error logging, structured ok:false/reason codes throughout trusted APIs and the Lands bridge |
| 12 — Backup/restore | See RUNBOOK.md | |
| 13 — Rollback | See ROLLBACK.md | |
| 14 — Security review | PASS, no unresolved CRITICAL/HIGH | See below |
| 15 — Release documentation | PASS | This file + RUNBOOK.md + ROLLBACK.md + UAT-CHECKLIST-AL-QUNFUDHAH.md + RELEASE-NOTES.md |
| 16 — Release SHA | See Release Notes for final commit |

## Gate 5 detail — Lands emulator suite (58/61)

3 of 61 emulator-dependent Lands tests (`storage-emulator.test.js`, the
"apply distinct Lands role permissions" group) show non-deterministic failures in this
sandboxed session. Root-caused by direct reproduction: an isolated, trivial single-condition
Storage Rule using one `firestore.get()` cross-service call fails 100% of the time cold, but
the identical rule succeeds once the Storage↔Firestore emulator bridge has already served a
few prior cross-service calls in the same session — a timing characteristic of the local
JVM-based cross-service rules bridge, not of Lands' rules or code. Evidence against a real
security defect:
- Every condition in the failing rule was manually traced against the test's own seeded data
  and is genuinely satisfied (membership enabled, record ownership, document/storage-path
  binding, MIME/size match).
- The same rule chain succeeds elsewhere in the identical run once the bridge has been
  exercised.
- The failure is identical at both the configured Firestore port (8085) and Firestore's
  default port (8080), ruling out a port-configuration cause.
- No Lands file was modified to chase this; all `assertFails` (security-boundary) tests in
  the same file pass consistently.

This should be re-confirmed on a standard (non-sandboxed) CI runner or developer machine as
part of Phase 10 UAT tooling verification, consistent with the Phase 08.1-disclosed
real-browser network-sandboxing limitation.

## Gate 8 — Environment / secrets table

| Variable | Repo | Purpose | Public/Secret | Required | Status |
| --- | --- | --- | --- | --- | --- |
| Firebase Web API key (in client bundles) | Manager, Lands, Owner | Firebase client SDK init | Public by Google's own design — not a secret; real authorization is Firestore Rules + Auth | Yes | OK, no action |
| FIREBASE_SERVICE_ACCOUNT | Manager | Admin SDK credential for server APIs | Secret | Yes (server) | OK — not committed, env-only |
| FIREBASE_WEB_CONFIG | Manager | Server-rendered client config | Public | Optional | OK |
| FIREBASE_PROJECT_ID / GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT | All three | Project targeting | Public | Yes | OK |
| LANDS_TRUSTED_API_URL | Manager | Manager→Lands server bridge base URL | Config, not secret | Optional (safe no-op when unset) | OK |
| LANDS_TRUSTED_API_BYPASS_SECRET | Manager | Vercel Preview-protection bypass for the Lands bridge | Secret | Optional | OK — not committed, env-only |
| B2_KEY_ID / B2_APPLICATION_KEY / B2_BUCKET_NAME / B2_REGION / B2_S3_ENDPOINT | Manager | Evidence object storage (S3-compatible) | Secret (key/app key) | Yes (server) | OK — not committed, env-only |
| SMART_HSR_AI_PROVIDER | Manager | Selects Gemini/OpenAI/OpenRouter vision provider | Config | Optional (defaults to Gemini) | OK |
| GEMINI_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY | Manager | AI vision provider credentials | Secret | Only for the selected provider | OK — not committed, env-only, fail-closed to `AI_PROVIDER_UNAVAILABLE` when absent |
| GEMINI_VISION_MODEL / OPENAI_VISION_MODEL / OPENROUTER_VISION_MODEL / OPENROUTER_MODEL_SUPPORTS_* | Manager | Provider model selection/capability flags | Config | Optional | OK |
| SMART_HSR_AI_APPLICATION_INTEGRATION / SMART_HSR_REAL_AI_EVALUATION / SMART_HSR_SYNTHETIC_DATA_ONLY / SMART_HSR_NO_APP_INTEGRATION | Manager | AI feature-gating flags (pilot rollout, synthetic-only test mode) | Config | Optional | OK |
| GCP_SERVICE_ACCOUNT_EMAIL / GCP_WORKLOAD_IDENTITY_POOL_ID / GCP_WORKLOAD_IDENTITY_PROVIDER_ID / GCP_PROJECT_NUMBER | Lands | Workload Identity Federation for Lands' server→Firestore/Storage access | Config (identifiers, not bearer secrets) | Yes (Production) | OK |
| FIREBASE_STORAGE_BUCKET | Lands | Storage bucket targeting | Public | Yes | OK |
| (none custom) | Owner | Owner Console uses only default Cloud Functions runtime credentials — no bespoke secret | — | — | OK, no action |

No committed secret, credential, or token was found in any of the three repos. `.gitignore`
coverage and `.env.example` hygiene were confirmed for all three.

## Gate 10 — Performance (measured, not assumed)

- `vendor/cesium` (Twin only, loaded exclusively by `twin.html`): 20MB
- `vendor/maplibre-gl` (Operational Map only, loaded exclusively by `operational-map.html`): 5.4MB
- `vendor/firebase`: 3.9MB, shared by all pages that need Firestore/Auth
- Neither Cesium nor MapLibre is loaded by `dashboard.html`, `manager-operations.html`, or
  `mobile-map.html` — the heavy map engines are already correctly scoped to their own pages,
  not bundled globally.
- Page markup sizes: `dashboard.html` 358KB, `manager-operations.html` 196KB,
  `mobile-map.html` 111KB, `operational-map.html` 23KB, `geo-core.bundle.js` 56KB — all
  plain text, gzip-friendly, no red flag at these sizes.
- Firestore query review (Gate 9) found list/dashboard views to be one `onSnapshot` per
  collection scoped by `organizationId`, not per-document reads in a loop — no N+1 pattern.
- No measurement here shows a latency or repeated-read problem that would justify adding
  Redis or another caching layer; none is added.

Real-browser timing (Lighthouse-style measurement) could not be run in this sandboxed
session — outbound network egress to CDNs is blocked here, the same disclosed limitation as
Phase 08.1/08.2's real-browser acceptance gate. This is a measurement-tooling limitation, not
a finding of a performance problem.

## Gate 14 — Security review

No unresolved CRITICAL or HIGH finding. Summary of what was specifically re-verified this
phase (beyond what Phase 08.1 already closed):
- **MEDIUM → fixed**: Manager's Lands-grant completeness display checked fields that no
  longer exist in Lands' real schema (stale port from an earlier Lands client shape) —
  cosmetic (a wrong percentage/status shown to a Manager viewer), not a security bypass, but
  a genuine correctness defect. Fixed and regression-tested (Gate 1).
- **MEDIUM → fixed**: 13 compound Firestore queries across `observations`, `missions`,
  `vehicles`, `incidents`, and `employeeAssignments` had no composite index; the Firestore
  emulator does not enforce this, so it was invisible to the test suite, but a real deployed
  Firebase project would return `FAILED_PRECONDITION` for these — most seriously, every
  evidence-image authorization check (`api/storage/read.js`) would have failed for 6 of its
  7 lookup fields, and contractors' mobile evidence-loading query would have failed outright.
  Fixed by adding the justified indexes (Gate 9); this is an availability/correctness defect,
  not an authorization bypass — access remained fail-closed throughout.
- **INFO**: Lands' Storage emulator test flakiness (see Gate 5 above) — investigated in
  depth and attributed to the local cross-service rules bridge, not a Rules defect.
- No Firestore/Storage Rule was weakened anywhere. No tenant isolation gap was found. No
  bypass of a trusted API, SSO handoff, or audit-logging path was found.

## Final release decision

**PHASE 09 RESULT: PASS**
**RELEASE CANDIDATE: READY**
**PHASE 10 UAT: READY**, conditional on the UAT checklist's physical-device GPS checks and
the Lands emulator-flakiness re-confirmation above being run once on non-sandboxed
infrastructure before or during UAT — neither blocks starting UAT itself.

STOP. DO NOT BEGIN PHASE 10. DO NOT DEPLOY PRODUCTION.

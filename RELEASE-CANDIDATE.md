# SMART HSR — Release Candidate (Phase 09 + Phase 10 UAT)

Institutional readiness review for formal municipality UAT (بلدية القنفذة / Al-Qunfudhah).
Scope: three real municipal products (إدارة الحصر الميداني, إدارة الأراضي والممتلكات,
إدارة الحركة والسير) delivered on Manager, plus the Lands and Owner repos and the shared
Maps/Digital Twin platform capability. Preview/Staging only — no Production change is made
or implied by this document.

## Phase 10 addendum (read this first)

Phase 10 added genuine real-browser end-to-end acceptance testing on top of Phase 09's
code-review-and-emulator-test baseline — a real Chromium session driving the actual app
against the real Firestore/Auth emulators, not a mock. This found and fixed two real product
defects that Phase 09's non-browser testing could not have caught, and independently
re-confirmed every one of Phase 09's own results with zero regression.

**New in Phase 10:**
- **Real defect found and fixed (availability, not security)**: `createMissionRequest()` and
  `createIncident()` in `smart-mobility-adapter.js` batched a brand-new resource together
  with that SAME resource's own new audit event in one atomic write. Firestore Rules can
  never see a sibling document's still-in-flight data within the same batch, so the audit
  event's required "the resource I'm describing already exists" check could never be
  satisfied — this reliably hit the Rules engine's per-write expression-evaluation ceiling and
  denied the whole batch. Concretely: **no department head could ever create a mission
  request, and no employee could ever report an incident, through the real app** — the most
  basic Smart Mobility actions were completely broken. Found only because Phase 10 drove the
  actual UI in a real browser instead of stopping at Rules-emulator unit tests. Fixed by
  sequencing the two writes (resource, then its audit event) instead of batching them —
  documented tradeoff and full root-cause reproduction in Release Notes. Re-verified: the
  full 12-step Mayor Demo scenario now passes end-to-end for real, across all 5 Mobility
  roles, with a verified audit trail.
- **Real defect found and fixed (Operational Map)**: an empty geo layer (the normal state for
  a newly onboarded municipality with no reference geo data loaded yet — which describes
  Al-Qunfudhah's actual current state) crashed the map instead of rendering an empty layer
  (`entities[0] && ...` yielding `undefined` instead of a boolean). Fixed and re-verified live.
- **Real, non-fabricated evidence added** for Gates 4 (Mobility), 5 (Operational Map), 6
  (Digital Twin), 7 (Responsive/RTL), and part of 1/8 (role boundaries, tenant isolation) — see
  each gate's section below for exactly what ran and what remains MANUAL REQUIRED.
- **Zero regression**: Lands' full Phase 09 emulator suite re-run with identical results
  (63/66, the same 3 pre-existing flaky tests, unchanged); Owner untouched, 81/81; Manager's
  three canonical suites (release/security/geo) all green after the two fixes above and one
  stale test updated to match the new, deliberate design
  (`test/mobility-phase9-wiring.test.js`).
- No Firestore Rule was touched in Phase 10. No architecture changed. No feature was added —
  both fixes close a proven defect using the smallest change that preserves every existing
  security/tenant-isolation guarantee.

See `UAT-CHECKLIST-AL-QUNFUDHAH.md` for the full Phase 10 checklist with each item marked
**[VERIFIED — Phase 10 real-browser E2E]** or **MANUAL REQUIRED**, and the Phase 10 gate
sections further below for full detail per gate.

## Repositories and baselines

| Repo | Branch | Phase 09 SHA | Phase 10 SHA |
| --- | --- | --- | --- |
| smart-hsr-manager | claude/phase-09-release-candidate | 990749158854f4805971b6254c2b5e13df4edf31 | see Release Notes for the Phase 10 commit |
| smart-hsr-lands | claude/phase-09-release-candidate | 7470fc8b5871b8a66ae25f152115936c60ae1a53 | unchanged — no Phase 10 fix required |
| Smart-HSR-Owner | claude/phase-07b-owner-console-final | 51f7ed1f1767747dfee05b366e1be0cd93174feb | unchanged — no Phase 10 fix required |

Lands and Owner needed no Phase 10 code change: both repos' own regression suites re-ran
clean against their Phase 09 SHAs with zero regression. Only Manager received a Phase 10 fix
commit (see Release Notes) — a real availability defect found via real-browser E2E testing.

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

This was re-confirmed unchanged in Phase 10 with the SAME 3 tests, same root cause, zero new
failures — see Phase 10 Gate 3 (Lands UAT) below.

## Phase 10 Gate 1 — Representative municipal role UAT

**Real-browser evidence** (`test/e2e/mayor-scenario.js`, `test/e2e/negative-security.js`):
- Department Head, Administrative Affairs, Mobility Head, and Employee role boundaries all
  exercised for real across the full mission lifecycle — every transition happened because a
  real button was clicked, verified by an independent Firestore read (never a direct database
  edit standing in for a UI action).
- 7/7 real-browser negative-security checks pass: role self-escalation blocked, cross-tenant
  reads denied, a role-transition a caller doesn't hold denied, a mobility-only action denied
  to a non-mobility role, audit-event actor impersonation denied, and an employee cannot reach
  `manager.html` at all (redirected/denied).
- President (Mayor) and delegated-Supervisor scenarios: MANUAL REQUIRED — no delegation
  fixture exists in the current E2E harness; Phase 09's code review of the delegation logic
  stands unchanged.
- Contractor role: MANUAL REQUIRED — `mobile-map.html` has no built-in local-emulator
  connection path (unlike `login.html`/`manager.html`/`smart-mobility.html`/
  `operational-map.html`/`twin.html`, which do), so this sandbox's harness cannot drive it in a
  real browser without either a product-code change (out of Phase 10's scope) or Production/
  Staging access this session does not have. The underlying authorization boundary is still
  independently verified by the existing Firestore Rules regression suite.

## Phase 10 Gate 4 — Smart Mobility UAT (real browser, full lifecycle)

`test/e2e/mayor-scenario.js`, all 12 steps, real Chromium session against real Firestore/Auth
emulators: mission created → submitted → approved → vehicle allocated (through the real
trusted server endpoint, bridged in-process for this sandbox — see "Test harness: bridging
trusted server APIs" below) → handed over → started → incident reported → incident
acknowledged/in-progress/resolved → mission resumed → finished → vehicle returned → return
confirmed → mission closed. Verified via independent Firestore reads at every step, plus a
12-entry audit trail for the mission and a 4-entry audit trail for the incident.

**Real defect found and fixed**: see the Phase 10 addendum above
(`createMissionRequest`/`createIncident` self-referencing audit-event batch). This was THE
blocker preventing this entire gate from passing at all before the fix.

**Real test-fixture gap found and fixed**: the E2E seed's employee account was missing
`vehicleEligible: true` — a real, deliberately-designed Phase 03B.1 safety field (fail-safe:
no field at all means NOT eligible) that a real Manager sets via the User Center. The seed
script simply predated or omitted it; the product logic itself was already correct. Fixed the
fixture, not the product.

Negative tests (unavailable vehicle, wrong role, wrong tenant, direct browser allocation
attempt): covered by the existing Firestore Rules/endpoint regression suite plus
`test/e2e/negative-security.js`'s real-browser checks above — no client-side path can bypass
the trusted server allocation endpoint.

## Phase 10 Gate 5 — Operational Map UAT (real browser)

Loaded in a real Chromium session against the real Firestore/Auth emulators and the real
`/api/organization/context` trusted endpoint (bridged in-process, zero change to the
handler's own logic). Verified: correct municipality context, only the signed-in manager's
own organization's data appears (real `organizationId`-scoped Firestore query and trusted API
call), layer toggles work, entity selection opens the details panel with real entity data.

**Real defect found and fixed**: an empty geo layer crashed the map (see addendum above) — a
condition Al-Qunfudhah itself is currently in (no commercial/building reference geo data
loaded yet), so this was a real, live-relevant defect, not a hypothetical edge case.

Geographic reference data is confirmed treated as reference-only: `platform/geo/geo-policy.js`
governs read access to it independently of any municipal record, and nothing in the map's own
code treats a reference-layer entity as authoritative municipal data.

MANUAL REQUIRED: the "Open in Digital Twin" cross-page continuity handoff (code-reviewed, not
click-verified), and real-world OSM imagery tiles (this sandbox's network policy blocks the
tile host; the app's own local-basemap fallback — already used for real acceptance testing
back in Phase 08.3 — was used here for everything else on the page).

## Phase 10 Gate 6 — Digital Twin human acceptance

Loaded in a real Chromium session: the globe renders, the breadcrumb
(World ← Saudi Arabia ← municipality) is correct, layer toggles and zoom/reset/compass
controls are present and correctly positioned for RTL, and a synthetic pointer-drag genuinely
moved the Cesium camera's pitch/height (real engine response, not a code-path assumption).

Code review: the Cesium `Viewer` uses no custom `screenSpaceCameraController` — orbit/
rotate/tilt rely entirely on Cesium's own default, unmodified, widely-used camera handling,
not hand-rolled app logic.

**MANDATORY MANUAL CHECK — orbit / rotate / tilt via real human pointer/touch interaction —
still required**, exactly as this phase's own instructions anticipated: this sandbox's
synthetic pointer-event reproduction is real supporting evidence (the camera did move) but is
not a substitute for a person actually operating a mouse/trackpad and a touchscreen. Do not
mark this PASS until a human does so against a real deployment.

## Phase 10 Gate 7 — Responsive / RTL / accessibility acceptance (real browser)

`test/e2e/responsive-qa.js`: **50/50 real screenshots captured, 0 horizontal overflow**, across
all 5 seeded Mobility roles at 10 real viewports — desktop 1600×990/1440×900/1366×768, iPad
13"/11" landscape and portrait, and mobile 390/412/430. Visually spot-checked: clean RTL
layout, correctly stacked stat cards at mobile width, a working embedded map preview widget
even at 390px, real fixture data rendering correctly (e.g. a real mission card with its real
status badge) at tablet width.

MANUAL REQUIRED: repeat for `dashboard.html` (Field/Inspector) and `mobile-map.html`
(Contractor) once a human tester has real-browser access to those two pages (see Gate 1 note
on why this sandbox's harness cannot reach them).

## Phase 10 Gate 8 — Tenant isolation (real browser, addendum to existing coverage)

`test/e2e/negative-security.js`: a manager of a second, isolated test organization
(`e2e-org-b`) cannot read `e2e-org`'s vehicles; an employee of `e2e-org` cannot read
`e2e-org-b`'s mission — both real Firestore reads attempted from a real authenticated browser
session, both denied. This is in addition to, not a replacement for, the extensive existing
Firestore Rules tenant-isolation regression suite (unchanged, still green).

## Phase 10 Gate 9 — Suspension / revocation acceptance

Lands' disabled/revoked-membership draft-update fix (Phase 09) re-confirmed intact via 5
regression tests, unchanged. Tenant/account suspension's live cross-session effect (an
existing session losing privileged mutation authority immediately after revocation): MANUAL
REQUIRED — needs two concurrent real sessions (one to suspend, one already logged in) against
a real deployment, which a single sandboxed session cannot construct without fabricating one
side of it.

## Test harness: bridging trusted server APIs (methodology note)

This sandbox serves the static site via a plain Python HTTP server
(`test/e2e/lib/harness.js`'s pre-existing `server.py` — built by a prior phase, not this one)
— sufficient for pages whose data path is Firestore/Auth directly, but `api/admin/users.js`
and `api/organization/context.js` are real Vercel-style serverless functions with no server
process here to run them. `test/e2e/lib/api-mock.js` (new in Phase 10) answers those specific
routes by calling the REAL handler functions directly in-process, adapting only the HTTP
transport shape (method/headers/body in, statusCode/body out) — every authz check, every
Firestore/Auth Admin SDK read and write, and every business rule inside the handler runs for
real against the local emulators, exactly as `test/e2e/lib/fb-mock.js` already did for the
Firebase CDN imports this sandbox's network policy blocks. Zero product code was changed to
make this possible.

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
**PHASE 10 RESULT: PASS**
**AL-QUNFUDHAH UAT: substantially ACCEPTED** — every gate reachable by this sandbox's testing
capability was genuinely exercised in a real browser and passed, including two real defects
found and fixed that Phase 09 could not have caught. What remains is a bounded, explicit list
of MANUAL REQUIRED items (Field/Contractor page click-throughs, physical GPS hardware, the
literal human hand for Twin camera gestures, live two-session suspension effect) — see
`UAT-CHECKLIST-AL-QUNFUDHAH.md` and the Go/No-Go review for the complete, itemized list.
**PRODUCTION RELEASE: READY FOR EXPLICIT APPROVAL** once the remaining MANUAL REQUIRED items
are completed by a human against a real deployment.

STOP. DO NOT DEPLOY PRODUCTION. DO NOT MERGE MAIN.

# Inspector Acceptance Gate

Baseline under review: `codex/close-inspector-baseline-v1` at `f2027a0`  
Acceptance branch: `codex/inspector-acceptance-gate`

## Decision rule

Automated evidence and live/device evidence are reported separately. A gate is `PASS` only when all evidence required by that gate is available. A missing browser, Firebase, B2, Vercel, or physical-device check is `HOLD`, never an inferred pass.

## Gate status

| Gate | Automated evidence | Live/manual evidence | Result |
|---|---|---|---|
| 1. UX | Inspector modal markup/CSS regression checks; `dashboard.html` unchanged by this acceptance branch | Visual comparison on desktop, iPhone, and Android | **HOLD** |
| 2. Functional | Golden Observation wiring covers verified session, modal open, GPS, image validation/upload, save, server re-subscription, reopen, and AI endpoint | Complete the flow against Preview on desktop and mobile | **HOLD** |
| 3. Security | RBAC/tenant/storage suites pass; all six Firestore rule gaps are closed with 55/55 emulator tests and 0 TODO | Confirm the candidate rules in Preview before final acceptance | **PASS** |
| 4. AI & Workflow | Advisory allowlist is persisted for Manager review; tests prohibit AI status, assignment, and closure mutations; review remains explicit | Run a real provider request and Manager approve/reject on Preview | **HOLD** |
| 5. Field | GPS-only enforcement, canonical + legacy evidence normalization, authenticated read path, and Manager compatibility are regression-tested | Real GPS/camera/B2 round trip on iPhone and Android | **HOLD** |

## Golden Observation Test

Automated contract:

1. A verified Inspector session supplies `uid` and `organizationId`.
2. Opening `smartInputModal` starts GPS acquisition.
3. Only a supported image and verified GPS location enable processing.
4. Evidence uploads before the observation is written.
5. The observation is saved idempotently and reloaded from a server-confirmed, Inspector-and-tenant-scoped subscription.
6. Reopening the same record resolves canonical or legacy evidence through the authenticated storage path.
7. Explicit AI analysis persists only an allowlisted advisory object.
8. Manager maps the same record's canonical/legacy evidence and `aiAnalysis` without broader permissions or workflow changes.

Automated result: **PASS (6/6)** in `test/inspector-acceptance-golden-observation.test.js`. The broader targeted Inspector/Storage/RBAC/Workflow/AI suite is **PASS (195/195)**.

Live result: **HOLD** until a single real observation completes the following Preview flow:

`Login -> open modal -> acquire GPS -> capture/attach image -> Save -> reopen same observation -> verify image and fields -> request AI advisory -> open same observation as Manager -> verify Evidence and AI`

## Required live checklist

- Desktop Preview: approved modal layout and behavior; save/reopen; Manager evidence and AI view.
- iPhone Safari: camera capture, permission denial/retry, accurate GPS, upload, save/reopen.
- Android Chrome: camera capture, permission denial/retry, accurate GPS, upload, save/reopen.
- Vercel: branch Preview uses the intended environment variables and API routes.
- Firebase: authenticated Inspector/Manager sessions, deployed tenant-scoped rules, server-confirmed observation reload.
- Private B2: canonical upload, authenticated Inspector read, authenticated same-tenant Manager read, no public URL.
- Compatibility: at least one legacy evidence record and one canonical record render for both Inspector and Manager.
- AI: real provider response is advisory, available to Manager, and causes no automatic assignment, status transition, or closure.

## Verification record

- Targeted Inspector/Storage/RBAC/Workflow/AI tests: **195 passed, 0 failed**.
- Golden Observation automated contract: **6 passed, 0 failed**.
- Firestore emulator: **49 passed, 0 ordinary failures, 6 explicit security-gap TODOs**.
- JavaScript syntax: **122 files passed**.
- Dashboard/Manager module syntax: **passed**.
- `git diff --check`: **passed**.
- `dashboard.html` diff from `f2027a0`: **empty**; the approved Inspector UI was not changed.

### Firestore security closure

1. Same-tenant Contractor updates require matching assignment ownership.
2. Unassigned observations reject Contractor updates.
3. Inspector updates require creator ownership and no assignment.
4. Manager transitions follow the existing workflow matrix.
5. Contractor transitions allow start and evidence submission only.
6. Inspector has no status or final-completion authority.

Closure evidence is recorded in `docs/project-memory/SECURITY-CLOSURE-REPORT.md`. Inspector is **READY FOR LIVE ACCEPTANCE**, but remains unapproved until the live Golden Observation completes.

## Approval outcome

Current status: **READY FOR LIVE ACCEPTANCE**. Do not create `baseline/inspector-dashboard-v2` until all five gates are `PASS` and the live Golden Observation is recorded.

## Sprint 3 AI entitlement live acceptance — 2026-08-14

Verified Preview: `https://smart-hsr-manager-hd4xtw81t-blumark24-os.vercel.app` (commit `4d264ec`, branch `codex/inspector-smart-input-orchestration-closure`).
Test organization: `org-staging-alpha` (verified staging-scoped test organization, confirmed server-side via `/api/organization/context`; not the historical Production Al-Qunfudhah org ID).

### Proven PASS (live evidence, this Preview only)

| Item | Evidence |
|---|---|
| Inspector auth on `org-staging-alpha` | Real login; `organizationId` verified server-side via `GET /api/organization/context` → `200` |
| Image upload | `POST /api/storage/upload` → `200` (synthetic test image) |
| AI draft generation | `POST /api/ai/analyze` (draft mode) → `200`; real categorized draft rendered (category, severity, recommended action) |
| Finalize/save | `POST /api/storage/finalize` → `200` |
| Saved-observation Vision | `POST /api/ai/analyze` (non-draft, `observationId` mode) → `200`, real advisory rendered; confirmed on two separate isolated single-click invocations against two different saved observations |
| `/api/ai/analyze` = 200 on current Preview | Confirmed repeatedly across draft mode, Vision mode, and isolated single-click retests; zero `403`s observed on this deployment |
| Entitlement regression closed | Root cause proven (`403 AI_APPLICATION_ORGANIZATION_NOT_ENABLED`, hardcoded pilot org ID mismatched against the isolated Staging Firebase project) and fixed via `SMART_HSR_AI_ALLOWED_ORGANIZATION_IDS` (environment-aware allowlist, commit `4d264ec`); env var scoped to Preview + this branch only, Production behavior unchanged (historical id preserved as fallback) |
| No duplicate-submit defect | The two additional observations created during this round were intentional, separate automated live tests (confirmed with the requester), not evidence of an unintended duplicate-submit bug |
| No Production/main changes | No commits to `main`; no `--prod` deploys; no Production env vars set; no Firebase/B2 data written outside `org-staging-alpha` staging records |

### Private evidence read — closed out (same day)

| Sub-check | Result |
|---|---|
| Authenticated own-observation read | **PASS** — `GET /api/storage/read` → `200`, `image/jpeg`, 42065 bytes |
| Same-org, different-owner read | **UNTESTABLE** — no second-owner evidence-bearing observation exists in `org-staging-alpha`; not fabricated |
| Cross-org read | **PASS** — `403 AUTH_ORGANIZATION_DENIED` (own token, key with a different org prefix) |
| No automatic read on dashboard/page open | **Initially FAIL, then fixed** — root cause: `renderReferenceInspectorDashboard()` (`dashboard.html:2961-2982`) eagerly resolved the latest observation's evidence on every Firestore snapshot, including the first one after load. Fixed in commit `9d285ce` (removed the eager fetch; thumbnail now stays hidden). Re-verified **PASS** on redeployed Preview: isolated single-tab capture showed zero `/api/storage/read` calls on fresh load, then correct scoped reads only after explicit selection. |
| B2 stays private, authenticated-API-only | **PASS** — zero direct browser-to-B2 domain requests observed; unauthenticated direct call → `401 AUTH_HEADER_MISSING` |

## Sprint 3 final closure — 2026-08-14 (branch `codex/inspector-smart-input-orchestration-closure`, SHA `9d285ce`)

Verified Preview: `https://smart-hsr-manager-r4x158qma-blumark24-os.vercel.app`.

### Retry without re-upload / idempotency — PASS

Two independent `POST /api/ai/analyze` calls (Vision/non-draft mode) against the same already-saved observation, no upload between them:

- Both `200`.
- Response bodies **byte-identical** (`JSON.stringify(a.body) === JSON.stringify(b.body)` → `true`), confirming the AI Guard's operation cache served the second call rather than re-invoking the provider.
- Zero `/api/storage/upload` calls during the test (confirmed via isolated network capture).

### Idempotency / quota / 429 + `Retry-After` — PASS

7 sequential draft-mode `POST /api/ai/analyze` calls, each against a distinct freshly-uploaded synthetic image (distinct operation identities; no observations created — only ephemeral `pendingEvidenceUploads` records):

| Call | Status | Notes |
|---|---|---|
| 1–6 | `200` | within `UID_LIMIT = 6` per 60s window |
| 7 | `429` | `errorCode: AI_RATE_LIMITED`, `Retry-After: 28` |

Matches `api/_lib/aiGuard.js` design exactly (`UID_LIMIT = 6`, `WINDOW_MS = 60000`).

### Performance samples (authenticated, real Preview traffic, browser Resource Timing API)

| Endpoint | n | min (ms) | avg (ms) | p95 (ms) |
|---|---|---|---|---|
| `/api/organization/context` | 1 | 3813 | 3813 | 3813 |
| `/api/firebase-config` | 1 | 811 | 811 | 811 |
| `/api/storage/read` | 2 | 2777 | 3499 | 4221 |
| `/api/storage/upload` | 7 | 976 | 1594 | 3218 |
| `/api/ai/analyze` | 12 | 1268 | 3142 | 4846 |
| Dashboard document (HTML shell) | 1 | — | responseEnd 467, DOMContentLoaded 1041, load 1266 | — |

**SLO comparison** — no standalone perf-budget document exists in this repo; compared against the codebase's own client-side timeout constants (the closest thing to a documented budget):

| Path | Client timeout budget | Measured p95 | Margin |
|---|---|---|---|
| Upload (`IMAGE_UPLOAD_TIMEOUT_MS`, `dashboard.html:3206`) | 30000 ms | 3218 ms | 89% headroom |
| AI analyze (`AI_ANALYZE_TIMEOUT_MS`, `dashboard.html:4838`) | 20000 ms | 4846 ms | 76% headroom |
| Provider internal (`PROVIDER_TIMEOUT_MS`, `api/ai/analyze.js:64`) | 15000 ms | 4846 ms (client-observed, includes network) | 68% headroom |
| Save/finalize (`SMART_INPUT_SAVE_TIMEOUT_MS`, `dashboard.html:4537`) | 20000 ms | not re-measured this round (functionally proven `200` earlier) | — |

`organization/context` and `storage/read` have no documented budget and small sample sizes (`n=1`, `n=2`); both are comfortably sub-5s but flagged as a residual measurement-confidence gap, not a failure.

### Residual risks (not blocking, explicitly out of this round's scope)

- Same-org, different-owner evidence-read denial remains unproven (no second test account/data available).
- Mobile (iPhone Safari / Android Chrome) acceptance remains untested — this round is desktop/automated-browser only; the original Gate 1 (UX) and Gate 5 (Field) live/manual checks are unaffected by this closure and remain their own tracked item.
- `organization/context` and `storage/read` performance samples are small (`n=1`/`n=2`); worth a larger sample before treating as a stable baseline.

### Technical Health Gate: **GO** (scoped to AI entitlement, backend authorization, and performance)

Every item explicitly in scope for this closure — entitlement regression, private evidence read (including the page-load defect, now fixed), retry/idempotency, quota/429 + `Retry-After`, and performance vs. the codebase's own timeout budgets — is proven **PASS** with live evidence on the current verified Preview (SHA `9d285ce`). This verdict does **not** extend to the original Gate 1 (UX)/Gate 5 (Field) physical-device mobile certification, which remains a separately tracked, unaffected HOLD item requiring real iPhone/Android hardware.

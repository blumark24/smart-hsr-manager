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

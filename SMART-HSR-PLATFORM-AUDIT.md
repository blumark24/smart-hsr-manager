# Smart HSR Portable Municipal Intelligence Platform

## Phase 0 — Full Read-Only Architecture Audit

**Audit date:** 2026-08-06

**Repository:** `blumark24/smart-hsr-manager`

**Audited branch:** `codex/smart-hsr-rules-test-harness`

**HEAD:** `eb111e7 test(security): add Firestore authorization emulator harness`

**Baseline comparison:** `origin/codex/smart-hsr-phase1-audit`

**Audit mode:** read-only. No application, Firebase, rules, authentication, workflow, image, migration, dependency, cloud, or deployment change was made.

## 1. Executive conclusion

Smart HSR is a functioning municipal workflow prototype built as a static, browser-heavy application backed by Firebase Authentication and Firestore, with Vercel-style serverless endpoints and a private Backblaze B2 evidence path. Its strongest qualities are the fail-closed role checks on primary screens, organization-scoped core queries, server-derived tenant identity for uploads, private/proxied evidence retrieval, and an existing emulator authorization suite.

It is not yet a portable municipal intelligence platform. Provider calls and security decisions remain distributed across very large HTML files, Firebase configuration is duplicated, workflow transitions are not represented by one authoritative state machine, the storage abstraction is only partial, and all AI presentation is currently simulated or deterministic. The committed characterization suite proves six authorization gaps, while this audit identifies a separate `presence` isolation concern.

**Recommended decision:** GO for Phase 1 contracts and characterization only. NO-GO for real AI, storage migration, government production pilot, or provider replacement until the six rules gaps, presence isolation, transition contract, and evidence lifecycle ownership are explicitly resolved and regression-tested.

## 2. Workspace safety evidence

| Item | Observed state |
|---|---|
| Current branch | `codex/smart-hsr-rules-test-harness` |
| HEAD | `eb111e7` |
| Tracked modifications before audit document | none |
| Untracked files before audit document | none reported by `git status --short` |
| Divergence from `origin/codex/smart-hsr-phase1-audit` | 0 behind, 1 ahead |
| Current branch upstream | no upstream branch established in the inspected state |
| Permitted audit output | this untracked document only |

The one commit ahead is the local Firestore emulator authorization harness. The audit did not clean, reset, switch, commit, push, merge, or deploy.

Files future implementation must preserve until covered by replacement tests:

- `firestore.rules` and `test/firestore.rules.test.js`: current authorization contract and characterization evidence.
- `dashboard.html`, `manager.html`, `mobile-map.html`: current inspector, manager/supervisor, and contractor workflows.
- `storage-adapter.js`, `api/storage/upload.js`, `api/storage/read.js`: evidence reference compatibility and private retrieval behavior.
- `api/_lib/authz.js`, `api/_lib/firebaseAdmin.js`, `api/admin/users.js`: identity/RBAC and account-management boundary.
- `spatial-map.js`, `api/organization/context.js`: tenant-verified spatial context.
- Existing observation field names, especially `organizationId`, `createdByUid`, `assignedContractorUid`, `imagePath`, `afterImagePath`, `imageObjectKey`, status timestamps, and resolution fields.

## 3. Current architecture

### 3.1 Frontend

The product is a multi-page static application with extensive inline CSS and JavaScript:

- Inspector dashboard: `dashboard.html` (Firebase module entry at lines 2773–2805; auth/tenant gate 2812–3020; observation query/write path 3353–3470; creation and smart input 4169–4520; dummy AI 4591–4627).
- Manager/supervisor command center: `manager.html` (Firebase setup 625–674; operational writes 1085–1151; scoped subscriptions 1339–1370; presence/auth/boot 1688–1851; deletion 1868–1892; deterministic insights 1895–2057).
- Contractor mobile surface: `mobile-map.html` (Firebase setup 704–723; workflow vocabulary 749–750; scoped assignment query 1097–1103; evidence/workflow commit 1450–1760; auth/role gate 1989–2049).
- Owner administration: `owner.html` (Firebase setup 319–335; direct organization and invoice CRUD 389–629; local connector UI 643–687; owner gate 705–724; admin API calls 764–862).
- Login routing: `login.html` lines 130–216 and `manager-login.html` lines 78–137.

Firebase Web SDK versions are inconsistent: 10.4.0 in `dashboard.html:2775–2788`, 10.12.0 in manager/contractor surfaces (`manager.html:627–637`, `mobile-map.html:704–710`), 11.x in login pages, and 12.4.0 in `owner.html:319–320`. This increases upgrade, behavior, and caching risk.

### 3.2 Identity and authentication

- Firebase Authentication is the identity provider.
- Browser pages resolve roles by reading `owners/{uid}`, `managers/{uid}`, or `users/{uid}`. Manager records are intentionally authoritative over legacy user records (`dashboard.html:2845–2879`, `manager.html:1740–1762`).
- Inspector access requires an active `users/{uid}` record with role `inspector` and a non-empty organization (`dashboard.html:2825–2837`).
- Manager/supervisor access fails closed (`manager.html:1742–1762`, 1796–1810).
- Contractor access is resolved from the signed-in user's own user record (`mobile-map.html:1989–2049`).
- Server APIs require a bearer Firebase ID token and use revoked-token checking (`api/_lib/authz.js:40–56`).
- Admin identity bootstrap uses environment credentials outside emulator mode (`api/_lib/firebaseAdmin.js:21–55`). It defaults the project ID to `smart-hsr-manager` at line 28, which is provider/environment coupling and a deployment-safety concern if environment setup is wrong.

### 3.3 Database

Firestore is accessed directly from browsers for observations, presence, organizations, and invoices. Firebase Admin is used by server APIs for role resolution, user administration, map context, and evidence authorization.

Principal collections observed:

- `owners`, `managers`, `users`: identity metadata and role resolution.
- `organizations`: municipal tenant configuration and map context.
- `observations`: operational cases, coordinates, assignment, status, evidence references, and resolution data.
- `presence`: manager location/presence.
- `invoices`: owner billing records.

There is no repository-level Database Adapter. Query shape, field naming, server timestamps, and status writes are embedded in pages and APIs.

### 3.4 Storage and evidence

There are three coexistence modes:

1. **Private B2 objects:** browser uploads through `/api/storage/upload`; objects are read through authenticated `/api/storage/read`. The bucket produces no public URL (`api/storage/upload.js:1–20`).
2. **Local demo:** IndexedDB database `smart-hsr-institutional-storage`, with organization-scoped blob assets and `local-demo://<organizationId>/<assetId>` references (`storage-adapter.js:1–31`, 61–75, 165–193).
3. **Legacy compatibility:** direct `https://` URLs and `data:image` values are accepted and rendered (`storage-adapter.js:195–220`). These may be public/external or embedded and bypass the private proxy security model.

`storage-adapter.js` is an evidence-reference facade, not a complete portable provider adapter. Non-local connector types are modeled but deliberately inactive (`storage-adapter.js:121–163`, 259–266). Owner connector settings are stored only in the current browser's IndexedDB (`owner.html:643–687`), not in a server-side institutional configuration store.

### 3.5 Maps

- Leaflet with OpenStreetMap attribution is the active map stack.
- Shared marker, coordinate validation, and tenant map-context functions are in `spatial-map.js:1–79`.
- `/api/organization/context` derives the caller's role, rejects cross-organization requests, and returns sanitized map settings (`api/organization/context.js:39–92`).
- A hard-coded Al Qunfudhah fallback organization ID and center exist (`api/organization/context.js:5–7`, 59–64), reducing portability.
- `spatial-map.js:81–254` also installs manager-specific UI and monkey-patches Leaflet behavior. That is unrelated responsibility and a portability/testing hazard.

### 3.6 Workflow

Observed canonical values are:

- `PENDING`
- `IN_PROGRESS`
- `PENDING_REVIEW`
- `COMPLETED`

The shared map recognizes all four (`spatial-map.js:1–6`). The contractor path explicitly uses `PENDING → IN_PROGRESS → PENDING_REVIEW` (`mobile-map.html:749–750`). Firestore supervisor rules recognize review rejection `PENDING_REVIEW → IN_PROGRESS` (`firestore.rules:118–136`).

The frontend vocabulary is inconsistent:

- Inspector `statusMap` omits `PENDING_REVIEW` (`dashboard.html:3079–3083`).
- Manager status labels omit or do not consistently treat review as a primary board state (`manager.html:682` and workflow rendering around 1060–1160).
- Manager `cycleStatus` uses `PENDING → IN_PROGRESS → COMPLETED → PENDING` (`manager.html:1085–1094`), allowing a backward reopen cycle in UI logic.
- Manager `closeTicket` writes `COMPLETED` directly (`manager.html:1096–1105`).
- Contractor evidence submission performs the field/status update in `mobile-map.html:1703–1755`.
- Inspector creation and completion writes are in `dashboard.html:4260–4295` and `dashboard.html:4492–4520`.

There is no single transition service. The security rules constrain supervisor transitions but allow broad manager, inspector, and contractor status changes (`firestore.rules:107–153`).

### 3.7 Deployment and operations

- The `api/` layout and source comments identify Vercel serverless operation; B2 variable names are expected in the Vercel environment (`api/storage/upload.js:39–40`).
- Firebase hosts identity and database. Backblaze B2 is the private evidence provider. Leaflet/OSM and several CDN-hosted browser libraries are runtime dependencies.
- No centralized observability provider, durable notification provider, event bus, or audit-log service was found.
- User feedback is primarily toasts, alerts, console errors, and UI notification placeholders.

## 4. Organization isolation trace

### 4.1 Authentication to tenant context

1. Firebase Auth produces the current `uid`.
2. Each role surface reads the caller's own role document.
3. `organizationId` is copied to an in-memory context, not accepted from inspector/contractor form input (`dashboard.html:2812–2837`; analogous manager/contractor guards).
4. Core queries add tenant filters:
   - Inspector: `organizationId` and `createdByUid` (`dashboard.html:3369–3374`).
   - Manager: organization-scoped users and observations (`manager.html:1339–1359`).
   - Contractor: organization plus `assignedContractorUid` (`mobile-map.html:1097–1103`).
5. Map points are rejected if observation tenant differs from the verified tenant (`spatial-map.js:63–69`).
6. Upload organization is derived server-side from the caller's `users/{uid}` document, never the request (`api/storage/upload.js:1–16`, 126–140).
7. Evidence object keys embed the verified organization under `observations/<organizationId>/<scope>/...` (`api/storage/upload.js:105–123`).
8. Private reads require an authenticated role and verify that the requested key is attached to an observation in that organization (`api/storage/read.js`, object authorization around lines 86–118).

### 4.2 Confirmed strengths

- Core dashboards do not rely on URL/local storage for tenant selection.
- Firestore observation reads require same-organization membership (`firestore.rules:89–104`).
- Manager Admin API actions are constrained to the manager's own organization (`api/_lib/authz.js:79–103`; `api/admin/users.js:141–178`, 210–267).
- Non-owner map context rejects a requested organization different from the caller (`api/organization/context.js:80–88`).
- Private object reads are mediated by an authenticated proxy and are not permanent public URLs.

### 4.3 Risks and unscoped behavior

**P0 — same-tenant authorization is too broad.** The committed emulator suite documents six unresolved cases as TODO, not as allowed behavior:

1. A non-assigned same-organization contractor can update a report.
2. A contractor can update an unassigned report.
3. An inspector can update another inspector's report.
4. A manager can write an unknown status.
5. A contractor can perform a backward transition.
6. An inspector can write an unknown status.

Root cause: contractor and inspector update rules check role, organization, and allowed fields but not assignment/ownership or legal transition (`firestore.rules:138–153`). Manager updates do not validate an enum/transition (`firestore.rules:107–116`). Evidence: `test/firestore.rules.test.js` contains the characterization scenarios and the harness reports 55 total, 49 passing, 6 todo, 0 failing.

**P0 — presence isolation concern.** `presence` permits any active manager to read (`firestore.rules:158–162`) without checking `resource.data.organizationId`. UI queries filter by organization, but direct document access can be cross-tenant if an identifier is known. Manager writes require the email document ID to equal the token email, but do not require the written `organizationId` to equal the manager record's organization. Firestore rules, not UI query shape, must be the security boundary.

**P1 — owner operations are intentionally global.** `owner.html` performs unscoped organization/invoice reads as a platform owner. This is expected authority, but owner compromise has platform-wide impact and needs immutable audit events and stronger step-up controls.

**P1 — legacy evidence references weaken tenant assurance.** A legacy HTTPS URL or base64 value is rendered without proving its tenant origin (`storage-adapter.js:195–220`). It does not grant Firestore access, but can cause privacy, retention, availability, and tracking leakage.

## 5. Evidence lifecycle audit

### 5.1 Before image

- Inspector selects a JPEG/PNG/WebP.
- Browser validates the type, resizes to at most 1024px, encodes to WebP, and enforces 700KB (`dashboard.html:3088–3134`).
- `uploadObservationImage` checks the verified context and either calls the server upload or stores an organization-scoped local demo Blob (`storage-adapter.js:165–193`).
- The observation stores an opaque reference in existing image fields during creation (`dashboard.html:4260–4295`).

### 5.2 After image

- Contractor selects/captures after evidence in the mobile workflow.
- The same adapter/upload path is used with `scope: after`; the observation receives `afterImagePath`, resolution data, and a status update (`mobile-map.html:1450–1760`).
- Inspector also has a completion UI/write path (`dashboard.html:4492–4520`), which is a workflow-ownership ambiguity requiring an explicit product decision.

### 5.3 Server validation and upload

- `/api/storage/upload` accepts JSON base64, enforces a pre-decode size ceiling, MIME allowlist, magic bytes, structural image validation, and before/after scope (`api/storage/upload.js:27–84`).
- It reads the inspector context server-side and builds a normalized organization-keyed B2 object key (`api/storage/upload.js:105–140`).
- B2 credentials remain server environment variables. The upload endpoint returns only `{ ok, objectKey }`.
- Provider coupling is high inside this endpoint: AWS S3 client construction and B2 environment interpretation are embedded in the handler rather than a provider module (configuration/client code later in `api/storage/upload.js`, beginning around lines 163–174).

### 5.4 Resolution and rendering

- Local demo references resolve to an IndexedDB Blob and temporary object URL (`storage-adapter.js:195–206`).
- Private server keys resolve by bearer-authenticated `/api/storage/read` and a Blob object URL (`storage-adapter.js:90–119`, 207–216).
- Generated object URLs are tracked and revoked on cleanup/page exit (`storage-adapter.js:223–233`; `dashboard.html:3023–3042`).
- Manager before/after rendering uses the same resolver (`manager.html:1959–2026`).

### 5.5 Deletion and failures

- Local demo assets can be deleted or cleared by owner context only (`storage-adapter.js:235–257`).
- Manager observation deletion deletes only the Firestore document (`manager.html:1868–1892`). No corresponding private B2 delete/retention workflow was found. This creates orphan evidence and government retention/compliance ambiguity.
- No server-side evidence delete endpoint or provider-neutral retention/tombstone contract was found.
- Upload and Firestore writes are not one transaction. The contractor UI distinguishes upload and Firestore failures and supports retry states (`mobile-map.html:1417`, 1728–1755), but an uploaded object can still become orphaned if the record write fails.
- Rendering failures are surfaced as unavailable evidence; console/toast handling exists, but there is no central incident telemetry.

## 6. Workflow integrity

### 6.1 Intended state model inferred from code

| Actor | Intended transition | Evidence |
|---|---|---|
| Inspector | create → `PENDING` | `dashboard.html:4260–4295` |
| Manager | assign while pending / move into work | `manager.html:1124–1151` |
| Contractor | `PENDING → IN_PROGRESS` | `mobile-map.html:749–750`, update path 1703–1755 |
| Contractor | `IN_PROGRESS → PENDING_REVIEW` with after evidence | same locations |
| Supervisor | `PENDING_REVIEW → IN_PROGRESS` rejection | `firestore.rules:118–136` |
| Manager/supervisor | review/close → `COMPLETED` | manager write functions 1085–1105 |

### 6.2 Integrity findings

- The state list is not centrally defined and UI maps disagree.
- `cycleStatus` is not a legal-state-machine implementation; it permits completion without review and reopens completed work to pending.
- Rules protect allowed field sets but do not validate a complete transition matrix for manager, inspector, or contractor.
- Assignment and ownership are not enforced for same-tenant contractor/inspector updates.
- Evidence requirements for `PENDING_REVIEW`/`COMPLETED` are not enforced at the database boundary.
- There is no immutable workflow event ledger; timestamps/fields on a mutable observation are the current history source.

The following must remain protected during adapter work: creation ownership, tenant immutability, assignment identity, allowed status enum, transition actor/capability, before/after evidence immutability and provenance, resolution note, audit timestamps, and manager-only deletion. No provider adapter should contain or bypass workflow policy.

## 7. AI placeholder audit

No external AI API, model SDK, Gemini request, prompt service, model credential, or real inference result was found.

Presentation-only elements include:

- Inspector future-AI disclosure explicitly states there are no Gemini calls (`dashboard.html:2054`).
- Buttons and labels advertise AI insights, action plans, Gemini tools, and executive reports (`dashboard.html:2193`, 2228, 2263–2286, 2338–2351, 2432).
- Dummy AI handlers use fixed delayed results under `AI BUTTONS (DUMMY)` (`dashboard.html:4591–4627`).
- Manager report output is explicitly an AI demo with a fixed executive summary (`manager.html:1153–1158`).
- Manager “AI” recommendations are deterministic rules based on status, age, proximity, and evidence presence (`manager.html:1895–1957`), then rendered into the AI panel (`manager.html:2043–2048`).
- Contractor AI card is hidden and says AI-ready (`mobile-map.html:545`).

Safest AI Gateway boundary: a server-only application service that accepts an authenticated, tenant-authorized case/evidence reference and a named task, retrieves private evidence internally through the Storage Adapter, calls a provider, validates a versioned structured response, records model/version/confidence/provenance, and returns advisory output. It must never receive a client-selected organization, expose storage URLs, write workflow status, or auto-execute an operational decision. Human review must remain mandatory.

## 8. Provider coupling map

| Category | Current provider | Direct call sites | Severity | Recommended boundary |
|---|---|---|---|---|
| Identity | Firebase Auth + Firestore role docs | all login/pages; `api/_lib/authz.js`; `api/_lib/firebaseAdmin.js` | High | `IdentityAdapter` at browser session facade and server principal/capability resolver |
| Database | Cloud Firestore | all three operational HTML pages, owner page, APIs, rules | Critical | tenant-bound `DatabaseAdapter` plus a separate workflow policy/service |
| Storage | Backblaze B2 via AWS S3 SDK; IndexedDB demo; legacy URL/base64 | `storage-adapter.js`; `api/storage/upload.js`; `api/storage/read.js` | High | server-side `StorageAdapter`; opaque `EvidenceRef`; compatibility resolver |
| AI | None; fixed/deterministic UI only | dashboard dummy handlers; manager deterministic recommendations | None currently / high future risk | server-only `AIProvider` behind auditable AI Gateway |
| Maps | Leaflet + OpenStreetMap + browser geolocation | three surfaces; `spatial-map.js`; `api/organization/context.js` | Medium | `MapsAdapter` for renderer/geocoder/navigation; keep tenant spatial policy outside provider |
| Notifications | Alerts, toasts, UI placeholder | page-local handlers and notification panels | Medium | event-driven `NotificationAdapter` with template, channel, consent, and dedupe |
| Observability | console/UI only | distributed `console.error`, toast, alert | High | `ObservabilityAdapter` with redaction, correlation IDs, security audit events, metrics/traces |

## 9. Proposed adapter contracts — design only

### 9.1 StorageAdapter

**Responsibilities:** store, retrieve, verify metadata, delete/tombstone, and health-check private evidence without exposing provider URLs.

**Methods:**

- `putEvidence(principal, input) -> EvidenceRef`
- `getEvidence(principal, ref) -> EvidenceStream`
- `headEvidence(principal, ref) -> EvidenceMetadata`
- `deleteEvidence(principal, ref, retentionDecision) -> DeleteReceipt`
- `healthCheck() -> ProviderHealth`

**Shapes:** input `{ observationId, scope: 'before'|'after', contentType, bytes, checksum }`; reference `{ id, provider, tenantId, objectKey, checksum, createdAt, schemaVersion }`; output stream never includes a permanent public URL.

**Security:** tenant comes from the verified principal and observation, checksums and MIME/container validation mandatory, encryption and retention policy explicit, access audited, deletion idempotent. **Migration risk:** high because three reference formats coexist and orphan handling is undefined.

### 9.2 AIProvider

**Responsibilities:** model invocation only; no authorization, storage URL exposure, or workflow mutation.

**Methods:** `analyzeImage(input)`, `compareEvidence(input)`, `classifyPriority(input)`, `healthCheck()`.

**Shapes:** `{ taskId, tenantPolicy, evidenceBytes|internalRef, locale, rubric, schemaVersion }` → `{ result, confidence, warnings, provider, model, modelVersion, promptVersion, latencyMs, usage, traceId }`.

**Security:** server-only credentials, data residency/retention policy, tenant-specific enablement, redaction, prompt-injection controls, human approval. **Migration risk:** high due government data governance and model-output variability.

### 9.3 IdentityAdapter

**Responsibilities:** session verification, principal resolution, capabilities, token revocation, step-up authentication.

**Methods:** `verifySession(token)`, `resolvePrincipal(uid)`, `requireCapability(principal, capability, resource)`, `revokeSessions(uid)`, `requireRecentAuth(principal)`.

**Shape:** `{ uid, tenantId|null, role, capabilities, active, authTime, issuer }`.

**Security:** fail closed, manager record precedence explicit, no client role trust, revocation checked. **Migration risk:** high because Firestore rules and direct browser access depend on Firebase identity semantics.

### 9.4 DatabaseAdapter

**Responsibilities:** tenant-scoped repositories, transactional record changes, queries, audit events; workflow policy remains a separate domain service.

**Methods:** `getObservation(ctx,id)`, `listObservations(ctx,filter)`, `createObservation(ctx,input)`, `applyObservationPatch(ctx,id,patch,precondition)`, `appendWorkflowEvent(ctx,event)`, `listAssignableUsers(ctx,role)`.

**Shapes:** context always includes verified `{ principal, tenantId, correlationId }`; records are versioned DTOs.

**Security:** tenant is implicit/immutable, field allowlists, optimistic concurrency, audit event per mutation. **Migration risk:** critical because current pages call Firestore directly and depend on realtime listeners.

### 9.5 NotificationAdapter

**Responsibilities:** dispatch workflow events to approved channels, templates, delivery tracking, preferences, deduplication.

**Methods:** `send(ctx,message)`, `sendTemplate(ctx,templateId,data)`, `getDeliveryStatus(ctx,id)`.

**Shape:** `{ tenantId, recipients, eventType, locale, channels, templateData, dedupeKey }` → `{ notificationId, channelReceipts }`.

**Security:** recipient authorization, minimal personal data, tenant templates, opt-out/legal policy, no evidence attachments by public URL. **Migration risk:** medium.

### 9.6 MapsAdapter

**Responsibilities:** map creation, markers, bounds, navigation/geocoding abstraction, attribution; not tenant authorization.

**Methods:** `createMap(element,options)`, `renderMarkers(map,features)`, `fitBounds(map,bounds)`, `openNavigation(point)`, `geocode(query,policy)`, `destroy(map)`.

**Shapes:** GeoJSON-like features with opaque case IDs and sanitized labels.

**Security:** only verified-tenant coordinates, location minimization, attribution preserved, no silent third-party leakage. **Migration risk:** medium, especially for geocoding/navigation and offline government maps.

### 9.7 ObservabilityAdapter

**Responsibilities:** structured logs, metrics, traces, immutable security/audit events, alert integration.

**Methods:** `log(level,event,context)`, `metric(name,value,tags)`, `trace(name,fn,context)`, `auditSecurityEvent(event)`, `captureException(error,context)`.

**Shapes:** mandatory `{ correlationId, tenantId?, actorId?, eventName, timestamp }`, with evidence bytes/tokens/credentials prohibited.

**Security:** redaction by default, tenant-aware access, retention/residency rules, tamper-evident audit channel. **Migration risk:** low-to-medium; high operational ROI.

## 10. Implementation roadmap

### Phase 1 — Platform contracts

- **Scope:** document/version DTOs and adapter interfaces; extract pure status transition matrix and capability vocabulary; add contract tests without switching providers.
- **Expected files:** new `platform/contracts/*`, pure workflow policy module, contract tests, architecture decision records; minimal import shims only after approval.
- **Protected:** all current pages, `firestore.rules`, Firebase config, production APIs and evidence fields until parity tests exist.
- **Test gates:** existing 55 rules tests remain 49 pass/6 explicit todo/0 fail; pure transition matrix tests; no runtime/provider calls; syntax and diff checks.
- **Rollback:** remove new isolated modules/import shim; no data rollback.
- **GO:** contracts are provider-neutral, tenant context mandatory, zero behavior change. **NO-GO:** interface accepts client-selected tenant or mixes workflow policy with provider logic.

### Phase 2 — Evidence storage foundation

- **Scope:** move B2 client code behind server Storage Adapter; define opaque reference/version, integrity metadata, orphan reconciliation, retention/delete/tombstone design; preserve legacy resolver.
- **Expected files:** `api/_lib/storage/*`, upload/read handlers, adapter unit/integration tests, evidence operations documentation.
- **Protected:** observation field compatibility, private proxy, 700KB and image validation, existing objects/images, Firestore rules.
- **Test gates:** cross-tenant denial, upload/read parity, magic/structural validation, no public URL, failure/orphan tests, no real cloud in CI.
- **Rollback:** route handlers select current B2 implementation; no object migration.
- **GO:** byte/reference parity and private access proven. **NO-GO:** migration or delete touches existing objects without inventory/recovery plan.

### Phase 3 — AI Gateway

- **Scope:** server-only gateway, provider interface, schemas, policy flags, mock provider, audit metadata; no real model initially.
- **Expected files:** `api/ai/*`, `platform/ai/*`, schema/contract tests, policy docs.
- **Protected:** workflow writes, evidence privacy, AI UI claims, Firebase credentials.
- **Test gates:** auth/tenant tests, mock-only deterministic tests, schema validation, prompt-injection/redaction tests, no external API in CI.
- **Rollback:** disable tenant feature flag/remove gateway route.
- **GO:** human-reviewed advisory output only. **NO-GO:** model can change status/assignment or receive public evidence URLs.

### Phase 4 — Image analysis

- **Scope:** controlled pilot for defect classification/quality signals on one image with confidence and reviewer decision.
- **Expected files:** AI task schema/provider implementation, review UI, audit record repository, evaluation dataset tooling.
- **Protected:** raw evidence, original labels, status/assignment.
- **Test gates:** approved de-identified evaluation set, accuracy/calibration thresholds, residency/retention approval, reviewer override.
- **Rollback:** disable task flag; retain audit record, discard provider-derived view.
- **GO:** procurement/security/data governance approved. **NO-GO:** insufficient evaluation or unapproved data transfer.

### Phase 5 — Before/after verification

- **Scope:** compare evidence pair, detect mismatch/change, surface confidence and reasons; never auto-close.
- **Expected files:** comparison task, pair provenance checks, manager review UI, evaluation tests.
- **Protected:** completion authority, original images, timestamps, contractor submission.
- **Test gates:** same-observation/same-tenant pairing, manipulation/error cases, false-positive threshold, human confirmation.
- **Rollback:** hide comparison result and disable task flag.
- **GO:** provenance and reviewer flow complete. **NO-GO:** comparison result can complete a case.

### Phase 6 — Priority/SLA intelligence

- **Scope:** versioned recommendation policy combining deterministic SLA rules and optional AI explanation.
- **Expected files:** priority policy service, SLA configuration, explainability UI, simulations/tests.
- **Protected:** official priority, legal SLA, assignment and status.
- **Test gates:** historical replay, bias/tenant-policy checks, deterministic fallback, performance thresholds.
- **Rollback:** return to current deterministic recommendations.
- **GO:** municipality approves rubric. **NO-GO:** model output overrides policy or lacks explanation/version.

### Phase 7 — Smart digital twin

- **Scope:** read model for spatial/temporal case aggregation, layer contracts, performance-safe map visualization.
- **Expected files:** read-model API, spatial DTOs/cache, map adapter implementation, UI layer modules.
- **Protected:** transactional observations, OSM attribution, tenant filtering, exact sensitive locations.
- **Test gates:** tenant isolation, aggregation accuracy, load/performance, privacy zoom/generalization, stale-data indicators.
- **Rollback:** disable twin read model/layers; existing maps remain.
- **GO:** read-only derived model. **NO-GO:** twin becomes system of record or leaks cross-tenant coordinates.

### Phase 8 — Contractor intelligence

- **Scope:** workload/SLA/quality analytics from approved events, not opaque personnel scoring.
- **Expected files:** contractor metrics read model, policy definitions, manager dashboards, fairness/audit tests.
- **Protected:** identity, employment decisions, assignment authority, raw evidence.
- **Test gates:** metric definitions, sample-size safeguards, appeal/explanation, tenant access, fairness/privacy review.
- **Rollback:** disable derived scorecards and retain raw operational workflow.
- **GO:** governance approves intended use. **NO-GO:** automated punitive decision or unverifiable score.

### Phase 9 — Executive command center

- **Scope:** audited cross-module KPIs, drill-down, data freshness, incident/quality/SLA views; cross-tenant only for explicitly authorized platform owners.
- **Expected files:** executive aggregation APIs, KPI contracts, command UI modules, export/audit controls.
- **Protected:** tenant boundaries, operational write paths, personal/evidence data.
- **Test gates:** KPI reconciliation, role/tenant tests, freshness and partial-failure display, export authorization, load testing.
- **Rollback:** disable new command route; retain manager dashboard.
- **GO:** all preceding security/data gates and pilot acceptance pass. **NO-GO:** aggregate values cannot reconcile or drill-down crosses tenant authority.

## 11. Priority, risk, and ROI

| Priority | Action | Risk reduced | ROI |
|---|---|---|---|
| P0 | Formalize transition enum/matrix and close six rules TODO gaps | unauthorized same-tenant mutation and invalid workflow states | Very high: protects every future adapter and AI feature |
| P0 | Fix/test `presence` tenant binding | cross-tenant staff location exposure/spoofed org presence | Very high: privacy and government trust |
| P0 | Establish Phase 1 contracts without runtime change | provider lock-in and unsafe refactor | High: makes later work reversible |
| P1 | Extract B2 access into server Storage Adapter; define orphan/retention lifecycle | provider coupling, orphan objects, deletion ambiguity | High: enables municipal/private storage portability |
| P1 | Add structured audit/observability facade | invisible security/operational failures | High: faster support and pilot accountability |
| P1 | Consolidate shared Firebase config/SDK version behind approved bootstrap | drift and inconsistent behavior | Medium-high |
| P1 | Split manager-specific behavior out of `spatial-map.js` | side effects and weak module boundaries | Medium |
| P2 | Add notification adapter and event model | manual follow-up and delivery uncertainty | Medium |
| P2 | Introduce mock AI Gateway, then governed provider pilot | marketing/demo gap to measurable intelligence | High later, but unsafe before P0/P1 |
| P2 | Decompose large HTML files incrementally | maintenance velocity and testability | Medium, realized over multiple phases |

## 12. Final scoring

| Dimension | Score / 10 | Rationale |
|---|---:|---|
| Architecture | 5.5 | Functional hybrid stack, but monolithic pages and distributed policy |
| Tenant isolation | 6.0 | Core queries/uploads scoped; presence and same-tenant authorization gaps remain |
| Auth/RBAC | 7.0 | Fail-closed role gates and revoked-token server checks; duplicated role resolution |
| Workflow integrity | 4.5 | Known statuses exist, but no authoritative state machine and broad update rules |
| Evidence security | 7.0 | Private proxy and strong upload validation; legacy URLs, orphan/delete gaps |
| Provider portability | 3.5 | partial evidence facade only; Firebase/B2/Leaflet calls remain direct |
| AI readiness | 3.0 | good conceptual UI boundary, but no gateway, governance, evaluation, or real AI |
| Deployment safety | 5.0 | emulator harness and server credentials separation; default production ID and limited observability |
| Government pilot readiness | 5.0 | credible demo/pilot base; audit, retention, privacy, and workflow gaps block controlled production use |
| Production readiness | 4.0 | security characterization is valuable, but six TODO gaps and operational lifecycle weaknesses remain |

**Overall assessment:** 5.1/10. The platform is ready for a controlled engineering hardening program, not for production municipal intelligence deployment.

## 13. Recommended first implementation phase

Start with **Phase 1 — Platform contracts**, but make its first deliverable a pure, provider-independent `ObservationWorkflowPolicy` specification and test matrix that mirrors current actors/statuses without changing production behavior. In parallel within the same phase, convert each of the six authorization TODO cases and the `presence` concerns into explicit desired-policy tests after municipal product approval. Only then should `firestore.rules` be changed in a separately reviewed security task.

This order has the highest ROI because every storage, AI, notification, map, and database adapter will otherwise inherit ambiguous authorization and transition semantics.

## 14. Audit checks and limitations

Checks performed:

- Read-only Git branch, HEAD, status, tracked/untracked, and baseline divergence inspection.
- Repository file inventory and targeted code search for organization, role, query, write, status, evidence, AI, map, notification, and provider call sites.
- Line-addressed inspection of primary HTML surfaces, shared modules, Firestore rules, server APIs, package/config metadata, documentation, and tests.
- Review of the committed Firestore Emulator characterization suite and its documented 55/49/6/0 result.
- Local JavaScript syntax checks and final workspace/diff validation are recorded in the completion handoff after the document is created.

Limitations:

- No Firebase Production, B2, Vercel, external map service, or AI provider was contacted.
- No live credentials, production data, cloud configuration, billing console, runtime logs, or deployed headers were inspected.
- The report assesses repository architecture and policy as code; it does not certify infrastructure settings or regulatory compliance.

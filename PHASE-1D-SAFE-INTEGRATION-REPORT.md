# Smart HSR Phase 1D — Safe Assignment Integration Report

Date: 2026-08-06

Branch: `codex/smart-hsr-rules-test-harness`

Base commit: `eb111e7`

Status: local only; no commit, push, deploy, migration, or Production connection

## Executive decision

Phase 1D provides a provider-neutral, transaction-backed Assignment V2 service and integration gateway. `PLATFORM_ASSIGNMENT_V2` is disabled by default. No existing UI or application write path imports the gateway, so current Production behavior is unchanged.

**GO** for a controlled staging Preview implementation review.

**NO-GO** for Production enablement or candidate-rule deployment until real application write paths are connected in Preview and legacy data compatibility is measured.

## Files created

| File | Purpose |
|---|---|
| `platform/config/feature-flags.js` | Local deterministic feature flag contract; V2 defaults to `false` |
| `platform/assignments/canonical-assignment-write-service.js` | Canonical create, replace, end, and resolve operations with authorization gates |
| `platform/assignments/firestore-assignment-store.js` | Firestore transaction adapter injected into the provider-neutral service |
| `platform/assignments/legacy-assignment-bridge.js` | Read-only canonical/legacy/ambiguous/invalid classifier |
| `platform/integration/assignment-v2-gateway.js` | Dual-mode wrappers for assignment and workflow actions |
| `platform/audit/assignment-audit-events.js` | Non-persisted audit payload generation |
| `test/phase1d-safe-integration.test.js` | Deterministic unit and dual-mode tests |
| `test/phase1d-firestore-integration.test.js` | Emulator integration tests against the Phase 1C candidate rules |
| `test/run-phase1d-emulator.js` | Demo-only local emulator runner |

No protected file was changed. Production `firestore.rules`, Firebase configuration, Auth, HTML, storage, and maps are unchanged.

## Feature flag behavior

- Flag: `PLATFORM_ASSIGNMENT_V2`.
- Default: disabled.
- Source: local process memory only; no Remote Config and no network dependency.
- Test override: `createFeatureFlags({ PLATFORM_ASSIGNMENT_V2: true })`.
- Disabled path: gateway delegates directly to the injected existing legacy handler.
- Enabled path: gateway applies legacy classification and authorization before returning or executing a V2 operation.
- Rollback: set/remove the local override so the flag resolves to `false`. No data deletion or code rollback is required for routing.

The flag has not been imported by any Production page or write function and therefore cannot activate accidentally in the current application.

## Canonical assignment transaction model

### `createAssignment()`

1. Calls `AuthorizationDecisionService.canAssignObservation()`.
2. Transaction reads the observation.
3. Denies missing, cross-organization, or already assigned observations.
4. Creates ACTIVE assignment version 1.
5. Updates the observation's canonical pointer and preserved legacy display fields in the same transaction.

### `replaceAssignment()`

1. Calls the assignment authorization gate.
2. Transaction reads the observation and referenced current assignment.
3. Verifies current pointer, organization, observation, ACTIVE status, and version.
4. Marks the prior record `REPLACED`, sets `replacedByAssignmentId`, `endedAt`, and `updatedAt`.
5. Creates the replacement as ACTIVE with `version + 1`.
6. Moves the observation pointer in the same transaction.

This leaves at most one ACTIVE assignment when all writes use the service and candidate rules.

### `endAssignment()`

Marks the current record `INACTIVE`, sets `endedAt`, and removes the observation's current pointer atomically. It does not delete assignment history.

### `resolveCurrentAssignment()`

Loads the assignment referenced by the observation and delegates ownership/current-version validation to the existing `AssignmentResolver`.

Structured results contain `allowed`, `code`, `reason`, optional `data`, and optional in-memory `auditEvent`.

## Authorization gates

Before assignment writes, the service calls the existing Authorization Decision Service. The service then rechecks transaction-fresh organization, observation pointer, status, and current assignment invariants.

Workflow wrappers call the named existing decision methods:

| Wrapper | Decision method |
|---|---|
| contractor start | `canStartObservation` |
| contractor evidence submit | `canSubmitEvidence` |
| manager/supervisor return | `canReturnObservation` |
| manager completion | `canCompleteObservation` |
| inspector update | `canUpdateObservation` |

These gates enforce organization scope, real actor role, inspector ownership, contractor assignment ownership, legal transitions, and terminal `COMPLETED`. A denied decision produces no write request.

## Legacy compatibility bridge

| Classification | Meaning | V2 contractor action |
|---|---|---|
| `canonical` | Valid canonical record and matching observation id/version pointer | eligible for policy evaluation |
| `legacy-compatible` | Can be displayed/interpreted but lacks canonical guarantees, or is unassigned | denied |
| `ambiguous` | Contractor identity exists with incomplete provenance | denied |
| `invalid` | Missing identity/org or invalid canonical record/pointer | denied |

The bridge is read-only and never migrates or rewrites a document. With the feature flag disabled, it is not invoked and legacy behavior remains unchanged.

## Integration boundary

`assignment-v2-gateway.js` exposes minimal wrappers for all requested application points without editing protected monolithic pages:

- manager/supervisor assignment create, replace, and end;
- contractor start and submit evidence;
- manager/supervisor return;
- manager completion;
- inspector update.

In V2 mode, workflow wrappers return an authorized `writeRequest`; they intentionally do not call the existing page write functions. Phase 1E/Preview must adapt those write requests at the exact legacy call sites only after protected-file approval. This preserves visible UI, labels, transitions, and current behavior now.

## Audit payloads

Generated, but not persisted:

- `assignment_created`
- `assignment_replaced`
- `assignment_ended`
- `authorization_denied`
- `workflow_transition_requested`

Payloads use the Phase 1 platform audit contract and include actor, organization, resource, decision/reason code, timestamp, and state context. No audit collection was created.

## Verification results

| Gate | Result |
|---|---|
| Phase 1A + 1B + Sprint 3 + Phase 1C + Phase 1D unit/parity | 96 passed, 0 failed |
| Phase 1D unit/dual-mode subset | 13 passed, 0 failed |
| Legacy Production-rules emulator baseline | 49 passed, 6 documented todo, 0 failed |
| Phase 1B characterization emulator | 14 passed, 0 failed (includes 5 documented RULE GAP cases) |
| Phase 1C candidate-rule emulator | 26 passed, 0 failed |
| Phase 1D service integration against candidate rules | 5 passed, 0 failed |
| JavaScript syntax | passed |
| `git diff --check` | passed |

All emulator projects begin with `demo-`; Phase 1D uses `demo-smart-hsr-phase1d`. Firebase CLI reported that non-emulated service access for this demo project would fail. No credentials were used.

## Candidate-rule compatibility

The real Firestore adapter and service passed atomic create, duplicate denial, replacement, end, and cross-organization denial against `firestore.rules.phase-1c-candidate`. Production `firestore.rules` was neither overwritten nor deployed.

## Remaining blockers and risks

1. Existing HTML write paths are not yet connected to the gateway. This is intentional for safety but means end-to-end UI compatibility is not proven.
2. The volume and shape distribution of legacy assignment records are unknown. V2 correctly denies ambiguous contractor actions, which could block legacy work if enabled broadly.
3. Existing Production rules retain the characterized ownership and transition gaps. The candidate rules cannot be deployed before the application switches atomically to canonical writes.
4. Assignment uniqueness is guaranteed by observation pointer + transaction + candidate rules, not by a database-wide unique index. All future assignment writers must use this service boundary.
5. Audit events are payloads only; persistence, retention, redaction, and access policy remain future work.
6. The gateway returns workflow write requests but does not persist them. This prevents behavior change now; Preview integration still needs precise adapters at existing functions.

## Recommended Preview sequence

1. Build a read-only legacy inventory in a local/demo export; classify records without migration.
2. Add the gateway import at one manager assignment call site behind an environment-injected flag that still defaults false.
3. Run Preview with candidate rules and demo/staging data only.
4. Validate create/replace/end and contractor start/submit end-to-end.
5. Add telemetry for decision codes without sensitive payloads.
6. Expand gradually to return/complete and inspector update.
7. Keep Production flag false and Production rules unchanged until parity and rollback drills pass.

## Rollback

1. Disable `PLATFORM_ASSIGNMENT_V2`.
2. Legacy handlers resume immediately through the gateway.
3. Do not delete canonical assignment history.
4. If Preview candidate rules cause incompatibility, restore the Preview rules version only; Production rules remain untouched.
5. Re-run baseline emulator tests to prove legacy parity.

## GO / NO-GO

- **GO:** code review and staging Preview planning with demo/staging-only Firebase resources, flag disabled initially.
- **NO-GO:** Production flag enablement, Production rule deployment, Production migration, or broad UI integration.

The next approval should authorize only a single Preview call-site integration plus staging-only verification, with an explicit protected-file exception if that call site is inside `manager.html`.

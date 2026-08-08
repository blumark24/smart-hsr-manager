# Smart HSR Phase 1E — Single Preview Call-Site Report

Date: 2026-08-06

Branch: `codex/smart-hsr-rules-test-harness`

Base commit: `eb111e7`

Status: local and uncommitted; no push, merge, deploy, migration, cloud resource, or Production connection

## Executive result

Exactly one application call site—manager assignment creation/replacement—now routes through a Preview-safe dispatcher. The existing legacy `updateDoc()` operation remains the default path and is executed unchanged when V2 is disabled. V2 requires an explicit multi-part local/Preview override and never falls back to legacy after a denial.

**GO** for local/demo validation and a reviewed staging Preview bundle.

**NO-GO** for Production, candidate-rule deployment, or enabling V2 by default.

## Existing manager flow traced

All line numbers below refer to the resulting `manager.html`:

| Concern | Function/lines | Finding |
|---|---|---|
| modal preparation | `openAssign()`, 1109–1123 | loads active contractors and preselects `assignedContractorUid` |
| assignment call site | `confirmAssign()`, 1125–1173 | validates observation organization and contractor, constructs legacy payload, writes, closes modal, and reports success/failure |
| legacy fields | 1138–1145 | `assignedContractorUid`, `assignedByUid`, `assignedAt`, `supervisorNote`, `updatedByUid`, `updatedAt` |
| original observation write | preserved inside `legacyWrite()`, 1147–1150 | same `updateDoc(doc(db,'observations',o.docId), payload)` expression |
| V2 dispatch | 1151–1168 | passes actor, observation, contractor, and gateway; denial returns without fallback |
| success state | 1169–1170 | closes modal and shows the existing success message only after an allowed result |
| error state | 1164–1167 and 1171 | structured denial message or existing generic exception message |
| observation mapping | 1402–1406 | preserves legacy assignment fields and now retains canonical id/version pointers |

The original flow had no separate canonical assignment record and treated initial assignment and replacement as the same observation-only update.

## Files changed or created

| File | Change |
|---|---|
| `manager.html` | one module import, one dual-mode dispatch at `confirmAssign()`, and canonical pointer retention in the existing observation mapper |
| `platform/integration/manager-assignment-preview.mjs` | browser-safe Preview call-site dispatcher accepting the Phase 1D gateway instance |
| `platform/assignments/canonical-assignment-write-service.js` | preserves the existing supervisor note inside the same V2 create/replace transaction |
| `test/phase1e-manager-callsite.test.js` | dual-mode, denial, rollback, and compatibility tests |
| `test/phase1e-firestore-callsite.test.js` | end-to-end call-site → gateway → transaction tests against candidate rules |
| `test/run-phase1e-emulator.js` | demo-only emulator runner |
| `PHASE-1E-PREVIEW-CALLSITE-REPORT.md` | this report |

No other application file was modified.

## Legacy path preservation

When the Preview guard is false, `executeManagerAssignmentCallsite()` invokes the supplied `legacyWrite()` directly. The callback contains the original payload and original Firestore update statement. It does not run canonical service logic or create assignment documents.

Tests cover both creation-shaped and replacement-shaped observations and verify callback invocation. Disabling the single V2 flag rolls routing back immediately.

## V2 behavior

When the guard is true:

1. validates the selected contractor identity, role, active status, and actor organization;
2. chooses `createAssignment()` when no canonical pointer exists;
3. chooses `replaceAssignment()` when `currentAssignmentId` exists;
4. delegates authorization and atomic persistence to the existing Phase 1D gateway/service;
5. returns the structured decision;
6. stops on denial without calling `legacyWrite()`.

Replacement therefore marks the old assignment `REPLACED`, records `replacedByAssignmentId` and `endedAt`, increments version, updates the observation pointer, and leaves one ACTIVE assignment.

## Preview-only activation

The default feature flag remains `false`. V2 at this call site requires all conditions:

```text
window.__SMART_HSR_PREVIEW_ASSIGNMENT_V2__.environment === "preview"
window.__SMART_HSR_PREVIEW_ASSIGNMENT_V2__.flags.PLATFORM_ASSIGNMENT_V2 === true
window.__SMART_HSR_PREVIEW_ASSIGNMENT_V2__.projectId starts with "demo-"
hostname is localhost, 127.0.0.1, or begins with preview-
window.__SMART_HSR_ASSIGNMENT_V2_GATEWAY__ supplies the reviewed gateway instance
```

No URL parameter, Local Storage value, Remote Config value, or Production default can activate it. The repository does not set either global. A missing gateway produces a denial, not a legacy fallback.

The `smart-hsr-manager` string appears once in a negative unit-test vector to prove a Production-like project id cannot activate the guard; it is never passed to an emulator or service.

For a real Preview bundle, the injected gateway must be built from the existing `assignment-v2-gateway` and configured with demo/staging-only Firestore. This repository phase does not create or deploy that bundle.

## Local compatibility measurement

Dataset: eight deterministic fixtures; no Production data was read.

| Classification | Count | Percentage |
|---|---:|---:|
| CANONICAL | 2 | 25.0% |
| LEGACY_COMPATIBLE | 3 | 37.5% |
| AMBIGUOUS | 1 | 12.5% |
| INVALID | 2 | 25.0% |
| structurally compatible total | 5 | **62.5%** |

“Structurally compatible” means the bridge can safely classify/read the fixture. It does **not** mean every fixture may execute contractor actions. Only CANONICAL records are contractor-action-ready in V2.

### Missing and ambiguous fields

- Legacy-compatible assigned observations lack `assignmentId`, `status`, and `version` plus the observation's `currentAssignmentId` and `currentAssignmentVersion`.
- The ambiguous fixture has `assignedContractorUid` but lacks complete `assignedByUid`/`assignedAt` provenance.
- Invalid fixtures lack observation identity/organization or contain a canonical record whose observation pointer/resource identity does not match.

### Exact migration requirements

No migration was performed. A future controlled migration must:

1. require observation id and `organizationId`;
2. verify the contractor exists, is active, and belongs to the same organization;
3. require or explicitly reconstruct `assignedByUid` and `assignedAt` from an approved source;
4. create one immutable assignment document with a new `assignmentId`, `ACTIVE` status, and version 1;
5. atomically set `currentAssignmentId` and `currentAssignmentVersion` on the observation;
6. retain legacy display fields during the compatibility window;
7. quarantine ambiguous/invalid records for municipal review rather than infer provenance silently.

## Tests

| Suite | Result |
|---|---|
| Phase 1E unit/dual-mode/compatibility | 7 passed, 0 failed |
| Phase 1E call-site integration against candidate rules | 3 passed, 0 failed |
| Phase 1A + 1B + Sprint 3 + Phase 1C + Phase 1D + Phase 1E unit regression gate | 103 passed, 0 failed |
| Legacy Production-rules emulator baseline | 49 passed, 6 documented todo, 0 failed |
| Phase 1B characterization emulator | 14 passed, 0 failed (including documented RULE GAP classifications) |
| Phase 1C candidate emulator | 26 passed, 0 failed |
| Phase 1D candidate service emulator | 5 passed, 0 failed |

Covered: unchanged legacy create/replace, guarded activation, valid V2 create, atomic replacement/version, single ACTIVE invariant, cross-organization denial, invalid contractor, unauthorized actor, COMPLETED denial, duplicate denial, no fallback, and flag-only rollback.

## Candidate-rule compatibility

The Phase 1E test enters through the same dispatcher imported by `manager.html`, then calls the existing gateway and canonical Firestore transaction adapter against `firestore.rules.phase-1c-candidate` under `demo-smart-hsr-phase1e`.

Creation, replacement, and denial-without-fallback passed. Production `firestore.rules` was not modified or deployed.

## Rollback

1. Leave/remove the explicit override or set `PLATFORM_ASSIGNMENT_V2` to false.
2. The call site immediately executes the unchanged legacy callback.
3. Do not delete canonical assignment history created in Preview.
4. Restore the Preview-only bundle/rules if needed; Production rules remain untouched.
5. Re-run the legacy emulator baseline.

## Remaining blockers

1. No real Preview browser bundle currently injects the CommonJS Phase 1D gateway into the browser global expected by the call site.
2. The current page contains the existing hard-coded Firebase project configuration. A safe Preview must inject a demo/staging configuration before any V2 activation; this phase deliberately did not modify Firebase configuration.
3. Compatibility results are fixture-based, not a Production inventory.
4. Legacy-compatible assigned observations require explicit canonicalization before contractor V2 actions.
5. Candidate rules remain a test artifact and must not be deployed until the Preview bundle and rollback drill pass.

## GO / NO-GO recommendation

- **GO:** local/demo review; build a Preview-only gateway bundle using demo/staging Firebase; keep the flag false initially; then run browser smoke tests.
- **NO-GO:** any Production deployment, Production data migration, candidate-rule deployment, or flag default change.

The next phase should be narrowly authorized to create the Preview bootstrap/bundle and browser smoke test without touching Production configuration or other workflow call sites.

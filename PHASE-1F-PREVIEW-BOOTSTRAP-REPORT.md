# Smart HSR Phase 1F — Preview Bootstrap Isolation Report

Date: 2026-08-06

Branch: `codex/smart-hsr-rules-test-harness`

Base commit: `eb111e7`

Status: local only; no commit, push, merge, deploy, migration, cloud resource, or Production connection

## Executive result

Assignment V2 now has an isolated, fail-closed Preview bootstrap. It accepts an already-created Firebase app and Firestore instance, validates their project through an allowlist guard, and never calls `initializeApp`. `manager.html` consumes only the bootstrap interface. If bootstrap initialization is denied or unavailable, the existing legacy assignment callback remains active. After V2 is initialized, an authorization denial never falls back to legacy.

**GO** for creating a reviewed Preview browser bundle and local/staging smoke testing.

**NO-GO** for Preview deployment until the bundle injects this bootstrap with approved staging/demo configuration and passes browser verification. Production remains NO-GO.

## Files created or changed

| File | Purpose |
|---|---|
| `platform/config/preview-environments.js` | secret-free approved Preview hostnames and staging project allowlist |
| `platform/config/preview-environment-guard.js` | provider-neutral structured allow/deny decision |
| `platform/bootstrap/assignment-v2-preview-bootstrap.js` | singleton V2 bootstrap importing the existing gateway and receiving Firebase dependencies explicitly |
| `platform/integration/manager-assignment-preview.mjs` | uses the bootstrap interface; legacy callback remains the denied/unavailable path |
| `manager.html` | replaces the Phase 1E direct gateway global with the Preview bootstrap global at the same single assignment call site |
| `test/fixtures/phase1f-compatibility-fixtures.js` | 40 deterministic local assignment shapes |
| `test/phase1f-preview-bootstrap.test.js` | guard, singleton, dependency, legacy fallback, and compatibility tests |
| `test/phase1f-bootstrap-firestore.test.js` | bootstrap-to-call-site-to-gateway integration against candidate rules |
| `test/run-phase1f-emulator.js` | demo-only local runner |
| `PHASE-1F-PREVIEW-BOOTSTRAP-REPORT.md` | this report |

No other application file changed. Production `firestore.rules`, Firebase configuration, Auth, workflow transitions, UI labels, storage, maps, contractor flow, and other pages remain unchanged.

## Preview Environment Guard

`evaluatePreviewEnvironment()` returns:

```text
{ allowed, code, reason, environment }
```

Activation requires every condition:

1. `environment === "preview"`;
2. `explicitOverride === true`;
3. `featureEnabled === true` while the repository default remains false;
4. hostname is `localhost`, `127.0.0.1`, or exactly in the Preview hostname allowlist;
5. project id begins with `demo-` or exactly matches the staging allowlist;
6. local execution explicitly confirms that the Firestore Emulator is connected.

### Explicit denial conditions

- malformed or missing configuration;
- missing override;
- disabled feature;
- unknown environment;
- missing, unknown, or Production hostname;
- missing or non-allowlisted Firebase project;
- localhost without confirmed emulator connection;
- mismatched/missing existing Firebase dependencies;
- a second Firebase app after successful initialization.

Any Firebase project outside `demo-*` and the one explicit staging allowlist entry is denied with `PRODUCTION_OR_UNKNOWN_PROJECT_DENIED`. No Production project is present in the allowlist.

## Bootstrap isolation

`assignment-v2-preview-bootstrap.js` directly imports:

- the existing `assignment-v2-gateway`;
- canonical assignment service;
- Firestore assignment store adapter;
- local feature flag contract;
- Preview Environment Guard.

Public interface:

- `initializeAssignmentV2Preview(options)`
- `isAssignmentV2PreviewAvailable()`
- `getAssignmentV2PreviewStatus()`
- `getAssignmentV2PreviewApi()` — returns only `createAssignment()` and `replaceAssignment()`

The test reset method is isolated for deterministic unit tests.

The initializer requires the caller to supply `app`, `db`, modular Firestore SDK functions, clock, and id factory. It validates `app.options.projectId` against the approved project and reuses that app. There is no import or call to Firebase `initializeApp`, no embedded credentials, and no configuration rewrite. Reinitialization with the same app is idempotent; a different app is denied.

## Manager integration behavior

The existing `confirmAssign()` call site still owns validation, payload preparation, and UI success/failure presentation. Its Preview input is now:

```text
window.__SMART_HSR_ASSIGNMENT_V2_PREVIEW__
```

The repository never sets this global. Therefore default behavior is legacy.

- Bootstrap missing or denied: execute the unchanged legacy observation update.
- Bootstrap available: retrieve its limited API and call canonical create/replace.
- Canonical authorization denial: display the structured denial and return; never call legacy.
- Success: retain the existing modal close and Arabic success message.

No workflow labels, transitions, or contractor calls changed.

## Demo/staging configuration

The configuration contains only:

- exact local host handling;
- two non-routable Preview test hostnames;
- one staging project id allowlist entry;
- no API key, credential, email, private key, service account, token, or Production allowlist entry.

It is deterministic and defaults to deny because configuration alone cannot enable the feature; all guard inputs must also pass.

## Expanded compatibility measurement

Dataset: 40 local fixtures. No Production data was queried.

| Classification | Count | Percentage |
|---|---:|---:|
| CANONICAL | 11 | 27.5% |
| LEGACY_COMPATIBLE | 15 | 37.5% |
| AMBIGUOUS | 7 | 17.5% |
| INVALID | 7 | 17.5% |
| structurally compatible | 26 | **65.0%** |
| denied for ambiguity/invalidity | 14 | **35.0%** |

Migration-required assigned shapes: 8 complete-provenance legacy assignments plus 7 ambiguous assignments, or **37.5%**. Seven unassigned legacy-compatible shapes require no assignment migration until assignment occurs. Seven invalid shapes require remediation/quarantine, not automatic migration.

Fixtures include valid canonical, completed canonical, replaced, inactive, stale version, missing contractor id, string contractor id, organization mismatch, missing observation id, observation mismatch, unassigned legacy, and incomplete-provenance legacy shapes.

### Missing legacy fields

Assigned legacy-compatible documents lack:

- `assignmentId`;
- assignment `status`;
- assignment `version`;
- observation `currentAssignmentId`;
- observation `currentAssignmentVersion`;
- canonical `createdAt`/`updatedAt` assignment timestamps.

Ambiguous shapes additionally lack one or both of `assignedByUid` and `assignedAt`. Invalid shapes may lack `assignedContractorUid`, observation id, or `organizationId`, or may contain mismatched organization/observation/pointer/version values.

## Test results

| Gate | Result |
|---|---|
| Phase 1F guard/bootstrap/fixture unit suite | 14 passed, 0 failed |
| Phase 1E + Phase 1F focused unit run | 21 passed, 0 failed |
| Phase 1F bootstrap integration against candidate rules | 3 passed, 0 failed |
| Full Phase 1A–1F unit/policy regression | 117 passed, 0 failed |
| Legacy emulator baseline | 49 passed, 6 documented todo, 0 failed |
| Phase 1C candidate rules | 26 passed, 0 failed |
| Phase 1D candidate service | 5 passed, 0 failed |
| Phase 1E candidate call site | 3 passed, 0 failed |
| Phase 1F candidate bootstrap | 3 passed, 0 failed |
| JavaScript syntax and `git diff --check` | passed |

Security tests cover every required allow/deny vector, default legacy routing on bootstrap denial, zero gateway construction on denial, and refusal of a second Firebase app.

## Candidate-rule compatibility

The Phase 1F integration suite uses `demo-smart-hsr-phase1f` and the local Firestore Emulator. It initializes the bootstrap with the emulator's existing Firebase app, enters through the same manager call-site wrapper, and executes canonical create and atomic replacement under `firestore.rules.phase-1c-candidate`.

It also proves that a denied bootstrap creates no assignment and routes to legacy. Production `firestore.rules` was not changed or deployed.

## Rollback

1. Do not supply the Preview bootstrap global, or keep `PLATFORM_ASSIGNMENT_V2` false.
2. The manager call site immediately uses the existing legacy callback.
3. Do not delete canonical Preview assignment history.
4. Remove/restore only the Preview bundle if its initialization fails.
5. Keep Production rules unchanged and rerun the legacy baseline.

## Exact Preview deployment prerequisites

1. Produce a browser bundle from the CommonJS bootstrap and its existing gateway/service dependencies.
2. Inject only an already-created staging Firebase app and Firestore instance whose project id is allowlisted.
3. Keep the feature override false on first Preview deployment.
4. If localhost, connect Firestore Emulator before bootstrap and assert `emulatorConnected:true`.
5. For hosted Preview, use an exact approved hostname and staging project; never use Production Firebase configuration.
6. Load candidate rules only in that demo/staging environment after separate approval.
7. Run browser smoke tests for legacy disabled state, V2 create, V2 replace, denial/no-fallback, and rollback.
8. Record the staging rule version and rollback command before activation.

## GO / NO-GO

- **GO:** code/security review and creation of the isolated Preview browser bundle.
- **NO-GO:** Preview deployment today because the browser bundle and staging Firebase injection are not yet present or browser-tested.
- **NO-GO:** Production deployment, Production rules, Production data, or default V2 activation.

# Smart HSR Sprint 3 — Platform Foundation Core Report

## Executive outcome

Sprint 3 created an isolated, provider-neutral authorization foundation for roles, workflow, assignment validity, legacy compatibility, structured decisions, and immutable audit-event payloads. The core has no Firebase, storage, network, UI, or persistence dependency and is not imported by production code.

All local unit and emulator gates passed with the known Firestore rule gaps still explicitly characterized. No protected file, production rule, application write function, configuration, deployment, or data was changed.

**Recommendation:** GO for an isolated Phase 1C rules/design branch after approving the assignment persistence representation. NO-GO for application integration or deployment while current rules disagree with the contracts.

## Architecture and files

```text
platform/
  core/
    authorization-decision-service.js
  policies/
    organization-scope-policy.js
    assignment-ownership-policy.js
    observation-workflow-policy.js
  assignments/
    assignment-contract.js
    assignment-resolver.js
    legacy-compatibility.js
  audit/
    audit-event-contract.js
  contracts/
    decision.js
    role-contract.js
```

New Sprint 3 files:

- `platform/contracts/decision.js`
- `platform/contracts/role-contract.js`
- `platform/assignments/assignment-contract.js`
- `platform/assignments/assignment-resolver.js`
- `platform/assignments/legacy-compatibility.js`
- `platform/audit/audit-event-contract.js`
- `platform/core/authorization-decision-service.js`
- `test/sprint3-platform-foundation.test.js`
- `SPRINT-3-PLATFORM-FOUNDATION-REPORT.md`

Updated isolated Phase 1 file:

- `platform/policies/assignment-ownership-policy.js` now delegates contractor assignment validation to the canonical `AssignmentResolver`. Its public decision codes remain compatible with Phase 1 tests.

No dependency or framework was added.

## Decision contract

All new services return:

```js
{
  allowed: boolean,
  code: string,
  reason: string,
  metadata?: object
}
```

`createDecision` and `withDecisionMetadata` recursively freeze decisions and metadata. Service metadata identifies the action, verified actor role, and resource ID without including resource content.

## Canonical role contract

Only verified repository values are present:

- `owner`
- `manager`
- `supervisor`
- `inspector`
- `contractor`

`assistant` was not introduced. The UI phrase “مشرف مساعد” remains a label for `supervisor`.

| Role | Organization scope | Create observation | Edit observation | Assign | Review | Return | Complete |
|---|---|---:|---:|---:|---:|---:|---:|
| `owner` | platform scope where existing owner functions permit | no | no | no | no | no | no |
| `manager` | exact organization | no | named commands only | yes | yes | yes | yes |
| `supervisor` | exact organization | no | named commands only | yes | yes | yes | no |
| `inspector` | exact organization | yes, as creator | own and pre-assignment only | no | no | no | no |
| `contractor` | exact organization | no | assignment actions only | no | no | no | no |

Owner platform scope does not grant observation authority. This preserves the current distinction between platform administration and operational observations.

## Canonical workflow

Statuses are limited to:

- `PENDING`
- `IN_PROGRESS`
- `PENDING_REVIEW`
- `COMPLETED`

| From | To | Authority | Required policy |
|---|---|---|---|
| `PENDING` | `IN_PROGRESS` | current contractor | exact organization and valid current assignment |
| `PENDING` | `IN_PROGRESS` | manager/supervisor assignment command | exact organization and assignment authority |
| `IN_PROGRESS` | `PENDING_REVIEW` | current contractor | exact organization and valid current assignment |
| `PENDING_REVIEW` | `IN_PROGRESS` | manager or supervisor | verified return authority |
| `PENDING_REVIEW` | `COMPLETED` | manager | verified completion authority |
| `COMPLETED` | any status | none | terminal state |

Inspector and contractor completion are denied. Unknown, unchanged, backward, and all outgoing `COMPLETED` transitions return structured denials.

## Assignment contract

Canonical shape:

```js
{
  assignmentId,
  observationId,
  organizationId,
  contractorId,
  status,
  version,
  assignedAt,
  assignedBy,
  replacedByAssignmentId?,
  endedAt?
}
```

Only three assignment states are defined:

- `ACTIVE`: current, not ended, and not replaced.
- `INACTIVE`: no longer actionable; requires `endedAt`.
- `REPLACED`: superseded by another assignment; requires `replacedByAssignmentId` and `endedAt`.

Version must be a positive integer. Active assignments cannot carry termination fields. The contract produces an immutable normalized object but does not persist it.

## AssignmentResolver

`resolveAssignment({ actor, observation, assignment })` validates:

1. actor, observation, and assignment exist;
2. actor, observation, and assignment organizations match;
3. contractor ID equals the authenticated actor UID;
4. assignment observation ID equals observation `id` or `docId`;
5. assignment status is current `ACTIVE` with no replacement/end marker;
6. observation current assignment ID, when present, matches;
7. versions match when either side provides a version.

It detects missing, wrong-contractor, wrong-observation, wrong-organization, inactive, ended, replaced, identity-replaced, and stale-version assignments. For Phase 1 fixture compatibility only, it can also interpret the isolated `active: true/current: true` test shape. That compatibility is not a proposed storage schema.

## Authorization Decision Service

The pure service exposes:

- `canCreateObservation(context)`
- `canUpdateObservation(context)`
- `canAssignObservation(context)`
- `canStartObservation(context)`
- `canSubmitEvidence(context)`
- `canReviewObservation(context)`
- `canReturnObservation(context)`
- `canCompleteObservation(context)`

Each method combines the minimum required boundaries:

- organization scope;
- canonical role authority;
- inspector resource ownership;
- contractor current-assignment resolution;
- legal workflow transition.

Generic update is deliberately limited to the creating inspector before assignment. Manager/supervisor operations use named methods so assignment, review, return, and completion cannot be hidden inside an unrestricted edit call.

The service has no side effects and never calls Firestore.

## Audit event contract

Shape:

```js
{
  eventId,
  organizationId,
  actorId,
  actorRole,
  resourceType,
  resourceId,
  action,
  decision,
  reasonCode,
  previousState?,
  requestedState?,
  assignmentId?,
  timestamp,
  correlationId?
}
```

`createAuditEvent` accepts a completed authorization decision and builds a deeply frozen payload. `decision` is normalized to `ALLOW` or `DENY`. Previous/requested state is reduced to a status string; arbitrary objects, image references, image bytes, credentials, secrets, and request payloads are not copied. IDs and timestamps must be provided by the future application/infrastructure boundary, keeping the core deterministic.

No event is persisted in Sprint 3.

## Legacy compatibility matrix

| Legacy observation shape | Classification | Mapping conclusion |
|---|---|---|
| Unassigned observation with valid observation/organization identity | `FULLY_COMPATIBLE` | correctly represents absence of an assignment |
| Canonical embedded assignment passing the new contract | `FULLY_COMPATIBLE` | can be evaluated directly, though no production write is proposed |
| `assignedContractorUid` + `assignedAt` + `assignedByUid` | `PARTIALLY_COMPATIBLE` | maps organization, observation, contractor, time, assigner; lacks assignment ID/status/version |
| `assignedContractorUid` without complete assignment provenance | `AMBIGUOUS` | contractor is known but currency/replacement/provenance cannot be proven |
| Missing observation ID or organization | `INCOMPATIBLE` | cannot form tenant-safe assignment identity |
| Conflicting/malformed canonical embedded assignment | `INCOMPATIBLE` | fails contract validation |

No observation was migrated, rewritten, or read from Production.

## Tests

### Syntax

All JavaScript files under `platform/` and all Phase 1/Sprint 3 test files passed `node --check`.

### Unit suites

Command:

```text
node --test test/workflow-contracts.test.js test/phase1b-policy.test.js test/sprint3-platform-foundation.test.js
```

Result:

- total: 72
- passed: 72
- failed: 0
- skipped/todo: 0
- Sprint 3 additions: 35 tests
- exit code: 0

Coverage includes all requested role, organization, inspector ownership, contractor assignment, workflow, terminal-state, legacy compatibility, decision-shape, immutability, and audit redaction cases.

### Existing Firestore Emulator baseline

Command: `npm.cmd run test:rules`

- total: 55
- passed: 49
- todo: 6 known authorization gaps
- failed: 0
- exit code: 0

### Phase 1B emulator characterization

Command: `node test/run-phase1b-emulator.js`

- total: 14
- passed: 14
- failed: 0
- classification: 9 `PASS`, 5 `RULE GAP`
- exit code: 0

Both emulator runs used only `demo-smart-hsr-tests`. Firebase CLI emitted its automatic unauthenticated/MOTD warning because remote configuration was unavailable; no Production credentials, data, or project were used.

## Known contract/rule mismatches

The five executable Phase 1B gaps remain:

1. contractor can start another contractor's observation;
2. contractor can submit evidence for another assignment;
3. inspector can update another inspector's observation;
4. manager can reopen `COMPLETED`;
5. contractor can reopen `COMPLETED`.

The baseline also records unknown-status and unassigned contractor gaps. These are expected because `firestore.rules` was intentionally not changed.

## Unresolved ambiguities

1. Canonical assignment persistence location: separate `assignments/{assignmentId}` collection versus embedded immutable assignment object.
2. Atomicity: assignment replacement and observation current pointer must change in one transaction or trusted server command.
3. Version semantics: whether version increments per observation assignment sequence or assignment mutation.
4. Legacy compatibility: how legacy assigned observations receive an authoritative ID/status/version without unsafe backfill.
5. Inspector pre-assignment fields: the exact editable field allowlist still needs product approval; Sprint 3 resolves actor/resource authority, not field-level patch policy.
6. Audit identifiers and trusted timestamp generation belong at the integration boundary, not this pure core.
7. Retention and access policy for future persisted audit events remains undefined.

## Next Phase 1C integration boundaries

No integration was performed. Safest sequence:

### 1. Assignment persistence decision

Approve the canonical representation, current pointer, version increment rule, transaction boundary, legacy dual-read behavior, and indexes. Add emulator fixtures before writing migration code.

### 2. Shared rule vectors

Convert Sprint 3 decisions into data-driven vectors usable by Node and emulator suites. Keep current gaps explicit until a proposed rule patch exists.

### 3. Firestore Rules changes

Required future changes:

- recognize only the four canonical statuses;
- preserve organization and creator identity;
- inspector update requires own `createdByUid`, pre-assignment state, approved fields, and no completion;
- contractor requires the current assignment and only `PENDING → IN_PROGRESS` or `IN_PROGRESS → PENDING_REVIEW`;
- manager completion requires `PENDING_REVIEW → COMPLETED`;
- manager/supervisor return permits only `PENDING_REVIEW → IN_PROGRESS`;
- supervisor cannot complete;
- no role can transition out of `COMPLETED`;
- assignment replacement/version/current identity must be transactionally consistent;
- unknown roles such as `assistant` remain denied.

### 4. Application write-function changes

Only after rules pass:

- `manager.html:1085–1094`: replace cyclic statuses; remove completion reopening.
- `manager.html:1096–1105`: restrict close to manager-approved `PENDING_REVIEW`.
- `manager.html:1124–1151`: write canonical assignment/replacement through the approved atomic boundary.
- `dashboard.html:4237–4295`: call create decision before inspector creation.
- `dashboard.html:4492–4520`: remove inspector completion in a separately approved behavior-change task.
- `mobile-map.html:1523–1533`, `1637–1705`: resolve current assignment immediately before upload and transition.
- API role resolution at `api/_lib/authz.js:40–103`: map verified profiles to the canonical actor DTO without changing role precedence.

### 5. Audit integration

Generate event ID, trusted timestamp, and correlation ID server-side; create an audit event from every decision; persist through a separate append-only adapter. Denied decisions must be auditable without storing evidence or sensitive request payloads.

### Test gates

- 72 unit tests stay green;
- baseline suite reaches 0 todo/0 fail for approved rule policy;
- all five Phase 1B `RULE GAP` cases become strict denials;
- two-tenant, two-inspector, two-contractor replacement race tests;
- legacy read compatibility tests;
- no terminal-state reopening;
- audit redaction and append-only authorization tests;
- no Production project/credential in runners.

## Rollback approach

- Keep core modules additive and unused until integration approval; rollback is removing imports without data impact.
- Rules changes must be a separate reviewable commit with the exact prior deployed rules retained for rollback.
- Assignment persistence must be additive with dual-read; do not delete legacy fields until parity and inventory are proven.
- Client integrations should be isolated per role surface and feature-flagged where practical.
- Audit persistence must be separately disableable; authorization decisions must remain deterministic if audit delivery fails.
- No evidence object or observation history should move during authorization integration.

## Safety verification

- Protected application/login files: unchanged.
- `firebase.json` and deployment configuration: unchanged.
- `firestore.rules`: unchanged.
- Auth and current write behavior: unchanged.
- No production module imports Platform Foundation Core.
- No cloud resource, migration, external AI/API, Production Firebase, commit, push, merge, or deploy operation occurred.
- `git diff --check`: passed in final verification.

## GO / NO-GO

**GO** to Phase 1C design and emulator-first implementation of the canonical assignment persistence and Firestore rules, provided each rule change is driven by the shared contract vectors.

**NO-GO** to Production integration or deployment until assignment atomicity/legacy handling is approved, the five rule gaps become enforced denials, inspector completion is removed through an explicitly approved behavior task, and rollback artifacts are ready.

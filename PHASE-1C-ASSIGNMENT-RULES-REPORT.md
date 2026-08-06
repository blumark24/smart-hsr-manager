# Smart HSR Phase 1C — Assignment Persistence and Emulator-First Rules Report

## Outcome

Phase 1C produced a canonical persisted assignment contract, atomic assignment plans, legacy mapping, deterministic emulator fixtures, and an isolated Firestore Rules candidate. The candidate closes the five verified authorization gaps and preserves the unrelated owner/organization/invoice behavior from the current rules.

Production `firestore.rules` and all application write functions remain unchanged. The candidate was loaded only by the local Firestore Emulator under `demo-smart-hsr-phase1c`.

## Files created or updated

Created:

- `platform/assignments/assignment-persistence-plan.js`
- `test/fixtures/phase1c-fixtures.js`
- `test/phase1c-assignment-persistence.test.js`
- `test/phase1c-firestore-rules.test.js`
- `test/run-phase1c-emulator.js`
- `firestore.rules.phase-1c-candidate`
- `PHASE-1C-ASSIGNMENT-RULES-REPORT.md`

Updated isolated contracts/tests:

- `platform/assignments/assignment-contract.js`: persisted documents now require and normalize `createdAt` and `updatedAt`.
- `platform/assignments/assignment-resolver.js`: canonical `currentAssignmentId/currentAssignmentVersion` pointers take precedence, with Phase 1 field names retained as test/compatibility fallback.
- `test/sprint3-platform-foundation.test.js`: canonical fixture includes persisted timestamps.

No protected application or Production configuration file changed.

## Canonical assignment model

```js
{
  assignmentId,
  organizationId,
  observationId,
  contractorId,
  status,                 // ACTIVE | INACTIVE | REPLACED
  version,                // positive integer
  assignedAt,
  assignedBy,
  replacedByAssignmentId?,
  endedAt?,
  createdAt,
  updatedAt
}
```

Observation pointer fields:

```js
{
  currentAssignmentId,
  currentAssignmentVersion
}
```

Legacy display fields such as `assignedContractorUid`, `assignedByUid`, and `assignedAt` may be dual-written temporarily, but they are not sufficient authorization proof.

## Current-assignment invariant and atomicity

An assignment is actionable only when:

- it is `ACTIVE` with no `endedAt` or replacement marker;
- its organization and observation IDs match the observation;
- its contractor ID matches the authenticated contractor;
- its ID/version match the observation's current pointer.

Initial assignment is one atomic batch/transaction:

1. create `assignments/{assignmentId}` as `ACTIVE`, version 1;
2. update observation `currentAssignmentId/currentAssignmentVersion`.

Replacement is one atomic batch/transaction:

1. update previous assignment `ACTIVE → REPLACED`, setting `replacedByAssignmentId` and `endedAt`;
2. create new `ACTIVE` assignment with exactly previous version + 1;
3. update observation pointer to the new ID/version.

The candidate uses `getAfter()` to bind assignment creation/replacement to the post-write observation pointer. An ACTIVE assignment cannot be created without becoming the pointer, and pointer replacement requires the prior assignment to be ended/replaced in the same atomic write. A standalone second ACTIVE assignment is denied in the emulator.

`assignment-persistence-plan.js` produces immutable operation plans only; it performs no Firestore write.

## Legacy compatibility

Current fields traced:

- `manager.html:1080–1146`: reads/writes `assignedContractorUid`, `assignedByUid`, `assignedAt`.
- `mobile-map.html:1517–1535`, `1637–1708`: validates embedded contractor UID and performs contractor transitions.
- current `firestore.rules:107–153`: permits embedded assignment fields but has no current assignment document check.
- baseline tests seed `assignedContractorUid` without assignment status/version.

| Legacy shape | Classification | Safe behavior |
|---|---|---|
| Unassigned observation with valid identity/organization | `FULLY_COMPATIBLE` | no contractor action until an atomic canonical assignment exists |
| Valid canonical assignment + matching observation pointer | `FULLY_COMPATIBLE` | normal policy/rule evaluation |
| `assignedContractorUid` + `assignedAt` + `assignedByUid` | `PARTIALLY_COMPATIBLE` | useful for display/provenance, not authorization |
| Contractor UID without complete provenance | `AMBIGUOUS` | deny contractor action |
| Missing observation ID/organization or conflicting canonical assignment | `INCOMPATIBLE` | deny; require explicit remediation |

Fallback is fail-closed: never guess ownership, never treat legacy UID alone as current proof, and never silently migrate.

## Candidate rule changes

`firestore.rules.phase-1c-candidate` adds:

- canonical status enum and legal transition checks;
- role-dispatched observation updates with exact organization scope;
- inspector creator ownership, pre-assignment restriction, and no completion;
- contractor lookup of the current ACTIVE assignment, including tenant, contractor, observation, ID, and version equality;
- contractor transitions limited to `PENDING → IN_PROGRESS` and `IN_PROGRESS → PENDING_REVIEW`;
- manager completion limited to `PENDING_REVIEW → COMPLETED` and return to `IN_PROGRESS`;
- supervisor review/return without completion;
- terminal `COMPLETED` for every role;
- assignment create/replacement constraints using `getAfter()`;
- no assignment deletion.

The role value remains `supervisor`; no `assistant` role was added. Manager alone completes. Supervisor reviews/returns, matching the approved verified contract.

## Emulator fixtures

Fixtures include two organizations; managers, supervisor, two inspectors, two contractors, and missing-org user; PENDING/IN_PROGRESS/PENDING_REVIEW/COMPLETED observations; own/other ACTIVE assignments; INACTIVE, REPLACED, stale-version, completed, and cross-organization resources.

## Test results

### JavaScript policy/unit suites

Command:

```text
node --test test/workflow-contracts.test.js test/phase1b-policy.test.js test/sprint3-platform-foundation.test.js test/phase1c-assignment-persistence.test.js
```

- total: 83
- passed: 83
- failed: 0
- skipped/todo: 0
- Phase 1C additions: 11
- exit code: 0

### Production-rules baseline

Command: `npm.cmd run test:rules`

- total: 55
- passed: 49
- todo: 6 documented existing gaps
- failed: 0
- exit code: 0

### Phase 1B characterization

Command: `node test/run-phase1b-emulator.js`

- total: 14
- passed: 14
- failed: 0
- 9 current-rule PASS, 5 explicit RULE GAP
- exit code: 0

### Phase 1C candidate

Command: `node test/run-phase1c-emulator.js`

- total: 26
- passed: 26
- failed: 0
- exit code: 0
- project: `demo-smart-hsr-phase1c`

An initial candidate revision caused denied requests to hit the Firestore 1000-expression evaluation ceiling. Role dispatch was changed to a lazy conditional; the final run contains no expression-limit denial. Normal emulator `PERMISSION_DENIED` evaluation messages remain expected for negative assertions.

## Policy/rule parity

All required vectors match Platform Foundation Core and the candidate:

| Vector group | Core | Candidate | Classification |
|---|---|---|---|
| Valid current contractor start/submit | ALLOW | ALLOW | parity |
| Missing/wrong/inactive/replaced/stale assignment | DENY | DENY | parity |
| Contractor complete/reopen | DENY | DENY | parity |
| Inspector own pre-assignment update | ALLOW | ALLOW | parity |
| Inspector other-owner/complete | DENY | DENY | parity |
| Manager review/return/complete review | ALLOW | ALLOW | parity |
| Supervisor review/return; complete | ALLOW/ALLOW/DENY | ALLOW/ALLOW/DENY | parity |
| Cross-organization/missing organization | DENY | DENY | parity |
| Invalid/terminal transitions | DENY | DENY | parity |
| Second ACTIVE without pointer replacement | DENY | DENY | parity |
| Atomic replacement | valid plan | ALLOW batch | parity |

No required vector remains a POLICY GAP or RULE GAP in the candidate. Existing Production rules remain a RULE GAP until a separately approved deployment. Legacy records without a canonical pointer remain a DATA MODEL GAP and are intentionally denied. Legacy currency/replacement without provenance remains AMBIGUOUS.

## Remaining blockers

1. No approved Production storage location/index/retention policy for assignment documents.
2. Existing observations lack canonical pointers; a reviewed inventory and explicit compatibility/remediation plan is required.
3. Candidate rule deployment has not undergone Preview/staging validation or security review.
4. Application functions still write only legacy fields and would be denied by the candidate contractor rules.
5. Inspector completion UI/write still contradicts the approved workflow.
6. Trusted server timestamps, assignment ID generation, retry/idempotency, and audit persistence are not integrated.
7. Assignment replacement should use a transaction when concurrent managers are possible; batch is safe only after a preconditioned current-version read.

## Exact Phase 1D integration plan

### Assignment creation/replacement

- `manager.html:1124–1151`, `confirmAssign()`.
- Replace the single observation update with a transaction:
  1. read observation and current assignment;
  2. verify version/precondition;
  3. mark prior assignment REPLACED when present;
  4. create new ACTIVE assignment;
  5. update canonical pointer and temporary legacy display fields;
  6. create audit payload.
- Rollback: remove the new transaction call and retain legacy function until candidate rules are deployed; no destructive backfill.

### Contractor start/evidence

- `mobile-map.html:1517–1535`, `readVerifiedWritableObservation()`.
- `mobile-map.html:1625–1724`, save/start/submission flow.
- Read canonical assignment and observation in the same freshness boundary, run `canStartObservation` or `canSubmitEvidence`, then write with current-version precondition. Upload cleanup/idempotency must handle a rejected write.
- Rollback: feature flag back to legacy read only while old rules remain deployed.

### Manager review/return/complete

- `manager.html:1085–1094`, `cycleStatus()`: replace cycle with named transitions; remove reopening.
- `manager.html:1096–1105`, `closeTicket()`: require `PENDING_REVIEW` and manager role.
- Use transaction/precondition on current observation status and assignment version.
- Rollback: independently revert named-command integration; never restore reopening after candidate deployment.

### Inspector update

- `dashboard.html:4237–4300`: creation remains PENDING and creator-owned.
- `dashboard.html:4492–4525`, `completeObservation()`: remove/disable in an explicitly approved behavior change.
- Any retained inspector edit must call `canUpdateObservation` and be restricted to own, PENDING, unassigned observations and an approved field allowlist.

### Rules sequencing

1. add canonical assignment writes behind an off feature flag while old rules run;
2. inventory/explicitly remediate legacy active work—no silent migration;
3. validate dual-read in Preview/emulator;
4. deploy candidate rules only after clients no longer depend on legacy-only authorization;
5. enable role flows gradually with audit monitoring.

## Rollback

- Keep the exact currently deployed rules artifact for immediate restoration.
- Candidate rules and application changes must be separate commits/deploy approvals.
- Assignment data is additive; rollback disables canonical writes but does not delete documents or pointers.
- Transactions are idempotent by assignment ID/version and reject stale retries.
- Maintain dual-read display compatibility until inventory proves safe removal.
- Do not move/delete evidence during assignment rollout.

## Safety confirmation

- Protected application/login/storage/map files: unchanged.
- Production `firestore.rules`: unchanged.
- Firebase/deployment configuration: unchanged.
- No Production Firebase, cloud resource, migration, external API, commit, push, merge, or deploy occurred.
- Candidate and fixtures use demo emulator projects only.
- `git diff --check`: passed in final verification.

## GO / NO-GO

**GO** for security review of the candidate and Phase 1D implementation behind a disabled feature flag, starting with the atomic assignment transaction and legacy inventory.

**NO-GO** for Production rules deployment until Phase 1D clients write canonical assignments, legacy active observations are explicitly handled, Preview/staging parity passes, and rollback artifacts are approved.

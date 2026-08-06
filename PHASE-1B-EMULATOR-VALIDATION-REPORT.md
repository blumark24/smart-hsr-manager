# Smart HSR Phase 1B — Emulator Validation and Role Resolution

## Outcome

Phase 1B resolved the actual repository role identifiers, corrected the isolated Phase 1 workflow/ownership contracts to the approved business decisions, added deterministic assignment vectors, and reproduced current Firestore behavior in the local emulator. No production page, Firebase configuration, authentication path, workflow write function, storage/map module, or production Firestore rule was changed.

**Decision:** the isolated contracts are ready for review. Production integration remains **NO-GO** until the five demonstrated rule gaps and the missing assignment-record model are addressed in Phase 1C behind emulator gates.

## Files

### Updated isolated Phase 1 files

- `platform/policies/assignment-ownership-policy.js`
- `platform/policies/observation-workflow-policy.js`
- `test/workflow-contracts.test.js`

### Added Phase 1B files

- `test/phase1b-policy.test.js`
- `test/phase1b-firestore-rules.test.js`
- `test/run-phase1b-emulator.js`
- `PHASE-1B-EMULATOR-VALIDATION-REPORT.md`

The pre-existing Phase 0 audit and Phase 1A report were preserved. No protected application file was modified.

## Real role resolution

### Authentication claims

No custom role claim assignment or `setCustomUserClaims` call was found. Firebase ID tokens provide authenticated identity such as `uid` and email, while authorization roles are resolved from Firestore profile documents. Server APIs verify bearer tokens with revoked-token checking at `api/_lib/authz.js:40–56`, then resolve the role from collections at `api/_lib/authz.js:59–76` or `api/organization/context.js:39–52`.

### Role matrix

| Exact identifier | Authoritative record | Assignment/creation path | Current responsibility | UI label/evidence |
|---|---|---|---|---|
| `owner` | Membership in `owners/{uid}`; a literal `role` field is not required | owner allowlist is external/admin-managed; Admin API intentionally does not create owners (`api/_lib/authz.js:20–25`) | platform organization/invoice administration, account administration across organizations, explicit owner map-context selection; no observation operations in rules | owner pages; `firestore.rules:13–24`, 165–179 |
| `manager` | `managers/{uid}` with `role: 'manager'`, active and organization-scoped | Admin API supports manager records for an owner; manager records are authoritative (`api/_lib/authz.js:30–33`; `api/admin/users.js:164–197`) | same-organization observation read/update/delete, assignment, review/close; account administration limited to non-manager roles in own organization | “مدير المؤسسة”; `manager.html:1744–1752`, 1784–1789 |
| `supervisor` | `users/{uid}` with `role: 'supervisor'`, active and organization-scoped | owner/manager Admin API creates a `users` record (`api/_lib/authz.js:24–33`; `api/admin/users.js:164–197`) | same-organization reads; assignment/note; `PENDING → IN_PROGRESS`; return `PENDING_REVIEW → IN_PROGRESS`; cannot complete/delete or use Admin API | displayed as “مشرف مساعد”; `manager.html:498`, 1740–1762, 1784–1789; `firestore.rules:118–136` |
| `inspector` | `users/{uid}` with `role: 'inspector'` | owner/manager Admin API | create own organization observations; intended contract permits updates only to own, pre-assignment observations; approved decision denies approval/completion | “مراقب” / “مراقب ميداني”; `dashboard.html:2825–2837`; create at 4237–4295 |
| `contractor` | `users/{uid}` with `role: 'contractor'` | owner/manager Admin API | view assigned same-organization work, start own assignment, submit after evidence for review | “مقاول”; `mobile-map.html:1097–1142`, 1523–1533, 1637–1705 |

### ASSISTANT versus SUPERVISOR

`ASSISTANT`/`assistant` is **not** a recognized stored role, Auth claim, API role, or Firestore rule role. The Arabic label “مشرف مساعد” is presentation text for the exact stored value `supervisor`. An emulator profile seeded with `role: 'assistant'` is denied review access. `manager` and `supervisor` are different roles, stored in different collections with different permissions.

Role precedence is significant: a valid `managers/{uid}` record is checked before a legacy `users/{uid}` record (`dashboard.html:2845–2879`, `manager.html:1740–1762`).

## Corrected workflow contract

Only the four repository statuses remain supported:

- `PENDING`
- `IN_PROGRESS`
- `PENDING_REVIEW`
- `COMPLETED`

No new or reopen status was added.

| From | To | Contract role | Preconditions |
|---|---|---|---|
| `PENDING` | `IN_PROGRESS` | contractor | exact tenant and valid current assignment |
| `PENDING` | `IN_PROGRESS` | manager or supervisor | exact tenant; assignment operation |
| `IN_PROGRESS` | `PENDING_REVIEW` | contractor | exact tenant and valid current assignment |
| `PENDING_REVIEW` | `IN_PROGRESS` | manager or supervisor | exact tenant; return for correction |
| `PENDING_REVIEW` | `COMPLETED` | manager | exact tenant; managerial approval/close |
| `COMPLETED` | any | none | terminal; reopening denied |

Inspector has no status transition in the approved contract. Inspector may create and may update only their own observation before assignment where the workflow permits. Inspector may not approve evidence or complete. Contractor may never complete. Supervisor may return but may not approve completion. Manager is the current approval role.

## Assignment ownership contract

Every contractor action now requires a separate `assignment` input and validates:

1. an assignment record exists;
2. `assignment.organizationId === observation.organizationId`;
3. `assignment.contractorId === actor.uid`;
4. `assignment.observationId === observation.id|docId`;
5. `assignment.active === true`;
6. `assignment.current === true`;
7. when `observation.assignmentId` exists, it equals `assignment.id`;
8. when either side carries a version marker, both versions exist and match;
9. the requested status transition is legal.

Structured denials distinguish missing, inactive/non-current, contractor mismatch, observation mismatch, organization mismatch, replaced ID, and stale version.

### Repository limitation

The current repository has only embedded `assignedContractorUid`, `assignedByUid`, and `assignedAt` observation fields. No authoritative assignment collection, assignment organization field, active/current marker, assignment ID, or version marker was found. Therefore the full approved assignment contract cannot yet be enforced by current Firestore rules. This is a **POLICY GAP** in the persistence model; stale/replaced assignment behavior is **AMBIGUOUS** until Phase 1C selects an authoritative representation.

## Unit test results

Command:

```text
node --test test/workflow-contracts.test.js test/phase1b-policy.test.js
```

Result:

- tests: 37
- passed: 37
- failed: 0
- skipped/todo: 0
- exit code: 0

The 15 Phase 1B-specific vectors cover missing/inactive/non-current assignment, contractor/observation/organization mismatch, replaced ID, stale version, valid assignment, assignment-gated transition, post-assignment inspector denial, inspector approval/completion denial, actual manager/supervisor permissions, rejection of invented `assistant`, and terminal completion.

## Firestore Emulator results

All emulator activity used `demo-smart-hsr-tests` with local Firestore Emulator only. No credentials or Production project were used.

### Baseline suite

Command: `npm.cmd run test:rules`

- tests: 55
- passed: 49
- todo: 6 known security gaps
- failed: 0
- exit code: 0

### Phase 1B characterization suite

Command: `node test/run-phase1b-emulator.js`

- scenarios: 14
- executable tests passed: 14
- test failures: 0
- classifications: 9 `PASS`, 5 `RULE GAP`
- exit code: 0

`RULE GAP` tests assert the current permissive result and are named explicitly as gaps. They do not declare that behavior approved.

### Scenario classification

| Scenario | Emulator result | Classification | Contract/rule conclusion |
|---|---|---|---|
| Contractor starts own assigned `PENDING` observation | allowed | PASS | aligns at the embedded `assignedContractorUid` level |
| Contractor starts another contractor's observation | allowed | RULE GAP | rules check organization, not assignment owner |
| Contractor submits evidence for another assignment | allowed | RULE GAP | rules check allowed fields/tenant, not assignment owner |
| Inspector updates own unassigned observation | allowed | PASS | compatible with approved pre-assignment ownership intent |
| Inspector updates another inspector's observation | allowed | RULE GAP | rules do not check `createdByUid === request.auth.uid` on update |
| Supervisor returns `PENDING_REVIEW → IN_PROGRESS` | allowed | PASS | exact stored role is `supervisor` |
| Supervisor approves `COMPLETED` | denied | PASS | completion remains manager-exclusive in current rules |
| Manager approves `PENDING_REVIEW → COMPLETED` | allowed | PASS | matches approved manager review authority |
| `assistant` profile attempts review | denied | PASS | confirms it is not a real role identifier |
| Cross-organization read | denied | PASS | organization boundary enforced |
| Cross-organization write | denied | PASS | organization boundary enforced |
| Manager reopens `COMPLETED → PENDING` | allowed | RULE GAP | manager transitions are not constrained |
| Assigned contractor reopens `COMPLETED → PENDING` | allowed | RULE GAP | contractor transitions are not constrained |
| Missing authenticated organization context | read/write denied | PASS | fail-closed role context |
| Full active/current/version assignment validation | cannot be represented in current schema | POLICY GAP | requires approved assignment representation |
| Stale/replaced assignment | no repository marker exists | AMBIGUOUS | Phase 1C data-model decision required |

### Additional contract/rule mismatches

- Current inspector rule is documented as `completeObservation` and permits `status`, `isComparative`, `afterImagePath`, and `resolutionNote` without creator ownership or transition validation (`firestore.rules:138–144`). This conflicts with the approved decision that inspectors cannot complete.
- Current manager rule accepts status changes without enum/transition checks (`firestore.rules:107–116`).
- Current contractor rule accepts status changes without assignment or transition checks (`firestore.rules:146–153`).
- The application already performs client-side contractor freshness checks against `organizationId` and `assignedContractorUid` (`mobile-map.html:1523–1533`, 1637–1705), but browser checks are not a security boundary.

## Safest Phase 1C integration sequence

### 1. Approve the assignment representation

Choose one authoritative model before rules changes:

- preferred: immutable/versioned `assignments/{assignmentId}` records plus current assignment pointer on the observation; or
- minimal: embedded assignment object with organization, contractor, observation, active/current, ID, and version.

Do not migrate or backfill Production in the rules task. First create emulator fixtures and compatibility rules for legacy observations.

### 2. Promote shared test vectors

Encode the provider-neutral transition/assignment cases as data vectors consumed by both Node policy tests and emulator tests. Convert existing TODO expectations into strict deny assertions only when the proposed rules are under review.

### 3. Change Firestore rules in an isolated security branch

Required rule changes:

- inspector update requires creator ownership, pre-assignment state, approved fields, and no status transition to `COMPLETED`;
- contractor update requires current assignment ownership and only `PENDING → IN_PROGRESS` or `IN_PROGRESS → PENDING_REVIEW`;
- manager permits only approved transitions and cannot reopen `COMPLETED`;
- supervisor retains assignment and `PENDING_REVIEW → IN_PROGRESS`, without completion;
- all paths preserve `organizationId`, `createdByUid`, assignment identity/version, and updated actor constraints;
- unknown statuses and all outgoing `COMPLETED` transitions are denied.

### 4. Add client policy checks after rules pass

Client checks improve UX but follow server enforcement:

- `manager.html:1085–1094` — replace unrestricted status cycle with named commands; remove reopen path.
- `manager.html:1096–1105` — manager close must require `PENDING_REVIEW`.
- `manager.html:1124–1151` — create/replace assignment with current/version semantics.
- `dashboard.html:4237–4295` — creation remains inspector-owned.
- `dashboard.html:4492–4520` — remove/disable inspector completion in a separately approved behavior-change task.
- `mobile-map.html:1523–1533`, 1637–1705 — evaluate the current assignment record immediately before upload and write.

These are future integration points only; none were modified in Phase 1B.

### 5. Test gates

- all policy unit vectors pass;
- baseline emulator tests have 0 TODO and 0 fail after approved rule changes;
- Phase 1B `RULE GAP` cases change to strict denied `PASS` cases;
- two-organization, two-contractor, two-inspector concurrency fixtures;
- assignment replacement/version race tests;
- no `COMPLETED` outgoing transition for any role;
- Auth/role precedence regression tests;
- no Production credentials/project IDs in test runner;
- protected UI behavior changes reviewed separately.

### 6. Rollback

- Rules: retain the previously deployed rules version and deploy only after emulator/preview approval; rollback is restoring that exact version.
- Application: policy imports and UI command changes must be separate commits/feature flags so they can be reverted independently.
- Assignment model: additive only; do not delete or rewrite legacy assignment fields until dual-read parity and inventory are proven.
- No evidence objects or workflow records should move during Phase 1C authorization hardening.

## Blockers

1. No authoritative assignment record or active/current/version representation exists.
2. Current rules contradict approved contractor assignment ownership.
3. Current rules contradict approved inspector ownership and completion restrictions.
4. Current manager and contractor rules permit reopening a terminal observation.
5. `dashboard.html` still contains an inspector completion write; changing it is intentionally outside Phase 1B.
6. Rule and JavaScript policy parity needs shared vectors to prevent drift.

## Checks and safety confirmation

- JavaScript syntax checks: passed for all Phase 1 policy and Phase 1B test/runner files.
- Phase 1A plus Phase 1B policy unit tests: 37/37 passed.
- Baseline Firestore Emulator: 49 passed, 6 explicit todo, 0 failed, exit 0.
- Phase 1B Firestore Emulator: 14/14 executable scenarios passed, exit 0.
- `git diff --check`: passed in final verification.
- Protected tracked file changes: none.
- `firestore.rules`: unchanged.
- Production behavior: unchanged; no production code imports the policies.
- External APIs and Production Firebase: not contacted.
- Commit/push/merge/deploy: not performed.

## GO / NO-GO for Phase 1C

**GO** to design the authoritative assignment representation and prepare an isolated Firestore-rules patch driven by the shared test vectors.

**NO-GO** to integrate policy calls into application writes or deploy rules until:

1. the assignment representation and legacy compatibility strategy are approved;
2. all five `RULE GAP` scenarios are strict denials in the emulator;
3. the inspector completion UI/write path is handled in an explicitly approved behavior-change task;
4. rollback artifacts and rule-version review are ready.

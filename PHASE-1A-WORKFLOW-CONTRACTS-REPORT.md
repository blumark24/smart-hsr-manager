# Smart HSR Phase 1A — Workflow and Ownership Contracts Report

## Outcome

Phase 1A adds provider-neutral, pure policy contracts and deterministic Node tests. The contracts do not import Firebase, perform writes, call a network service, or integrate with any production page or API. Current application behavior is unchanged.

## Files created

| File | Purpose |
|---|---|
| `platform/policies/organization-scope-policy.js` | Reusable authenticated-tenant boundary |
| `platform/policies/assignment-ownership-policy.js` | Actor/resource ownership and operational action boundary |
| `platform/policies/observation-workflow-policy.js` | Supported statuses, legal transitions, roles, and ownership metadata |
| `test/workflow-contracts.test.js` | Deterministic unit tests with no Firebase or network dependency |
| `PHASE-1A-WORKFLOW-CONTRACTS-REPORT.md` | Phase result and next-phase integration boundary |

The pre-existing untracked `SMART-HSR-PLATFORM-AUDIT.md` was preserved and not changed in Phase 1A.

## Contracts and methods

### OrganizationScopePolicy

`evaluateOrganizationScope({ actor, resource })` returns:

```js
{ allowed: boolean, reason: string, code: string }
```

It requires an authenticated `organizationId`, a resource `organizationId`, and exact equality. The only scope exception is the already-existing `owner` role. This exception grants scope selection only; it does not grant observation workflow authority. This matches current owner context behavior in `api/organization/context.js:39–92` while preserving the current observation rule that owners are not operational actors.

### AssignmentOwnershipPolicy

`evaluateAssignmentOwnership({ actor, observation, action })` enforces:

- Contractor: the observation must be assigned and `assignedContractorUid` must equal the actor uid; only `start`, `submit_evidence`, and `view` are recognized.
- Inspector: `createdByUid` must equal the actor uid; only `update`, `complete`, and `view` are recognized.
- Supervisor: same-organization `assign`, `review`, `return`, and `view`; no close.
- Manager: same-organization `assign`, `review`, `return`, `close`, and `view`.
- Owner: no operational observation authority.

The repository's Arabic “assistant supervisor” UI maps to the existing role value `supervisor`; no new `assistant` role was introduced.

### ObservationWorkflowPolicy

- `evaluateTransition({ actor, observation, toStatus })`
- `describeTransition(fromStatus, toStatus)`
- `OBSERVATION_STATUSES`
- `TRANSITION_MATRIX`

Every decision has the same structured `{ allowed, reason, code }` shape. The module describes policy only and performs no persistence.

## Transition matrix

Only statuses found in the repository are encoded:

- `PENDING`
- `IN_PROGRESS`
- `PENDING_REVIEW`
- `COMPLETED`

| From | To | Allowed role(s) | Ownership/scope requirement |
|---|---|---|---|
| `PENDING` | `IN_PROGRESS` | contractor, manager, supervisor | same organization; contractor must own assignment |
| `IN_PROGRESS` | `PENDING_REVIEW` | contractor | same organization and assignment owner |
| `IN_PROGRESS` | `COMPLETED` | inspector, manager | same organization; inspector must be creator |
| `PENDING_REVIEW` | `IN_PROGRESS` | manager, supervisor | same organization; review return |
| `PENDING_REVIEW` | `COMPLETED` | manager | same organization; manager review/close |
| `COMPLETED` | any | none | protected terminal state |

All other transitions, unchanged statuses, and unknown statuses are denied.

## Tests added

The unit suite covers:

- exact organization match, cross-organization denial, missing actor/resource organization, and existing owner scope behavior;
- owner scope without operational workflow privilege;
- unassigned contractor denial;
- wrong-contractor evidence denial;
- valid contractor start and evidence submission;
- contractor close denial;
- inspector creator ownership and other-inspector denial;
- supervisor review/return and close denial;
- manager review/close and cross-organization denial;
- invalid and unknown transitions;
- terminal `COMPLETED` protection from reopening by every operational role.

Run with:

```text
node --test test/workflow-contracts.test.js
```

Result: **21 tests, 21 passed, 0 failed, 0 skipped/todo; exit code 0**.

## Ambiguities and intentional contract choices

1. `firestore.rules:138–153` currently permits same-organization inspector/contractor updates more broadly than this intended contract. Existing emulator TODO tests prove the gap. The new policy denies those actions but is not integrated, so production behavior does not change.
2. `dashboard.html:4492–4520` lets an inspector complete an observation, while the contractor path submits to `PENDING_REVIEW`. The contract retains inspector completion only from `IN_PROGRESS` and only for the creating inspector; product governance should confirm whether inspector completion remains valid.
3. `manager.html:1085–1094` cycles `COMPLETED → PENDING`. The new contract treats `COMPLETED` as terminal because the requested Phase 1A safety test requires protection from unauthorized reopening. A future reopen capability, if approved, needs a separate action, reason, audit event, and explicit authority.
4. `manager.html` omits `PENDING_REVIEW` from several labels/filters although the contractor and rules paths use it. The contract includes it because it is a real persisted status.
5. Current rules let a supervisor return `PENDING_REVIEW → IN_PROGRESS` and assign `PENDING → IN_PROGRESS`, but deny supervisor completion. The contract preserves that boundary.
6. Assignment fields and transition status can be written together by manager/supervisor today. The pure contract expresses role/action permission but does not validate a proposed assignment payload; Phase 1B needs a command DTO and resource-after validation.

## Exact production integration points for the next phase

No integration was performed. Candidate Phase 1B call sites are:

| Surface | Current point | Future boundary |
|---|---|---|
| Manager status cycle | `manager.html:1085–1094` | evaluate a named workflow command before constructing the Firestore patch |
| Manager close | `manager.html:1096–1105` | manager `close` command with review/audit preconditions |
| Manager/supervisor assignment | `manager.html:1124–1151` | assignment command validating contractor tenant and proposed assignment |
| Inspector creation/completion | `dashboard.html:4237–4295`, `4492–4520` | creator/tenant contract and completion command |
| Contractor fresh-record validation | `mobile-map.html:1523–1533`, `1637–1705` | assignment owner plus transition decision before upload/write |
| Firestore enforcement | `firestore.rules:89–153` | mirror approved transition/ownership semantics in rules after emulator tests are promoted from TODO |
| Server role resolution | `api/_lib/authz.js:40–103` | map verified principal to the same provider-neutral actor DTO |

Integration must preserve Firestore rules as the final browser-write security boundary. Client policy use improves consistency and error messages but cannot replace rules.

## Risks

- Policy drift if JavaScript contracts and Firestore rules are maintained manually without shared generated test vectors.
- Race conditions unless Phase 1B evaluates both current and proposed resource state transactionally/preconditioned.
- Manager assignment transition semantics need payload validation, not only a status decision.
- Evidence upload may occur before a transition is accepted, leaving orphaned objects.
- A future owner operational privilege would be an authorization expansion and is explicitly outside this contract.

## Verification result

- Syntax: all three policy modules and the unit test file passed `node --check`.
- Unit tests: 21 passed, 0 failed; exit code 0.
- `git diff --check`: passed.
- Protected file changes: none; verified against Git status/diff after test execution.
- Production behavior: unchanged by design; no production module imports these contracts.

## GO / NO-GO recommendation

**GO** to review and approve the Phase 1A contract semantics after all local checks pass.

**NO-GO** for production integration until the organization decides the inspector completion authority, manager reopen behavior, and assignment-plus-transition command semantics. Once decided, Phase 1B should add shared policy test vectors to the Firestore emulator suite before any rule or UI integration.

# Inspector / Contractor Security Closure Report

Base: `codex/inspector-acceptance-gate` at `8fe4fda`  
Scope: Firestore authorization parity with the existing Organization Scope, Assignment Ownership, Assignment Resolver, and Observation Workflow policies.

## Outcome

All six executable Firestore security TODOs are closed. The emulator result is **55 passed, 0 failed, 0 skipped, 0 TODO**. No HTML, Firebase Auth, Storage, AI, Owner baseline, or Manager baseline was changed.

## Closed gaps

| Gap | Rule before | Rule after | Proving test | Role impact |
|---|---|---|---|---|
| Contractor updates another contractor's assignment | Same-organization Contractor was sufficient | `assignedContractorUid` must equal `request.auth.uid` and remain unchanged | A9.1 | Contractor can act only on its own embedded current assignment |
| Contractor updates an unassigned observation | Assignment ownership was not checked | Missing/mismatched `assignedContractorUid` fails closed | A9.2 | Unassigned work cannot be self-claimed through an update |
| Inspector updates another Inspector's observation | Inspector role and organization were sufficient | `createdByUid` must equal `request.auth.uid` and remain unchanged | G1 | Inspector can update only observations it created |
| Manager writes unknown/illegal status | Allowed fields were checked, not transitions | Only `PENDING→IN_PROGRESS`, `PENDING_REVIEW→IN_PROGRESS`, and `PENDING_REVIEW→COMPLETED` | G3 | Manager retains assignment/return/final-completion authority; arbitrary transitions are denied |
| Contractor moves status backward | Allowed fields were checked, not transitions | Only `PENDING→IN_PROGRESS` and `IN_PROGRESS→PENDING_REVIEW` | G4 | Contractor can start and submit evidence, but cannot move backward or complete |
| Inspector writes arbitrary/completed status | Inspector could update the `status` field | Inspector status changes are denied; owned, unassigned evidence fields remain editable | G5 | Inspector has no workflow or final-completion authority |

## Additional terminal and tenant guarantees

- Every update path requires the stored and requested `organizationId` to remain identical and match the authenticated role record.
- Manager, Supervisor, Inspector, and Contractor updates are denied when the stored status is `COMPLETED`.
- Supervisor retains `PENDING→IN_PROGRESS` assignment and `PENDING_REVIEW→IN_PROGRESS` return authority, but cannot complete.
- AI has no Firestore rules identity or workflow branch and therefore has no workflow authority.
- The existing final fallback remains deny-all.

## Verification

- Firestore emulator authorization suite: **55/55 PASS, 0 TODO**.
- RBAC/Workflow/Assignment/Inspector security suite: **66/66 PASS, 0 TODO**.
- JavaScript syntax: **122 files PASS**.
- `git diff --check`: **PASS**.

The emulator logs can report its expression-evaluation ceiling while evaluating deliberately denied requests. Every such request failed closed and every positive authority case passed; no authorization was granted because of that diagnostic.

## Readiness decision

Security Closure is complete. Inspector moves from **RC/HOLD** to **READY FOR LIVE ACCEPTANCE**. Final approval still requires the previously defined live iPhone/Android/Vercel/Firebase/B2 Golden Observation checks.


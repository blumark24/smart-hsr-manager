# SMART HSR — Phase 09 Rollback Plan

## Exact rollback SHAs (pre-Phase-09 known-good baseline)

| Repo | Rollback target branch | Rollback target SHA |
| --- | --- | --- |
| smart-hsr-manager | claude/phase-08-1-geo-closure | 4351a62a771f4d07e3dcc18ab57f6f201d4589f4 |
| smart-hsr-lands | claude/phase-08-smart-hsr-geo-final | 37b9af272c204a63b216723d14e765af5a5a1b56 |
| Smart-HSR-Owner | claude/phase-07b-owner-console-final | 51f7ed1f1767747dfee05b366e1be0cd93174feb |

Lands and Owner were not modified in Phase 09 — their rollback target is identical to their
current deployed state, so "rolling back" those two repos is a no-op by construction.

## How to roll back Manager

```
git fetch origin claude/phase-08-1-geo-closure
git checkout claude/phase-08-1-geo-closure  # or deploy this SHA directly
```

Rolling back Manager means reverting exactly these Phase 09 changes:
`manager-lands-adapter.js`, `test/manager-lands-grant-completeness.test.js`,
`test/phase1b-firestore-rules.test.js`, `test/phase1h-staging-package.test.js`,
`test/sprint5e5-arabic-utf8-quality.test.js`,
`test/sprint5f2-summary-policy-coverage.test.js`,
`test/sprint6.11-2-provider-activation.test.js`, `test/run-release-suite.js`,
`test/run-geo-suite.js`, `test/run-security-suite.js`, `package.json`,
`firestore.indexes.json`. None of these touch a data schema, a Firestore Rules
authorization decision, or a migration — every change is either test-only, a client-side
display-logic fix, a test-command fix, or additive index metadata. Reverting is safe at any
time and requires no data migration.

## Firestore Rules rollback

Phase 09 made **no change** to `firestore.rules` in any of the three repos (Gate 1 confirmed
Manager's embedded copy of Lands' rules is already byte-for-byte reconciled; no rules edit
was needed anywhere). There is nothing to roll back on the Rules themselves. If a Rules
rollback is ever needed for an unrelated reason, deploy the specific prior `firestore.rules`
blob via `firebase deploy --only firestore:rules --project <project>` from the target SHA —
Rules deploys are themselves atomic and instantly reversible the same way.

## Firestore indexes rollback

Phase 09 added 13 composite indexes to `firestore.indexes.json` (Gate 9). A composite index
is strictly additive — removing an index definition and redeploying
(`firebase deploy --only firestore:indexes`) only stops Firestore from serving the queries
that relied on it (they would then return `FAILED_PRECONDITION` again, the pre-Phase-09
behavior for those specific queries); it never deletes data and is safe to reverse at any
time. No irreversible migration is involved.

## Static frontend / API rollback

Manager's frontend is static HTML/JS served from the repo root plus Vercel serverless
functions under `api/`. Rolling back to the target SHA and redeploying reverts both the
frontend and the API atomically as one deploy — there is no separate frontend/backend
rollback sequencing to manage.

## Schema compatibility notes

- The Gate 1 fix (`computeGrantCompleteness`) is a pure client-side/read-side display
  calculation — it reads existing Lands grant fields, writes nothing, and has no schema
  dependency in either direction. Rolling it back or forward does not require a data
  migration in either repo.
- No document schema was added, renamed, or removed in any of the three repos this phase.

## No irreversible migration

Phase 09 introduced zero data migrations, zero renamed/removed Firestore fields, and zero
one-way transformations. Every change in this phase's Manager commit can be reverted by a
plain `git revert`/checkout to the prior SHA with no data cleanup step required.

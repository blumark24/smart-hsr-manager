# SMART HSR — Phase 09 Release Notes

Release candidate for formal municipality UAT. Preview/Staging only.

## Manager changes

- **Fix (Gate 1)**: `manager-lands-adapter.js`'s `computeGrantCompleteness()` was checking
  Lands grant fields (`beneficiary.name`, `royal_order.number`, `plan_reference_number`,
  `conveyance.letter_number`, etc.) that no longer exist in Lands' real, current schema —
  Lands' own server-side completeness formula moved to a different field shape
  (`beneficiary_id`, `royal_order_id`, `plan_id`, `parcel_id`, `document_ids`, etc.) in a
  prior Lands change that Manager's ported display copy never picked up. The visible defect:
  every grant's completeness percentage/status shown to a Manager viewer was silently wrong,
  with no error or crash. Re-ported from Lands' current authoritative
  `client/lands-core.js`'s `computeCompleteness()`. Added 5 new regression tests
  (`test/manager-lands-grant-completeness.test.js`).
- **Fix (Gate 9)**: added 13 composite Firestore indexes that real queries in the codebase
  require but which `firestore.indexes.json` was missing — `observations` × contractor
  assignment and × 6 evidence-key fields, `missions`/`incidents` × department and ×
  employee, `vehicles` × employee, `employeeAssignments` × employee. The local Firestore
  emulator does not enforce composite-index requirements, so this was invisible to the test
  suite; a real deployed Firebase project would return `FAILED_PRECONDITION` for these
  queries — most notably, the evidence-image authorization endpoint
  (`api/storage/read.js`) would fail for 6 of its 7 lookup paths, and contractors' mobile
  evidence view would fail to load at all.
- **Fix (Gate 4)**: `npm test` was a non-functional placeholder
  (`echo "Error: no test specified" && exit 1`) that always failed with zero signal. Added
  three real, portable, deterministic test-runner scripts —
  `npm test` / `npm run test:release` (the full 1864-test suite), `npm run test:geo`, and
  `npm run test:security` — each self-starting and self-stopping its own Firestore+Auth
  emulator session, enumerating `test/*.test.js` by directory listing (not a shell glob or
  Node's own directory auto-discovery, both of which behave inconsistently across
  platforms), and running with `--test-concurrency=1` after finding and fixing a real
  Firestore-emulator race condition (concurrent test files each calling
  `clearFirestore()` against one shared emulator instance produced non-deterministic,
  different failing tests on every run).
- **Fix (Gate 4)**: investigated and closed all 11 test failures that had been carried
  forward as "known, pre-existing, unrelated" baseline noise since Phase 08.1. All 11 were
  stale tests, not product defects: 5 documented a Rules gap already closed by Phase 08.1's
  own contractor-authorization work; 1 compared a frozen legacy rules hash against the live,
  ever-evolving `firestore.rules` with no frozen copy ever having been committed; 3
  contradicted `arabic-summary-policy.js`'s own documented design decision (action/impact
  wording is required in `recommendedActionAr`, deliberately not in the short summary); 2
  expected an older, coarser error-flattening behavior from `provider-router.js` that a
  since-improved version correctly stopped doing (a well-shaped provider failure now keeps
  its specific error code instead of being flattened to a generic one). Result: **1864/1864
  tests pass**, up from a persistent 1853/1864 baseline that had carried across Phases 08.1,
  08.2, and 08.3.

## Lands changes

None. Gate 1 confirmed Manager's embedded copy of Lands' Firestore Rules is already
byte-for-byte reconciled with Lands' own `firebase/firestore.rules`. Lands' own test suites
(51/51 non-emulator, 58/61 emulator — see RELEASE-CANDIDATE.md for the 3-test emulator
flakiness finding) pass against the pinned baseline with no code change.

## Owner changes

None. Owner's own test suite (81/81) passes against the pinned baseline with no code change.
Gate 6 (historical aggregation) does not apply — the locked Owner Console has no month/year
rollup feature to audit; it is a live current-state dashboard plus a live audit feed.

## Non-changes worth stating explicitly

- No Firestore or Storage Rule was weakened or loosened anywhere.
- No fake municipality, fake production user, or fake GPS data was created anywhere.
- No new product was added; Maps/Digital Twin remain a platform capability, not a fourth
  product.
- Redis/additional infrastructure was not added — Gate 10's real measurements found no
  performance problem that would justify it.
- No Al-Qunfudhah-specific logic was hard-coded into product code; no municipality-specific
  fork was created.
- main was not touched; nothing was merged; no PR was opened; Production was not deployed or
  modified.

## Release candidate SHA

See the commit that accompanies this file for Manager's final Phase 09 SHA on
`claude/phase-09-release-candidate`. Lands and Owner remain at their pinned Phase 08/07B
SHAs (`37b9af272c204a63b216723d14e765af5a5a1b56` and
`51f7ed1f1767747dfee05b366e1be0cd93174feb` respectively) — unchanged.

# SMART HSR — Release Notes (Phase 09 + Phase 10 UAT)

Release candidate for formal municipality UAT. Preview/Staging only.

## Phase 10 — Manager changes

- **Fix (real-browser E2E defect, availability not security)**: `createMissionRequest()` and
  `createIncident()` in `smart-mobility-adapter.js` batched a brand-new resource together with
  that SAME resource's own new `auditEvents` document in one atomic `writeBatch()`.
  `firestore.rules`' `auditReferencedResourceOk()` requires the audit event's referenced
  resource to already exist — Security Rules resolve `get()`/`exists()` against the database's
  committed state, never a sibling document's still-in-flight data from the same batch, so
  that check could never be satisfied for a resource created in the very same write. Proven by
  direct reproduction, both via the real Chromium E2E harness and via a minimal isolated Node
  script, that this reliably hits the Rules engine's per-write expression-evaluation ceiling
  ("Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been
  reached") and denies the whole batch. Concretely: no department head could create a mission
  request, and no employee could report an incident, through the real app — a complete outage
  of Smart Mobility's two most basic actions that no prior emulator-only test suite could have
  caught (the emulator enforces Rules correctness, and this is a Rules-correctness denial, just
  one only reachable from a real multi-write session, not a single-assertion unit test).
  Fixed by sequencing the two writes (the resource, then its audit event) instead of batching
  them. Every other restriction on both functions is unchanged. Accepted tradeoff: if the
  second write fails after the first succeeds, the resource exists without its 'create' audit
  entry — the same tradeoff this product already accepts elsewhere (Owner Console's
  `recordAuditEvent`). Updated `test/mobility-phase9-wiring.test.js` (which asserted the old,
  now-incorrect atomic-batch shape for exactly these two functions) and
  `test/mobility-audit-atomicity.test.js`'s header comment to match.
- **Fix (real-browser E2E defect)**: `operational-map.html`'s `paintEntities()` crashed
  (`sources.<id>.cluster: boolean expected, undefined found`) whenever a geo layer returned
  zero entities — the normal state for a newly onboarded municipality with no reference geo
  data loaded yet, which describes بلدية القنفذة's actual current state. Root cause:
  `entities[0] && entities[0].geometry.type === 'Point'` yields `undefined`, not `false`, when
  `entities` is empty. Fixed to `entities.length > 0 && ...`.
- **Test-fixture fix**: `test/e2e/seed-mayor-scenario.js`'s employee account was missing
  `vehicleEligible: true` — a real, deliberately-designed Phase 03B.1 safety field (fail-safe:
  no field at all means NOT eligible for vehicle allocation) that a real Manager sets via the
  User Center. The fixture simply predated or omitted it; the product's own enforcement
  (`api/_lib/authz.js`'s `isValidMobilityAllocationTarget`) was already correct. Fixed the
  fixture, not the product.
- **New test-harness-only file**: `test/e2e/lib/api-mock.js` — bridges this sandbox's static
  file server to the real `api/admin/users.js` and `api/organization/context.js` handler
  functions in-process (transport-shape adaptation only; every authz check and Firestore/Auth
  Admin SDK call inside the handlers runs for real against the local emulators). Zero product
  code changed to enable this.
- `test/e2e/mayor-scenario.js` updated to install this bridge alongside the existing Firebase-
  CDN mock, so the full Mayor Demo scenario's vehicle-allocation step (which calls the real
  trusted server endpoint) now runs end to end for real instead of stopping short.

Full Manager canonical regression after these fixes: **1869/1869** (release suite),
**378/378** (security suite), **82/82** (geo suite) — all green, zero unexplained failures.

## Phase 09 — Manager changes

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

## Phase 10 — Lands and Owner changes

None. Both repos' full Phase 09 regression suites re-ran with zero regression: Lands 51/51
(non-emulator) + 63/66 (emulator — the same 3 pre-existing, previously root-caused Storage-
emulator-bridge flaky tests, unchanged in identity or count); Owner 81/81.

## Lands changes (Phase 09)

None. Gate 1 confirmed Manager's embedded copy of Lands' Firestore Rules is already
byte-for-byte reconciled with Lands' own `firebase/firestore.rules`. Lands' own test suites
(51/51 non-emulator, 58/61 emulator — see RELEASE-CANDIDATE.md for the 3-test emulator
flakiness finding) pass against the pinned baseline with no code change.

## Owner changes (Phase 09)

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

See the commit that accompanies this file for Manager's final Phase 10 SHA on
`claude/phase-09-release-candidate` (same branch, new commit on top of the Phase 09 SHA
`990749158854f4805971b6254c2b5e13df4edf31`). Lands remains at its Phase 09 SHA
(`7470fc8b5871b8a66ae25f152115936c60ae1a53`) and Owner at its pinned Phase 07B SHA
(`51f7ed1f1767747dfee05b366e1be0cd93174feb`) — both unchanged in Phase 10.

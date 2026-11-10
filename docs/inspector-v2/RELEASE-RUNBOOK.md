# Inspector V2 release and rollback

Status: HOLD. Nothing was pushed, deployed or published by this task. No Preview deployment or exact deployed SHA has been verified. Local code and simulated browser integration are not production acceptance.

## Required staging gates

1. Provision the existing approved staging Firebase/B2/AI bindings; retain project isolation from production. Preview Firebase config must resolve to `smart-hsr-staging-blumark24` through the existing config endpoint. Confirm same-project Admin credentials and revoked token behavior.
2. On staging only, provision the additive composite index in `firestore.indexes.json`; wait until ready. No rules change is required. Keep all existing indexes and documents.
3. Run the repository's Firestore rule suites through their individual emulator runners using demo projects. The runtime currently denies the official emulator download. Request environment access to the official emulator download host through environment settings; do not disable TLS or security controls.
4. Deploy an immutable **Preview** of the selected reviewed commit using the existing authorized release channel. Record deployment ID, full git SHA, exact URL, Firebase project, timestamp and existing rollback deployment ID. Verify artifact contents exclude test/docs/legacy fixture.
5. Use existing authorized **staging** accounts for inspector, other inspector, inactive user, supervisor, contractor, manager and another organization. No authorized credentials were supplied in this environment. Do not manufacture production accounts or reset any data.
6. Test real sign-in and role routing; own/cross-org and same-org other-user queries/cursors; token revocation; actual B2 before/after uploads and read delivery; server commit failures/timeouts and exact-ID retries; current GPS/bounds; AI enabled/disabled organizations; manager/contractor workflow compatibility. Read-only tests are preferred; any staging test observations must be identifiable and preserved unless separately authorized for cleanup.
7. Complete mobile, tablet and desktop UAT against the supplied reference, including field GPS on an actual phone. Chromium viewports do not certify iPhone/Safari behavior. Confirm OSM tile delivery and appropriate provider capacity/terms before municipality scale; the environment currently blocks the tile host.
8. Resolve the pre-existing failing CI tests without weakening contracts; run all required CI/security checks. Assess P0/P1 findings explicitly and require zero unresolved P0/P1 before release.
9. Only after all gates pass and release authority is current, deploy the exact accepted commit to Production. Then run smoke tests at the final domain: login/role/organization, all six routes, map/evidence, a separately authorized observation creation if allowed, server confirmation and counters. Record actual results, not inferred build success.

## Rollback

Pre-change source reference: full commit starting `666e7d3`. Source is not proof of a healthy deployed release: capture and validate the actual last healthy Vercel deployment before promotion. On failed smoke test, use the authorized deployment rollback channel to restore that immutable deployment. Do not reset Firestore, delete observations/evidence/users, reverse indexes, reinitialize services or change rules. Newly created V2 observations use existing fields and PENDING lifecycle, so older consumers can still read them. A rollback must preserve both before/after evidence references and all newly created records.

A return to the baseline UI is an emergency rollback, not acceptance of legacy inside V2. Keep V2 migration work on this branch for repair and rerun the entire release gate before another promotion.

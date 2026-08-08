# Smart HSR Assignment V2 — Isolated Staging Deployment Runbook

This is a review plan, not deployment authorization. Production use is prohibited.

## Prerequisites

- separate written staging-change approval;
- non-Production Firebase project with no municipal data;
- exact project id and hostname recorded in the staging allowlists;
- named operator, reviewer, rollback owner, and change window;
- candidate and rollback hashes independently verified;
- V2 flag false;
- browser bundle and all local regression gates passing;
- demo seed reviewed for fake identifiers only.

## Firebase staging project requirements

The future project must be newly approved or an existing isolated staging project. It must not share Production Auth users, Firestore data, credentials, service accounts, storage, or billing-dependent services. Use least-privilege staging access and record its exact project id. This phase does not create that project.

## Hostname setup

Use one exact reviewed Preview hostname. Add no wildcard. The hostname and project id must match both the staging contract and Preview Environment Guard. TLS/DNS work requires separate infrastructure approval.

## Emulator validation

1. Keep `assignmentV2Enabled:false` in the example-derived config.
2. Start Firestore Emulator with a `demo-*` id.
3. Validate candidate and rollback hashes.
4. Load only the deterministic demo seed.
5. Run legacy baseline, candidate rules, bootstrap integration, and browser smoke suites.
6. Confirm 26/40 compatibility ALLOW and 14/40 fail-closed.

## Candidate rules validation

- compare packaged and root candidate hashes;
- confirm rollback hash targets current legacy rules;
- review all assignment, organization, role, and terminal-status conditions;
- verify no fallback catch-all permits writes;
- confirm package checklist is complete.

Do not deploy rules during preparation or emulator validation.

## Demo seed process

Use `staging/demo/assignment-v2-demo-seed.js` only. Before loading, assert every organization/user/observation/assignment id begins with `demo-`, no credential fields exist, and no external source is merged. Seed through an emulator-only helper or separately reviewed staging-only script. No seed script is provided here to avoid accidental remote writes.

## Future Preview deployment steps

After separate approval only:

1. Build the deterministic Preview bundle twice and record the matching hash.
2. Prepare runtime config from the example with exact approved values; keep V2 false.
3. Package `manager.html`, bundle, loader, and config without Production Firebase values.
4. Deploy only to the isolated staging hosting target.
5. Verify legacy-only page load before considering rules or flag activation.
6. If separately authorized, validate/deploy candidate rules to the exact staging project.
7. Enable the explicit Preview override for the controlled smoke session only.
8. Execute browser and Firestore acceptance tests.

## Smoke tests

- manager page and assignment UI load;
- legacy assignment remains default;
- explicit guard activation succeeds only on approved target;
- existing Firebase app is reused once;
- canonical create and replacement succeed atomically;
- one ACTIVE assignment remains;
- wrong contractor, cross-organization, COMPLETED, ambiguous, and invalid cases deny;
- bundle-load failure before activation preserves legacy;
- V2 denial never falls back;
- flag disable restores legacy.

## Acceptance criteria

- every required test passes with zero unexpected failures;
- bundle/candidate/rollback hashes match the reviewed record;
- no Production or real municipal identifier appears;
- network logs show only the approved staging project/host;
- V2 remains disabled outside the controlled smoke window;
- rollback drill completes within the change window.

## Rollback triggers

Use every stop condition in `STAGING-ROLLBACK-RECORD.md`. Disable the flag first, stop staging writes, restore reviewed staging artifacts/rules only with separate authorization, preserve assignment history, and document the incident.

## Production prohibition

Never substitute a Production project, hostname, Firebase configuration, Auth tenant, rule target, data export, storage bucket, or credential. This runbook grants no Production authority and contains no deploy authorization.

# Smart HSR Phase 1H — Isolated Staging Package Report

Date: 2026-08-06

Branch: `codex/smart-hsr-rules-test-harness`

Base commit: `eb111e7`

Status: package preparation only; no commit, push, merge, deploy, cloud resource, migration, external API, or Production connection

## Executive result

The Assignment V2 staging package is complete for review. It contains a fail-closed environment contract, disabled example configuration, byte-identical candidate rules copy and hash manifest, deterministic demo dataset, rollback record, runbook, and automated integrity/security tests.

Nothing has been deployed. No Firebase project or resource was created. V2 remains disabled by default.

**GO** for formal security/change review and selecting an isolated staging project/hostname.

**NO-GO** for actual staging deployment until the remaining prerequisites and separate deployment/rules approvals are satisfied. Production remains prohibited.

## Files created

| File | Purpose |
|---|---|
| `platform/staging/staging-environment-contract.js` | validates contract and all activation gates with structured decisions |
| `config/staging/assignment-v2-staging.example.js` | secret-free, demo-only, disabled example configuration |
| `staging/assignment-v2-rules/firestore.rules.phase-1c-candidate` | byte-identical packaged candidate rules |
| `staging/assignment-v2-rules/PACKAGE-MANIFEST.md` | validation checklist, hashes, preconditions, tests, rollback plan |
| `staging/demo/assignment-v2-demo-seed.js` | deterministic fake organization/users/observations/assignments |
| `STAGING-ROLLBACK-RECORD.md` | baseline, hashes, procedures, data expectations, stop conditions |
| `STAGING-DEPLOYMENT-RUNBOOK.md` | prerequisites through smoke/acceptance/rollback plan |
| `test/phase1h-staging-package.test.js` | gates, hashes, defaults, security, and fixture validation |
| `PHASE-1H-STAGING-PACKAGE-REPORT.md` | this report |

No application file was modified during Phase 1H. Earlier uncommitted Phase 1E–1G changes to `manager.html` remain intact. Production `firestore.rules` and Firebase configuration remain unchanged.

## Staging environment contract

Required fields:

```text
environmentName
firebaseProjectId
allowedProjectIds
allowedHostnames
emulatorOnly
assignmentV2Enabled
candidateRulesFile
candidateRulesHash
demoDataOnly
rollbackVersion
```

Activation also requires:

- structurally valid contract;
- explicit override;
- `assignmentV2Enabled === true`;
- `demoDataOnly === true`;
- exact hostname match;
- exact project id match in the project allowlist;
- exact candidate rules SHA-256 match.

Every missing, malformed, disabled, unknown, or mismatched condition returns a structured DENY decision with `environment:'staging'`.

## Configuration template

The example uses only deterministic fake values:

- project: `demo-smart-hsr-staging`;
- hostname: `preview-smart-hsr.test`;
- emulator-only: true;
- demo-data-only: true;
- Assignment V2: **false**.

It contains no API key, token, service account, credential, private key, email, Production id, or wildcard allowlist. Activation instructions are defined in the runbook; copying the file alone cannot enable V2.

## Candidate rules package

| Artifact | SHA-256 |
|---|---|
| packaged/root candidate rules | `3aa6bcdc6c4659f5f417bcec24fed6f3ec8cda3a724a789c39ad0634406c088a` |
| current legacy rollback rules | `2d36ab1ede72054e1b197a0126502cbbfc49f35e983c2aeeb8fa8d167e8784e7` |
| Preview browser bundle | `83214ea9929b6ecad4783f4dd8d75422fab90aa5d5005cecc7738132995f1299` |

The packaged candidate and root candidate are byte-for-byte identical. Production rules were not overwritten. The manifest intentionally contains no executable deploy command; a staging command must be constructed only during a separately approved change window after exact project/hash validation.

## Demo seed summary

- one fake organization;
- one manager;
- one supervisor;
- one inspector;
- two contractors;
- observations covering PENDING, IN_PROGRESS, PENDING_REVIEW, and COMPLETED;
- canonical ACTIVE assignment version 2;
- prior REPLACED assignment version 1;
- INACTIVE assignment;
- ambiguous legacy observation with incomplete provenance;
- invalid assignment/organization test shape.

All present identifiers begin with `demo-`. The intentionally invalid contractor id is empty to characterize a missing-id denial. There are no emails, credentials, real names, geographic data, municipal identifiers, or imported datasets.

## Activation decisions tested

| Scenario | Result |
|---|---|
| missing staging config | DENY |
| unknown hostname | DENY |
| unknown project id | DENY |
| Assignment V2 disabled | DENY |
| demoDataOnly false | DENY |
| rules hash mismatch | DENY |
| missing explicit override | DENY |
| valid reviewed staging contract | ALLOW |

Legacy remains the default in both the staging example and repository feature flag.

## Verification results

| Gate | Result |
|---|---|
| Phase 1H staging package tests | 15 passed, 0 failed |
| full Phase 1A–1H unit/policy regression | 136 passed, 0 failed |
| bundle hash verification | matched Phase 1G and rollback record |
| candidate rules root/package hash | exact match |
| legacy rollback hash | exact match |
| JavaScript syntax | passed |
| `git diff --check` | passed |

The previously verified browser and emulator results remain:

- browser smoke: 9/9;
- legacy emulator: 49 passed, 6 todo, 0 failed;
- candidate rules: 26/26;
- bootstrap/candidate integration: 3/3.

## Rollback package

`STAGING-ROLLBACK-RECORD.md` records:

- immutable baseline hashes;
- disable-request/flag-first procedure;
- reviewed manager artifact restoration approach;
- staging-only legacy-rules restoration plan;
- assignment-history preservation expectations;
- explicit stop conditions for target/hash/security/workflow/test failures.

No destructive data rollback or automatic deletion is authorized.

## Remaining prerequisites

1. Select or create an isolated non-Production Firebase staging project under separate infrastructure approval.
2. Confirm it shares no Auth, Firestore, Storage, credentials, data, or service account with Production.
3. Approve an exact Preview hostname and update allowlists through review.
4. Name operator, reviewer, rollback owner, and change window.
5. Record a staging rules version/rollback artifact.
6. Approve candidate rules deployment to staging separately.
7. Build the bundle twice and record the matching hash in the staging release manifest.
8. Deploy first with V2 false and validate legacy-only behavior.
9. Run emulator and hosted staging browser/network smoke tests with demo data only.
10. Complete and time the rollback drill.

## GO / NO-GO

- **GO:** package security review, staging-project selection, hostname review, and change-plan approval.
- **NO-GO:** actual staging deployment today because no approved staging project/host/change window/rules authorization exists.
- **NO-GO:** Production project, rules, data, credentials, deployment, migration, or default V2 activation.

# Smart HSR Assignment V2 — Staging Rollback Record

Status: prepared only; no deployment has occurred.

## Verified baseline

- Branch baseline: `eb111e7`
- Legacy emulator suite: 49 passed, 6 documented todo, 0 failed
- Assignment V2 default: disabled
- Legacy rules file: `firestore.rules`
- Legacy rules SHA-256: `2d36ab1ede72054e1b197a0126502cbbfc49f35e983c2aeeb8fa8d167e8784e7`
- Preview bundle SHA-256: `83214ea9929b6ecad4783f4dd8d75422fab90aa5d5005cecc7738132995f1299`
- Candidate rules SHA-256: `3aa6bcdc6c4659f5f417bcec24fed6f3ec8cda3a724a789c39ad0634406c088a`

## Files affected by a future staging change

- staging runtime configuration derived from `config/staging/assignment-v2-staging.example.js`;
- Preview bundle and explicit loader request;
- staging Firestore rules only, if separately approved;
- demo-only assignments and observation pointers created during smoke tests.

Production files, projects, and data are never part of this rollback record.

## Disable-flag procedure

1. Set the staging runtime `assignmentV2Enabled` and explicit feature override to false.
2. Remove `window.__SMART_HSR_PREVIEW_BUNDLE_REQUEST__` from the staging page bootstrap.
3. Reload the staging manager page and verify no Preview bundle activation.
4. Run the legacy assignment smoke test and confirm no canonical write occurs.

## Revert-manager procedure

If disabling the flag is insufficient, restore the reviewed pre-Preview `manager.html` artifact in staging only. Do not use workspace reset/clean operations. Verify the restored artifact hash from the staging release manifest, then rerun the legacy browser and emulator baselines.

## Rules rollback procedure

1. Stop all staging V2 tests and disable the flag.
2. Verify the target is the exact approved staging project; abort on any alias or mismatch.
3. Verify `firestore.rules` matches rollback SHA-256 `2d36ab1ede72054e1b197a0126502cbbfc49f35e983c2aeeb8fa8d167e8784e7`.
4. During a separately approved change window, construct the Firebase CLI rules command using the explicit staging project selector and reviewed legacy file.
5. Verify the active staging rules version and run read/write denial smoke tests.

No deployment command is embedded here to prevent accidental execution.

## Data rollback expectations

- Assignment documents are immutable history and should not be deleted automatically.
- Disable V2 before data review.
- Demo-only records may be removed later only through an independently reviewed, exact-id cleanup plan.
- Do not rewrite or infer ambiguous assignment provenance.
- Observation pointers created in a failed atomic transaction require no rollback; committed pointers must be reconciled with their matching assignment history.

## Stop conditions

Stop immediately if any condition occurs:

- target project/hostname is not the exact allowlisted staging value;
- any Production identifier, credential, or real municipal record appears;
- candidate or rollback hash differs;
- V2 activates without explicit override;
- a second Firebase app is initialized;
- two ACTIVE assignments exist for one observation;
- cross-organization or unauthorized write succeeds;
- COMPLETED observation changes unexpectedly;
- browser, emulator, or post-change smoke gate fails;
- rollback owner or verified rollback artifact is unavailable.

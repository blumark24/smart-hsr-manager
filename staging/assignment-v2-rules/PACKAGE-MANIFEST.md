# Assignment V2 Candidate Rules Package

This package is review-only and must not be deployed without separate approval.

- Candidate source: `../../firestore.rules.phase-1c-candidate`
- Packaged copy: `firestore.rules.phase-1c-candidate`
- Expected SHA-256: `3aa6bcdc6c4659f5f417bcec24fed6f3ec8cda3a724a789c39ad0634406c088a`
- Legacy rollback target: `../../firestore.rules`
- Rollback SHA-256: `2d36ab1ede72054e1b197a0126502cbbfc49f35e983c2aeeb8fa8d167e8784e7`

## Validation checklist

- [ ] Target project is exact approved staging/demo id.
- [ ] Production aliases and credentials are absent.
- [ ] Candidate file hash matches this manifest.
- [ ] Rollback file hash matches this manifest.
- [ ] V2 flag is false before any rules change.
- [ ] Emulator baseline and candidate suites pass.
- [ ] Demo-only seed is selected.
- [ ] Rollback owner and stop conditions are recorded.

## Preconditions and post-change tests

Follow `STAGING-DEPLOYMENT-RUNBOOK.md`. Required post-change smoke tests are legacy load, guarded V2 activation, assignment create, atomic replace, ownership denial, cross-organization denial, COMPLETED denial, bundle-load failure, and flag rollback.

## Rollback command plan

After separate approval and exact staging project verification, the operator would use Firebase CLI with the reviewed legacy rules file and explicit staging project selector. The command is intentionally not executable from this package; construct it during the approved change window after validating the rollback hash.

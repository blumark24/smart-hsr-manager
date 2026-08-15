# Smart HSR Stabilization Sprint 2

## Live Firebase acceptance blocker

No isolated non-production Firebase target is configured. The repository has no `.firebaserc`; the Inspector client identifies `smart-hsr-manager`; and the staging runbook states that the isolated staging project has not been created. Rules and indexes must not be deployed until an exact isolated Preview/Staging project id, credentials, and approval are supplied.

## Evidence cleanup contract

Uploads enter `PENDING` with a 24-hour expiry and become `FINALIZED` only after an atomic server-side check binds the same organization, owner, observation, and object key. A future privileged scheduler may query expired `PENDING` records, re-check that no observation references the key, delete the B2 object, and then mark the record `DELETED`. Scheduler creation and B2 deletion are deliberately deferred; finalized evidence must never be deleted by this cleanup.

## Dependency triage

`npm audit` reports 27 vulnerable packages: 1 critical, 8 high, and 18 moderate.

- Critical `tar@6.2.1` is reached only through dev dependency `firebase-tools`; it is not bundled into Vercel functions. Upgrade path: `firebase-tools@15.26.0` (major).
- High `brace-expansion`, `glob`, and `minimatch` are transitive CLI/build paths under `firebase-tools` (dev-only). The reported fixes are available through dependency/CLI upgrades.
- High `nanoid`, `picomatch`, and `postcss` are under Tailwind/PostCSS build tooling (dev-only). They do not process user-controlled CSS at runtime.
- High `undici@6.19.7` is under the dev dependency `firebase@10.14.1` used by emulator tests. The deployed API runtime uses `firebase-admin`, not this client package. The declared fix requires `firebase@12.17.1` (major).
- `firebase-admin` advisories are moderate in this audit; the declared fix is `firebase-admin@14.2.0` (major).

No broad major upgrade was made because it would expand scope across Firebase client, Admin SDK, emulator tooling, and Node engine compatibility. Perform those migrations in a dedicated dependency sprint with browser, emulator, auth, upload, and Preview regression coverage.

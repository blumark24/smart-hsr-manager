# Firestore Rules authorization tests

These tests run exclusively against the local Firestore Emulator. They use the
synthetic project ID `demo-smart-hsr-tests`, require no service account, and do
not read from or write to Firebase Production.

## Run locally

Prerequisites: Node.js 20 or newer and Java 11 or newer.

```bash
npm ci
npm run test:rules
```

The runner invokes Firebase CLI with the equivalent command:

```bash
firebase emulators:exec --project demo-smart-hsr-tests --only firestore "node --test test/firestore.rules.test.js"
```

The runner disables the CLI update check and redirects Firebase CLI preferences
to an operating-system temporary directory. It does not load service-account
environment variables, default cloud credentials, or a `.firebaserc`
production alias.

Tests marked `SECURITY GAP` are executable `todo` tests. They express the
desired deny decision but remain non-blocking while the current production
rules are unchanged. They must be converted to ordinary passing tests in the
separate rules-hardening change.

## Current harness result

Verified locally on 6 August 2026:

- 55 tests discovered.
- 49 passed.
- 6 executable security-gap tests reported as `todo`.
- 0 failed.

A zero exit code requires all non-todo authorization tests to pass.

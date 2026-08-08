# Smart HSR Phase 1G — Preview Browser Bundle and Smoke Test Report

Date: 2026-08-06

Branch: `codex/smart-hsr-rules-test-harness`

Base commit: `eb111e7`

Status: local only; no commit, push, merge, deploy, migration, cloud resource, or Production connection

## Executive result

A deterministic browser bundle now exposes the isolated Assignment V2 Preview bootstrap and compatibility gate. `manager.html` requests it only through an explicit runtime request. Normal loading remains legacy-only; a missing/failed bundle preserves legacy availability before activation. Once V2 is active, authorization denial never falls back to legacy.

The browser smoke harness passed all nine scenarios in the local in-app browser with no console warnings or errors. Candidate-rule integration also passed against the local Firestore Emulator.

**GO** for security review and preparation of an isolated staging deployment package.

**NO-GO** for deployment until a real approved staging Firebase app/configuration and Preview hostname are supplied and the same smoke suite runs in that staging environment. Production remains NO-GO.

## Files created or changed

| File | Purpose |
|---|---|
| `platform/browser/assignment-v2-preview-entry.js` | narrow browser global entry point |
| `platform/integration/preview-bundle-loader.mjs` | explicit-request dynamic loader; fail-safe legacy behavior |
| `platform/assignments/preview-compatibility-gate.js` | allows CANONICAL/LEGACY_COMPATIBLE and denies AMBIGUOUS/INVALID |
| `scripts/build-preview-assignment-bundle.js` | deterministic local dependency tracer/bundler |
| `preview-only/assignment-v2-preview.bundle.js` | generated Preview-only browser output |
| `manager.html` | imports loader and invokes it after the existing Firebase app is initialized |
| `test/browser/phase1g-preview-smoke.html` | local browser smoke UI |
| `test/browser/phase1g-preview-smoke.mjs` | nine browser scenarios with an in-memory Firebase-compatible adapter |
| `test/run-phase1g-browser-server.js` | localhost-only static smoke server |
| `test/phase1g-browser-bundle.test.js` | bundle surface, security, hash, and 40-fixture gate tests |
| `PHASE-1G-PREVIEW-BROWSER-BUNDLE-REPORT.md` | this report |

No other application file changed. Production rules, Firebase configuration, Auth, workflow labels/transitions, storage, maps, contractor flows, and protected pages remain unchanged.

## Bundle architecture

The build starts from `platform/browser/assignment-v2-preview-entry.js` and follows only static relative CommonJS imports. It bundles:

- Preview Environment Guard and allowlist;
- Assignment V2 Preview Bootstrap;
- Assignment V2 Gateway;
- canonical assignment transaction service and Firestore adapter;
- workflow, ownership, organization, role, resolver, decision, audit, and compatibility dependencies.

The generated runtime is a small in-browser module registry. It does not depend on Node globals or packages. Firebase app, Firestore instance, modular SDK functions, clock, and id factory remain explicit runtime inputs.

Output:

```text
preview-only/assignment-v2-preview.bundle.js
SHA-256: 83214ea9929b6ecad4783f4dd8d75422fab90aa5d5005cecc7738132995f1299
Size: 52,591 bytes
Source map: disabled
```

Two consecutive builds produced the identical SHA-256 hash and byte-for-byte output.

Static bundle checks confirm no Node API imports, source-map marker, credential fields, API key, or Production project id.

## Manager loading behavior

Resulting `manager.html` integration anchors:

- line 639: imports `preview-bundle-loader.mjs`;
- line 660: calls the loader after the existing app, Firestore, Auth, and persistence initialization;
- line 1156: the existing assignment call site consumes only `window.__SMART_HSR_ASSIGNMENT_V2_PREVIEW__`.

The loader does nothing unless:

```text
window.__SMART_HSR_PREVIEW_BUNDLE_REQUEST__.enabled === true
```

If explicitly requested, it loads only:

```text
/preview-only/assignment-v2-preview.bundle.js
```

It then requires the Phase 1F configuration and Firebase dependency globals. It does not accept a URL override and cannot load an arbitrary script.

Behavior:

- no request: no script load, no bootstrap, legacy path;
- load/input/guard failure before activation: no V2 global, legacy remains available;
- successful guard/bootstrap: V2 interface is exposed;
- V2 authorization denial: structured denial, no legacy fallback;
- disabling the explicit flag after activation: call site returns to legacy mode.

No duplicate Firebase initialization is possible because the bundle never imports/calls `initializeApp`, and the Phase 1F singleton rejects a different app.

## Demo/staging isolation

Activation still requires every Phase 1F guard condition:

- explicit Preview override;
- enabled flag while repository default remains false;
- localhost/127.0.0.1 or exact approved Preview hostname;
- `demo-*` project or exact staging allowlist entry;
- confirmed Emulator connection on localhost;
- supplied existing app whose project matches the approved project id.

The bundle contains neither Firebase configuration nor credentials. It cannot copy or fall back to the existing Production page configuration.

Local browser smoke used only an in-memory fake with `demo-smart-hsr-phase1g`. Firestore security integration used only the local emulator demo ids.

## Browser smoke results

Local URL:

```text
http://127.0.0.1:4173/test/browser/phase1g-preview-smoke.html
```

Result: **9 passed, 0 failed**, with no browser console errors or warnings.

| Scenario | Result |
|---|---|
| manager source loads and assignment UI remains present | PASS |
| normal page mode remains legacy-only with no V2 write | PASS |
| bundle load error preserves legacy before activation | PASS |
| explicit safe override loads bundle and reuses existing app/API once | PASS |
| valid assignment creation | PASS |
| valid replacement with one ACTIVE assignment | PASS |
| wrong contractor denied without fallback | PASS |
| cross-organization and COMPLETED observation denied | PASS |
| disabling override restores legacy | PASS |

The harness fetches `manager.html` as local source to verify its assignment UI/call-site presence without executing the page's existing Firebase configuration. All functional V2 browser scenarios run through the real generated bundle using a local in-memory Firestore-compatible adapter. Server and browser tabs were closed after verification.

## Candidate rules integration

The browser verifies loading/routing/runtime behavior without network access. Persistence and rule enforcement are independently tested through the same bootstrap/gateway/service path against `firestore.rules.phase-1c-candidate` under the Firestore Emulator.

Final candidate gates:

- Phase 1C rule matrix: **26 passed, 0 failed**;
- Phase 1F bootstrap → manager call site → gateway → transaction: **3 passed, 0 failed**.

Production `firestore.rules` was not overwritten or deployed.

## Compatibility gate

The browser bundle exposes `evaluatePreviewCompatibility()`.

| Classification | Count | Rate | Gate |
|---|---:|---:|---|
| CANONICAL | 11 | 27.5% | ALLOW |
| LEGACY_COMPATIBLE | 15 | 37.5% | ALLOW |
| AMBIGUOUS | 7 | 17.5% | DENY |
| INVALID | 7 | 17.5% | DENY |
| total | 40 | 100% | 26 ALLOW / 14 DENY |

Activation-compatible rate: **65%**. Fail-closed rate: **35%**. Ambiguous and invalid shapes cannot pass the bundle gate.

## Verification summary

| Gate | Result |
|---|---|
| deterministic build twice | identical hash |
| Phase 1A–1G unit/policy regression | 121 passed, 0 failed |
| focused bundle/Phase 1E/1F tests | 25 passed, 0 failed |
| real local browser smoke | 9 passed, 0 failed |
| legacy emulator baseline | 49 passed, 6 documented todo, 0 failed |
| candidate rule matrix | 26 passed, 0 failed |
| candidate bootstrap integration | 3 passed, 0 failed |
| syntax checks | passed |
| `git diff --check` | passed |

Firebase CLI emitted its standard unavailable MOTD/update warning in the restricted environment; all test projects were demo ids and all persistence traffic targeted the local emulator.

## Rollback

1. Remove or disable `window.__SMART_HSR_PREVIEW_BUNDLE_REQUEST__`.
2. Keep `PLATFORM_ASSIGNMENT_V2` false.
3. The bundle is not loaded and the manager assignment call site uses legacy behavior.
4. If load fails before activation, no action is required; legacy remains available.
5. Remove the Preview bundle artifact from the staging package if needed.
6. Do not delete canonical Preview assignment history.
7. Keep Production rules unchanged and rerun the legacy baseline.

## Exact Preview deployment prerequisites

1. Provision/approve a non-Production staging Firebase project separately; this phase created no cloud resource.
2. Add only its project id to the reviewed staging allowlist if it differs from the placeholder allowlist entry.
3. Create the existing staging Firebase app outside the bundle and connect its Firestore instance before bootstrap.
4. Serve from an exact approved Preview hostname.
5. Deploy candidate rules only to staging after separate authorization and record their rollback version.
6. First load with V2 flag false and prove legacy behavior.
7. Enable explicit Preview request/override only for the staging smoke session.
8. Run the same nine browser scenarios plus candidate-rule emulator/staging tests.
9. Confirm no Production project/config appears in built assets or network logs.

## GO / NO-GO

- **GO:** security review and assembly of an isolated staging package.
- **NO-GO:** staging deployment until the staging Firebase project, hostname, candidate-rule authorization, and rollback record exist.
- **NO-GO:** Production deployment, Production rules, Production data migration, or default feature activation.

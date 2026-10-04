# SMART HSR Lands — Staging Release Manifest

Status: **STAGING-READY / NOT DEPLOYED**

This manifest freezes the reviewed Lands payload for staging validation. It does **not** authorize Production deployment.

## Release identity

- Repository: `blumark24/smart-hsr-manager`
- Branch: `design/lands-system-polish-v2`
- Reviewed payload commit: `937ea3eaa6447a51a5c020620ea76f4d707b206e`
- Approved staging Firebase project: `smart-hsr-staging-blumark24`
- Production: **PROHIBITED**
- `main`: **UNCHANGED**
- Authentication/RBAC model: **UNCHANGED**

## Frozen payload

| File | Git blob SHA |
|---|---|
| `firestore.rules` | `98730bbbdbc2ed130cd1eee32d6c7d1a1835b1d2` |
| `storage.rules` | `eebc4c473013c845b8d15417c3f0a5364ab371d9` |
| `firebase.json` | `ca75b7ec6532c49fcb18f480cd578a83fe3dde17` |
| `lands/index.html` | `5eb8cb84e37a81a466cd06b34115da14625c6cfe` |
| `package.json` | `6643855721e27777cf4b4bd41344152e44a46d11` |
| `test/lands-rules-candidate.test.js` | `91c5cf548dbd4098cbc1f8ec2b845f5810935dc1` |
| `test/lands-shell-ui.test.js` | `89e02508f052081dd328d821e8bd814b34c2e6e5` |

Any mismatch is a release stop condition and requires re-running the complete gate.

## Verified gates

- Firestore + Storage emulator gate: **67/67 PASS**
- Lands application regression: **59/59 PASS**
- Total: **126/126 PASS, 0 FAIL**
- Browser-client consequential Firestore updates/deletes: denied
- Storage browser overwrite/delete: denied
- Tenant boundary: municipality-scoped
- Audit visibility: reviewer-scoped
- User administration: municipal-manager scoped
- Preview fallback login: same-origin
- GIS: verified geometry only; no fabricated parcel locations

## Staging deployment prerequisites

Before any remote Firebase rules change:

1. Use an authenticated operator session that is explicitly authorized for `smart-hsr-staging-blumark24`.
2. Confirm the active Firebase project ID immediately before deployment.
3. Confirm no Production project, bucket, Auth tenant, or municipal dataset is selected.
4. Record the currently active staging Firestore and Storage rules versions for rollback.
5. Confirm a rollback owner is available during the change window.
6. Deploy **rules only**; do not deploy Hosting, Functions, Auth, indexes, or data as part of this gate.
7. Run post-deploy UAT for u5 and u8 before any freeze/merge decision.

## Post-deploy acceptance

Required after staging rules deployment:

- u5: Login → SSO → Membership → Lands board
- u8: Login → SSO → Membership → Lands board
- correct role and allowed sections
- unrelated sections denied
- no 409
- no 5xx
- no Auth/Origin errors
- no cross-municipality access
- document upload enforces allowed MIME and size
- Global/Decision/Parcel GIS states remain truthful when geometry is absent

Stop immediately on any P0/P1, 409, 5xx, Auth/Origin issue, target-project mismatch, or cross-tenant access.

## Rollback

If any post-deploy gate fails:

1. Stop UAT writes.
2. Restore the exact staging Firestore and Storage rules versions recorded before deployment.
3. Re-run membership, tenant-isolation, and document-denial smoke tests.
4. Preserve logs and evidence.
5. Do not attempt Production deployment.

## Current infrastructure note

The latest Vercel attempts for the newest release SHA were blocked by account build-rate-limit, not application build errors. A prior Preview from this branch is READY and showed no recent 4xx/5xx runtime errors during the inspected window. Firebase staging rules remain **not remotely deployed** by this manifest.

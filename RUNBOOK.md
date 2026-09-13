# SMART HSR — Operations Runbook

Non-destructive operational reference for Preview/Staging. No step here was executed against
Production as part of Phase 09 — this document describes procedure, it does not perform any
destructive action.

## 1. Backup strategy

- **Firestore**: use `gcloud firestore export gs://<backup-bucket>/<timestamp>` (managed
  export, works while the database is live, no downtime). Schedule daily for Staging, and at
  minimum daily for Production once live with real municipal data. Retain at least 30 days
  of exports before rotation.
- **Firebase Auth**: user records are recreatable from `auth.exportUsers`/`importUsers` if
  ever needed, but the source of truth for role/entitlement is Firestore (`users/`,
  `managers/`, `landsMunicipalities/*/userAccess/`), not Auth custom claims — back up
  Firestore first.
- **Evidence objects** (Backblaze B2 / S3-compatible, `api/storage/*`): rely on the bucket
  provider's own versioning/retention; this repo does not implement object backup itself.
  Confirm bucket versioning is enabled before Production go-live.
- **Lands Storage** (Firebase Storage, `landsMunicipalities/*/documents/*`): covered by
  Firebase Storage's own object versioning if enabled at the bucket level; confirm before
  go-live.

## 2. Restore procedure

1. Identify the export timestamp to restore from.
2. `gcloud firestore import gs://<backup-bucket>/<timestamp>` into a **new** or explicitly
   cleared project/database — never import over a live database with newer data without a
   deliberate, communicated decision, since import is a merge that can reintroduce
   already-superseded documents.
3. After import, run each repo's own regression suite against the restored project
   (`npm run test:release` for Manager, `npm test` + the emulator suite for Lands, `npm test`
   for Owner) to confirm Rules and data shape are consistent before resuming traffic.
4. Re-verify multi-tenant isolation (Gate 7) against the restored data using at least one
   real tenant's credentials in a read-only spot check — never a synthetic/fake municipality
   in Production.

## 3. Who can execute

Restore into Production must be executed only by whoever holds the Firebase project's Owner
IAM role for that project (Google Cloud IAM, not this app's own `owners/{uid}` Firestore
role) — that is the credential that can run `gcloud firestore import`. This is a deliberate
narrow blast radius: the app-level Owner Console role has no restore capability at all.

## 4. Post-restore verification checklist

- [ ] Regression suites green on all three repos against the restored project
- [ ] Spot-check one real tenant's dashboard loads with correct, non-stale counts
- [ ] Spot-check the Lands SSO handoff still issues and consumes a code correctly
- [ ] Confirm Firestore indexes (`firestore.indexes.json`) are deployed/building on the
      restored project — an import does not carry index definitions
- [ ] Confirm no suspended tenant appears reactivated by the restore (check `status` fields
      against the last known-good state)

## 5. Rollback implications of a restore

A Firestore import is not atomic with a code rollback. If a restore is needed because of a
bad data write (not a bad deploy), the running code can usually stay as-is — only the data
changes. If a restore is needed together with a code rollback (a bad deploy caused bad
writes), do the code rollback first (see ROLLBACK.md), then the data restore, so the
restored data isn't immediately re-corrupted by code that's still misbehaving.

## 6. Auth and storage considerations

- Firebase Auth accounts are not affected by a Firestore restore — a disabled/enabled state
  set via `auth.updateUser` persists independently. After a Firestore restore, reconcile any
  account that was disabled/enabled between the backup timestamp and now.
- Evidence objects (B2/S3, Firebase Storage) are addressed by opaque keys stored in
  Firestore documents (`imageObjectKey`, `storage_path`, etc.) — restoring Firestore without
  also confirming the referenced objects still exist in the bucket can leave dangling
  references. Spot-check a sample of restored documents' object keys resolve after any
  restore.

## 7. Observability (Gate 11)

Current, real state of the codebase (not a target to build toward):
- Every trusted server API (`api/_lib/landsBridge.js`, `api/storage/read.js`,
  `api/admin/*.js`) fails closed with a structured `{ ok:false, reason }` /
  `{ code, message }` shape on every error path — no endpoint throws an unhandled exception
  into a generic 500 with a stack trace exposed to the client.
- Server-side `console.error` calls log a sanitized shape (e.g. `error.name` only, or a
  purpose-built `safeStorageFailure()`/similar sanitizer) — not the raw error object, so a
  logged line cannot leak a token, password, or other secret even if one were present in an
  underlying error message.
- The Lands SSO handoff and trusted-mutation bridge never log the handoff code or the
  forwarded ID token; only structured reason codes (`lands_bridge_unreachable`,
  `LANDS_SSO_HANDOFF_EXPIRED`, etc.) are surfaced.
- No new observability platform, log aggregator, or metrics pipeline was introduced — none
  was justified by anything measured in Gate 10, and the task's own instruction is not to add
  infrastructure without a measured need.
- Gap acknowledged: there is no centralized log aggregation across the three repos today —
  each is whatever the hosting platform (Vercel/Cloud Functions) captures natively. This is
  adequate for the current scale (one real tenant, Al-Qunfudhah) and is not a release
  blocker; revisit if/when a second real municipality onboards.

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

## 8. Controlled onboarding sequence (Phase 10, Al-Qunfudhah)

Per the explicit Phase 10 instruction, do NOT bulk-create the municipality's full ~200-person
staff roster at once. Onboard in three small, verifiable waves instead:

1. **Wave 1 — institutional core (≤5 accounts).** One رئيس البلدية (President), one المشرف
   العام (General Supervisor), one رئيس قسم (Section Head) per the first section going live,
   one موظف (Employee) in that section, and — only if Lands or Mobility is in this first
   wave — one مقاول (Contractor) or one Mobility role. Confirm every login, every role
   boundary, and one full real workflow end to end (e.g. one real field observation, or one
   real mission) before adding anyone else.
2. **Wave 2 — first full section/department (≤20 accounts).** Add the remaining staff of the
   ONE section/department exercised in Wave 1. Confirm normal daily use for a few real
   working days before expanding further.
3. **Wave 3 — controlled expansion.** Add additional sections/departments in similarly-sized
   batches, only after the previous wave has run cleanly with no unresolved defect.

Never create an account for a person who has not been confirmed as a real employee of
بلدية القنفذة by the municipality's own institutional authority. Never fabricate or
pre-guess a roster.

## 9. Representative first-user list template

For Wave 1, the municipality (not this engineering team) provides the real name, role, and
section for each account. Do not invent names. Use this shape when requesting it:

| Role | Section/Department | Full name (from municipality) | Email | Notes |
|---|---|---|---|---|
| رئيس البلدية | — | | | |
| المشرف العام | — | | | Confirm whether they hold a standing delegation or only ad hoc ones |
| رئيس القسم | (first section) | | | |
| الموظف | (first section) | | | |
| المقاول / Mobility role | (if in scope for Wave 1) | | | |

## 10. Account activation procedure

1. An authorized Manager (or, for the very first Manager account, whoever holds Owner Console
   access for بلدية القنفذة) creates the account through the existing User Center flow
   (`api/admin/users.js` / `api/admin/employees.js`) — never a direct Firestore write, so the
   account is created with a correct role, organization, and (for Mobility) explicit
   `vehicleEligible` setting from the start.
2. The new user receives their temporary password through a channel the municipality
   controls (never sent by this engineering team over an insecure channel); `mustChangePassword`
   is set, so first sign-in forces a real password change.
3. Confirm the account can sign in and lands on the correct product/dashboard for its role
   before considering the account "activated."
4. Record the activation in the municipality's own onboarding tracker (outside this repo) —
   this repo's own audit trail (`adminAuditEvents`) already records the creation event
   itself.

## 11. Support / escalation procedure

- **First line**: the municipality's own designated internal point of contact (typically the
  رئيس البلدية's office or IT liaison) triages user-reported issues.
- **Second line (engineering)**: escalate to this engineering team only for issues that look
  like a genuine defect (wrong data, a denied action that should be allowed, an error page) —
  not for password resets or role questions, which the Manager's own User Center already
  handles.
- **Security incident** (suspected account compromise, suspected cross-tenant data exposure,
  suspected unauthorized access): escalate immediately, out of band from routine support,
  to whoever holds rollback authority (below) — do not wait for a scheduled check-in.

## 12. Backup/restore owner and incident contact path

- **Backup/restore owner**: whoever holds the Firebase project's Owner IAM role (see Runbook
  §3) — name this specific person/role before go-live; this document intentionally does not
  hard-code an individual's name.
- **Rollback authority**: the same person/role as backup/restore owner, OR an explicitly
  named engineering lead with deploy access to all three repos' hosting platforms
  (Vercel for Manager/Lands, Firebase Hosting/Cloud Functions for Owner). Name this before
  go-live.
- **Incident contact path**: municipality liaison → engineering on-call → (for a Firestore
  Rules or data-integrity incident specifically) whoever holds rollback authority. Keep this
  path short — three hops at most — since every hop adds latency during a live incident.

## 13. Environment checklist (before any Production step)

- [ ] Rollback authority and backup/restore owner are named, real people/roles (not blank)
- [ ] Production Firebase project's env vars (Gate 8 table in `RELEASE-CANDIDATE.md`) are
      set and confirmed present — never copied from Staging by assumption
- [ ] Firestore indexes (`firestore.indexes.json`) are deployed and finished building on the
      Production project before any traffic relies on them
- [ ] Firestore Rules deployed match exactly the release-candidate SHA's `firestore.rules` —
      diff them against the repo before deploying, never deploy from memory
- [ ] Backup export is scheduled and has run at least once successfully before real data enters
      the system
- [ ] Wave 1's accounts (§9) are the ONLY accounts that exist at go-live — no bulk import

## 14. Final Production deployment checklist

- [ ] Every mandatory Phase 10 gate is PASS or has only ACCEPTED LIMITATION / MANUAL
      FOLLOW-UP items, per `RELEASE-CANDIDATE.md`'s Go/No-Go review
- [ ] §13's environment checklist is fully checked
- [ ] A named person has given **explicit** Production deployment approval — this document,
      Phase 10 passing, and every automated check passing are NOT themselves that approval
- [ ] Deploy Manager, Lands, and Owner from the exact release-candidate SHAs recorded in
      `RELEASE-CANDIDATE.md` — never from an uncommitted or locally-modified working tree
- [ ] Immediately after deploy: sign in as one real Wave 1 account and confirm the correct
      dashboard loads, before considering the deployment complete
- [ ] Keep the rollback SHAs (`ROLLBACK.md`) and the rollback authority's contact on hand for
      the first 24 hours after go-live

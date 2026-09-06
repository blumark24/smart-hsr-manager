# Global Evidence Authentication & Delivery Closure

## Scope

Platform-wide private evidence delivery for Inspector, Manager, and Contractor. No UI, Firestore workflow, public-bucket, or role-authority change is included.

## Confirmed root cause

The shared authenticated fetch already attached a Firebase bearer token. Inspector forwarded the `forceRefresh` argument, but the Manager and Contractor callbacks discarded it. After a 401, their retry could therefore reuse the same expired token. Rendering also had no shared in-flight request deduplication, which matches the repeated 401 burst observed in Vercel runtime logs.

The previous deployment returned only a generic 401, so those logs cannot distinguish an expired/invalid token from an Admin/client project mismatch. The closure adds safe server error codes and explicit audience/issuer project validation so the next live test can make that distinction without logging credentials.

## Closure

- Every viewer passes the Firebase `User` to `storage-adapter.js`; the adapter centrally calls `getIdToken(false)` and, once only after 401, `getIdToken(true)`.
- A second 401 stops after exactly two HTTP requests and returns an explicit reauthentication outcome.
- Concurrent and repeated resolution of the same evidence reference is deduplicated and successful blob URLs are cached per user and object key.
- `imageObjectKey` remains the canonical write field. Read authorization retains `imagePath`, `imageUrl`, `beforeImagePath`, `afterImagePath`, and `afterImageUrl` compatibility.
- Firebase token `aud` and `iss` must agree and must match the initialized Admin project before `verifyIdToken` is called.
- The reader emits only: `AUTH_HEADER_MISSING`, `AUTH_TOKEN_INVALID`, `AUTH_TOKEN_EXPIRED`, `AUTH_PROJECT_MISMATCH`, `AUTH_ORGANIZATION_DENIED`, `EVIDENCE_NOT_FOUND`, or `B2_READ_FAILED` for evidence/auth failures.

## Vercel verification

The client code consistently uses Firebase project `smart-hsr-manager`. The actual Preview and Production environment values are not exposed by the available project metadata and must be checked by name/scope before live retest:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT`
- `GOOGLE_APPLICATION_CREDENTIALS` (only if application-default credentials are intentionally used)
- `GCLOUD_PROJECT`
- `GOOGLE_CLOUD_PROJECT`
- `B2_KEY_ID`
- `B2_APPLICATION_KEY`
- `B2_BUCKET_NAME`
- `B2_S3_ENDPOINT`
- `B2_REGION`
- `B2_FILE_PREFIX`

For Firebase, the effective Admin project/service-account `project_id` must equal `smart-hsr-manager` in each Vercel scope. No secret value should be copied into logs or this report.

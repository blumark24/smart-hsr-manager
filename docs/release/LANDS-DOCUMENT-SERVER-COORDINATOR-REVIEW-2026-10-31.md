# SMART HSR — Isolated Lands Document Coordinator Review

**Decision: DRAFT / NO-GO / NOT WIRED TO LIVE API.**

Source branch is stacked on Draft PR #105, not the frozen municipal Release Candidate PR #103. The coordinator is an isolated server-side design with dependency-injected adapters and synthetic tests. It is not imported into Vercel APIs, Firebase, live clients, Admin or Production.

## Implemented contract

- begin: verify an opaque credential via a trusted host adapter; atomically validate tenant-scoped parent, reserve an idempotency request key, create pending metadata and append a typed audit.
- finish: check tenant, active role, actor and revision BEFORE Storage inspection; independently inspect and hash the exact attempt object OUTSIDE Firestore transaction; revalidate revision within a Firestore transaction to finalize ready and append audit atomically.
- fail: reject unknown failure reasons, transactionally mark failed and append audit.
- retry: bounded to three attempts, new server-derived object key on each attempt, revision CAS and typed audit.
- status: role/actor/tenant filtered public fields; no object path, person identifier, signed URL, token or generation disclosure.

## New isolated Firestore adapter (source-level only)

The working branch now includes `embedded-lands/server/document-firestore-store.js`, a concrete Admin Firestore **transaction adapter not imported by any production API**. It binds each path to the verified municipality, uses a nested actor/request key to avoid concatenation collisions, reads the **current** enabled Lands membership and exact role INSIDE every transaction, reserves the upload request using a Firestore `create` precondition, and creates pending metadata and the typed audit record in the same transaction. Finalization and failure updates require an existing document path and a fresh membership read.

The adapter is covered by `test/lands-document-firestore-store.test.js`, using a copy-on-write transaction fake that enforces Firestore's read-before-write rule, duplicate create checks and rollback on audit failure. These tests still do **not** prove production IAM, actual Firebase rule deployment, live Storage, emulator-level concurrency, or an HTTP upload.

## New isolated Storage object verifier (no upload or release activation)

The branch also now includes `embedded-lands/server/document-gcs-inspector.js` with a trusted, dependency-injected Google Cloud Storage bucket: it checks a canonical tenant-specific attempt object path, pins the exact object generation, downloads those bytes, confirms the metadata size and actual PDF/JPEG/PNG magic signature, hashes bytes with SHA-256, and returns only the minimal proof expected by the coordinator. Provider errors are sanitized and the bucket itself is never chosen by an HTTP caller. The byte verifier is covered by `test/lands-document-gcs-inspector.test.js` with synthetic provider doubles for corrupted content, MIME mismatch, generation mismatch, cross-tenant paths, size limit and failures.

**Saudi region gate (candidate design, not release):** the GCS inspector now reads the **actual bucket metadata** and refuses to access document object bytes unless `location = ME-CENTRAL2` (Dammam) and `locationType = REGION`. It fails closed when the location cannot be verified, is outside KSA, or is a multi-region bucket. Source-level synthetic tests cover incorrect region/missing metadata/unknown type, provider failure, and case variants. Cloud Firestore region is not evidence for a Storage bucket's region. Access to Google Cloud's Dammam region for KSA billing addresses is subject to CNTXT purchase requirements: https://docs.cloud.google.com/docs/dammam-region-access . This guard does not prove cross-region access/logging/backup policies, data classification or official municipal authorization.

This still requires security/data-controller approval of the actual Storage bucket and residency, Firebase project identity, signed upload issuance and application roles. It does not create files, enable uploads, replace existing versions, or import any module into a live API. Real GCS emulator and Staging integration remain outstanding.

## Required production adapters — NOT included

1. Verified Firebase Admin identity and current tenant/role membership. No direct client-supplied UID, tenant or role.
2. Firestore transactional repository with atomic request idempotency uniqueness, parent relationship checks, revision CAS and trusted actor-sourced audit. A fresh membership/account/tenant check must also be performed inside EACH Firestore transaction, particularly after inspecting Storage bytes, to deny a permission-revocation race. A transaction callback may retry; never call Storage inside it.
3. Server-only Storage adapter which inspects a pinned immutable object generation, independently hashes actual file bytes, verifies MIME and length, and returns trustworthy proof. Never accept a browser-supplied proof.
4. Approved short-lived single-object upload allocation constrained to tenant, actor, record, size, format and attempt, with rate limits and replay handling. No Firebase Admin secrets in the browser.
5. Versioned replacement retaining the old good object on failure, read/download generation pinning, expired pending reconciler, cleanup and retention/legal-hold policy.
6. Security and municipal data-owner review of staging project access, document sensitivity, storage region, PDPL processing, NCA applicability and safe synthetic UAT.

This prototype does NOT change the legacy metadata-first client upload, fix the embedded documentStorage:null replacement handler, modify real security rules, or make file replacement work. It is an isolated step toward those outcomes. A successful test run does NOT close P1 issue #57.

## Required negative acceptance

Missing parent, unauthorized actor, disabled user, cross-tenant records, same request replay/conflicting file, interrupted upload, missing or tampered object, wrong MIME/generation, audit rollback, stale revision, competing fail/finalize, retry limit, and storage-success/Firestore-failure recovery. Existing policy tests and a synthetic failure-injection reproduction are included.

**Release Candidate PR #103 remains unchanged. No Production or Vercel publishing changes are part of this review.** The only `vercel.json` change sets Git auto-deploy to **false for this exact review branch**, with CI comparing all other Vercel settings against the base commit. No runtime routing or secret setting is changed.

## OCI Saudi S3 Object Storage candidate (not activated, 31 Oct 2026)

This isolated prototype adds `document-oci-inspector.js` with **no runtime route**. Operator-pinned `me-jeddah-1` or `me-riyadh-1` and namespace-specific OCI S3 endpoint MUST be backed by a **signed OCI Native bucket control-plane adapter** verifying the same region, private access and **Enabled** versioning. This is a required trusted host integration, **not yet implemented**. The inspector refuses an unknown/non-Saudi region or mismatched attestation before object reads, independently verifies SHA-256, byte signature and size against the pinned OCI `VersionId`. ETag is not an integrity proof and OCI `VersionId` must not be confused with GCS numeric generation.

The isolated document lifecycle now records GCS numeric `storage_generation` and OCI `storage_version_id` separately, along with `storage_provider`; it remains behind server-owned verification and unconnected to Vercel, Firebase or any municipal data. Tests use only synthetic in-memory provider doubles. OCI purchases, account eligibility, region subscription, IAM policies, bucket ACL/private status, signed URLs and object provenance, retention, a secure upload API, backup locations, billing, owner/sign-off and live UAT **remain pending**. OCI Always Free lacks production SLA. No Production or runtime integration changes and no deployment authorization. Official references: https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/s3compatibleapi.htm and https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usingversioning.htm

## OCI SDK v3 / normalized storage proof interface (31 Oct 2026)

Official OCI documentation explicitly supports the dedicated S3 path-style URL `https://<namespace>.compat.objectstorage.<region>.oci.customer-oci.com`. The existing inspector URI matches it, so no endpoint change was made. Reference: https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/s3compatibleapi.htm .

The standalone `document-oci-s3-sdk-adapter.js` now normalizes AWS SDK v3 PascalCase response fields (`VersionId`, `ContentType`, `ContentLength`, `Body`) into the inspector's explicit internal contract. GET requests are always pinned to the exact HEAD `VersionId`; SDK errors are sanitized. End-to-end adapter+inspector tests use injected AWS SDK command fakes and real synthetic PDF bytes, without credentials, provider network, or billed objects.

**Still absent:** a real authenticated OCI S3Client factory with independently verified endpoint/region, and actual Native OCI GetBucket adapter. OCI Native GetBucket's Bucket representation includes `namespace`, `name`, `versioning`, `publicAccessType` but does *not* expose a universal standalone `region` field: a real signed control-plane adapter must attest region via a trusted, fixed regional OCI endpoint/client invocation and cannot fabricate residency from request JSON. Source https://docs.oracle.com/en-us/iaas/tools/typescript/latest/modules/_objectstorage_lib_model_bucket_.bucket.html . These API adapters are not wired to the HTTP runtime, and neither municipal data nor live buckets have been touched.

**Review warning:** the current prototype's SDK-version fields are now mapped properly, but cloud IAM, bucket region, retention, costs, genuine object version read, audit and full E2E remain OPEN. No deploy/merge.

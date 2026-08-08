# Smart HSR — Sprint 4 StorageAdapter Foundation

## Executive decision

**GO for isolated contract adoption and further emulator/local development. NO-GO for application integration, cloud activation, migration, or deletion lifecycle.** The foundation is provider-neutral, private-by-contract, tenant-scoped, and fully local. Current production behavior and every protected file remain unchanged.

Expected ROI: a single evidence boundary removes repeated provider-specific logic from future call sites, reduces tenant-leak and public-URL risk, and makes R2/S3/SCCC/MinIO evaluation reversible. Value is realized only after a later, separately approved integration and migration phase.

## 1. Current evidence architecture audit

### Browser adapter and local demo

- `storage-adapter.js:1-10` defines IndexedDB storage, `local-demo://`, a 700 KiB image cap, and JPEG/PNG/WebP.
- `storage-adapter.js:53-59` derives organization, user, and role context; `61-76` parses local references.
- `storage-adapter.js:78-119` identifies private server object keys and resolves them through authenticated `/api/storage/read`, returning a temporary blob URL rather than a bucket URL.
- `storage-adapter.js:121-163` stores institution connector metadata locally. Non-demo connectors remain server-required and inactive.
- `storage-adapter.js:165-193` uploads inspector/contractor demo evidence to tenant-scoped IndexedDB, computes SHA-256, and returns `local-demo://...`. The asset id is time/UUID based, not canonical.
- `storage-adapter.js:195-221` resolves local demo, private server keys, and legacy `https://`/`data:image` references. Direct HTTPS acceptance is a privacy/tenant ambiguity and is therefore fail-closed by the new classifier.
- `storage-adapter.js:223-257` revokes blob URLs and supports owner-only deletion/clearing for local demo records. No active server-side delete endpoint exists.
- `storage-adapter.js:259-266` describes future server connector endpoints but does not implement them.

### Inspector dashboard

- Import: `dashboard.html:2789`.
- Reference rendering: `dashboard.html:2938`, `3229-3242`, `3508-3529`, `3646-3655`, `3785-3788`.
- Client validation/compression: `dashboard.html:3089-3135`; a canvas-generated image is bounded by the 700 KiB cap.
- Private API fallback upload: `dashboard.html:3167-3213`; adapter selection: `3215-3221`.
- BEFORE creation: upload at `dashboard.html:4254-4255`, persisted as `imagePath` at `4278` with `afterImagePath` initialized at `4287`.
- AFTER creation: upload and persistence at `dashboard.html:4504-4520`.
- User-facing storage error mapping is at `dashboard.html:4718-4734`.

### Contractor mobile map

- Import and adapter wrapper: `mobile-map.html:709`, `1236-1245`.
- Observation evidence mapping: `mobile-map.html:1129-1131`.
- Reference resolution/rendering: `mobile-map.html:1478-1491`, `1577-1599`.
- AFTER validation/compression/upload and write flow: `mobile-map.html:1420-1460`, `1635-1730`; `afterImagePath` is written at `1721`.
- Canvas compression and 700 KiB rejection: `mobile-map.html:1857-1880`.

### Manager view

- Import: `manager.html:636`.
- Evidence mapping and resolution: `manager.html:1420-1421`, `1474-1501`.
- Before/after presentation: `manager.html:2043-2087`.
- Manager is currently a reader of these evidence paths; no manager evidence upload was found.

### Server-side private B2 path

- Upload limits/types/scopes: `api/storage/upload.js:27-38`.
- MIME magic-byte gate and key construction: `api/storage/upload.js:53-64`, `76-119`.
- Inspector/tenant context is server-derived from `users/{uid}`: `api/storage/upload.js:128-136`.
- Structural image validation occurs before B2 upload: `api/storage/upload.js:236-258`, implemented by `api/_lib/imageValidation.js:221-237`.
- Private B2 configuration/write: `api/storage/upload.js:163-205`, handler write at `260-284`.
- Read-side key safety and role resolution: `api/storage/read.js:41-89`.
- Tenant ownership is proved by matching an observation's evidence field within the viewer organization: `api/storage/read.js:94-103`; permitted fields are `imagePath`, `afterImagePath`, and `imageObjectKey` at `28`.
- Private streaming and safe errors: `api/storage/read.js:127-188`. No permanent/public or signed bucket URL is returned.
- Provider bootstrap is duplicated between `api/storage/upload.js:163-190` and `api/_lib/b2Client.js`; this is high coupling and should be removed only in a later integration phase.

### Verified reference shapes

| Shape | Current handling | Sprint 4 classification |
|---|---|---|
| Private B2 object key | Authenticated proxy | `LEGACY_COMPATIBLE` |
| `local-demo://org/asset` | Tenant-scoped IndexedDB | `LEGACY_COMPATIBLE` |
| `data:image/...` | Rendered directly | `LEGACY_COMPATIBLE`, migration required |
| Arbitrary `https://` | Rendered directly | `AMBIGUOUS`, fail closed |
| Firebase `gs://`/Storage URL | No active evidence call site verified; only Firebase `storageBucket` config exists | `AMBIGUOUS`, fail closed |
| Canonical portable key | Not integrated | `CANONICAL` |

## 2. Isolated contract

Created under `platform/storage/`:

- `storage-adapter-contract.js`: validates `uploadEvidence`, `resolveEvidence`, `deleteEvidence`, `createThumbnail`, `getMetadata`, and `healthCheck`; standardizes structured results.
- `evidence-policy.js`: declares `BEFORE`, `AFTER`, `THUMBNAIL`, `AI_REPORT`, and `GENERATED_REPORT`; enforces current image MIME/size/private requirements. AI/generated reports are reserved and explicitly denied until a real policy exists.
- `object-key-policy.js`: creates deterministic canonical keys:
  `organizations/{org}/observations/{obs}/{type}/{sha256}`.
- `legacy-storage-compatibility.js`: deterministic four-state classifier.
- `in-memory-storage-adapter.js`: test-only implementation with no network, URL, credential, persistence, or image transformation.

Upload input:

```text
organizationId, observationId, evidenceType, file, actorId,
contentType, correlationId
```

Standard result:

```text
ok, provider, objectKey, contentType, size, checksum, metadata,
errorCode? and reason?
```

Tenant security is exact organization **and** observation scope. Raw filenames never form keys. Traversal, protocol references, public URLs, unsupported MIME, empty bytes, oversized files, and reserved unsupported evidence behavior fail closed.

## 3. Evidence policy

- Maximum image size: 716,800 bytes, matching current client/API behavior.
- MIME: JPEG, PNG, WebP only for active image evidence.
- Checksum: SHA-256; canonical in-memory keys are content-addressed and deterministic.
- Access: private only. The contract never returns a public URL.
- Filename: normalized metadata only; never authoritative or path-bearing.
- EXIF: production adapters must strip GPS/device metadata before upload. This sprint performs no image processing.
- Audit: future integrations must record actor, tenant, observation, evidence type, correlation id, outcome, provider, key, size, and checksum—never bytes, secrets, tokens, or raw provider errors.
- Retention: must be institution/provider configured before production lifecycle or deletion is activated. Current value is deliberately `not-configured`.
- Deletion: tenant and observation scoped. Production authorization, legal hold, retention, and audit checks remain a blocker.

## 4. Provider decision records

| Provider | Fit | Key security requirements | Portability / risk | Decision |
|---|---|---|---|---|
| Current private Backblaze B2 | Existing S3 API and authenticated proxy | Server-only credentials, private bucket, tenant proof, no raw provider errors | Medium coupling due duplicated client/bootstrap and legacy key shape | Keep as legacy provider; wrap later |
| Cloudflare R2 | S3-compatible, low egress profile | Private bucket, server-side signing/proxy, per-tenant key policy | Low/medium adapter effort; operational vendor dependency | Candidate, not activated |
| Generic S3-compatible | Broad portability | Endpoint allowlist, TLS, private ACL, scoped credentials, checksum validation | Best interchangeability; dialect differences need conformance tests | Preferred baseline protocol |
| SCCC | Government cloud alignment depends on approved service/interface | Saudi data residency, government IAM, audit export, SLA, encryption/KMS | Contract/API unknown; procurement and security validation required | Research gate; no invented adapter |
| Institution MinIO/S3 | Institution-controlled deployment and residency | TLS, credential rotation, private policy, backups, capacity/HA, tenant isolation | High sovereignty; institution carries operations burden | Supported target after conformance |

Provider selection must not alter canonical keys, decision/error codes, tenant checks, or audit shape.

## 5. Tests and results

New suite: `test/sprint4-storage-adapter.test.js`.

- Sprint 4: **17 passed, 0 failed, 0 skipped/todo**.
- Combined isolated policy/unit regression: **153 passed, 0 failed, 0 skipped/todo**.
- Covered: contract completeness, deterministic normalized key, traversal denial, filename normalization, MIME/size denial, reserved types, SHA-256, upload/resolve/metadata/delete, tenant and observation isolation, public URL denial, legacy classification, Firebase ambiguity, explicit thumbnail unavailability, and network-free health check.
- No test opens a network socket or reads Production data.

## 6. Migration strategy (design only)

1. Inventory fixture/exported metadata only; classify every reference without fetching image bytes.
2. Block `AMBIGUOUS` and `INVALID`; obtain tenant ownership evidence and explicit mapping before any copy.
3. Introduce a read-only compatibility resolver behind a disabled feature flag.
4. Add one provider adapter with emulator/local contract tests and provider conformance tests.
5. Copy—not move—evidence into canonical private keys; verify MIME, structural validity, size, SHA-256, tenant, and observation.
6. Dual-read with canonical preference; never silent fallback after an authorization denial.
7. Reconcile counts/checksums and retain immutable audit records.
8. Switch writes for one Preview call site only after candidate rules/API authorization agree.
9. Decommission legacy references only after retention/legal approval and a separately approved deletion plan.

Rollback at every stage: disable the new feature flag and keep legacy references/objects untouched. This sprint creates no flag or integration.

## 7. Blockers and next phase

Major blockers:

1. No production authorization/integration boundary yet binds StorageAdapter operations to existing workflow policies.
2. Current HTTPS/data references do not prove privacy, ownership, or provider provenance.
3. No server delete API, legal-hold model, retention decision, or immutable evidence audit sink.
4. Canonical keys omit file extensions by design; a future proxy must trust stored validated metadata, not extensions. Candidate provider conformance is required.
5. Browser compression does not document EXIF removal guarantees.
6. Firebase Storage is configured in page bootstrap but no active evidence storage call was verified; migration assumptions would be unsafe.
7. B2 bootstrap duplication increases configuration drift risk.

Recommended next phase: **Sprint 5 — StorageAdapter authorization and conformance design**, still disabled and Preview/local only. Bind workflow/ownership decisions to adapter commands, define provider conformance fixtures, audit events, retention/legal-hold decisions, and a read-only legacy resolver. Do not integrate uploads until this gate passes.

## 8. Safety confirmation

- No image was read, transformed, moved, uploaded, deleted, or rewritten.
- No Firebase/Production connection, application external API call, cloud resource, deployment, commit, push, or merge occurred.
- The local Firebase CLI attempted its standard MOTD/remote-config lookup while starting the emulator; it failed without authentication. The demo project id forced non-emulated services to fail, and no Production service or data was contacted.
- No dependency was installed.
- No protected file or existing `storage-adapter.js` behavior was changed.
- Existing pre-Sprint workspace changes remain preserved and were not cleaned/reset.

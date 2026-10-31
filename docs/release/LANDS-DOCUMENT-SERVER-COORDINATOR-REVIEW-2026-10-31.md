# SMART HSR — Isolated Lands Document Coordinator Review

**Decision: DRAFT / NO-GO / NOT WIRED TO LIVE API.**

Source branch is stacked on Draft PR #105, not the frozen municipal Release Candidate PR #103. The coordinator is an isolated server-side design with dependency-injected adapters and synthetic tests. It is not imported into Vercel APIs, Firebase, live clients, Admin or Production.

## Implemented contract

- begin: verify an opaque credential via a trusted host adapter; atomically validate tenant-scoped parent, reserve an idempotency request key, create pending metadata and append a typed audit.
- finish: check tenant, active role, actor and revision BEFORE Storage inspection; independently inspect and hash the exact attempt object OUTSIDE Firestore transaction; revalidate revision within a Firestore transaction to finalize ready and append audit atomically.
- fail: reject unknown failure reasons, transactionally mark failed and append audit.
- retry: bounded to three attempts, new server-derived object key on each attempt, revision CAS and typed audit.
- status: role/actor/tenant filtered public fields; no object path, person identifier, signed URL, token or generation disclosure.

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

**Release Candidate PR #103 remains unchanged. No Production or Vercel publishing changes are part of this review.**

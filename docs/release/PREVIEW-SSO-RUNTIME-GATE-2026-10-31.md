# SMART HSR — Live Preview Lands SSO gate diagnosis, 2026-10-31

**Decision:** **NO-GO** for credentialed Lands UAT and municipal handover on the newest approved-code Preview until a separately authorized Vercel Preview environment alignment and retest. This is a runtime/configuration deployment finding, NOT a verified authentication bypass, and NOT a claim that all Manager APIs are unavailable.

## Verified, read-only browser observations

Candidate Manager Preview: `dpl_4g53dwvUHzFvrpCsmWmYQxiNkuDn` / exact Git SHA `74d35cc091f07e23bf3d5c029e165075fc0ee22e`, branch `fix/lands-executive-header-profile-ai-safe-20261031`, deployment **READY**, target **Preview**, URL https://smart-hsr-manager-k2e5jx9cw-blumark24-os.vercel.app.

- GET `/api/organization/context?previewGate=lands-sso` returned the **public, sanitized** result: `service=lands-sso`, `ready=false`, checks `preview=true`, `webStaging=true`, `adminStaging=true`, **`embedded=false`**.
- GET `/api/lands-health` returned `service=smart-hsr-lands-embedded, status=ok`. This proves **route and handler dispatch**, NOT credentialed or mutation readiness.
- Anonymous GET `/api/organization/context` returned `error=unauthenticated`; no organization data visible.
- Anonymous GETs to four guarded endpoints `/api/lands-membership-status`, `/api/lands-mutations`, `/api/lands-sso-register`, `/api/lands-sso-consume` each returned `error=staging_lands_sso_gate_not_ready`. The fail-closed block is behaving as intended.
- Earlier comparable Manager Preview `dpl_BrkDsMkDST19cuwQYboWJQzkLLEo`, branch `integration/lands-shell-ai-preview-20261031`, SHA `aee4250acbe76aebdb1b0a96fff6dda74cee25cc`, **READY**, responded `ready=true` with **all four flags true** on the same public diagnostics endpoint. This is not the latest code; do not promote it to avoid configuration review.

**Independent Vercel project metadata:** read-only environment variable enumeration, **without decrypting or displaying values**, found `LANDS_EMBEDDED_RUNTIME` configured for **specific Preview Git branches**, including `integration/lands-shell-ai-preview-20261031`, but not for `fix/lands-executive-header-profile-ai-safe-20261031` or its ancestor candidate branch `test/preview-same-origin-api-gate-20261031`. It did not show a general unscoped Preview target for the key. This configuration scoping explains the observed difference between the two live endpoints; it does not authorize silently enabling a protected embedded service.

The separate `smart-hsr-staging-api` project continues to show **CANCELED** deployments, with connected-agent 403 permissions to create its Preview deployment or read its runtime logs (see issue #97). However, Manager Preview's **same-origin read-only health and config handler respond** independently of that standalone deployment.

## How to close safely (authorized operator + independent reviewer)

1. Obtain the authorized Vercel project administrator and independent security/data-controller reviewer approval for **Preview branch-specific** `LANDS_EMBEDDED_RUNTIME` alignment. This enables protected embedded operations, so treat as a security-significant release decision, not a cosmetic toggle. Do not change Production or global Preview settings.
2. Verify the candidate's staging Firebase frontend and admin projects are the intended isolated non-production project (the sanitized endpoint currently reports both true). Verify no municipal personal data or production Firebase identity is used.
3. Align **only the nominated immutable-release-candidate Preview Git branch** to the reviewed staging embedded runtime configuration using authorized deployment controls, while preserving server enforcement, SSO one-time code consumption, RBAC and Firestore Rules. Do **not** turn off the fail-closed branch gate or make the health endpoint grant access.
4. Redeploy a new **Preview only**, pin its exact Git SHA and Vercel deployment ID, then run the scripted anonymous preflight on that URL:
   `node scripts/preview-lands-sso-live-preflight.cjs https://smart-hsr-manager-<hash>-blumark24-os.vercel.app`
   or the workflow's manual `preview_url` input. The script sends **no credentials/cookies**, rejects Production/custom hosts, records only sanitized public fields, and exits nonzero for **NO-GO**.
5. A green preflight is **only permission to start authorized credentialed Staging UAT**, NOT proof of login or tenancy: test U1/U2 tab isolation, U5 single-use SSO and replay denial, disabled/unscoped/cross-tenant negative paths, profile identity synchronization, and exact SHA/role; collect redacted evidence.
6. Municipal handover/Production remain **NO-GO** until all governance manifest gates and independent PDPL/NCA/security/municipal approvals close.

**Do not modify:** `main`, Production, Firebase accounts/claims, rules/roles, secrets, municipal/real data, external AI providers or multi-tenant access scopes. The preflight script and CI added to the sibling Draft PR do not mutate these.

## Traceability

- [Original integrated Draft PR #96](https://github.com/blumark24/smart-hsr-manager/pull/96)
- [Header/Profile/Assistant Draft PR #100](https://github.com/blumark24/smart-hsr-manager/pull/100)
- [Security UAT issue #73](https://github.com/blumark24/smart-hsr-manager/issues/73)
- [Release acceptance issue #75](https://github.com/blumark24/smart-hsr-manager/issues/75)
- [Governance issue #92](https://github.com/blumark24/smart-hsr-manager/issues/92)
- [Standalone Stage API issue #97](https://github.com/blumark24/smart-hsr-manager/issues/97)

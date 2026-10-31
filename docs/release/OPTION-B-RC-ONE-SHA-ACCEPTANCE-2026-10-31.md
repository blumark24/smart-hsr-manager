# SMART HSR — Option B: one-SHA Preview Release Candidate

**Release status: NO-GO for municipal handover and Production.**

## Why this release candidate exists
PR #93, #94, #95, #96, #98, #99, #100, #101 and #102 formed a chain of focused improvements and tests, but successful independent branch CI does not establish the composed system's correctness. This branch `release-candidate/option-b-one-sha-preview-20261031` was created from **exact tested PR #102 SHA `cd891f5cff4b685468cf9eacee552e665d29bac4`** and adds **only** this evidence and a new combined Preview-only CI workflow. The **current HEAD** must be read from GitHub/CI at execution time; do not confuse the parent SHA with the final candidate SHA.

Base for review is **Draft PR #93** on `integration/lands-shell-ai-preview-20261031` SHA `aee4250acbe76aebdb1b0a96fff6dda74cee25cc`, not `main`. Any eventual merge/promotion requires separate authorization.

## Five-stage acceptance gates

| Gate | Scope tested automatically on this exact SHA | Independent evidence still required for GO |
| --- | --- | --- |
| 1 Identity, security & SSO | Synthetic workforce tab isolation; same-origin Preview API routes; negative unauthenticated request; fail-closed preview gate (no credentials) | Authorized non-production U1/U2/U5 login, replay denial, cross-tenant/RBAC negative tests, independent security review |
| 2 Manager/Lands header, theme & profile | Approved executive-shell DOM, municipality branding/clock/weather, Day/Night profile contrast and interactions, Chromium desktop/iPad-size/mobile local fixtures | Real protected Preview browser visual approval; physical iPad/mobile QA; Manager-to-Lands pixel-comparison and verified workforce label sync |
| 3 Land grants & documents | Canonical 5-axis completeness, digital file, GIS, document error/refresh distinction and synthetic regressions | Typed legal documentary evidence requirements, broken upload metadata integrity fix, authorized staging failure injection, masking per verified role |
| 4 Field Survey & movement | Field honest nonfabricated unavailable-case KPI regression plus retained legacy mobility code | Authoritative visual-distortion case lifecycle, marker/twin consistency, contractor before/after, mobility approval/handover/return, authorized end-to-end UAT |
| 5 Release, AI & governance | Deterministic read-only local assistant, role/session privacy scrub and evidence manifest fail-closed validator | PDPL transfer/privacy impact and data-controller review, NCA ECC/CCC applicability, AI governance, independent signatures, production change and rollback approvals |

### Confirmed deployment blocker (not automatically resolved by CI)
On the live exact PR #102 preview, the anonymous `/api/lands-health` responded OK, and unauthenticated organization context denied correctly. But the **sanitized release diagnostic** `/api/organization/context?previewGate=lands-sso` returned **`ready:false`** because `embedded:false` on the new branch. Read-only Vercel metadata shows `LANDS_EMBEDDED_RUNTIME` was limited to older named Preview branches. [Issue #73](https://github.com/blumark24/smart-hsr-manager/issues/73) and [Draft PR #101](https://github.com/blumark24/smart-hsr-manager/pull/101) describe the precise review boundary. Do **not** silently change this security-significant environment option. Authorized Vercel/security owner must approve branch-scoped non-production alignment, verify staging contains only permitted synthetic identities/data, redeploy Preview at frozen SHA, run anonymous 4/4 gate, and **only then** run credentialed UAT. The separate staging API project still has canceled deployments and independent 403 privileges blocker [#97](https://github.com/blumark24/smart-hsr-manager/issues/97).

### Machine tests are not an authorization to deploy
- The new combined CI must report the merged regression tests **and** independent headless Chromium test on the same HEAD.
- Chromium local `http://127.0.0.1/lands/?review=1` is **fixture-only**, protected from Firebase, external AI and API calls. It cannot be activated on hosted Preview or Production; it is **not** an authenticated SaaS test.
- `docs/release/municipal-acceptance-2026-10-31.json` is inherited from governance PR #94 and pins an **earlier historic SHA**: do not misapply it to this RC. The existing 13 HOLD gates and four missing independent signoffs remain. A new separately signed, SHA-frozen evidence manifest is needed for municipal release.
- No Production, Firebase permissions, tenant roles, real data, Vercel secrets or global environment configuration are changed here.
- Hard decision: **GO for source-only and local fixture evaluation if CI PASS. NO-GO for actual municipal acceptance, credentialed staging UAT and Production** until independently evidenced.

## Links
- Integrated [PR #96](https://github.com/blumark24/smart-hsr-manager/pull/96)
- Lands document feedback [PR #98](https://github.com/blumark24/smart-hsr-manager/pull/98)
- Same-origin API security [PR #99](https://github.com/blumark24/smart-hsr-manager/pull/99)
- Manager parity + assistant [PR #100](https://github.com/blumark24/smart-hsr-manager/pull/100)
- Live SSO diagnosis [PR #101](https://github.com/blumark24/smart-hsr-manager/pull/101)
- Real local Chromium [PR #102](https://github.com/blumark24/smart-hsr-manager/pull/102)
- Security gate [#73](https://github.com/blumark24/smart-hsr-manager/issues/73)
- Municipality acceptance [#75](https://github.com/blumark24/smart-hsr-manager/issues/75)
- Privacy/security governance [#92](https://github.com/blumark24/smart-hsr-manager/issues/92)

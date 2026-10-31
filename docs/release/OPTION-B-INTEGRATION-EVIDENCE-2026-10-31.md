# SMART HSR — Option B integration: staged evidence & acceptance plan

**Status: NO-GO for municipal Production / government handover.** Prepared as an isolated **Preview-only** candidate under the user's 2026-10-31 mandate. This is not a signed legal, cybersecurity or municipal finding.

## Provenance and no-surprise scope

- Parent: [Draft PR #93](https://github.com/blumark24/smart-hsr-manager/pull/93), commit `aee4250acbe76aebdb1b0a96fff6dda74cee25cc`. PR #93 itself descends from the pinned [Lands parity PR #88](https://github.com/blumark24/smart-hsr-manager/pull/88), commit `11edb272ca8637cfd8667f9854eb399930d82da3`.
- Carry forward **unchanged** the governance five file changes from [Draft PR #94](https://github.com/blumark24/smart-hsr-manager/pull/94), SHA `07b631fab70521e83aa1287db5c797d7301e6a54`, and the Field three file changes from [Draft PR #95](https://github.com/blumark24/smart-hsr-manager/pull/95), SHA `ebcc81dd6b316f02ba0dadc80afd278f8fd64aa0`. The integration-only workflow plus this document are additional.
- Verify the integration HEAD at the time of each Preview build; this document cannot embed its own final commit SHA. A `READY` badge does not replace HEAD/Preview SHA equality.
- **Important:** `docs/release/municipal-acceptance-2026-10-31.json` inherited from PR #94 pins the **historical PR #88 baseline**, not this integrated SHA. Before final release assessment, create a separately reviewed final candidate evidence record against a frozen, distinct Git SHA; never treat that earlier manifest as sign-off for integration.
- **Production is out of scope.** No changes to `main`, the official domain, Firebase users or identities, tenant mappings, RBAC, Firestore/Storage rules, secrets, real municipal datasets, model-provider integration, or Vercel project/global settings.

## Five phases — current implementation vs acceptance gap

| Phase | Implemented in this integrated candidate | Outstanding independent gate |
| --- | --- | --- |
| 1 Security, PDPL, SDAIA, NCA | Legacy preview-only Auth/SSO contract code and synthetic tests + fail-closed 13-gate checklist; no provider changes | Credentialed U1/U2 tab isolation and U5 single-use SSO/replay; deny out-of-tenant & role escalation; read-only real provider-region audit, data classification, transfers, retention, PIA applicability and NCA ECC/CCC mapping |
| 2 Manager executive UI | Carries PR #93's parent Manager shell, weather and identity code, and existing CSS | Visual live acceptance in Manager before propagating to other surfaces: one weather display, approved SMART HSR logo, identity/municipality, RTL right rail, soft Day/Night, Desktop/iPad/Mobile |
| 3 User Center & Lands | PR #93 shell + deterministic, read-only Lands assistant; canonical five-axis parity; existing User Center protections | Authenticated UID/tenant sync and stale-response denial; one synthetic grant Manager↔Lands equality; masking role-by-role; required document policy; document upload interruption recovery |
| 4 Field Survey | PR #95's honest unavailable case KPI state, **not** a connected observations dashboard | Define tenant-scoped **single visual distortion case source**, separate from general incidents; click-through KPIs; recorded→assigned→work→verified→closed timeline; same record and marker in table/SMART HSR MAPS/TWIN; signed contractor assignment and before/after image swipe/lightbox; use only synthetic Stage data |
| 5 Mobility + final UAT | Existing mobility and field code is unchanged by this integration; test suite may prove only static contracts | Role-aware vehicle request/authorization/hand-over/return; AI human oversight and accurate deterministic assistant label; full regression and negative UAT on **one exact integration SHA**, rollback, independent signoffs |

### Known residual P1 / risk items, never auto-close by CI

1. **Field data not wired:** the Manager/Department experience previously showed fake zeros because the observations feed was absent; PR #95 replaces case counters with `—`, but this remains missing feature functionality. Live employee counts are not equivalent to visual-distortion case counts.
2. **Lands evidence:** the trusted `land_grant.approve` path checks canonical five-axis business data + official grant number, but typed document sufficiency is a separate policy. Do not infer approval from `100%` data completeness.
3. **Uploads:** `lands/client/lands-client.js` writes document metadata before `uploadBytes`, so interruption may leave orphan metadata; require a synthetic interruption test and compensating or status-aware workflow before GO.
4. **AI:** the Lands assistant is deterministic/read-only. Do not market it as an external LLM or send citizen data to one until the privacy/data-owner review authorizes that.
5. **Deployment:** do not mistake Vercel Manager Preview `READY` for Staging API deployment readiness or for authorized UAT. Earlier separate Staging API builds were canceled; diagnose against the **new exact SHA**.
6. **Regulatory:** the observed Vercel `iad1` region is a review trigger, not evidence by itself that personal data was transferred unlawfully. Confirm all processors, regions, cloud logs and backup paths with authorized administrators.

## Evidence decision rules

- **CI PASS** supports source invariants and synthetic unit regressions only.
- **Preview READY + SHA parity** supports build identity only.
- **Credentialed Staging UAT PASS** requires masked logs, test user/role IDs, exact tested SHA, expected negative results and independent reviewer.
- **GO** is possible only when the 13 gate entries are each independently evidenced, the four approvals from designated reviewers are recorded, real data and independent security/privacy obligations are cleared, and a separate written Production release authorization exists.
- If any gate lacks independent evidence: **NO-GO**. Do not turn unknown data into success.

## Tracking
- [Owner findings #75](https://github.com/blumark24/smart-hsr-manager/issues/75)
- [Security and SSO #73](https://github.com/blumark24/smart-hsr-manager/issues/73)
- [Governance and SDAIA/PDPL #92](https://github.com/blumark24/smart-hsr-manager/issues/92)
- [Integrated Lands review #93](https://github.com/blumark24/smart-hsr-manager/pull/93)

This document intentionally requests no action on Production and does not represent approval on behalf of a municipality, SDAIA or NCA.

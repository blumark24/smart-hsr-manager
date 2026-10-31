# SMART HSR — Municipal Release & SDAIA/PDPL Evidence Gate

**Decision: NO-GO for municipality Production acceptance as of 2026-10-31.** This document is an internal evidence checklist, not an official SDAIA approval, privacy certification or finding of legal violation.

## Source of truth and boundaries

- Repository: `blumark24/smart-hsr-manager`. Candidate baseline (Draft PR #88): `11edb272ca8637cfd8667f9854eb399930d82da3`. **No automatic merge of other drafts.**
- Vercel Preview `dpl_7nTqbD31wFMNRjWH4Q2daS35GwNz` READY / exact SHA. Focused Lands parity tests 17/17 PASS and Lands SSO environment preflight 4/4 PASS. These do **not** establish live authorization, role-scoped UAT or general readiness.
- Production on `smart.blumark24.com` remains `dpl_2CvDF5CmcGrYvWooah8gu6hF1LnX` / `c07ec531de800a405e2d168e97c3dc492a622bdc`; do not touch its aliases, Firebase users, municipal records, secrets, or RBAC.
- Vercel compute region `iad1` was observed; this alone **does not establish** actual Firestore/Auth/Storage locations, personal-data transfers, noncompliance or lawfulness. Verify end-to-end data flow with infrastructure owners.
- Keep real municipality/citizen identity, orders, beneficiary documents and live prompts outside external AI providers until classification and documented authorization.

## Five-stage controlled delivery

| Stage | Delivery scope | Exit evidence |
| --- | --- | --- |
| 1. Security + governance | Session isolation, tenant/RBAC negative tests; SSO replay; data inventory, transfer mapping, PDPL and NCA applicability; AI ethics and PIA | Signed classification, regional diagram, screenshots/test logs, independent security and privacy reviews |
| 2. Manager first | Approved SMART HSR navy/green logo, executive header, weather once, RTL sidebar, calm Day/Night, desktop/iPad/mobile | Visual acceptance on an exact SHA with device matrix; no redesign regression |
| 3. Identity + Lands | User Center stable refresh and UID/tenant sync; five-axis grant parity; right rail, responsive modals; mask restricted data | Authenticated role-scoped acceptance with synthetic Stage records |
| 4. Field Survey | One visual distortion case registry separate from general incidents; lifecycle observed→assigned→in work→verified→closed; operational table, map, twin and before/after | Real endpoint contract confirmed; synthetic case same status on every surface, no automatic AI approval |
| 5. Mobility + final acceptance | Head vs employee capabilities; vehicle eligibility vs actual driving permission; field/lands/mobility regression and controlled AI | Full exact-SHA tests; negative UAT, rollback exercise, separate GO/NO-GO record |

## Regulatory evidence ownership

Record each processing activity's purpose, subjects, controller/processor roles, lawful basis, sensitivity, retention/deletion, access, logging and subcontractors. Verify applicable PDPL provisions, the conditions and exceptions of Article 29 and the Regulations on Transfers outside the Kingdom; do not assume a blanket prohibition or blanket permission. Determine whether a Privacy Impact Assessment is required. Evaluate applicability of the NCA Essential and Cloud Cybersecurity Controls with the municipality's cybersecurity team. Run the SDAIA AI Ethics Assessment as applicable: transparency, human oversight, accuracy, explainability, fairness and accountability. Legal/compliance sign-off belongs to competent reviewers.

**Evidence inventory (safe synthetic only):**
1. Firebase Auth/Firestore/Storage configured regions; Cloud functions/Vercel compute/edge region and telemetry; support access; logs; backup/retention; external processors; any cross-border access — independently inspect settings, never paste secrets or live user data here.
2. Role-based matrix for Manager/Head/Employee with negative out-of-tenant, disabled user, single-use SSO/replay and multi-tab tests — document masked identifiers only.
3. Synthetic business record reconciled between Lands and Manager including independent docs/GIS completeness and minimal exposed identity.
4. Field visual-distortion case lifecycle and public incident separation with consistent map/twin state; no silent AI closure.
5. Device/interaction regression and explicit rollback SHA; no Production release before written authorization.

## Existing evidence vs unknown

**Already evidenced:** PR #88 static Lands parity tests 17/17; Vercel Preview READY on exact pinned SHA; stage SSO configuration 4/4; anonymous method smoke on that preview. These are **preflight**, not credentialed UAT.

**Not evidenced:** current U1/U2 identity across browser tabs; U5 SSO replay denial; real municipal role masking; comprehensive UI acceptance; real data-region and subprocessors; PDPL lawful basis; independent NCA/PIA/AI ethics findings; production release signatures.

## Rules for merging and release

- `docs/release/municipal-acceptance-2026-10-31.json` is a **self-attested release checklist**: its validator never independently proves a linked test. A PASS needs human reviewer + verified evidence.
- Do not merge Draft PRs #74/#76/#77/#78/#88/#89/#91 blindly or conflate changes on diverged branches. Fix only confirmed P0/P1 in a scoped branch; test it in protected Staging Preview.
- No Production or municipality-auth mutation is authorized by this checklist. A separate explicit deployment and legal/security data-owner approval are mandatory.
- Outcome is **NO-GO** until every gate is evidenced, individually reviewed and all four sign-offs are recorded.

## Primary tracking and official references

- Technical: [security #73](https://github.com/blumark24/smart-hsr-manager/issues/73), [owner acceptance #75](https://github.com/blumark24/smart-hsr-manager/issues/75), [data & AI release gate #92](https://github.com/blumark24/smart-hsr-manager/issues/92), [parity PR #88](https://github.com/blumark24/smart-hsr-manager/pull/88).
- SDAIA: [PDPL](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPL), [data transfers](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/RegulationonPersonalDataTransferOutsidetheKingdom), [Privacy Impact Assessment](https://dgp.sdaia.gov.sa/wps/portal/pdp/services/PrivacyImpactAssessment), [AI Ethics Assessment](https://dgp.sdaia.gov.sa/wps/portal/pdp/services/AIEthicsAssessment).
- NCA: [ECC](https://nca.gov.sa/ar/regulatory-documents/controls-list/ecc/), [CCC](https://nca.gov.sa/ar/regulatory-documents/controls-list/ccc/).

**Next evidence acquisition:** inspect real provider regions with an authorized, read-only admin; execute protected credentialed Staging UAT; then independent review, never infer compliance from a READY badge.

# SMART HSR — Independent Cybersecurity Review Handoff

**Issued:** 2026-11-01 · **Repository:** blumark24/smart-hsr-manager · **Decision:** HOLD / NO-GO

هذه حزمة إحالة فنية للمراجعة المستقلة، وليست شهادة امتثال أو نتيجة اختبار اختراق أو إذن نشر. لا تحتوي على مفاتيح أو بيانات بلدية حقيقية.

## 1. Technical baseline and limitations

- Production read-only reference: https://smart.blumark24.com — commit c07ec531de800a405e2d168e97c3dc492a622bdc.
- Last **tested** Draft baseline before this document: cc580b21083ba84b174b26fb172ac6aba5ef13ed, protected no-auto-deploy branch fix/owner-upgrade-ledger-no-deploy-20261101, PR #113.
- At that SHA: integrated cross-product and Chromium 4/4 jobs SUCCESS, Preview isolation and emulator 3/3 SUCCESS, CodeQL execution 1/1 SUCCESS. A green scan is NOT zero SARIF findings. New documentary commits require fresh exact-SHA checks.
- Baseline 001: 32 earned / 35 assessed / 65 not evaluated of 100 **evidence** points, not percentage of implemented functionality. 13 acceptance gates HOLD and four authorizations not signed.
- NO merge, Production, domain-alias changes, data migrations, password resets, live Firebase/B2 municipal data, or hosted Preview UAT without security authorization.

Primary evidence: [P0 security #73](https://github.com/blumark24/smart-hsr-manager/issues/73), [CodeQL #116](https://github.com/blumark24/smart-hsr-manager/issues/116), [audit #118](https://github.com/blumark24/smart-hsr-manager/issues/118), [Draft PR #113](https://github.com/blumark24/smart-hsr-manager/pull/113).

## 2. Independent security review gates

| Gate | Independent reviewer must verify | Reject or HOLD if |
| --- | --- | --- |
| G1 Firebase | Effective Preview/Production Web and Admin projects, service principals, least-privilege IAM, Auth, Firestore and Storage regions, no cross-project reachability, and ADC/default-app paths | Any unverified IAM, resource, region or cross-tenant boundary |
| G2 B2 | Effective private Preview/Production bucket IDs, active application key scopes including delete capabilities, endpoint and region, document lifecycle/retention, and data-transfer assessment | Any unverified credentials, cross-bucket access, data location or orphan-document control |
| G3 Professional signoff | Independent dated APPROVE or HOLD on P0/P1 risk register, CodeQL, dependencies, applicable PDPL and NCA controls and evidence | Reviewer is author/AI; unsupported assurance or material risk remains |
| G4 Protected UAT | **Only after G1–G3 APPROVE plus release authorization:** deploy one immutable Preview SHA; synthetic Owner, Manager, U1–U8, Field, Lands, Mobility, GIS/Twin and AI tests; disaster restore/rollback | Missing signed acceptance, wrong SHA, cross-tenant access or failed material tests |

Evidence for every finding: gate ID; time (UTC); environment; verified principal or bucket identifier **without credentials**; test/attestation artifact ID; positive and negative tests; independent reviewer; risk level; approve/hold outcome. Redact PII, access keys, tokens and log payloads.

## 3. Current observed facts vs unverified dependencies

1. Declared staging Firebase project is smart-hsr-staging-blumark24; Production is smart-hsr-manager. The Draft includes fail-closed checks for mismatched Auth domain, Storage bucket, service-account email and project ID. **This is not verification of actual cloud IAM.**
2. Prior provider read-only records show separate B2 buckets smart-hsr-staging-evidence and smart-hsr-manager-blumark24 in US us-east-005. Assess real document classifications and permitted transfer conditions; do not assert automatic legality or illegality.
3. A non-decrypted Vercel environment-variable inventory showed Preview Firebase/B2 variables, but no entries for SMART_HSR_PREVIEW_B2_BUCKET_NAME and SMART_HSR_PRODUCTION_B2_BUCKET_NAME. The Preview storage gate is intentionally fail-closed until these values and effective key scope are independently reviewed. Do not insert guesses.
4. CodeQL triage #116 reported **17 actual SARIF findings across 5 rules** at prior scanned SHA. The first-party missing-origin-check concerns generated support.js and an identical public runtime asset, both accepting __dc_theme / __dc_probe window messages. The generated file declares itself built from dc-runtime/src/*.ts, but the expected source files and build manifest were **not found at inspected repository paths**. Recover authoritative original source, establish legitimate parent/iframe origin/source contract, rebuild deterministically and retest before patching generated output. Third-party Cesium worker requires its own upstream review.
5. Synthetic success is not hosted authenticated UAT: reconcile real U1–U8 staging identities and manager role/UID/tenant resolution only after G1–G3. Do not create/reset Production credentials for testing.

Unverified: effective service accounts and cloud regions; Backblaze key permissions/retention; cross-border data processing basis; independent review signatures; current Code Scanning alert-level dispositions; live UAT; rollback and approved RPO/RTO.

## 4. Required security acceptance matrix

**Identity and session:** Owner vs Manager vs department heads vs employees, invalid/disabled tokens, revocation, cross-tab session separation, logout and replay-resistant Lands SSO.

**Tenant isolation:** Create synthetic tenant A and B. Deny A-to-B read/write/upload/API/session operations across Firestore rules, server endpoints, Lands, Field/Map/Twin and Mobility. UI filtering alone is not evidence.

**Evidence documents:** Test unsupported content, oversize, key-prefix traversal, cross-tenant uploads, interrupted upload, replay/idempotency, missing storage gateway, orphan metadata, private reads, retention and restored versions. Never use actual grant beneficiaries or identity documents.

**Field data integrity:** On a single authorized synthetic case, preserve caseId/status/updatedAt from field case to Manager/Map/Twin, with human-only verification before closure. Failed service response must show unavailable, not zero. Late response from a previous UID/tenant must not overwrite the active user's view.

**Operational reliability:** Negative AI timeout/provider failures, retry, availability, encrypted backup, restore in isolated environment, change audit, rollback. Approve RPO/RTO and document results.

**Design/privacy:** Arabic RTL official SMART HSR brand, calm day/night, Desktop/iPad/mobile, focus and keyboard navigation; minimal visible beneficiary ID and backend access review, lawful retention/deletion, service provider and transfer mapping, AI human oversight.

## 5. Signature and decision sheet (no approvals recorded)

| Requirement | State |
| --- | --- |
| Independent reviewer/organization, evidence access, signed date | NOT PROVIDED |
| Firebase effective project/IAM/region attestation | HOLD |
| B2 effective bucket/key/regional assessment | HOLD |
| CodeQL/dependency dispositions and source provenance | HOLD |
| PDPL/NCA applicability and privacy review | HOLD |
| Backup/restore/incident management proof | HOLD |
| Authorized immutable Preview SHA, synthetic data types, UAT | NOT AUTHORIZED |
| Independent G1–G3 decision | **HOLD — NOT SIGNED** |
| Municipality and platform operational release authorization | **HOLD — NOT SIGNED** |

## 6. Immediate execution policy

Keep Production unchanged and Draft no-deploy. Obtain read-only resource evidence and reviewer acceptance criteria before any access, billing or cloud change. Three non-binding cybersecurity review requests were emailed on 2026-11-01; no consulting contract or cloud access is authorized by the emails. No automatic GO from a green CI badge. Once approvals exist, execute single-SHA synthetic Preview UAT with rollback and a documented GO/NO-GO decision.

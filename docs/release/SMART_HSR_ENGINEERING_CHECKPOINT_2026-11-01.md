# SMART HSR — Engineering Verification Checkpoint V1

**Date:** 2026-11-01 | **Status:** INTERNAL TECHNICAL CHECKLIST — NOT A MUNICIPAL RELEASE CERTIFICATION

## Metrics that must never be conflated

- **70/100 internal engineering-verification coverage = 14/20 binary checks with evidence, each worth 5 points.** Six not yet verified (BLOCKED) count as zero *in this limited checklist only*. This is not 70% of all software work done and not a regulatory score.
- **32/100 Baseline 001 historical signed-evidence matrix** from PR #108: 35 assessed, 65 not evaluated. Its A–H weights are unchanged; this checkpoint does NOT increase that score. An independent criterion reviewer must assess and sign any new Baseline 001 earned points.
- **Municipality release decision: HOLD / NO-GO.** Any missing G01–G06 keeps release blocked regardless of the 70/100 checkpoint.
- Latest verified **application code baseline:** eba96b3788ce4aa5001fa8733d60bdcf6e4a50ad on protected no-deploy Draft PR #113. This evidence was validated with 4/4 one-SHA jobs, 3/3 Preview-emulator jobs, 1/1 CodeQL *execution* job. The scanner can succeed while alerts remain.
- This checkpoint is **snapshot-based**, not a live CI widget. The added deterministic regression test verifies checklist arithmetic, ID uniqueness, links, and NO-GO labels; it cannot independently re-run cloud tests. Whenever source code changes, inspect exact-SHA CI before updating PASS rows.

## Reproducible verification matrix (20 checks × 5 points)

| ID | Evidence-backed checkpoint | Status | Evidence link |
| --- | --- | --- | --- |
| E01 | Node 22/Vercel and source contract verified | PASS | https://github.com/blumark24/smart-hsr-manager/actions/runs/41344382655 |
| E02 | 8/8 GitHub Actions jobs on one immutable application SHA | PASS | https://github.com/blumark24/smart-hsr-manager/actions/runs/41344382655 |
| E03 | Local synthetic Chromium Desktop/iPad/Mobile tested | PASS | https://github.com/blumark24/smart-hsr-manager/actions/runs/41344382655 |
| E04 | Draft no-deploy guard and unchanged Production verified | PASS | https://github.com/blumark24/smart-hsr-manager/pull/113 |
| S01 | Preview Firebase Web/Admin fail-closed module tests | PASS | https://github.com/blumark24/smart-hsr-manager/actions/runs/41344382676 |
| S02 | Preview B2 endpoint/bucket fail-closed module tests | PASS | https://github.com/blumark24/smart-hsr-manager/actions/runs/41344382676 |
| S03 | Seven-municipality Firestore rules emulator negative tests | PASS | https://github.com/blumark24/smart-hsr-manager/actions/runs/41344382676 |
| S04 | Cross-tenant B2 evidence read prefix/ownership negative tests | PASS | https://github.com/blumark24/smart-hsr-manager/actions/runs/41344382676 |
| F01 | Synthetic Field case lifecycle and Manager/Map/Twin projection | PASS | https://github.com/blumark24/smart-hsr-manager/issues/109 |
| F02 | Field unavailable-vs-zero and late-session refresh contracts | PASS | https://github.com/blumark24/smart-hsr-manager/actions/runs/41344382655 |
| F03 | Field Head evidence-view authorization negative tests | PASS | https://github.com/blumark24/smart-hsr-manager/actions/runs/41344382676 |
| L01 | Lands synthetic ID masking and fail-closed approval contracts | PASS | https://github.com/blumark24/smart-hsr-manager/actions/runs/41344382676 |
| O01 | Owner billing pending ledger atomic/idempotency synthetic tests | PASS | https://github.com/blumark24/smart-hsr-manager/actions/runs/41344382655 |
| O02 | Manager/User Center identity and session synthetic contracts | PASS | https://github.com/blumark24/smart-hsr-manager/actions/runs/41344382655 |
| G01 | Effective Firebase Preview/Production IAM and regions independently attested | BLOCKED | https://github.com/blumark24/smart-hsr-manager/issues/73 |
| G02 | Effective B2 bucket/key scope, residency and transfer independently attested | BLOCKED | https://github.com/blumark24/smart-hsr-manager/issues/73 |
| G03 | Independent cybersecurity/CodeQL vulnerability disposition signed | BLOCKED | https://github.com/blumark24/smart-hsr-manager/issues/73 |
| G04 | Authorized hosted Preview U1–U8 authenticated role/device UAT | BLOCKED | https://github.com/blumark24/smart-hsr-manager/issues/73 |
| G05 | Actual isolated cross-module grant/Field/Mobility document bytes E2E | BLOCKED | https://github.com/blumark24/smart-hsr-manager/issues/118 |
| G06 | Tested isolated backup/restore and municipal operational signoffs | BLOCKED | https://github.com/blumark24/smart-hsr-manager/issues/118 |

## Calculation

- PASS checks: **14**; BLOCKED/unverified: **6**; total: **20**.
- Internal Engineering Verification Coverage = PASS / Total × 100 = 14 / 20 × 100 = **70/100**.
- Original Baseline 001 = **32/100**, entirely different weighted assessment, therefore **70 - 32 is NOT a 38-point increase in the same metric**.
- All six G checks are hard-release dependencies. Their HOLD cannot be diluted by local tests or converted to PASS without appropriate artifacts and human authorization.

## Fastest evidence-driven next actions

1. **G01/G02:** Independent read-only Firebase IAM + B2 bucket/key/region effective scope report. Do not disclose secrets or touch real records.
2. **G03:** Third-party source and cloud security review: 17 previously reported CodeQL alerts, current SARIF triage, generated runtime provenance, dependency findings, actual reviewer APPROVE/HOLD.
3. **G04/G05:** After G01–G03 signoff, allow separately approved SHA-pinned protected Preview and synthetic U1–U8 / Manager / Field / Lands / Mobility / AI / devices / evidence bytes UAT.
4. **G06:** Separate backup-restore, rollback, PDPL/municipal data-owner and authorized operational signoff.

## Change control

- Project: blumark24/smart-hsr-manager; branch: fix/owner-upgrade-ledger-no-deploy-20261101; no merge, no Preview/Production deploy authorized by this document.
- Disputed evidence reverts the related PASS to BLOCKED and recalculates score. Only new verified evidence changes a status.
- This document is **internal engineering progress**, not attestation by SDAIA, NCA, the municipality, a legal reviewer or independent auditor.

# SMART HSR — FINAL HANDOVER UAT 100%

**Release branch:** `release/municipality-final-rc`

This file is the single source of truth for municipality delivery closure.
No new feature work or redesign is allowed during this phase. Only verified P0/P1 fixes may change the release candidate.

## Gate 0 — Release Freeze

- [x] Phase 25 security / multi-tenant baseline adopted.
- [x] Approved responsive landing layer integrated.
- [x] Final responsive contract test added.
- [x] Portal/session isolation test added.
- [x] 7-organization isolation test runs under Firestore emulator.
- [x] Municipality acceptance workflow passes.
- [x] Vercel Preview matches the current RC SHA.
- [ ] Manual browser UAT complete.
- [ ] Final SHA frozen and tagged.
- [ ] Cloudflare deployment verified against the same frozen SHA.
- [ ] USB/archive package generated and checksummed.

## Gate 1 — Canonical Role & Routing Matrix

Every identity must resolve to exactly one institutional workspace. No user may fall through to a manager/owner surface unless that is their canonical role.

| Institutional path | Role | Expected workspace | Required authority |
|---|---|---|---|
| Platform | Owner | Owner Command Center | platform-level only |
| Municipality | Municipality Manager | Manager Dashboard | municipality-wide executive |
| Field Survey | Department Head | Department Head Command Center | department command/closure |
| Field Survey | Inspector | Inspector Dashboard | own field observations/capture |
| Smart Lands | Lands Department Manager | Smart Lands | lands department management |
| Smart Lands | Lands Employee | Smart Lands | lands employee operations |
| Smart Mobility | Mobility Head | Mobility Operations | fleet allocation/handover/return/incidents |
| Smart Mobility | Department Head | Mobility Department workspace | create department mission requests only |
| Smart Mobility | Employee | Mobility Employee workspace | own assigned missions and assigned vehicle only |
| Administrative Affairs | Department Head | Administrative Affairs | mission approvals, vehicle authorization, safe employee admin |
| Administrative Affairs | Employee | Administrative Affairs | read-only |
| Contracts / Contractor Companies | Municipality Manager | Manager Dashboard — Contracts supervisory module | manage and supervise contractor-company registry |
| External Contractor | Contractor | Contractor/field external surface | external identity only |

### Gate 1 pass criteria
- [x] Automated routing/role contract tests exist for Field, Lands, Mobility and Administrative Affairs; Contracts is locked to the Municipality Manager supervisory module.
- [x] Manager/workforce session namespaces are isolated.
- [x] Cross-organization access is denied by tested Firestore rules.
- [ ] Each canonical role is logged in once with a real UAT account and lands on the expected workspace.
- [ ] No account exposes another role's navigation or sensitive actions.

## Gate 2 — End-to-End Functional UAT

### A. Field Survey
1. Department Head opens command center.
2. Inspector receives/creates allowed field work.
3. Inspector captures GPS + image/evidence.
4. Observation appears only inside the correct organization/department scope.
5. Inspector verification occurs where required.
6. Department Head closes the visual-distortion case.
7. Audit trail is visible.

**Pass:** [ ]

### B. Smart Lands
1. Lands Department Manager logs in through the canonical workforce portal.
2. One-time SSO handoff contains only an opaque code.
3. Lands Manager opens the correct Smart Lands workspace.
4. Lands Employee logs in and opens the employee-appropriate Smart Lands workspace.
5. Digital record relationships are preserved: beneficiary, royal order, allocation decision, plan, parcel.
6. Manager and employee authorities remain distinct.

**Pass:** [ ]

### C. Mobility + Administrative Affairs
Required real sequence:

`Department Head → Administrative Affairs Head → Mobility Head → Administrative Affairs Head → Mobility Head → Assigned Employee → Mobility Head`

1. Department Head creates a mission request for a real eligible employee.
2. Administrative Affairs Head approves/rejects/returns the mission.
3. Mobility Head allocates an available vehicle.
4. Allocation creates a `PENDING_AUTHORIZATION` vehicle authorization.
5. Administrative Affairs Head authorizes/rejects/revokes the vehicle authorization.
6. Mobility Head hands the vehicle over.
7. Assigned employee sees only their own mission and the vehicle linked to that mission.
8. Assigned employee advances mission state / reports incident if required / completes work.
9. Assigned employee requests vehicle return.
10. Mobility Head confirms return and closure.
11. Audit events remain organization-scoped.

**Pass:** [ ]

### D. Administrative Affairs role separation
- Department Head can approve mission decisions.
- Department Head can decide vehicle authorization.
- Department Head can update the allowed safe employee fields.
- Administrative Affairs Employee sees the same institutional workspace in read-only mode.
- Administrative Affairs Employee cannot execute protected mutations.

**Pass:** [ ]

### E. Contracts / Contractor Companies
- Contracts/company registry is available inside the Municipality Manager dashboard.
- No canonical workforce route exists for a Contracts Department Head or Contracts Employee in this release.
- Protected registry mutations require Municipality Manager authority.
- Contractor identity remains external and is never treated as a municipal employee.

**Pass:** [ ]

## Gate 3 — Visual / Responsive UAT

No redesign in this gate. Only layout defects that block use may be fixed.

Test:
- Desktop 1440 / 1280.
- Tablet / iPad portrait and landscape.
- iPhone-sized viewport.
- Day mode.
- Night mode.
- RTL.
- Fixed navigation and overlays.
- Dialogs/drawers.
- Tables and maps.
- Landing.
- Manager Dashboard.
- Owner.
- Inspector.
- Department Head.
- Administrative Affairs.
- Mobility.
- Smart Lands handoff.

### Pass criteria
- [ ] No horizontal overflow that blocks operation.
- [ ] No clipped primary actions.
- [ ] No modal/overlay persists after route change.
- [ ] No unreadable day-mode surface.
- [ ] No responsive redesign regression.
- [ ] Touch targets remain usable on mobile/tablet.

## Gate 4 — Security / Release Integrity

- [x] Portal session isolation PASS.
- [x] Multi-tenant isolation PASS across 7 organizations.
- [x] Firestore rules regression PASS.
- [x] Production dependency audit PASS.
- [x] Municipality acceptance workflow PASS.
- [ ] Manual UAT has no P0/P1 issue.
- [ ] Preview SHA equals frozen release SHA.
- [ ] Production is untouched until explicit handover approval.

## Gate 5 — Delivery Package

After all previous gates pass:

1. Freeze one SHA.
2. Create final Git tag / GitHub Release.
3. Deploy the same SHA to Vercel.
4. Deploy the same SHA to Cloudflare.
5. Verify both hosts serve the frozen release.
6. Export source ZIP.
7. Export Git history/bundle.
8. Generate SHA-256 checksums.
9. Copy release archive to USB.
10. Deliver handover checklist, URLs, environment notes and role/UAT evidence.

## Definition of “100% Ready for Municipality Handover”

SMART HSR is **100% delivery-ready** only when:

- Every canonical role has a verified destination and authority.
- Field, Lands, Mobility and Administrative Affairs end-to-end UAT pass, and the Municipality Manager contracts supervisory module passes.
- No P0/P1 defect remains.
- Desktop/iPad/iPhone visual UAT passes.
- Security / tenant isolation / sessions remain PASS.
- Vercel and Cloudflare are built from the same frozen SHA.
- Release archive + Git history + checksums are stored for ownership/handover.
- `main` / Production are not changed until explicit final approval.

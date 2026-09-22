# SMART HSR — FINAL MUNICIPALITY UAT

## Release candidate
Branch: phase19-municipality-acceptance-rc1

## Acceptance rule
No P0 or P1 may remain open. P2/P3 may be documented only if they do not affect municipal operation, security, data integrity, role routing, or presentation.

## 01 — Municipality Manager
- Login routes to Manager workspace.
- Executive home loads without blocking errors.
- Field Survey, Lands, Mobility, Users, Maps and Reports open correctly.
- User Center add/edit/email/account status operations work.
- Contractors registry opens separately from municipal employees.
- Logout and suspended-account behavior are correct.

## 02 — Field Survey
- Inspector captures a trusted observation with GPS/evidence.
- Department Head sees the same case.
- Case assignment goes to an active contractor only.
- Contractor executes and uploads after-evidence.
- Department Head verifies or returns the case.
- Closure updates table, map, Digital Twin and audit consistently.
- General reports remain separate from Visual Distortion cases.

## 03 — Lands & Properties
- Lands employee opens the operational lands workspace.
- Lands Department Head can review/approve according to role.
- Manager opens registry, digital record and trusted GIS.
- Beneficiary / royal order / allocation decision / plan / parcel relationships resolve correctly.
- Completeness reflects real linked records and missing items.
- No fake parcel geometry is shown.

## 04 — Smart Mobility
- Any municipal department can request a mission for its own employee.
- Administrative Affairs reviews the mission.
- Mobility Head allocates an eligible vehicle.
- Recipient can accept, execute, report incident if needed, return vehicle and close.
- Vehicle eligibility is independent from Field/Lands.
- One identity / one employee record is preserved.

## 05 — Administrative Affairs
- Canonical Administrative Affairs Head routes directly to admin-affairs.html.
- Workspace access depends on institutional identity, not Mobility entitlement.
- Employee registry is read from the shared master registry.
- Mission approvals and vehicle authorization approvals work.
- No fleet allocation privilege leaks to Administrative Affairs.
- Search/filter/status feedback work.

## 06 — Contractors Registry
- Contractors do not appear as municipality employees.
- Add contractor company + representative account.
- Edit contract/company details.
- Archive only when no open cases exist.
- Historical observations/audit are preserved.
- Cross-organization access is denied.

## 07 — Identity / Routing
- One person = one UID = one Employee ID.
- One active administration + department + institutional role.
- User routes directly to one workspace.
- Vehicle eligibility does not change workspace.
- Transfer/promotion changes the institutional path without creating a duplicate identity.

## 08 — Visual / Responsive
Validate on Desktop, Tablet and Mobile:
- Day mode
- Night mode
- RTL
- Tables
- Dialogs
- Maps
- Forms
- Empty states
- Error states
- Loading states
- No clipping / overlap / horizontal layout corruption

## 09 — Security
- Firestore Rules regression PASS.
- Cross-organization denial PASS.
- Same-department boundaries PASS where applicable.
- Suspended account cannot continue protected operations.
- Audit trail records sensitive administrative changes.
- No protected workflow is available through UI-only trust.

## 10 — Release decision
PASS only when:
- Automated Municipality Acceptance Gate = PASS.
- Preview SHA matches accepted branch HEAD.
- Manual UAT above has no open P0/P1.
- Final visual review is accepted.
- Handover checklist is complete.

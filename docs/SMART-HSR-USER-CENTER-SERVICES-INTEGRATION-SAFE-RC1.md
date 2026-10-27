# SMART HSR — User Center + Services Integration | Safe Plan RC1

**Status:** DESIGN/CONTRACT BASELINE ONLY — NO RUNTIME IMPLEMENTATION  
**Date:** 2026-10-27  
**Baseline:** custom-domain deployment `smart.blumark24.com`, SHA `c07ec531de800a405e2d168e97c3dc492a622bdc` (`dpl_2CvDF5CmcGrYvWooah8gu6hF1LnX`).  
**Important:** `smart-hsr-manager.vercel.app` was mapped to a separate, newer SHA `eb4eda3a54c20b9ad8a53a9f4ebe352357528269` during the read-only audit. Before implementation, re-confirm BOTH alias mappings and choose the approved source branch deliberately. A READY deployment is not proof of live UAT success.  
**Production rule:** NO changes to main, Production, DNS/aliases, Production Firebase, real identities, role assignments, records, credentials or service entitlement grants. No automatic merge or deployment approval.

## Product decision — preserve the approved UI

- Keep the existing SMART HSR navy/green identity, manager shell/header/sidebar and Lands interface unchanged.
- Preserve the *actual* approved User Center grid and add/edit dialogs. Do **not** replace with a separate edit page or new dashboard design.
- Use the Lands grant-registry *table usability* as a reference: readable column widths, sticky header, trustworthy statuses, search/filter, RTL horizontal scroll, compact row actions. Do **not** copy its colors or overwrite the User Center layout.
- Preserve current employee-editor four stages and existing save orchestration; tighten validation, scroll, and partial-save messages instead of replacing the dialog.
- Only the approved header identity/workspace slot gets a compact **خدماتي** action; no fixed floating controls on approved surfaces.

## Verified code relationships

| Area | Existing implementation | Guardrail |
| --- | --- | --- |
| User Center view | `manager-phase11d-user-center-enhancements.js`, `manager-phase11f-reference-ui.js`, `manager-phase11g-user-center-approved-skin.js` | Approved component chain/order and CSS-only skin stay intact |
| Employee create/edit | `manager-phase11c-user-center-core.js`, `manager-phase11c-user-center-dialogs.js` | Reuse `U.permissions`, `U.readProducts`, `U.sync`; do not create duplicate UID/employee record |
| Identity/workspaces | `workspace-access.js`, `workspace-guard.js` | Primary remains institutional product; Mobility is additive |
| Header switch | `service-switcher.js`, `workspace.html` | Trusted `resolveWorkspaces` controls display; no client-only permission grants |
| Lands | Lands SSO in `lands/index.html`; API `/api/organization/context` | Single-use SSO, separate session; validate current actual route and return path before touching code |
| Mobility | `mobility-runtime.js`, `department-head.html?mode=mobility`, `api/admin/users.js` | Request != driver != allocator != approver |
| Policies | Municipality `FULL`, `SHORT`, `DIRECT` | Set by authorized municipal manager; no changing the employee's primary role |

### Current gaps to prove/resolve, in order

1. **Alias/source parity:** custom domain and default Vercel alias have different deployment SHAs. Do not assume one deployment's code is the other's.
2. **Switcher behavior:** `service-switcher.js` redirects integrated `[data-smart-hsr-workspace-trigger]` to the chooser, while fallback renders a floating switcher. Aim for a compact in-header list *inside the existing identity UI*; do not introduce a replacement header.
3. **Lands safe round-trip:** current `service-switcher.js` and `workspace.html` use a separate Lands destination and one-time code; `lands/index.html` has its own handoff flow. Verify direct and reverse paths on an isolated Preview, especially session preservation, before changing any URL.
4. **Requester role:** current `createMissionRequest` enforces department-head server authority and department-scoped eligible employees. Giving a Lands/Field employee `mobility.access` does not let them create a request. Implement a distinct, least-privilege request action/capability, not an elevation to `department_head`.
5. **Permission model:** current resolver knows `mobility.access`, `vehicle.checkout`, `vehicle.drive`, `vehicle.return`; `mobility.request` is a proposed NEW capability and must be added consistently across resolver, trusted API, employee mirror, manager UI, tests and data contract, with fail-closed defaults. No silent account migration.
6. **User Center consistency:** `U.sync` updates employee registry and account via sequential trusted calls. Characterize and handle partial success; never show an unconditional “Saved” when one side failed.
7. **Personal vs operational missions:** employee workspace currently scopes tasks to `assignedEmployeeUid`. A requester may not be the assigned driver; personal “طلباتي” needs an explicit, secure requester view rather than broadening operational lists.

## Scope and order

**Phase 0 — read-only discovery / freeze:** Verify hostname→deployment ID→SHA, collect desktop/iPad/mobile screenshots of the *actual* current UI (no synthetic layout assumptions), and inventory existing tests. Mark known original design elements “DO NOT TOUCH.”

**Phase 1 — User Center first:** Keep grid schema; adjust column sizing/filtering/RTL overflow only where a visual or usability defect is confirmed. Keep add/edit dialogs, stage navigation and API contracts; test save failures and employee status.

**Phase 2 — header navigation:** Render only trusted authorized products in the existing header identity slot. Selecting a service uses the existing login/session and guarded destination; preserve original product as primary. Lands uses verified SSO. Handle missing/expired codes with clear recovery and never sign out another portal's session.

**Phase 3 — request service:** Create requester-only contract for a municipal employee (including unassigned departmental employees when policy permits). Keep request and assigned driver separate. Vehicle driving and operational approval remain independent, explicitly granted capabilities. Route through `FULL`/`SHORT`/`DIRECT` policy server-side, with audit and no fake data.

**Phase 4 — Center integration:** Add request-service selection inside existing add/edit permissions, without changing the employee's institutional role, org ID, UID, primary product or unrelated entitlements. Ensure set/revoke synchronizes and propagates safely.

**Phase 5 — Preview UAT:** Staging Firebase, synthetic data and explicit Preview SHA match; manual role matrix and automated gates. Production release is a separate, explicit executive decision.

## Acceptance gates

- [ ] Production and Preview Git SHAs explicitly recorded; no cross-target Firebase or alias confusion.
- [ ] Land employee signs in → Lands primary → Services/Mobility request → returns to Lands without re-login or loss of access.
- [ ] Field inspector signs in → Field primary → request → returns without role change or lost field work.
- [ ] Employee with no department has a safe, authorized request path or an explicit unavailable state.
- [ ] Mobility Head/Administrative Affairs/Department Head/driver operational authorities are not expanded by request-service access.
- [ ] Unapproved product remains absent from header AND API returns 403 on protected actions.
- [ ] A requester's own requests are visible; other employees' requests are not leaked.
- [ ] Request policy FULL/SHORT/DIRECT obeys the pre-existing approval/allocation separation.
- [ ] Add/edit dialogs preserve existing saved values and never silently drop Lands/Field/Mobility products on an unrelated update.
- [ ] Registry `employees` and auth `users` synchronization is verified, including partial-failure recovery and audit.
- [ ] User Center grid, search, filter, sticky header, RTL, desktop/mobile/iPad, day/night and all dialog focus/scroll states pass.
- [ ] No open P0/P1; complete Preview screenshots/UAT log; explicit human authorization before any Production change.

## Files likely to be involved in future IMPLEMENTATION (not edited here)

`manager-phase11c-user-center-core.js`, `manager-phase11c-user-center-dialogs.js`, `manager-phase11d-user-center-enhancements.js`, `manager-phase11f-reference-ui.js`, `manager-phase11g-user-center-approved-skin.js`, `workspace-access.js`, `service-switcher.js`, `workspace.html`, `api/admin/users.js`, `api/admin/employees.js`, `api/_lib/serviceEntitlements.js`, `lands/index.html`, plus focused tests.

**No code/production change is authorized by this plan itself.**

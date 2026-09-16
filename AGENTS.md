# SMART HSR — Agent Operating Contract

This repository is a Saudi municipal/government product. Treat every change as release-sensitive.

## Read first

Before editing UI or product behavior, read:

1. `PRODUCT.md`
2. `DESIGN.md`
3. the relevant implementation and tests

If Graft is available locally, use it to orient before multi-file work (`graft check`, `graft map`, `graft callers`, or the equivalent Graft tools). The local `graft/` graph is a regenerable cache and must not be committed.

## Source of truth and release flow

- GitHub is the source of truth.
- Work only on an isolated feature branch.
- Preview/staging comes before merge.
- Never deploy or merge to Production without explicit human approval.
- Never use Production Firebase data or credentials for development or automated QA.
- Prefer emulator/staging data for tests.

## Protected surfaces

Do not change the following unless the task explicitly requires it and the change has dedicated security tests:

- Firebase Auth behavior
- RBAC / capability boundaries
- Firestore security rules
- organization/tenant isolation
- GPS/geofencing security logic
- trusted server endpoints
- Production deployment configuration

UI work must not silently broaden permissions or invent authorization in the browser.

## Product separation

Keep these surfaces distinct:

- Manager Dashboard
- Operational Map
- Digital Twin
- User Center
- Reports
- Field Survey
- Smart Lands
- Smart Mobility

The Manager Dashboard is not the Operational Map. The Operational Map is not the Digital Twin.

## Current User Center acceptance contract

The User Center is an institutional employee/account console, not a generic SaaS people table.

Required behavior:

- one canonical employee record, with an optional linked login account
- centered, professional employee/add/edit dialogs
- secure login email change synchronized through trusted backend logic
- password change uses `new password` + `confirm new password`; never display or log the old password
- service/product permissions remain independent and capability-based
- employee history/audit is visible without exposing secrets
- light and dark modes have equivalent information hierarchy and legibility
- Arabic RTL is first-class
- desktop uses a dense, readable table; small screens may use compressed rows/cards
- status must never be communicated by color alone

## Design workflow

For meaningful UI changes:

1. understand the existing surface and its data/actions
2. shape the UX before changing code
3. follow `DESIGN.md`
4. use Impeccable when installed for critique/audit/polish, but treat it as guidance rather than authority over product/security rules
5. verify accessibility and responsive behavior
6. run Playwright/browser QA for the changed flow
7. inspect `git diff`
8. run relevant regression/security tests

Do not redesign unrelated pages during a scoped task.

## Browser and accessibility baseline

- keyboard-operable flows
- visible `:focus-visible` states
- semantic buttons/links/labels before ARIA workarounds
- mobile touch targets approximately 44px where practical
- mobile text inputs at least 16px to avoid iOS focus zoom
- honor `prefers-reduced-motion`
- no `transition: all`
- no global horizontal page overflow
- modals trap/manage focus and close predictably
- loading actions prevent duplicate submission while preserving a clear label/state
- destructive actions require confirmation or a safe undo path

## Definition of done

A change is not done because it looks good in one screenshot. It is done only when:

- the requested scope is implemented
- no protected security boundary was weakened
- desktop and mobile were checked
- dark and light modes were checked when relevant
- browser QA passes for the changed path
- applicable unit/security/regression tests pass
- the Preview is ready for human acceptance

If evidence is missing, report it as unverified rather than claiming success.
# SMART HSR — Design Constitution

## Direction

SMART HSR is a **Saudi Municipal Enterprise** product.

The interface should feel:

- institutional rather than consumer-like
- operational rather than decorative
- premium without visual noise
- dense where data requires density, but never cramped
- calm under pressure
- trustworthy on executive displays
- coherent across desktop, tablet, and field-mobile contexts

## Brand

Use the approved SMART HSR identity as the source of truth.

- Night mode: navy / deep blue + municipal green/teal accents
- Day mode: clean white / light surfaces + municipal green accents
- Do not reinvent, redraw, or replace the approved logo.
- Avoid generic AI imagery, robots, stock people, and ornamental SaaS gradients.

## Hierarchy

Each screen should make four things obvious:

1. where the user is
2. what state the operation is in
3. what action is primary
4. what requires attention

Use spacing, typography, alignment, contrast, and grouping before adding containers.
Do not wrap every concept in a card. Avoid nested-card clutter.

## RTL and Arabic

Arabic RTL is the primary design mode, not a mirrored afterthought.

- align labels, data, controls, breadcrumbs, and navigation intentionally for RTL
- verify icons whose direction carries meaning
- use locale-aware dates, times, numbers, and delimiters
- keep technical identifiers and brand tokens readable and stable
- test long Arabic names and labels, not only short placeholder content

## Light / dark parity

Both modes must preserve the same information hierarchy.

Night mode should not depend on excessive glow.
Day mode must not become washed-out gray-on-white.

Every state needs sufficient contrast in both modes:

- default
- hover
- active
- selected
- disabled
- focus
- warning
- destructive
- success

## Typography

- Prefer a professional Arabic-capable type system already established by the product.
- Use a restrained scale.
- Executive headings are clear but not oversized.
- Dense data rows use tabular numbers where comparison matters.
- Avoid weak gray text on tinted backgrounds.

## Layout

- Use a deliberate grid and strong edge/baseline alignment.
- Prefer CSS grid/flex/intrinsic layout over JS measurement.
- Avoid accidental horizontal page scrolling.
- Internal tables/maps may scroll only where that behavior is intentional and visually clear.
- Verify laptop, large desktop, tablet, and mobile widths.
- Large screens should use space to improve comprehension, not simply stretch components.

## User Center pattern

### Register

Desktop:

- compact institutional header
- concise KPI strip only when it adds operational value
- filters grouped as one tool area
- dense employee register
- sticky header if the register scrolls
- service assignments summarized rather than adding a permanent column for every future service

Suggested conceptual columns:

`الموظف | الوظيفة/الإدارة | الخدمات | الحساب | آخر نشاط | الإجراءات`

### Employee profile

Use a centered Employee 360 dialog/profile with stable tabs:

`البيانات الأساسية | التنظيم | الحساب والأمان | الخدمات والصلاحيات | السجل`

The top summary should expose the employee identity, account state, department, service footprint, and role context without duplicating the entire form.

### Add employee

Use a centered modal and a short progressive flow when needed:

`البيانات → التنظيم → الحساب → الخدمات/الصلاحيات → المراجعة`

Do not force login-account creation when the institution only needs an employee record first.

## Modals and overlays

- Center primary institutional dialogs.
- Keep clear visual separation from the background without excessive blur.
- Trap/manage focus correctly.
- Return focus to the initiating control on close when practical.
- Escape closes non-destructive dialogs.
- Keep close controls discoverable and keyboard accessible.
- On mobile, preserve safe-area spacing and avoid fields hidden behind the keyboard.

## Forms

- Every form control has a real label or accessible name.
- Clicking the label focuses/activates its control.
- Mobile text input font size is at least 16px.
- Do not block paste.
- Password managers and OTP entry must remain usable.
- Show validation beside the relevant field and focus the first error after submit.
- During submission, prevent duplicate requests and show a clear in-flight state.
- Use correct autocomplete, type, and inputmode values.
- Warn about unsaved changes where loss is realistic.

## Status and actions

- Never rely on color alone for status.
- Use text + icon/shape where useful.
- Destructive actions require confirmation or an undo strategy.
- Primary actions should be visually dominant without turning every green button into a primary action.
- Navigation is implemented as links when it is navigation, not clickable divs.

## Accessibility

Baseline requirements:

- keyboard operation for complete flows
- visible `:focus-visible`
- focus is never hidden behind sticky UI
- semantic HTML before ARIA patches
- icon-only controls have descriptive accessible names
- async success/error updates are announced appropriately
- gestures have a click/tap/keyboard alternative unless inherently spatial
- mobile interactive targets target roughly 44×44px where practical
- browser zoom remains enabled

## Motion

Motion explains cause and effect; it is not decoration.

- prefer CSS transitions/animations
- prefer `transform` and `opacity`
- never use `transition: all`
- keep interactions interruptible
- honor `prefers-reduced-motion`
- avoid elastic/bouncy motion in core government workflows

## Maps and geospatial surfaces

Maps are operational tools, not background decoration.

- markers/statuses must remain legible at the expected zoom
- clicking a real entity opens useful context/actions
- filters must clearly alter visible operational layers
- preserve continuity when moving between Operational Map and Digital Twin
- do not replace real operational geography with decorative pseudo-maps

## Loading, empty, and error states

Every important surface has designed states for:

- loading
- no records yet
- no search/filter results
- partial data
- permission denied
- network/backend error
- stale/retry state when applicable

Skeletons should match the final layout to avoid layout shift.

## Quality gate

Before a UI change is considered ready:

- compare against this document and `PRODUCT.md`
- run Impeccable audit/critique/polish when installed
- verify keyboard focus
- verify no unintended page overflow
- verify RTL
- verify at least one desktop and one mobile viewport
- verify light and dark modes where applicable
- run the relevant Playwright/browser flow
- confirm no protected security behavior changed as a side effect

Visual polish never overrides security correctness, data truth, or municipal workflow clarity.
# SMART HSR — Product Context

## Product

SMART HSR / سمارت حصر is a Saudi municipal operations platform. It is intended to become a real institutional product, not a presentation-only dashboard.

Primary language: Arabic.
Primary direction: RTL.
Primary operating context: municipal managers, department heads, administrative staff, and field employees.

## Product promise

Give municipal leadership one coherent operating environment to understand people, field work, land records, mobility, incidents, and geographic operations without collapsing every workflow into one dashboard.

The system should feel auditable, calm, authoritative, operational, and suitable for large-screen executive use while remaining usable on laptops and mobile devices where the role requires it.

## Product surfaces

Keep these surfaces distinct and navigable:

1. Manager Dashboard — executive summary and command overview
2. Operational Map — full GIS/Geo Intelligence operational experience
3. Digital Twin — separate spatial/3D continuity layer
4. User Center — employee, account, service and permission administration
5. Reports
6. Field Survey / الحصر الميداني
7. Smart Lands / الأراضي والممتلكات
8. Smart Mobility / الحركة والسير

The dashboard may contain a small map card, but it is not the Operational Map.
The Operational Map is not the Digital Twin.

## Current completion priority: User Center

The User Center must support the institution as services grow over time.

### Canonical model

The employee record is the canonical person record. A login account is a linked identity and may be created at the same time or activated later.

### Employee 360

An employee profile should make it easy to understand:

- basic identity and employment information
- organization / department placement
- login account state
- assigned services/products
- role/capability context
- activity and audit history

### Account and security behavior

- Email changes for linked accounts must go through trusted backend logic and keep Auth + application records aligned.
- Password values are never logged or displayed in audit history.
- Password change UX uses a new password and confirmation.
- Security role/capability changes must not be inferred from job-title text.
- Tenant/organization boundaries are authoritative on the server.

### Employee administration UX

- `إضافة موظف` opens a centered modal/dialog.
- Employee view/edit opens a centered institutional profile/dialog rather than a generic side drawer.
- The main employee register should remain dense and scannable.
- Prefer a compact column model such as employee, job/department, services, account, activity, actions rather than one permanent column per future municipal product.
- Responsive layouts may switch from table to cards/compressed rows when necessary.

## Municipal service growth

The information architecture must support adding future municipal services without rebuilding the employee identity model. Service entitlements and roles should therefore remain modular rather than hardcoded to one product.

## Product language and tone

Use concise Saudi institutional Arabic. Avoid consumer-app slang, marketing copy inside operating screens, or decorative technical jargon.

Preferred labels are concrete and task-oriented.

## Non-goals for current work

- Do not combine every surface into one mega-dashboard.
- Do not redesign unrelated modules during scoped User Center work.
- Do not replace the approved SMART HSR identity or logo.
- Do not create browser-only authorization as a substitute for backend enforcement.
- Do not make Production the test environment.

## Release principle

GitHub is the source of truth. Work proceeds through an isolated branch, Preview/Staging, automated checks, human acceptance, and only then a Production decision.
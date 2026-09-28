# SMART HSR — Smart Lands V1 Foundation

**Phase:** 14A  
**Branch:** `phase14a-smart-lands-v1-foundation`  
**Baseline:** Field Survey V1 acceptance snapshot `ab844655957520feb6df188d44263116a127b27d`

## Objective

Turn the existing Lands integration into a municipality-ready product without redesigning the approved SMART HSR shell and without weakening Auth/RBAC/Firestore Rules.

## Existing Assets Reused

- `manager-lands-adapter.js`
- `api/_lib/landsBridge.js`
- `api/_lib/landsManagerBootstrap.js`
- `api/_lib/landsSyncReconciliation.js`
- Existing Lands user entitlements in `api/admin/users.js`
- Existing Municipality Manager Lands dashboard in `manager.html`
- Existing Lands bootstrap / bridge / sync / SSO test suites

## Product Target

1. Lands Command Center
2. Lands & Properties Registry
3. Digital Land/Property Record
4. GIS / parcel context
5. Smart Completeness Engine
6. Audit visibility
7. Municipality UAT and closure

## P1 Data-Model Gap

The adapter correctly computes completeness from the Rules-backed schema fields:

- `beneficiary_id`
- `royal_order_id`
- `allocation_decision_id`
- `plan_id`
- `parcel_id`
- `document_ids`

However, presentation mapping still attempts to display denormalized nested objects such as:

- `beneficiary.name`
- `royal_order.number`
- `allocation_decision.number`

The adapter's own authoritative schema comments state those denormalized objects are not part of the real landGrant schema.

**Required fix:** resolve related records from their authoritative collections by ID, scoped to the same municipality, then compose the display model without fake fallback data.

## P1 UX Gap

The current Municipality Manager Lands view has:

- Executive KPIs
- Registry
- Documents
- GIS placeholder/context

But it does not yet provide the municipality-grade **Digital Record / الملف الرقمي** workflow required for a selected record.

Required digital record sections:

- beneficiary
- royal order
- allocation decision
- plan
- parcel
- area
- documents
- completeness percentage
- missing requirements
- spatial context
- audit/history context

## P1 GIS Gap

Current manager view reports georeferenced counts and a GIS section, but municipality handover requires actual trusted parcel rendering when authoritative geometry exists.

Rules:

- no synthetic geometry
- no fake parcels
- invalid geometry omitted honestly
- selected registry record should focus its real parcel when available

## Acceptance Gates

Phase 14A must keep green:

- Lands bootstrap
- Lands bridge
- Lands auto-bootstrap
- Lands sync reconciliation
- Manager Lands bridge integration
- Manager Lands SSO
- Service entitlements
- Field Survey closure regression
- Firestore security rules regression

## Implementation Order

1. Fix authoritative related-record resolution.
2. Add Digital Record data model.
3. Add Digital Record UI.
4. Upgrade GIS to trusted parcel rendering.
5. Align Command Center KPIs with completeness/status.
6. Responsive + Day/Night QA.
7. Lands UAT.
8. Freeze Lands V1 except P0/P1 defects.

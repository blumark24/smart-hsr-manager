# SMART HSR — Smart Mobility V1 Release Candidate

**Status:** ENGINEERING ACCEPTED — VISUAL/ROLE SESSION UAT PENDING  
**Date:** 2026-09-22  
**Repository:** blumark24/smart-hsr-manager  
**Branch:** phase15-smart-mobility-v1-closure  
**Accepted engineering commit:** 41e9a5352561adb96d6d15e2c6d0697ab002e075  
**Runtime Preview commit:** 7269473e193c6c73278dda3a68c7e8d1135e4994 — Vercel READY, Preview only

## Product Decision

Smart Mobility is a municipality-wide shared institutional service.

A municipal employee may use Smart Mobility without Field Survey or Smart Lands access.

Employee identity and product/service permissions remain independent:

- Employee Master Registry
- Field Access
- Lands Access
- Mobility Access
- Vehicle Eligibility

Vehicle eligibility is explicit and independent from Mobility access.

## Operational Roles

### Department Head
- Own department only
- Create mission request
- Select a real eligible employee from the same department
- Submit mission for Administrative Affairs approval
- Read own department mission state

### Administrative Affairs
- Municipality organization scope
- Approve/reject/return mission requests
- Authorize/reject/revoke internal vehicle authorization
- Does not allocate fleet vehicles

### Mobility Head
- Municipality organization scope
- View operational mission queue
- Allocate available vehicles to eligible employees
- Handover vehicle
- Process incidents
- Confirm vehicle return and close mission
- Does not replace Administrative Affairs approval authority

### Employee
- Own assigned missions only
- Receive/start/complete mission
- Report incident
- Return vehicle
- No fleet allocation or approval authority

## Workflow

Department Head
→ Administrative Affairs
→ Mobility Head allocation
→ Vehicle Authorization
→ Handover
→ Employee execution
→ Incident path when required
→ Employee return
→ Mobility Head confirms return
→ CLOSED

## Municipality-wide Access

Department mobility workflow is no longer restricted to the Field Survey department.

The server derives:
- organization
- department
- role
- actor identity

from the authenticated live account.

No Field or Lands entitlement is required for a Mobility-only employee.

## Trusted Runtime

The approved department-head visual surface is reused in Mobility mode:

department-head.html?mode=mobility

Runtime:
mobility-runtime.js

Role mapping:
- mobility_head → mobility operations
- department_head → department mobility
- administrative_affairs → approvals
- employee → own operations

Field mode continues to use field-head-runtime.js and remains isolated.

## Trusted Workspace

api/admin/users.js action:

getMobilityWorkspace

Returns role-scoped safe projections for:
- missions
- vehicles
- incidents
- vehicle authorizations
- eligible employees

No fake records are generated.

## Incident Closure

processMobilityIncident is server-trusted and Mobility Head only.

Transitions:
NEW → ACKNOWLEDGED → IN_PROGRESS → RESOLVED

Transitions use the shared incident workflow policy, organization checks, transaction writes, and audit events.

## Acceptance Gate

PHASE15 Smart Mobility Acceptance Gate: PASS

- Syntax check Mobility integration — PASS
- Field Head mobility integration — PASS
- Shared mobility workflow — PASS
- Mobility server bridge — PASS
- Vehicle authorization workflow — PASS
- Mobility integration regression — PASS
- Mobility operational role runtime — PASS
- Manager mobility adapter — PASS
- Department head framework regression — PASS
- Field Survey closure regression — PASS
- Lands closure regression — PASS
- Firestore security rules regression — PASS

## Remaining Final Gate

One final handover gate remains before declaring **SMART MOBILITY V1 — CLOSED**:

Visual / authenticated session UAT on Preview for:
1. mobility_head
2. department_head from a non-Field municipal department
3. administrative_affairs
4. Mobility-only employee with Field OFF and Lands OFF

Required checks:
- successful login routing
- correct role surface
- correct same-org / same-department visibility
- mission request → approval → allocation → authorization → handover → execution → return → closure
- day/night visual integrity
- desktop/mobile integrity

No Production/main deployment is authorized by this document.

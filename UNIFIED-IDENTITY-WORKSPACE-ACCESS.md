# SMART HSR — Unified Identity & Workspace Access

**Principle:** One Identity → One Login → Roles + Entitlements → Authorized Workspaces.
Release candidate: `release/municipality-final-rc2` (Preview/UAT only; no merge to main and no Production change until final acceptance).

## Model (additive, no data migration)
`users/{uid}` keeps `organizationId`, `role`, `department`, `administration`, `institutionalRole`, `active`,
`mobilityAccess`, `landsAccess`, `vehicleEligible`. New optional layer:

```
users/{uid}.entitlements = { capabilities: [...], updatedBy, updatedAt }   // written by trusted APIs only
```

| Capability | Meaning |
|---|---|
| `mobility.access` | may open the Mobility workspace |
| `vehicle.checkout` | receive a vehicle / start an assigned mission (READY, IN_PROGRESS) |
| `vehicle.drive` | be the assigned operator: incident hold, completion, report incidents, allocation target |
| `vehicle.return` | return an assigned vehicle |

Mobility is **not** a role or an administration. The four legacy operational roles
(`mobility_head`, `department_head`, `administrative_affairs`, `employee`) still define the
approval / allocation chain and are untouched; a user with `mobility.access` and no legacy role is an
execution-only `employee` (own missions only).

### Dual-read compatibility
* `entitlements` present → it alone decides capabilities (fail-closed; `vehicle.*` needs `mobility.access`).
* Otherwise capabilities derive from `mobilityAccess` / legacy mobility `role` and `vehicleEligible`
  (`vehicleEligible === true` ⇒ checkout + drive + return). No record is rewritten.
* A legacy-style change (`setServices` mobility / `vehicleEligible`, `assignProducts`, `setVehicleEligible`)
  on a record that already has `entitlements` is mirrored into it, so a "disable Mobility" click can never leave
  `mobility.access` in force. Records without `entitlements` are never given one implicitly.

## Workspaces
`workspace-access.js` (pure; shared by browser and API) resolves `{ valid, primary, workspaces[], capabilities }`.
* Valid account = record exists + `active !== false` + non-empty `organizationId`.
* Primary = the institutional path (Field / Lands / Administrative Affairs / canonical Mobility) when authorized;
  otherwise the first authorized workspace. Mobility is additional, and the effective primary only when nothing else
  is authorized (e.g. no department/administration).
* Valid account with no workspace → authenticated session kept → `workspace.html` safe state
  «لم يتم تعيين مساحة عمل لهذا الحساب بعد» (logout only).

## Authority
* **Server is authoritative.** `POST /api/admin/users { action: "resolveWorkspaces", workspace? }` re-reads the live
  `users/{uid}` (Admin SDK) from the verified token; identity/organization never come from the body. Every Mobility
  action re-derives role and capabilities itself (`getMobilityAssignedOperatorCallerContext`, per-action capability checks).
* Client code (`login.html`, `workspace.html`, `service-switcher.js`, `workspace-guard.js`) is display/navigation only.
  A navigation-only local fallback exists if the API is unreachable; pages re-verify.
* Unauthorized workspace URL ⇒ redirect to `workspace.html` with the session intact. Sign-out happens only for an
  invalid account/session.
* Granting: `setServices { uid, capabilities:[…] }` — same authority as before (owner / same-organization manager;
  never self, never cross-organization). Unknown capabilities and `vehicle.*` without `mobility.access` are rejected.
* Lands keeps the one-time server-side SSO handoff. No Firestore Rules or Auth-architecture change.

## Not included (by design / follow-up)
* No User Center UI for capabilities (no approved-board redesign): grant via API, or via the existing Mobility /
  vehicle-eligibility controls which keep working through dual-read.
* Employee-registry selection lists keep reading the registry mirror (kept in step by the server).


## Mobility authorization model

Temporary Mobility delegation is **not** part of the release operating model.

- Permanent `entitlements.capabilities` are the authoritative source for Mobility workspace and vehicle-operation access.
- Legacy `mobilityDelegation` data, if present on an older record, does not grant workspace access or operational authority.
- No Head of Mobility grant/revoke flow is part of RC2.
- Same-organization manager/owner trusted APIs remain the only path for permanent entitlement changes.
- Vehicle authorization follows the municipality workflow policy: `FULL` requires Administrative Affairs authorization; `SHORT` and `DIRECT` skip Administrative Affairs and create an internally authorized vehicle-use record by policy so the audit trail and handover lifecycle stay intact.

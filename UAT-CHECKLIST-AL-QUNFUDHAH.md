# SMART HSR — Phase 10 UAT Checklist (بلدية القنفذة / Al-Qunfudhah)

Updated for Phase 10. Items marked **[VERIFIED — Phase 10 real-browser E2E]** were genuinely
executed against a real Chromium browser, the real app code, and the real Firestore/Auth
emulators (never faked, never a direct database edit standing in for a UI action) — see
`RELEASE-CANDIDATE.md` for exactly how. Items marked **MANUAL REQUIRED** still need a human
on real hardware / a real network path this sandbox cannot provide, and must not be checked
off until a person does so against the real Preview/Staging deployment.

## Roles

- [ ] **Mayor (رئيس البلدية)**: can view the cross-department overview; cannot perform an
      operational mutation reserved to a lower role; sees only بلدية القنفذة's own data.
      MANUAL REQUIRED for a human click-through of the Manager dashboard's own UI; the
      underlying authorization boundary is **[VERIFIED]** via the full Firestore Rules
      regression suite (1869/1869) and the real-browser negative-security suite below.
- [x] **Department Head → Administrative Affairs → Mobility Head → Employee** full mission
      lifecycle: create, submit, approve, allocate vehicle, handover, start, incident
      (report → acknowledge → in-progress → resolve), resume, finish, return, confirm return,
      close. **[VERIFIED — Phase 10 real-browser E2E]**: `test/e2e/mayor-scenario.js`, all 12
      steps, real clicks in a real Chromium session against real Firestore/Auth emulators, the
      real trusted vehicle-allocation server endpoint, and a verified 12-entry audit trail for
      the mission plus a 4-entry audit trail for the incident.
- [ ] **Supervisor with an active delegation**: while delegated, receives scoped/time-bound
      authority; delegation expiry/revocation fails closed; cannot self-grant. MANUAL REQUIRED
      (no delegation fixture exists in the current E2E harness) — code-reviewed in Phase 09.
- [x] **Section Head cannot approve their own mission** (role-transition denied):
      **[VERIFIED — Phase 10 real-browser E2E]**, `test/e2e/negative-security.js`.
- [x] **Employee cannot elevate role, cannot read cross-tenant data, cannot reach
      manager.html**: **[VERIFIED — Phase 10 real-browser E2E]**,
      `test/e2e/negative-security.js` (7/7 real browser-session negative-security checks pass).
- [ ] **Contractor**: only the allowed contractor workflow, cannot modify privileged fields,
      cannot elevate status outside the trusted workflow, tenant isolation enforced. MANUAL
      REQUIRED for a human click-through of `mobile-map.html` (this sandbox has no working
      real-browser harness for that specific page — see `RELEASE-CANDIDATE.md`); the
      underlying authorization boundary is **[VERIFIED]** via the existing Firestore Rules
      regression suite.

## Field GPS (physical device required)

MANUAL REQUIRED for every item below — Phase 09's code review (multi-sample stability,
staleness/accuracy bounds, explicit weak-GPS consent, fail-closed permission handling) stands,
but real GPS hardware and a real mobile browser cannot be exercised from this sandbox.

- [ ] Grant location permission on a real phone browser: a stable fix is captured, accuracy is
      shown honestly, and the observation records the real
      `locationAccuracyMeters`/`locationSource`.
- [ ] Deny location permission: fails closed with a clear Arabic message, offers manual map
      placement.
- [ ] Indoors / weak-signal test: the "GPS ضعيف — غير موثّق" explicit-consent path appears.
- [ ] Manual map correction after a GPS fix records `gps_corrected`, distinct from
      `manual_map`.
- [ ] The evidence photo and the GPS fix land on the same observation record after a full
      field submission round-trip.

## Lands SSO handoff

All items below are **[VERIFIED]** via Lands' own real Firestore-emulator test suite
(`test/lands-sso.test.js`, part of the 63/66-passing emulator run re-confirmed in Phase 10 with
zero regression from Phase 09) — not a browser click-through, but genuine server-side logic
execution against real Firestore transactions, not a unit-test mock:

- [x] A Lands-entitled employee's handoff issues and is consumed correctly, landing them on
      Lands with the correct municipality/role, with zero additional login prompt.
- [x] Reusing the same handoff code a second time is denied.
- [x] The ~60-second handoff window expiring before consumption is denied.
- [x] An account disabled between issuing and consuming the handoff is denied at consumption.
- [x] A revoked Lands entitlement is denied at consumption, live-checked, not just at issuance.
- [x] The Phase 09 fix (a disabled/revoked draft author cannot update their own old draft) is
      confirmed intact by 5 new focused regression tests, unchanged from Phase 09.

MANUAL REQUIRED: a human click-through of the actual redirect from the Manager login page to
a live Lands deployment (cross-origin, requires two real deployed environments talking to each
other — not reproducible from one sandboxed session).

## Mobility (Smart Mobility route)

- [x] **[VERIFIED — Phase 10 real-browser E2E]**: Department Head sees only their own
      department's missions/incidents (query-scoped by `organizationId`+`department`,
      exercised for real in the E2E run).
- [x] **[VERIFIED]**: Employee sees only vehicles/missions assigned to them.
- [x] **[VERIFIED]**: the full allocation → handover → return cycle completes and every status
      transition is reflected correctly for the roles that should see it.
- [x] **[VERIFIED]**: unavailable-target/wrong-role/wrong-tenant vehicle allocation attempts
      are denied (`test/e2e/negative-security.js`, plus the full existing Rules/endpoint
      regression suite).
- Real defect found and fixed in Phase 10: mission creation and incident creation were
  completely broken for every real user (a Firestore Rules self-reference evaluation ceiling
  — see `RELEASE-CANDIDATE.md`). Fixed and re-verified end to end.
- Real test-fixture gap found and fixed in Phase 10: the E2E seed's employee account was
  missing `vehicleEligible: true` (a real, deliberate Phase 03B.1 safety field), so vehicle
  allocation always failed in this harness even though the product logic was correct.

## Operational Map

- [x] **[VERIFIED — Phase 10 real-browser E2E]**: loads correctly in a real Chromium browser
      against the real Firestore/Auth emulators and the real trusted geo-context API (bridged
      in-process for this sandbox — see `RELEASE-CANDIDATE.md` — with zero change to the
      handler's own logic).
- [x] **[VERIFIED]**: only the signed-in manager's own organization's data appears (real
      `organizationId`-scoped Firestore query and trusted API call).
- [x] **[VERIFIED]**: entity selection opens the details panel with real entity data.
- Real defect found and fixed in Phase 10: an empty geo layer (the normal state for a newly
  onboarded municipality with no reference geo data loaded yet) crashed the map instead of
  rendering an empty layer. Fixed and re-verified.
- MANUAL REQUIRED: the "Open in Digital Twin" cross-page continuity handoff, and real-world
  imagery tiles (this sandbox's network policy blocks the OSM tile host; the app's own local-
  basemap fallback was used to test everything else about the page).

## Digital Twin (twin.html, Cesium)

- [x] **[VERIFIED]**: loads correctly in a real Chromium browser with the local-vendored
      Cesium assets, real Firestore/Auth emulators, and the real trusted geo-context API.
- [x] Code review: the Cesium `Viewer` uses no custom `screenSpaceCameraController`
      restriction — orbit/rotate/tilt rely entirely on Cesium's own default, unmodified camera
      handling, not custom app code, which is a materially lower-risk starting point than a
      hand-rolled camera controller.
- [ ] **MANDATORY MANUAL CHECK — orbit / rotate / tilt via real human pointer/touch
      interaction.** Not satisfied by this sandbox's synthetic pointer-event reproduction
      (attempted and inconclusive in a headless/software-GL environment, exactly as this
      phase's own instructions anticipated) — this box may only be checked by a person
      physically operating a mouse/trackpad and a touchscreen against a real deployment.

## RTL (Arabic right-to-left layout)

- [x] **[VERIFIED]** on every page reached by Phase 10's real-browser testing
      (login/manager/smart-mobility/operational-map/twin): `dir="rtl"` is preserved, text
      reads right-to-left, and no layout broke under RTL in any of these real sessions.
- [ ] MANUAL REQUIRED for `dashboard.html` (Field/Inspector) and `mobile-map.html`
      (Contractor), which this sandbox's harness could not reach (see Operational Map's
      MANUAL REQUIRED note and `RELEASE-CANDIDATE.md`).

## Responsive — mobile / tablet / desktop

- [x] **[VERIFIED — Phase 10 real-browser E2E]**: `test/e2e/responsive-qa.js`, real screenshots
      captured for every seeded Mobility role across desktop (1600×990, 1440×900, 1366×768),
      tablet (iPad 13"/11" landscape and portrait), and mobile (390/412/430 width) viewports —
      see `RELEASE-CANDIDATE.md` for the exact pass/fail count and any horizontal-overflow
      finding.
- [ ] MANUAL REQUIRED to repeat the same viewport sweep for `dashboard.html` and
      `mobile-map.html` once a human tester has real-browser access to those two pages.

## Suspension

- [ ] A tenant suspended from the Owner Console immediately fails closed for every one of its
      users on their very next request — no cached session continues to work. MANUAL REQUIRED
      end-to-end (Owner Console's own suspend action is covered by Owner's own 81/81 test
      suite; the cross-repo effect on a live Manager session needs a human check).
- [ ] Reactivating the tenant restores access without requiring re-registration or losing
      role/assignment history. MANUAL REQUIRED.

## Sign-off

Phase 10 substantially exceeded a code-review-only pass: the core Smart Mobility lifecycle,
role-boundary/tenant-isolation negative tests, and both the Operational Map and Digital Twin
now have genuine real-browser verification, not just static analysis. What remains MANUAL
REQUIRED above is bounded and explicit — Field/Contractor pages this sandbox's harness cannot
reach, physical GPS hardware, and the literal human hand on a mouse/touchscreen for camera
gestures. None of these were fabricated as passed.

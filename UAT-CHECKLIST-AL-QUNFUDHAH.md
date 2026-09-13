# SMART HSR — Phase 10 UAT Checklist (بلدية القنفذة / Al-Qunfudhah)

Manual verification checklist for the real tenant. Every item here requires a human tester
on real hardware — none of these were (or could be) executed automatically in this phase's
sandboxed environment, and none should be treated as passed until a person checks the box
against the real Preview/Staging deployment with the real tenant's own accounts.

## Roles

- [ ] **Mayor**: can view the cross-department overview; cannot perform an operational
      mutation reserved to a lower role; sees only بلدية القنفذة's own data.
- [ ] **Supervisor with an active delegation**: while delegated, can act within the
      delegated scope only; delegation naturally expires/revokes and the supervisor's
      authority reverts exactly to their own role afterward.
- [ ] **Section Head**: can manage their own section's assignments; cannot reach another
      section's data or another department's Mobility fleet.
- [ ] **Employee**: sees only their own assigned missions/vehicles/incidents (per the
      `assignedEmployeeUid`/`createdByUid` scoping); cannot see another employee's.
- [ ] **Contractor**: can submit evidence only for their own assigned observation; cannot
      read or write another contractor's assignment; cannot reopen a COMPLETED observation.

## Field GPS (physical device required — Gate 3 code review passed, hardware behavior not
verifiable from this sandbox)

- [ ] Grant location permission on a real phone browser: a stable fix is captured, accuracy
      is shown honestly (not fabricated), and the observation records the real
      `locationAccuracyMeters`/`locationSource`.
- [ ] Deny location permission: the flow fails closed with a clear Arabic message and offers
      manual map placement — never a silent wrong location.
- [ ] Indoors / weak-signal test: confirm the "GPS ضعيف — غير موثّق" (weak-GPS, explicit
      consent, unverified-accuracy) path appears rather than silently accepting a bad fix as
      trustworthy.
- [ ] Manual map correction after a GPS fix: confirm the corrected point is recorded as
      `gps_corrected`, distinct from a pure manual placement (`manual_map`).
- [ ] Confirm the observation's evidence photo and GPS fix are attached to the same
      observation record after a full field submission round-trip.

## Lands SSO handoff

- [ ] A Lands-entitled employee signed into the Manager unified gateway reaches Lands with
      zero additional login prompts.
- [ ] Attempting to reuse the same handoff URL/code a second time is denied.
- [ ] Waiting past the ~60-second handoff window before opening the Lands link is denied
      with an expiry error, not a silent failure.
- [ ] An account disabled by a Manager between issuing and consuming the handoff is denied
      at consumption, even though the handoff record itself was still technically valid.
- [ ] Navigating to the Lands app directly (no handoff code at all) requires a normal Lands
      sign-in — never grants access on its own.

## Mobility (Smart Mobility route)

- [ ] Department Head sees only their own department's missions/incidents.
- [ ] Employee sees only vehicles/missions assigned to them.
- [ ] A vehicle allocation/handover/return cycle completes and is reflected live for every
      role that should see it.

## Operational Map

- [ ] Loads correctly on a real browser (this phase could not do real-browser acceptance —
      outbound CDN egress is blocked in this sandbox; local-vendored assets per Phase 08.3
      should make this work, but must be confirmed on real infrastructure).
- [ ] Only the viewer's own organization's field observations/contractor assignments/GPS
      presence appear on the map.

## Digital Twin (twin.html, Cesium)

- [ ] Loads correctly on a real browser with the local-vendored Cesium assets.
- [ ] **Manual camera gestures**: pan, zoom, tilt/rotate all behave as expected on both a
      mouse+trackpad desktop session and a touch tablet session.

## RTL (Arabic right-to-left layout)

- [ ] Every page in this checklist renders correctly right-to-left: text alignment, icon
      mirroring where appropriate, form field order, and dialog/toast positioning.

## Responsive — mobile / tablet / desktop

- [ ] Repeat the role-based checks above at three real viewport classes: a phone, a tablet,
      and a desktop browser window — layout must not clip, overlap, or hide any control at
      any of the three.

## Suspension

- [ ] A tenant suspended from the Owner Console immediately fails closed for every one of
      its users on their very next request — no cached session continues to work.
- [ ] Reactivating the tenant restores access without requiring any user to re-register or
      lose their role/assignment history.

## Sign-off

This checklist is not release-blocking to *start* Phase 10 — it is Phase 10's own content.
Phase 09 is READY to proceed into UAT with this checklist as the acceptance instrument.

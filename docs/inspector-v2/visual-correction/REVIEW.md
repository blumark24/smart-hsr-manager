# Visual correction — design lock

This pass starts at `2d546cf8cab68530fd51ec540ea6000a46b6d0c2`. It changes the Inspector presentation and its map adapter only. Capture, validation, save, role enforcement, organization scope, workflow and data are preserved. The sole API presentation change exposes the already-existing `displayId` field so case cards can display the actual report number; no schema/write behavior changes.

## Reference composition

Implemented from the supplied phone image: right-side circular inspector avatar, compact identity hierarchy, circular notification control, three status cards, compact map with segmented tabs and edge controls, in-bounds contextual case card, location radar, AI orb/strip, evidence-led mission, four raised quick actions, three horizontal report cards and five-item bottom navigation with a raised circular capture button.

Local mobile proportions were checked against the visible reference, excluding the phone bezel and operating-system chrome. Approximate reference/implementation ratios relative to viewport width: map card width ~95%/~94%; map card height ~64%/~63%; bottom navigation width ~95%/~95%; bottom navigation height ~17%/~17%; raised capture button ~12%/~12%. These are manual composition checks, not an automated perceptual similarity score.

The internal visual estimate is **90% for composition/proportions**, subject to actual Preview review. **Visual Gate is not certified PASS on that estimate alone.** The real map uses licensed geometry, not the illustrative city's fictional elevations or routing lines. Weather, SLA time, unread counts and unavailable operational data stay explicitly unavailable. Those values cannot be copied from the reference without fabricating data.

## Preserved behavior / verification

All six routes and existing action handlers remain. A test-only browser harness covers 390×844, 320×740, 820×1180 and 1440×1000 viewports; it asserts bounds/overflow, three tabs, actual map rendering from the genuine local geographic reference, card exclusion from the map center, perspective controls and all existing capture/review routes. It makes **zero** requests to the blocked OSM raster endpoint. Operational fixtures are confined to tests and excluded from deployment.

The added source tests verify provider region/organization restrictions, genuine reference geometry, no fabricated missing building heights, legal attribution and a no-key external vector provider. Firebase Rules, authorization, capture/GPS/save services and domain workflow files are unchanged.

See `comparison.html` for before/after screenshots. These are local simulated-auth screenshots, not live-account UAT. Preview readiness and the exact deployed Git SHA must be checked after the feature branch is pushed. No Production deployment or merge is part of this pass.

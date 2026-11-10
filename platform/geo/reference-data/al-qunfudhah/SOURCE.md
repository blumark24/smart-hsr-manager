# Reference geographic data — Al-Qunfudhah (القنفذة)

This directory holds a small, REAL, bounded extract of open geographic
reference data used by the SMART HSR Geo Core as a demonstration/UAT dataset
for Phase 08. It is reference data only — see "What this is NOT" below.

## Provenance

| Field | Value |
|---|---|
| Source | [Overture Maps Foundation](https://overturemaps.org) |
| Release | `2026-08-19.0` |
| Themes | `places` (type `place`), `buildings` (type `building`) |
| Bounding box (places) | `xmin=40.90, ymin=18.95, xmax=41.25, ymax=19.30` |
| Bounding box (buildings) | `xmin=41.065, ymin=19.118, xmax=41.093, ymax=19.136` |
| Extraction tool | [`overturemaps` Python CLI](https://pypi.org/project/overturemaps/) v0.16.0, calling `overturemaps.core.record_batch_reader()` directly against the release's public S3 dataset (`s3://overturemaps-us-west-2/release/2026-08-19.0/...`) |
| Extraction date | 2026-09-12 |
| Feature counts | `places.geojson`: 87 features · `buildings.geojson`: 1,388 features |
| Underlying licenses | Overture's Places theme is released under **CDLA Permissive 2.0**; Buildings in this extract are sourced from Microsoft ML Buildings and OpenStreetMap contributors, both under **ODbL 1.0** (see each feature's own `sources[].license` for its specific attribution) |

Regenerate with `node platform/geo/reference-data/al-qunfudhah/extract.py` (see
that script's header for the exact bbox/release parameters used above) —
requires `pip install overturemaps pyarrow` and outbound access to
`overturemaps-us-west-2.s3.amazonaws.com` (plain HTTPS to S3; no STAC catalog
access is required — the extraction is pinned to an explicit release string).

## Real-data honesty note

Exactly **one** building in `buildings.geojson` (`sources[].dataset ==
"OpenStreetMap"`, `record_id: "w1130699627@1"`) carries a real, sourced
`height` (5.0 m) and `num_floors` (1) value. All other 1,387 buildings have
NO source height/floor data at all — those keys are simply absent from their
`properties`, not zero or null-filled. This is the real, honest state of open
building data for this area today, and it is exactly the case the Geo Core's
3D-extrusion rule is built to handle: render the true height where the
source actually provides one, and render a flat footprint (no invented
height) everywhere else. Do not "fix" this by inventing heights for the
other 1,387 buildings.

## What this is NOT

- This is **not** municipal-authoritative data. No place or building here has
  any municipal license, permit, ownership, zoning, or approval status —
  because Overture doesn't carry that data, and SMART HSR never infers it.
- This is **not** a live/realtime feed. It is a static, dated snapshot of one
  Overture release, used for reference-layer rendering and Phase 08's real
  data UAT — never described as "live" or "مباشر" anywhere in the UI.
- This is **not** the production data-serving path. In production the same
  `overturemaps` extraction approach (documented in `extract.py`) is intended
  to run as a periodic, offline ETL job writing into a scalable store (e.g.
  tiled/partitioned Cloud Storage), not as a request-time dependency. This
  repo-committed extract is a small, real, versioned stand-in for that store
  so Phase 08's provider abstraction, Entity Card, and UAT can be exercised
  against genuine open data without requiring production infrastructure.

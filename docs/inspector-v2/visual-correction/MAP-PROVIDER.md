# Inspector map provider correction

The visual shell is independent of `map-provider.mjs`. Operational markers continue to come exclusively from the authenticated Inspector repository. No provider introduces observations, fake paths, synthetic building heights, or municipal authority.

## Registered, bounded local reference

For the registered Qunfudhah organization, **only when the current map origin is inside the existing extract bounds**, the provider uses the repository's genuine Overture reference extract. Attribution remains visible. Its source, dates, bounds and feature-level licenses are documented in `platform/geo/reference-data/al-qunfudhah/SOURCE.md`. The source geometry is unchanged. Missing heights render as flat footprints; only sourced heights may extrude. The 3D control changes the map's camera/perspective, not the data. It does not invent a 3D city. This mode makes Preview rendering independent of third-party tile access and billing, without using placeholders or mocked 403 images.

It is a dated geographic reference, **not live operational or municipal-authoritative data**, and must not be relabeled as such. The extract is not used outside its organization and bounding box. No default location or user position is fabricated.

## Other regions

The vector adapter uses OpenFreeMap's public instance, with a custom navy style and required OpenMapTiles/OSM attribution. No raster requests to `tile.openstreetmap.org` remain. No API key, new account, paid service or billing commitment is introduced.

Legal/operational basis checked against the official source repository:
- https://github.com/hyperknot/openfreemap/blob/main/README.md — public instance, no API keys, no usage/view/request limits.
- https://github.com/hyperknot/openfreemap/blob/main/website/content/index/after_donate.md — explicitly permits commercial use; requires attribution; makes **no SLA guarantee**.
- https://openfreemap.org/tos — consult current terms before municipality-scale rollout.

Production requires reachability of `tiles.openfreemap.org`, monitoring its current terms/availability, and a self-hosted or otherwise approved alternative if a guaranteed SLA is required. No new paid provider is selected here. An arbitrary HTTP proxy to OSM is deliberately not introduced. Errors are displayed as a scoped data-unavailable state rather than a mosaic of denied tile images. This state is not a passed visual acceptance result.

## Performance

MapLibre and fonts are existing/local or vendored static assets. The local reference is fetched once per page session and has bounded feature count. Map objects/markers/listeners are disposed on route exit; hidden views keep the existing cleanup flow. The source adapter emits static style metadata and genuinely sourced geometry only.

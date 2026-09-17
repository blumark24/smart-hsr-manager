'use strict';
// Browser entry point for the SMART HSR Geo Core's pure, client-safe
// contracts. Bundled by scripts/build-geo-core-bundle.js (same
// dependency-free local bundler already used for
// platform/browser/assignment-v2-preview-entry.js) into geo-core.bundle.js,
// loaded via a plain <script> tag by operational-map.html and twin.html.
//
// Server-only concerns (the file-reading static reference provider in
// geo-provider-contract.js, which uses Node's fs/path) are deliberately
// NOT included here — the browser fetches geo layer data from the existing
// trusted /api/organization/context endpoint instead of running a provider
// locally. Authorization decisions exposed here (geo-policy) are for
// CLIENT-SIDE UX only (e.g. hiding a layer toggle a role can't use) — the
// server independently re-enforces every one of them; the browser is never
// the authority.
const geoEntity = require('../geo/geo-entity-contract');
const geoSourceTruth = require('../geo/geo-source-truth');
const geoLayerRegistry = require('../geo/geo-layer-registry');
const geoCameraState = require('../geo/geo-camera-state');
const geoContinuity = require('../geo/geo-continuity');
const geoStyleTokens = require('../geo/geo-style-tokens');
const geoSearch = require('../geo/geo-search-contract');
const geoAttribution = require('../geo/geo-attribution-registry');
const geoWriteGuard = require('../geo/geo-write-guard');
const geoPolicy = require('../geo/geo-policy');

globalThis.SmartHSRGeoCore = Object.freeze({
  entity: geoEntity,
  sourceTruth: geoSourceTruth,
  layerRegistry: geoLayerRegistry,
  cameraState: geoCameraState,
  continuity: geoContinuity,
  styleTokens: geoStyleTokens,
  search: geoSearch,
  attribution: geoAttribution,
  writeGuard: geoWriteGuard,
  policy: geoPolicy,
});

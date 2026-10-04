// GIS Spatial Adapter (RC/GIS-final §12) — the seam between Lands business
// data and any map renderer. Pure functions only: no DOM, no MapLibre, no
// fetch, no authorization logic of its own. Callers pass already-authorized,
// already-scoped grants/parcels (loaded once through the trusted client);
// this module only ever transforms what it's given.
//
// Spatial contract (§13 — documented, not yet backed by real data): a
// parcel MAY carry an optional `spatial` field:
//   spatial: { type: 'Point' | 'Polygon' | 'MultiPolygon',
//              geometry: <GeoJSON geometry object>,
//              source: string,        // e.g. 'official_gis', 'review_demo'
//              captured_at: string }  // ISO date
// No real parcel in this system has this field today — the schema (see
// database/firestore-schema.md, client/lands-core.js COMMON_DOMAIN_KEYS,
// firebase/firestore.rules) simply doesn't define coordinates/geometry yet.
// A parcel is "georeferenced" only when `spatial.geometry` is present.
// Every other parcel is honestly "not georeferenced" and must never be
// plotted at a fabricated position — see isGeoreferenced()/unmappedGrants().

export function isGeoreferenced(parcel) {
  return Boolean(parcel && parcel.spatial && parcel.spatial.geometry);
}

export function parcelForGrant(grant, parcelsById) {
  return grant && grant.parcel_id ? (parcelsById.get(grant.parcel_id) || null) : null;
}

export function buildParcelIndex(parcels) {
  const map = new Map();
  (parcels || []).forEach(p => { if (p && p.id) map.set(p.id, p); });
  return map;
}

/**
 * Builds a GeoJSON FeatureCollection from already-scoped grants. Status
 * classification is never re-derived here — the caller passes classifyFn
 * (AutomationEngine.classifyGrant in index.html) so the map can never
 * disagree with the rest of the product about what "complete"/"critical"/
 * etc. means. selectedGrantId is optional, purely for marking the
 * currently-open Parcel Twin Inspector selection in properties.selected.
 */
export function buildFeatureCollection(grants, parcelsById, classifyFn, selectedGrantId) {
  const features = [];
  for (const grant of grants || []) {
    const parcel = parcelForGrant(grant, parcelsById);
    if (!isGeoreferenced(parcel)) continue;
    features.push({
      type: 'Feature',
      geometry: parcel.spatial.geometry,
      properties: {
        grantId: grant.id,
        parcelId: parcel.id,
        reference: parcel.reference_id || parcel.name || '',
        status: classifyFn(grant),
        selected: Boolean(selectedGrantId && grant.id === selectedGrantId)
      }
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Grants whose parcel has no legitimate geometry — never fabricate a position for these. */
export function unmappedGrants(grants, parcelsById) {
  return (grants || []).filter(g => !isGeoreferenced(parcelForGrant(g, parcelsById)));
}

/** [[minLng,minLat],[maxLng,maxLat]] over a FeatureCollection's Point/Polygon geometries, or null if empty. */
export function featureCollectionBounds(fc) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  let found = false;
  const visit = (coords, depth) => {
    if (depth === 0) {
      const [lng, lat] = coords;
      if (typeof lng !== 'number' || typeof lat !== 'number') return;
      found = true;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      coords.forEach(c => visit(c, depth - 1));
    }
  };
  const depthByType = { Point: 0, LineString: 1, Polygon: 2, MultiPoint: 1, MultiLineString: 2, MultiPolygon: 3 };
  for (const f of (fc && fc.features) || []) {
    const geom = f.geometry;
    if (!geom || !(geom.type in depthByType)) continue;
    visit(geom.coordinates, depthByType[geom.type]);
  }
  return found ? [[minLng, minLat], [maxLng, maxLat]] : null;
}

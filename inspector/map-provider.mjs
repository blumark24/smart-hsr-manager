// Geographic reference only. Operational markers are supplied separately by the scoped repository.
export const REFERENCE = Object.freeze({
  organizationId: "CnlVlKC7UcDMp2NZzjjT",
  bounds: [41.065, 19.118, 41.093, 19.136],
  url: "/platform/geo/reference-data/al-qunfudhah/buildings.geojson",
  attribution:
    '<a href="https://overturemaps.org" target="_blank" rel="noopener">© Overture Maps</a> · <a href="https://github.com/microsoft/GlobalMLBuildingFootprints" target="_blank" rel="noopener">Microsoft</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL 1.0</a>',
});
export function hasLocalReference(organizationId, origin) {
  const [west, south, east, north] = REFERENCE.bounds;
  return (
    organizationId === REFERENCE.organizationId &&
    !!origin &&
    origin[0] >= west &&
    origin[0] <= east &&
    origin[1] >= south &&
    origin[1] <= north
  );
}
let referencePromise;
export async function basemapFor({ organizationId, origin }) {
  if (hasLocalReference(organizationId, origin)) {
    referencePromise ??= fetch(REFERENCE.url, { cache: "force-cache" })
      .then((r) => {
        if (!r.ok) throw new Error("reference_unavailable");
        return r.json();
      })
      .catch((error) => {
        referencePromise = null;
        throw error;
      });
    const raw = await referencePromise;
    const features = raw.features.map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        height: Number.isFinite(f.properties?.height) ? f.properties.height : 0,
      },
    }));
    return {
      id: "local-reference",
      label: "مرجع جغرافي · القنفذة",
      attribution: REFERENCE.attribution,
      features,
      style: {
        version: 8,
        sources: {
          buildings: {
            type: "geojson",
            data: { type: "FeatureCollection", features },
          },
        },
        layers: [
          {
            id: "ground",
            type: "background",
            paint: { "background-color": "#092a48" },
          },
          {
            id: "footprints",
            type: "fill",
            source: "buildings",
            paint: { "fill-color": "#14537c", "fill-opacity": 0.94 },
          },
          {
            id: "edge-glow",
            type: "line",
            source: "buildings",
            paint: {
              "line-color": "#4d9fe3",
              "line-opacity": 0.18,
              "line-width": 3,
              "line-blur": 2,
            },
          },
          {
            id: "edges",
            type: "line",
            source: "buildings",
            paint: {
              "line-color": "#5aabd3",
              "line-opacity": 0.66,
              "line-width": 0.65,
            },
          },
          {
            id: "sourced-heights",
            type: "fill-extrusion",
            source: "buildings",
            filter: [">", ["get", "height"], 0],
            paint: {
              "fill-extrusion-color": "#368abd",
              "fill-extrusion-height": ["get", "height"],
              "fill-extrusion-opacity": 0.9,
            },
          },
        ],
      },
    };
  }
  // OpenFreeMap's public instance explicitly permits free commercial use, no account/key/billing.
  // Source: https://github.com/hyperknot/openfreemap — OSM/ODbL attribution remains visible.
  return {
    id: "openfreemap",
    label: "OpenFreeMap",
    attribution:
      '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>',
    style: {
      version: 8,
      sources: {
        openmaptiles: {
          type: "vector",
          url: "https://tiles.openfreemap.org/planet",
          attribution:
            '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>',
        },
      },
      layers: [
        {
          id: "ground",
          type: "background",
          paint: { "background-color": "#08233d" },
        },
        {
          id: "landcover",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "landcover",
          paint: { "fill-color": "#133f4d", "fill-opacity": 0.5 },
        },
        {
          id: "water",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "water",
          paint: { "fill-color": "#031b35" },
        },
        {
          id: "roads-casing",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          paint: {
            "line-color": "#164a72",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 8],
          },
        },
        {
          id: "roads",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          paint: {
            "line-color": "#3b78a2",
            "line-opacity": 0.8,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.4,
              16,
              2.6,
            ],
          },
        },
        {
          id: "buildings",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "building",
          minzoom: 13,
          paint: { "fill-color": "#18507b", "fill-outline-color": "#327db2" },
        },
        {
          id: "sourced-heights",
          type: "fill-extrusion",
          source: "openmaptiles",
          "source-layer": "building",
          minzoom: 14,
          filter: [">", ["coalesce", ["get", "render_height"], 0], 0],
          paint: {
            "fill-extrusion-color": "#2472a6",
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 0],
            "fill-extrusion-base": [
              "coalesce",
              ["get", "render_min_height"],
              0,
            ],
            "fill-extrusion-opacity": 0.9,
          },
        },
      ],
    },
  };
}

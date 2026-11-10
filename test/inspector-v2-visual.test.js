"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const root = path.join(__dirname, "..");
test("same-origin geographic reference is restricted to its registered municipality and actual bounds", async () => {
  const { hasLocalReference, REFERENCE } = await import(
    "../inspector/map-provider.mjs"
  );
  assert.equal(
    hasLocalReference(REFERENCE.organizationId, [41.07889, 19.12639]),
    true,
  );
  assert.equal(hasLocalReference("other-org", [41.07889, 19.12639]), false);
  assert.equal(
    hasLocalReference(REFERENCE.organizationId, [46.67, 24.71]),
    false,
  );
  assert.equal(hasLocalReference(REFERENCE.organizationId, null), false);
});
test("reference basemap preserves real geometry and never invents missing building heights", async () => {
  const { basemapFor, REFERENCE } = await import(
    "../inspector/map-provider.mjs"
  );
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, REFERENCE.url), "utf8"),
  );
  const originalFetch = global.fetch;
  let requested;
  global.fetch = async (url) => {
    requested = url;
    return { ok: true, json: async () => raw };
  };
  try {
    const provider = await basemapFor({
      organizationId: REFERENCE.organizationId,
      origin: [41.07889, 19.12639],
    });
    assert.equal(requested, REFERENCE.url);
    assert.equal(provider.id, "local-reference");
    assert.equal(provider.features.length, raw.features.length);
    assert.deepEqual(provider.features[0].geometry, raw.features[0].geometry);
    provider.features.forEach((feature, index) =>
      assert.equal(
        feature.properties.height,
        Number.isFinite(raw.features[index].properties.height)
          ? raw.features[index].properties.height
          : 0,
      ),
    );
    assert.match(provider.attribution, /Overture/);
    assert.match(provider.attribution, /ODbL/);
  } finally {
    global.fetch = originalFetch;
  }
});
test("other regions use a documented no-key vector provider and never the blocked OSM raster endpoint", async () => {
  const { basemapFor } = await import("../inspector/map-provider.mjs");
  const provider = await basemapFor({
    organizationId: "other-org",
    origin: [46.67, 24.71],
  });
  assert.equal(provider.id, "openfreemap");
  assert.equal(
    provider.style.sources.openmaptiles.url,
    "https://tiles.openfreemap.org/planet",
  );
  assert(!JSON.stringify(provider).includes("tile.openstreetmap.org"));
  assert.match(provider.attribution, /OpenStreetMap/);
});
test("visual shell keeps unsupported capabilities honest and all main routes independent", () => {
  const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
  const app = read("inspector/app.mjs");
  assert.match(app, /مصدر المهام القريبة غير مفعّل/);
  assert.match(app, /دليل المقاولين غير متاح/);
  assert.match(app, /غير متاح حالياً/);
  assert.match(app, /مهلة غير محددة/);
  assert.doesNotMatch(
    app,
    /HSR-1042|مرحباً أحمد|28°|01:34|iframe|dashboard\.html/,
  );
  for (const route of ["home", "tasks", "new", "statistics", "account"])
    assert.match(read("inspector.html"), new RegExp('href="#' + route + '"'));
  assert.match(app, /mapHTML/);
  assert.match(app, /data-navigate/);
});

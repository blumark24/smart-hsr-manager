"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { installFakes, FieldValue } = require("./helpers/fakeFirebaseAdmin");
const fakes = installFakes();
const db = fakes.store,
  auth = fakes.auth;
require.cache[require.resolve("../api/_lib/firebaseAdmin")] = {
  exports: { getDb: () => db, getAuth: () => auth, FieldValue },
};
const handler = require("../api/inspector/observations"),
  { validateDraft, uploadAllowed, createObservation, attachAfter } =
    handler._test;
const { pendingUploadId } = require("../api/storage/finalize")._test;
const caller = { uid: "ins", organizationId: "org" },
  key = "observations/org/report/before/image.jpg";
const draft = () => ({
  id: "report",
  objectKey: key,
  title: "رصد",
  details: "تفاصيل",
  type: "MAINTENANCE",
  latitude: 21,
  longitude: 39,
  accuracy: 10,
  sampleCount: 3,
  stable: true,
  capturedAt: Date.now(),
});
function seedUpload(objectKey = key, patch = {}) {
  db.seed("pendingEvidenceUploads/" + pendingUploadId(objectKey), {
    objectKey,
    ownerUid: "ins",
    organizationId: "org",
    observationId: "report",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 60000),
    ...patch,
  });
}
function setup() {
  db.docs.clear();
  db.seed("users/ins", {
    role: "inspector",
    organizationId: "org",
    active: true,
  });
  // Stage mutations until the callback succeeds, modelling transaction rollback.
  db.runTransaction = async (callback) => {
    const pending = [];
    const out = await callback({
      get: (ref) => ref.get(),
      create: (ref, data) => {
        assert(!db.docs.has(ref.path));
        pending.push(() => ref.set(data));
      },
      update: (ref, data) => pending.push(() => ref.set(data, { merge: true })),
    });
    for (const apply of pending) await apply();
    return out;
  };
}
async function call(
  method,
  body,
  uid = "ins",
  url = "/api/inspector/observations",
) {
  const res = {
    setHeader() {},
    end(value) {
      this.body = JSON.parse(value);
    },
  };
  await handler(
    {
      method,
      body,
      url,
      headers: uid ? { authorization: "Bearer token-for-" + uid } : {},
    },
    res,
  );
  return res;
}
test("server role guard denies unauthenticated, inactive, non-inspector and missing-org callers", async () => {
  for (const profile of [
    { role: "contractor", organizationId: "org" },
    { role: "inspector", organizationId: "org", active: false },
    { role: "inspector" },
  ]) {
    setup();
    db.seed("users/ins", profile);
    assert.equal((await call("POST", draft())).statusCode, 403);
  }
  setup();
  assert.equal((await call("POST", draft(), null)).statusCode, 401);
  assert.equal((await call("DELETE", {})).statusCode, 405);
});
test("server validates GPS, category and bounded fields", () => {
  for (const patch of [
    { sampleCount: undefined },
    { stable: false },
    { accuracy: 31 },
    { capturedAt: Date.now() - 31000 },
    { latitude: 100 },
    { longitude: null },
    { accuracy: 101 },
    { accuracy: -1 },
    { capturedAt: 0 },
    { capturedAt: Date.now() + 20000 },
    { type: "AUTO_CLOSE" },
    { title: "" },
    { details: "x".repeat(3001) },
  ])
    assert.throws(() => validateDraft({ ...draft(), ...patch }));
  assert.equal(validateDraft(draft()).locationSource, "gps");
});
test("atomic create binds private evidence, ignores forged org/status and exact retries never overwrite data", async () => {
  setup();
  seedUpload();
  const res = await call("POST", {
    ...draft(),
    organizationId: "evil",
    status: "COMPLETED",
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.confirmed, true);
  const record = db.docs.get("observations/report");
  assert.equal(record.organizationId, "org");
  assert.equal(record.createdByUid, "ins");
  assert.equal(record.status, "PENDING");
  assert.equal(
    db.docs.get("pendingEvidenceUploads/" + pendingUploadId(key)).status,
    "FINALIZED",
  );
  const retry = await call("POST", {
    ...draft(),
    capturedAt: 0,
    title: "overwrite",
  });
  assert.equal(retry.body.idempotent, true);
  assert.equal(db.docs.get("observations/report").title, "رصد");
});
test("cross-org, foreign owner, missing, expired and wrong path evidence cannot create observations", async () => {
  for (const patch of [
    { organizationId: "other" },
    { ownerUid: "other" },
    { observationId: "other" },
    { status: "FINALIZED" },
    { expiresAt: null },
    { expiresAt: new Date(0) },
  ]) {
    setup();
    seedUpload(key, patch);
    const res = await call("POST", draft());
    assert.equal(res.statusCode, 403);
    assert.equal(db.docs.has("observations/report"), false);
  }
  setup();
  assert.equal((await call("POST", draft())).statusCode, 403);
  setup();
  seedUpload();
  assert.throws(() =>
    uploadAllowed(
      db.docs.get("pendingEvidenceUploads/" + pendingUploadId(key)),
      caller,
      "report",
      "observations/other/report/before/image.jpg",
      "before",
    ),
  );
});
test("retry cannot read or overwrite another inspector or organization observation", async () => {
  for (const patch of [
    { createdByUid: "other", organizationId: "org" },
    { createdByUid: "ins", organizationId: "other" },
  ]) {
    setup();
    db.seed("observations/report", { ...patch, imageObjectKey: key });
    const before = { ...db.docs.get("observations/report") };
    assert.equal((await call("POST", draft())).statusCode, 404);
    assert.deepEqual(db.docs.get("observations/report"), before);
  }
});
test("after evidence preserves lifecycle, denies assigned/closed records and protects previous evidence", async () => {
  const after = "observations/org/report/after/image.jpg";
  for (const patch of [
    { status: "COMPLETED" },
    { assignedContractorUid: "contractor" },
    { assignedContractorUid: null },
    { afterImagePath: "existing.jpg" },
  ]) {
    setup();
    db.seed("observations/report", {
      createdByUid: "ins",
      organizationId: "org",
      status: "IN_PROGRESS",
      ...patch,
    });
    seedUpload(after);
    assert.ok(
      (await call("PATCH", { id: "report", objectKey: after, note: "معالجة" }))
        .statusCode >= 400,
    );
  }
  setup();
  db.seed("observations/report", {
    createdByUid: "ins",
    organizationId: "org",
    status: "IN_PROGRESS",
  });
  seedUpload(after);
  assert.equal(
    (
      await call("PATCH", {
        id: "report",
        objectKey: after,
        note: "معالجة",
        status: "COMPLETED",
      })
    ).body.confirmed,
    true,
  );
  assert.equal(db.docs.get("observations/report").status, "IN_PROGRESS");
});
test("transaction rejection produces failure, never a success acknowledgement", async () => {
  setup();
  seedUpload();
  db.runTransaction = async () => {
    throw new Error("unavailable");
  };
  assert.equal((await call("POST", draft())).statusCode, 503);
  assert.equal(db.docs.has("observations/report"), false);
});
test("domain coordinate safety, GPS freshness, distance and lifecycle guards", async () => {
  const d = await import("../inspector/domain.mjs");
  assert.equal(d.coordinates({ location: "," }), null);
  assert.equal(d.coordinates({ correctedLat: null, correctedLng: null }), null);
  assert.deepEqual(d.coordinates({ location: "21,39" }), [21, 39]);
  assert.equal(
    d.validGPS({ latitude: 21, longitude: 39, accuracy: 5, capturedAt: 0 }),
    false,
  );
  assert.equal(
    d.distance({ latitude: 21, longitude: 39 }, { location: "21,39" }),
    0,
  );
  assert.equal(d.canAttachAfter({ status: "COMPLETED" }), false);
});
test("runtime uses independent V2; historical UI is inert and excluded from deploy", () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  const html = read("inspector.html"),
    app = read("inspector/app.mjs");
  assert(!/iframe|dashboard\.html|modal-script/.test(html + app));
  assert.match(read("dashboard.html"), /inspector.html/);
  assert(!/firebase|modal|iframe/i.test(read("dashboard.html")));
  assert.match(read("login.html"), /href = 'inspector.html'/);
  assert.match(read(".vercelignore"), /test\//);
  assert.match(app, /saved\.confirmed\s*!==\s*true/);
  assert.match(app, /URL.revokeObjectURL/);
  assert.match(app, /pagehide/);
  assert.match(read("inspector/services.mjs"), /getCurrentPosition/);
});

test("list, cursor and aggregate queries enforce own-user AND organization scope", async () => {
  setup();
  const originalCollection = db.collection;
  function query(
    filters = [],
    sorted = false,
    cursorId = null,
    pageSize = Infinity,
  ) {
    const select = () => {
      let list = [...db.docs.entries()]
        .filter(
          ([key, value]) =>
            key.startsWith("observations/") &&
            filters.every(([f, v]) => value[f] === v),
        )
        .map(([key, value]) => ({
          id: key.split("/")[1],
          exists: true,
          data: () => value,
        }));
      if (sorted)
        list.sort(
          (a, b) =>
            (b.data().createdAt?.toMillis() || 0) -
            (a.data().createdAt?.toMillis() || 0),
        );
      if (cursorId)
        list = list.slice(list.findIndex((i) => i.id === cursorId) + 1);
      return list;
    };
    return {
      where: (f, op, v) => {
        assert.equal(op, "==");
        return query([...filters, [f, v]], sorted, cursorId, pageSize);
      },
      orderBy: (f, d) => {
        assert.equal(f, "createdAt");
        assert.equal(d, "desc");
        return query(filters, true, cursorId, pageSize);
      },
      startAfter: (s) => query(filters, sorted, s.id, pageSize),
      limit: (n) => query(filters, sorted, cursorId, n),
      get: async () => {
        const docs = select().slice(0, pageSize);
        return { docs, size: docs.length };
      },
      count: () => ({
        get: async () => ({ data: () => ({ count: select().length }) }),
      }),
    };
  }
  db.collection = (name) => {
    const ref = originalCollection(name);
    return name === "observations"
      ? { ...ref, where: (...args) => query().where(...args) }
      : ref;
  };
  try {
    for (let i = 0; i < 27; i++)
      db.seed("observations/r" + i, {
        createdByUid: "ins",
        organizationId: "org",
        title: "title " + i,
        status: "PENDING",
        createdAt: { toMillis: () => i + 1 },
        secret: "must not appear",
      });
    db.seed("observations/foreign-user", {
      createdByUid: "other",
      organizationId: "org",
      status: "PENDING",
    });
    db.seed("observations/foreign-org", {
      createdByUid: "ins",
      organizationId: "other",
      status: "PENDING",
    });
    const first = await call("GET");
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.items.length, 25);
    assert.equal(first.body.items[0].id, "r26");
    assert(!Object.hasOwn(first.body.items[0], "secret"));
    const second = await call(
      "GET",
      null,
      "ins",
      "/api/inspector/observations?cursor=" + first.body.nextCursor,
    );
    assert.equal(second.body.items.length, 2);
    assert.equal(second.body.nextCursor, null);
    assert.equal(
      (
        await call(
          "GET",
          null,
          "ins",
          "/api/inspector/observations?cursor=foreign-user",
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await call(
          "GET",
          null,
          "ins",
          "/api/inspector/observations?cursor=foreign-org",
        )
      ).statusCode,
      404,
    );
    const summary = await call(
      "GET",
      null,
      "ins",
      "/api/inspector/observations?summary=1",
    );
    assert.equal(summary.body.counts.PENDING, 27);
    assert.equal(summary.body.counts.COMPLETED, 0);
  } finally {
    db.collection = originalCollection;
  }
});

test("configured municipal service area is enforced by the trusted transaction", async () => {
  setup();
  seedUpload();
  db.seed("organizations/org", {
    mapBounds: [
      [10, 10],
      [15, 15],
    ],
  });
  assert.equal(
    (await call("POST", draft())).body.error,
    "outside_service_area",
  );
  assert.equal(db.docs.has("observations/report"), false);
});

test("authoritative owner and manager records cannot enter V2 through a stale inspector record", async () => {
  for (const [collection, data] of [
    ["owners", { active: true }],
    ["managers", { role: "manager", active: true, organizationId: "org" }],
  ]) {
    setup();
    db.seed(collection + "/ins", data);
    assert.equal((await call("POST", draft())).statusCode, 403);
  }
});

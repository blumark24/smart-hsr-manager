"use strict";
const { getDb, FieldValue } = require("./firebaseAdmin");
const { verifyRequestToken, getCallerContext } = require("./authz");
const {
  resolveInspectorContext,
  evaluateObservationAccess,
} = require("./inspectorAccess");
const {
  pendingUploadId,
  canonicalBeforeEvidenceKey,
} = require("./evidenceBinding");

const STATUSES = ["PENDING", "IN_PROGRESS", "PENDING_REVIEW", "COMPLETED"];
function fail(code, status = 400) {
  throw Object.assign(new Error(code), { status });
}
function id(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)
    ? value
    : fail("invalid_id");
}
function text(value, max, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail("invalid_text");
  return value.trim();
}
function validateDraft(body, now = Date.now()) {
  const lat = body.latitude,
    lng = body.longitude,
    accuracy = body.accuracy;
  if (
    !Number.isFinite(lat) ||
    Math.abs(lat) > 90 ||
    !Number.isFinite(lng) ||
    Math.abs(lng) > 180 ||
    !Number.isFinite(accuracy) ||
    accuracy <= 0 ||
    accuracy > 30 ||
    !Number.isInteger(body.sampleCount) ||
    body.sampleCount < 3 ||
    body.stable !== true ||
    !Number.isFinite(body.capturedAt) ||
    now - body.capturedAt > 30000 ||
    body.capturedAt > now + 10000
  )
    fail("gps_invalid_or_stale");
  if (!["MAINTENANCE", "CLEANLINESS", "SAFETY", "OTHER"].includes(body.type))
    fail("invalid_category");
  return {
    title: text(body.title, 160, true),
    details: text(body.details, 3000),
    type: body.type,
    originalLat: lat,
    originalLng: lng,
    correctedLat: lat,
    correctedLng: lng,
    location: `${lat},${lng}`,
    locationAccuracyMeters: accuracy,
    locationCapturedAt: new Date(body.capturedAt).toISOString(),
    locationSource: "gps",
    locationVerified: true,
  };
}
function validateServiceArea(draft, bounds) {
  if (bounds == null) return;
  if (
    !Array.isArray(bounds) ||
    bounds.length !== 2 ||
    bounds.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some((v) => !Number.isFinite(v)),
    )
  )
    fail("service_area_unavailable", 503);
  const [[south, west], [north, east]] = bounds;
  if (
    draft.correctedLat < Math.min(south, north) ||
    draft.correctedLat > Math.max(south, north) ||
    draft.correctedLng < Math.min(west, east) ||
    draft.correctedLng > Math.max(west, east)
  )
    fail("outside_service_area");
}
function owns(data, caller) {
  if (!evaluateObservationAccess(data, caller).allowed) fail("not_found", 404);
}
function uploadAllowed(upload, caller, observationId, key, scope) {
  const expiry =
    upload?.expiresAt?.toMillis?.() ?? new Date(upload?.expiresAt).getTime();
  if (
    !upload ||
    upload.ownerUid !== caller.uid ||
    upload.organizationId !== caller.organizationId ||
    upload.observationId !== observationId ||
    upload.objectKey !== key ||
    upload.status !== "PENDING" ||
    !Number.isFinite(expiry) ||
    expiry <= Date.now()
  )
    fail("evidence_binding_denied", 403);
  const beforeKey =
    scope === "before" ? key : key.replace("/after/", "/before/");
  if (
    !canonicalBeforeEvidenceKey(
      beforeKey,
      caller.organizationId,
      observationId,
    ) ||
    !key.startsWith(
      `observations/${caller.organizationId}/${observationId}/${scope}/`,
    )
  )
    fail("evidence_binding_denied", 403);
}
// Only explicit presentation fields cross the API boundary, never raw documents.
function present(snapshot) {
  const d = snapshot.data(),
    out = { id: snapshot.id };
  for (const k of [
    "title",
    "details",
    "type",
    "status",
    "location",
    "correctedLat",
    "correctedLng",
    "locationAccuracyMeters",
    "imageObjectKey",
    "imagePath",
    "afterImagePath",
    "resolutionNote",
    "assignedContractorUid",
    "supervisorNote",
    "isComparative",
    "inspectorVerification",
    "aiAnalysis",
  ]) {
    if (d[k] !== undefined) out[k] = d[k];
  }
  out.createdAt = d.createdAt?.toMillis?.() || null;
  return out;
}
async function createObservation(db, caller, body) {
  const observationId = id(body.id);
  const key = text(body.objectKey, 512, true);
  const ref = db.collection("observations").doc(observationId);
  const uploadRef = db
    .collection("pendingEvidenceUploads")
    .doc(pendingUploadId(key));
  return db.runTransaction(async (tx) => {
    const [existing, evidence, organization] = await Promise.all([
      tx.get(ref),
      tx.get(uploadRef),
      tx.get(db.collection("organizations").doc(caller.organizationId)),
    ]);
    if (existing.exists) {
      owns(existing.data(), caller);
      if (existing.data().imageObjectKey !== key) fail("request_conflict", 409);
      return { id: observationId, confirmed: true, idempotent: true };
    }
    const draft = validateDraft(body);
    validateServiceArea(
      draft,
      organization.exists ? organization.data().mapBounds : null,
    );
    uploadAllowed(
      evidence.exists ? evidence.data() : null,
      caller,
      observationId,
      key,
      "before",
    );
    tx.create(ref, {
      ...draft,
      clientRequestId: observationId,
      organizationId: caller.organizationId,
      createdByUid: caller.uid,
      status: "PENDING",
      displayId: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      imageObjectKey: key,
      imagePath: key,
      isComparative: false,
      actionPlan: "يتطلب تحديد إجراء ميداني بعد المراجعة.",
      riskAssessment: {
        priority: "UNKNOWN",
        timeframe: "MANUAL_REVIEW_REQUIRED",
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(uploadRef, {
      status: "FINALIZED",
      expiresAt: null,
      finalizedAt: FieldValue.serverTimestamp(),
    });
    return { id: observationId, confirmed: true };
  });
}
async function attachAfter(db, caller, body) {
  const observationId = id(body.id),
    key = text(body.objectKey, 512, true),
    note = text(body.note, 3000, true);
  const ref = db.collection("observations").doc(observationId);
  const uploadRef = db
    .collection("pendingEvidenceUploads")
    .doc(pendingUploadId(key));
  return db.runTransaction(async (tx) => {
    const [snap, upload] = await Promise.all([tx.get(ref), tx.get(uploadRef)]);
    if (!snap.exists) fail("not_found", 404);
    const d = snap.data();
    owns(d, caller);
    if (d.status === "COMPLETED" || Object.hasOwn(d, "assignedContractorUid"))
      fail("workflow_denied", 403);
    if (d.afterImagePath === key && d.resolutionNote === note)
      return { confirmed: true, id: observationId };
    // Preserve existing evidence. Replacements require a future versioned evidence contract.
    if (d.afterImagePath) fail("after_evidence_already_exists", 409);
    uploadAllowed(
      upload.exists ? upload.data() : null,
      caller,
      observationId,
      key,
      "after",
    );
    tx.update(ref, {
      afterImagePath: key,
      resolutionNote: note,
      isComparative: true,
    });
    tx.update(uploadRef, {
      status: "FINALIZED",
      expiresAt: null,
      finalizedAt: FieldValue.serverTimestamp(),
    });
    return { confirmed: true, id: observationId };
  });
}
async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  const send = (status, value) => {
    res.statusCode = status;
    res.end(JSON.stringify(value));
  };
  if (!["GET", "POST", "PATCH"].includes(req.method))
    return send(405, { error: "method_not_allowed" });
  try {
    let token;
    try {
      token = await verifyRequestToken(req);
    } catch (_) {
      return send(401, { error: "unauthenticated" });
    }
    const authoritative = await getCallerContext(token.uid);
    if (authoritative.isOwner || authoritative.isManager)
      return send(403, { error: "inspector_role_required" });
    const db = getDb(),
      caller = await resolveInspectorContext(db, token.uid);
    if (!caller) return send(403, { error: "inspector_role_required" });
    if (req.method !== "GET") {
      if (
        !req.body ||
        typeof req.body !== "object" ||
        Buffer.byteLength(JSON.stringify(req.body)) > 8192
      )
        fail("invalid_body");
      return send(
        200,
        req.method === "POST"
          ? await createObservation(db, caller, req.body)
          : await attachAfter(db, caller, req.body),
      );
    }
    const params = new URL(req.url, "http://localhost").searchParams;
    const base = db
      .collection("observations")
      .where("organizationId", "==", caller.organizationId)
      .where("createdByUid", "==", caller.uid);
    if (params.get("summary") === "1") {
      const counts = await Promise.all(
        STATUSES.map((status) =>
          base.where("status", "==", status).count().get(),
        ),
      );
      return send(200, {
        counts: Object.fromEntries(
          STATUSES.map((s, i) => [s, counts[i].data().count]),
        ),
      });
    }
    let query = base.orderBy("createdAt", "desc");
    if (params.get("cursor")) {
      const cursor = await db
        .collection("observations")
        .doc(id(params.get("cursor")))
        .get();
      if (!cursor.exists) fail("invalid_cursor");
      owns(cursor.data(), caller);
      query = query.startAfter(cursor);
    }
    const [snapshot, profile] = await Promise.all([
      query.limit(26).get(),
      db.collection("users").doc(caller.uid).get(),
    ]);
    return send(200, {
      items: snapshot.docs.slice(0, 25).map(present),
      nextCursor: snapshot.size > 25 ? snapshot.docs[24].id : null,
      profile: {
        uid: caller.uid,
        organizationId: caller.organizationId,
        organizationName: profile.data()?.organizationName || "",
        name: profile.data()?.name || profile.data()?.fullName || "",
        role: "inspector",
      },
    });
  } catch (e) {
    return send(e.status || 503, {
      error: e.status ? e.message : "service_unavailable",
    });
  }
}
module.exports = handler;
module.exports._test = {
  validateDraft,
  uploadAllowed,
  createObservation,
  attachAfter,
  present,
};

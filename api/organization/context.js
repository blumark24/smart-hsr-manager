'use strict';
const { getDb } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, activeIsNotFalse } = require('../_lib/authz');
const { callLandsSsoRegister, bridgeConfigured } = require('../_lib/landsBridge');
const { evaluateReferenceLayerAccess } = require('../../platform/geo/geo-policy');
const { createStaticReferenceExtractProvider, validateBbox, slugForOrganization } = require('../../platform/geo/geo-provider-contract');
const { getAttribution } = require('../../platform/geo/geo-attribution-registry');

const ALQUNFUDHAH_ORGANIZATION_ID = 'CnlVlKC7UcDMp2NZzjjT';
const ALQUNFUDHAH_APPROXIMATE_CENTER = Object.freeze({ lat: 19.12639, lng: 41.07889 });
const ALQUNFUDHAH_DEFAULT_ZOOM = 13;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(payload));
}
function cleanText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : fallback;
}
function finiteCoordinate(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function cleanCenter(value) {
  return value && finiteCoordinate(value.lat, -90, 90) && finiteCoordinate(value.lng, -180, 180)
    ? { lat: value.lat, lng: value.lng } : null;
}
function cleanBounds(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const southWest = Array.isArray(value[0]) ? { lat:value[0][0], lng:value[0][1] } : value[0];
  const northEast = Array.isArray(value[1]) ? { lat:value[1][0], lng:value[1][1] } : value[1];
  return cleanCenter(southWest) && cleanCenter(northEast)
    ? [[southWest.lat, southWest.lng], [northEast.lat, northEast.lng]] : null;
}
function requestedOrganizationId(req) {
  const direct = req.query && req.query.organizationId;
  if (typeof direct === 'string') return direct.trim();
  try { return new URL(req.url || '/', 'http://localhost').searchParams.get('organizationId')?.trim() || ''; }
  catch (_) { return ''; }
}

// ============================================================================
// PHASE 08 — SMART HSR Geo Core reference-layer query, dispatched from the
// SAME GET request path (by an optional ?geoLayer= param) as the map-context
// lookup above, rather than as a new /api file. This project's Vercel
// Hobby-plan Serverless Function budget was already at exactly 12 files
// (the maximum) before Phase 08 — see the existing api/ directory listing —
// so a 13th top-level function is not available; this endpoint already
// dispatches by HTTP method for an unrelated purpose (see
// handleLandsSsoHandoff above), so extending that same dispatch to a third,
// additive, backward-compatible GET mode is the proven-necessary, minimal
// path rather than a new file or a new function. When ?geoLayer= is absent,
// this endpoint's behavior is byte-for-byte unchanged from before Phase 08.
//
// commercial_places/buildings are OPEN, non-tenant reference data (Phase 08
// brief's TENANT ISOLATION section: "Open/global basemap data may be
// globally visible") — access still requires a verified, recognized Smart
// HSR role (never anonymous) via evaluateReferenceLayerAccess(), but is not
// restricted to the caller's own organizationId the way municipal records
// are elsewhere in this file.
// ============================================================================
const GEO_LAYER_QUERY = Object.freeze({
  commercial_places: (provider, args) => provider.queryPlaces(args),
  buildings: (provider, args) => provider.queryBuildings(args),
});

function requestedGeoLayer(req) {
  const direct = req.query && req.query.geoLayer;
  if (typeof direct === 'string') return direct.trim();
  try { return new URL(req.url || '/', 'http://localhost').searchParams.get('geoLayer')?.trim() || ''; }
  catch (_) { return ''; }
}

function requestedBboxParam(req) {
  const raw = (req.query && req.query.bbox) ||
    (() => { try { return new URL(req.url || '/', 'http://localhost').searchParams.get('bbox'); } catch (_) { return null; } })();
  if (typeof raw !== 'string' || !raw) return null;
  const parts = raw.split(',').map((p) => Number(p.trim()));
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : null;
}

async function handleGeoLayerQuery(req, res, caller, organizationId) {
  const geoLayer = requestedGeoLayer(req);
  const queryFn = GEO_LAYER_QUERY[geoLayer];
  if (!queryFn) return sendJson(res, 400, { error: 'geo_layer_unsupported', geoLayer });

  const accessDecision = evaluateReferenceLayerAccess({ actor: { role: caller.role }, layerId: geoLayer });
  if (!accessDecision.allowed) return sendJson(res, 403, { error: 'forbidden', reason: accessDecision.code });

  const bbox = requestedBboxParam(req);
  if (!bbox) return sendJson(res, 400, { error: 'bbox_required' });
  const bboxDecision = validateBbox(bbox);
  if (!bboxDecision.allowed) return sendJson(res, 400, { error: 'bbox_invalid', reason: bboxDecision.code });

  const municipality = slugForOrganization(organizationId);
  const provider = createStaticReferenceExtractProvider();
  const { entities, attributions } = queryFn(provider, { municipality, bbox, limit: 500 });
  return sendJson(res, 200, {
    geoLayer,
    organizationId,
    count: entities.length,
    entities,
    attributions: attributions.length ? attributions : [getAttribution('osm_basemap')].filter(Boolean),
  });
}

// ============================================================================
// POST /api/organization/context — one-time server-side Lands SSO handoff
// registration (see server/lands-sso.js in the lands-smart repo for the
// receiving side). Shares this file with the GET org-context lookup above
// purely to stay within the Vercel Hobby plan's 12-Serverless-Function
// limit — every existing /api file already at that limit is unrelated in
// purpose, and api/admin/users.js's own top-level authorization is
// manager/owner-only, incompatible with this endpoint's self-service model
// (a caller only ever acts on their OWN uid). This file already has exactly
// the right self-service auth shape (verifyRequestToken, any active role,
// no manager gate), so the two concerns are dispatched here by HTTP method
// rather than duplicating that auth model in a 13th file.
//
// Auth: Authorization: Bearer <Firebase ID token> — the employee's own
// token, verified exactly like the GET path above. The employee's own
// token is forwarded as-is to Lands' own trusted /api/lands-sso-register
// endpoint (api/_lib/landsBridge.js), which performs its own independent,
// authoritative check against Lands' real membership record — the
// eligibility check here is a fast local pre-check only, never the actual
// authority for whether a handoff is issued.
//
// SECURITY: the handoff code is never logged, never stored here, never
// placed in a URL by this endpoint — returned once in the response body
// only. No client-supplied uid, municipality, or role is ever trusted;
// every value used comes from the verified token and the caller's OWN
// Firestore record.
// ============================================================================
function extractBearerToken(req) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return m ? m[1] : null;
}

const SSO_ALLOWED_LANDS_ROLES = ['lands_employee', 'lands_department_manager'];

function isSsoEligible(data) {
  if (!data) return false;
  const organizationId = typeof data.organizationId === 'string' ? data.organizationId.trim() : '';
  const landsAccess = data.landsAccess;
  return Boolean(
    data.active !== false &&
    organizationId &&
    landsAccess && landsAccess.enabled === true &&
    landsAccess.syncStatus === 'synced' &&
    SSO_ALLOWED_LANDS_ROLES.includes(landsAccess.role)
  );
}

async function handleLandsSsoHandoff(req, res) {
  let decoded;
  try {
    decoded = await verifyRequestToken(req);
  } catch (e) {
    return sendJson(res, e.statusCode || 401, { error: 'unauthenticated' });
  }
  const rawToken = extractBearerToken(req);

  if (!bridgeConfigured()) {
    return sendJson(res, 503, { error: 'lands_sso_not_configured' });
  }

  const db = getDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  const data = userSnap.exists ? (userSnap.data() || {}) : {};
  if (!isSsoEligible(data)) {
    return sendJson(res, 403, { error: 'not_lands_eligible' });
  }
  const organizationId = data.organizationId.trim();

  const result = await callLandsSsoRegister({ idToken: rawToken, municipalityId: organizationId });
  if (!result.ok) {
    return sendJson(res, 502, { error: 'lands_sso_register_failed', reason: result.reason });
  }

  return sendJson(res, 200, { code: result.code, expiresAt: result.expiresAt });
}

async function resolveRoleContext(db, uid) {
  const owner = await db.collection('owners').doc(uid).get();
  if (owner.exists && activeIsNotFalse(owner.data() || {})) return { uid, role:'owner', isOwner:true, organizationId:null, organizationName:'' };
  const manager = await db.collection('managers').doc(uid).get();
  if (manager.exists) {
    const data = manager.data() || {}, organizationId = cleanText(data.organizationId);
    if (data.role === 'manager' && activeIsNotFalse(data) && organizationId) return { uid, role:'manager', isOwner:false, organizationId, organizationName:cleanText(data.organizationName) };
  }
  const user = await db.collection('users').doc(uid).get();
  if (user.exists) {
    const data = user.data() || {}, organizationId = cleanText(data.organizationId);
    if (['supervisor','inspector','contractor'].includes(data.role) && activeIsNotFalse(data) && organizationId) return { uid, role:data.role, isOwner:false, organizationId, organizationName:cleanText(data.organizationName) };
  }
  return null;
}

function sanitizedMapContext(organizationId, organizationName, organizationData) {
  const configuredCenter = cleanCenter(organizationData.mapCenter);
  const configuredZoom = Number.isInteger(organizationData.mapDefaultZoom) && organizationData.mapDefaultZoom >= 4 && organizationData.mapDefaultZoom <= 19 ? organizationData.mapDefaultZoom : null;
  const configured = !!(configuredCenter && configuredZoom);
  const fallbackEligible = organizationId === ALQUNFUDHAH_ORGANIZATION_ID;
  return {
    organizationId,
    organizationName: cleanText(organizationData.organizationName, cleanText(organizationData.name, cleanText(organizationName, organizationId))),
    mapCenter: configured ? configuredCenter : (fallbackEligible ? ALQUNFUDHAH_APPROXIMATE_CENTER : null),
    mapDefaultZoom: configured ? configuredZoom : (fallbackEligible ? ALQUNFUDHAH_DEFAULT_ZOOM : null),
    mapBounds: configured ? cleanBounds(organizationData.mapBounds) : null,
    serviceArea: configured ? cleanText(organizationData.serviceArea, '') || null : null,
    mapStyle: configured ? cleanText(organizationData.mapStyle, 'standard') : 'standard',
    configured,
  };
}

async function handler(req, res) {
  if (req.method === 'POST') return handleLandsSsoHandoff(req, res);
  if (req.method !== 'GET') return sendJson(res, 405, { error:'method_not_allowed' });
  let decoded;
  try { decoded = await verifyRequestToken(req); }
  catch (error) { return sendJson(res, error.statusCode || 401, { error:'unauthenticated' }); }
  const db = getDb();
  const caller = await resolveRoleContext(db, decoded.uid);
  if (!caller) return sendJson(res, 403, { error:'forbidden', reason:'inactive_or_unscoped_role' });
  const requested = requestedOrganizationId(req);
  let organizationId = caller.organizationId;
  if (caller.isOwner) {
    if (!requested) return sendJson(res, 400, { error:'organizationId_required' });
    organizationId = requested;
  } else if (requested && requested !== caller.organizationId) {
    return sendJson(res, 403, { error:'forbidden', reason:'cross_organization_denied' });
  }
  if (!organizationId) return sendJson(res, 403, { error:'forbidden', reason:'organization_required' });
  if (requestedGeoLayer(req)) return handleGeoLayerQuery(req, res, caller, organizationId);
  const organization = await db.collection('organizations').doc(organizationId).get();
  if (caller.isOwner && !organization.exists) return sendJson(res, 404, { error:'organization_not_found' });
  const data = organization.exists ? (organization.data() || {}) : {};
  return sendJson(res, 200, sanitizedMapContext(organizationId, caller.organizationName, data));
}

module.exports = handler;
module.exports._test = { resolveRoleContext, sanitizedMapContext, requestedOrganizationId, cleanCenter, cleanBounds, ALQUNFUDHAH_ORGANIZATION_ID, ALQUNFUDHAH_APPROXIMATE_CENTER, ALQUNFUDHAH_DEFAULT_ZOOM, isSsoEligible, requestedGeoLayer, requestedBboxParam, handleGeoLayerQuery, GEO_LAYER_QUERY };

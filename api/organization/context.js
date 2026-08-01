'use strict';
const { getDb } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, activeIsNotFalse } = require('../_lib/authz');

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
  const organization = await db.collection('organizations').doc(organizationId).get();
  if (caller.isOwner && !organization.exists) return sendJson(res, 404, { error:'organization_not_found' });
  const data = organization.exists ? (organization.data() || {}) : {};
  return sendJson(res, 200, sanitizedMapContext(organizationId, caller.organizationName, data));
}

module.exports = handler;
module.exports._test = { resolveRoleContext, sanitizedMapContext, requestedOrganizationId, cleanCenter, cleanBounds, ALQUNFUDHAH_ORGANIZATION_ID, ALQUNFUDHAH_APPROXIMATE_CENTER, ALQUNFUDHAH_DEFAULT_ZOOM };

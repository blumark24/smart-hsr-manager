'use strict';
const { getAuth, getDb, FieldValue } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, activeIsNotFalse } = require('../_lib/authz');
const { callLandsSsoRegister, bridgeConfigured } = require('../_lib/landsBridge');
const { evaluateReferenceLayerAccess } = require('../../platform/geo/geo-policy');
const { createStaticReferenceExtractProvider, validateBbox, slugForOrganization } = require('../../platform/geo/geo-provider-contract');
const { getAttribution } = require('../../platform/geo/geo-attribution-registry');
const { validateEmployeeRecord } = require('../../platform/contracts/employee-registry-contract');

const ALQUNFUDHAH_ORGANIZATION_ID = 'CnlVlKC7UcDMp2NZzjjT';
const ALQUNFUDHAH_APPROXIMATE_CENTER = Object.freeze({ lat: 19.12639, lng: 41.07889 });
const ALQUNFUDHAH_DEFAULT_ZOOM = 13;
const USER_CENTER_ACTIONS = new Set(['userCenter.updateProfile']);
const USER_CENTER_PROFILE_KEYS = new Set(['action', 'employeeId', 'name', 'employeeRef', 'email', 'phone', 'jobTitle', 'employmentStatus']);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(payload));
}
function cleanText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : fallback;
}
function isNonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }
function finiteCoordinate(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function cleanCenter(value) {
  return value && finiteCoordinate(value.lat, -90, 90) && finiteCoordinate(value.lng, -180, 180) ? { lat: value.lat, lng: value.lng } : null;
}
function cleanBounds(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const southWest = Array.isArray(value[0]) ? { lat:value[0][0], lng:value[0][1] } : value[0];
  const northEast = Array.isArray(value[1]) ? { lat:value[1][0], lng:value[1][1] } : value[1];
  return cleanCenter(southWest) && cleanCenter(northEast) ? [[southWest.lat, southWest.lng], [northEast.lat, northEast.lng]] : null;
}
function requestedOrganizationId(req) {
  const direct = req.query && req.query.organizationId;
  if (typeof direct === 'string') return direct.trim();
  try { return new URL(req.url || '/', 'http://localhost').searchParams.get('organizationId')?.trim() || ''; }
  catch (_) { return ''; }
}
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { return {}; }
}
async function recordUserCenterAudit(db, { caller, employeeId, action, detail }) {
  const doc = { organizationId: caller.organizationId, actorId: caller.uid, actorRole: caller.role, targetEmployeeId: employeeId, action, createdAt: FieldValue.serverTimestamp() };
  if (detail && typeof detail === 'object') doc.detail = detail;
  await db.collection('adminAuditEvents').add(doc);
}

const GEO_LAYER_QUERY = Object.freeze({
  commercial_places: (provider, args) => provider.queryPlaces(args),
  buildings: (provider, args) => provider.queryBuildings(args),
});
function requestedGeoLayer(req) {
  const direct = req.query && req.query.geoLayer;
  if (typeof direct === 'string') return direct.trim();
  try { return new URL(req.url || '/', 'http://localhost').searchParams.get('geoLayer')?.trim() || ''; } catch (_) { return ''; }
}
function requestedBboxParam(req) {
  const raw = (req.query && req.query.bbox) || (() => { try { return new URL(req.url || '/', 'http://localhost').searchParams.get('bbox'); } catch (_) { return null; } })();
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
  return sendJson(res, 200, { geoLayer, organizationId, count: entities.length, entities, attributions: attributions.length ? attributions : [getAttribution('osm_basemap')].filter(Boolean) });
}

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
  return Boolean(data.active !== false && organizationId && landsAccess && landsAccess.enabled === true && landsAccess.syncStatus === 'synced' && SSO_ALLOWED_LANDS_ROLES.includes(landsAccess.role));
}
async function handleLandsSsoHandoff(req, res) {
  let decoded;
  try { decoded = await verifyRequestToken(req); } catch (e) { return sendJson(res, e.statusCode || 401, { error: 'unauthenticated' }); }
  const rawToken = extractBearerToken(req);
  if (!bridgeConfigured()) return sendJson(res, 503, { error: 'lands_sso_not_configured' });
  const db = getDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  const data = userSnap.exists ? (userSnap.data() || {}) : {};
  if (!isSsoEligible(data)) return sendJson(res, 403, { error: 'not_lands_eligible' });
  const organizationId = data.organizationId.trim();
  const result = await callLandsSsoRegister({ idToken: rawToken, municipalityId: organizationId });
  if (!result.ok) return sendJson(res, 502, { error: 'lands_sso_register_failed', reason: result.reason });
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

async function handleUserCenterAction(req, res, body) {
  let decoded;
  try { decoded = await verifyRequestToken(req); } catch (error) { return sendJson(res, error.statusCode || 401, { error:'unauthenticated' }); }
  const db = getDb();
  const auth = getAuth();
  const caller = await resolveRoleContext(db, decoded.uid);
  if (!caller || caller.role !== 'manager' || !isNonEmptyString(caller.organizationId)) return sendJson(res, 403, { error:'forbidden', reason:'manager_required' });
  if (!isNonEmptyString(body.employeeId)) return sendJson(res, 400, { error:'invalid_request', reason:'employeeId_required' });
  const employeeId = body.employeeId.trim();
  const employeeRef = db.collection('employees').doc(employeeId);
  const employeeSnap = await employeeRef.get();
  if (!employeeSnap.exists) return sendJson(res, 404, { error:'employee_not_found' });
  const current = employeeSnap.data() || {};
  if (!isNonEmptyString(current.organizationId) || current.organizationId !== caller.organizationId) return sendJson(res, 403, { error:'forbidden', reason:'cross_organization_denied' });
  if (Object.keys(body).some(key => !USER_CENTER_PROFILE_KEYS.has(key))) return sendJson(res, 400, { error:'invalid_request', reason:'protected_or_unknown_field' });

  const patch = {};
  const changedFields = [];
  const has = key => Object.prototype.hasOwnProperty.call(body, key);
  const assignNullableText = key => {
    if (!has(key)) return null;
    if (body[key] !== null && typeof body[key] !== 'string') return `invalid_${key}`;
    patch[key] = isNonEmptyString(body[key]) ? body[key].trim() : null;
    changedFields.push(key);
    return null;
  };
  if (has('name')) {
    if (!isNonEmptyString(body.name)) return sendJson(res, 400, { error:'invalid_request', reason:'name_required' });
    patch.name = body.name.trim(); changedFields.push('name');
  }
  for (const key of ['employeeRef','phone','jobTitle']) {
    const invalid = assignNullableText(key);
    if (invalid) return sendJson(res, 400, { error:'invalid_request', reason:invalid });
  }
  if (has('employmentStatus')) { patch.employmentStatus = body.employmentStatus; changedFields.push('employmentStatus'); }
  if (has('email')) {
    if (body.email !== null && typeof body.email !== 'string') return sendJson(res, 400, { error:'invalid_request', reason:'invalid_email' });
    const nextEmail = isNonEmptyString(body.email) ? body.email.trim() : null;
    const currentEmail = isNonEmptyString(current.email) ? current.email.trim() : null;
    if (isNonEmptyString(current.authUid) && nextEmail !== currentEmail) return sendJson(res, 409, { error:'invalid_request', reason:'linked_account_email_change_requires_account_flow' });
    patch.email = nextEmail; changedFields.push('email');
  }
  if (!changedFields.length) return sendJson(res, 400, { error:'invalid_request', reason:'no_changes_requested' });
  const prospective = { ...current, ...patch };
  const validation = validateEmployeeRecord({ organizationId: prospective.organizationId, name: prospective.name, employeeRef: prospective.employeeRef, email: prospective.email, phone: prospective.phone, administration: prospective.administration, department: prospective.department, jobTitle: prospective.jobTitle, employmentStatus: prospective.employmentStatus, directManagerEmployeeId: prospective.directManagerEmployeeId });
  if (!validation.ok) return sendJson(res, 400, { error:'invalid_request', reason:validation.reason });
  if (isNonEmptyString(current.authUid) && Object.prototype.hasOwnProperty.call(patch, 'name')) {
    await auth.updateUser(current.authUid, { displayName: patch.name });
    await db.collection('users').doc(current.authUid).set({ name: patch.name, updatedAt: FieldValue.serverTimestamp() }, { merge:true });
  }
  await employeeRef.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge:true });
  await recordUserCenterAudit(db, { caller, employeeId, action:'employee_profile_update', detail:{ changedFields } });
  return sendJson(res, 200, { employeeId, changedFields });
}

function sanitizedMapContext(organizationId, organizationName, organizationData) {
  const configuredCenter = cleanCenter(organizationData.mapCenter);
  const configuredZoom = Number.isInteger(organizationData.mapDefaultZoom) && organizationData.mapDefaultZoom >= 4 && organizationData.mapDefaultZoom <= 19 ? organizationData.mapDefaultZoom : null;
  const configured = !!(configuredCenter && configuredZoom);
  const fallbackEligible = organizationId === ALQUNFUDHAH_ORGANIZATION_ID;
  return { organizationId, organizationName: cleanText(organizationData.organizationName, cleanText(organizationData.name, cleanText(organizationName, organizationId))), mapCenter: configured ? configuredCenter : (fallbackEligible ? ALQUNFUDHAH_APPROXIMATE_CENTER : null), mapDefaultZoom: configured ? configuredZoom : (fallbackEligible ? ALQUNFUDHAH_DEFAULT_ZOOM : null), mapBounds: configured ? cleanBounds(organizationData.mapBounds) : null, serviceArea: configured ? cleanText(organizationData.serviceArea, '') || null : null, mapStyle: configured ? cleanText(organizationData.mapStyle, 'standard') : 'standard', configured };
}
async function handler(req, res) {
  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    if (USER_CENTER_ACTIONS.has(body && body.action)) return handleUserCenterAction(req, res, body);
    return handleLandsSsoHandoff(req, res);
  }
  if (req.method !== 'GET') return sendJson(res, 405, { error:'method_not_allowed' });
  let decoded;
  try { decoded = await verifyRequestToken(req); } catch (error) { return sendJson(res, error.statusCode || 401, { error:'unauthenticated' }); }
  const db = getDb();
  const caller = await resolveRoleContext(db, decoded.uid);
  if (!caller) return sendJson(res, 403, { error:'forbidden', reason:'inactive_or_unscoped_role' });
  const requested = requestedOrganizationId(req);
  let organizationId = caller.organizationId;
  if (caller.isOwner) { if (!requested) return sendJson(res, 400, { error:'organizationId_required' }); organizationId = requested; }
  else if (requested && requested !== caller.organizationId) return sendJson(res, 403, { error:'forbidden', reason:'cross_organization_denied' });
  if (!organizationId) return sendJson(res, 403, { error:'forbidden', reason:'organization_required' });
  if (requestedGeoLayer(req)) return handleGeoLayerQuery(req, res, caller, organizationId);
  const organization = await db.collection('organizations').doc(organizationId).get();
  if (caller.isOwner && !organization.exists) return sendJson(res, 404, { error:'organization_not_found' });
  const data = organization.exists ? (organization.data() || {}) : {};
  return sendJson(res, 200, sanitizedMapContext(organizationId, caller.organizationName, data));
}
module.exports = handler;
module.exports._test = { resolveRoleContext, sanitizedMapContext, requestedOrganizationId, cleanCenter, cleanBounds, ALQUNFUDHAH_ORGANIZATION_ID, ALQUNFUDHAH_APPROXIMATE_CENTER, ALQUNFUDHAH_DEFAULT_ZOOM, isSsoEligible, requestedGeoLayer, requestedBboxParam, handleGeoLayerQuery, GEO_LAYER_QUERY };
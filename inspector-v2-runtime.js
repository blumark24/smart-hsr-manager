import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { resolveFirebaseConfig } from './firebase-runtime-config.js';
import { fetchOrganizationMapContext, observationCoordinates, statusMarkerIcon, applyMapAttribution, openVerifiedMap } from './spatial-map.js';
import { resolveObservationImage, revokeAllObservationImageUrls, revokeObservationImageUrl } from './storage-adapter.js';
import { fetchWithFirebaseAuth } from './firebase-auth-fetch.js';

const gate = document.createElement('div');
gate.className = 'runtime-gate';
gate.innerHTML = '<div class="runtime-gate__card"><strong>SMART HSR</strong><p>جارٍ التحقق من جلسة المراقب وتحميل البيانات الموثوقة…</p></div>';
document.body.appendChild(gate);

function cleanText(value, fallback = '', max = 90) {
  const clean = typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
  return clean || fallback;
}

function redirectToLogin() {
  window.location.replace('login.html');
}

async function verifyInspectorAccess(db, user) {
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  const organizationId = typeof data.organizationId === 'string' ? data.organizationId.trim() : '';
  if (data.role !== 'inspector' || data.active === false || !organizationId) return null;
  const rawOrganizationName = cleanText(data.organizationName);
  return Object.freeze({
    uid: user.uid,
    organizationId,
    organizationName: rawOrganizationName && rawOrganizationName !== organizationId ? rawOrganizationName : 'المؤسسة المسجلة',
    name: cleanText(data.name || user.displayName, 'المراقب')
  });
}

async function routeOtherRole(db, user) {
  try {
    const manager = await getDoc(doc(db, 'managers', user.uid));
    if (manager.exists()) {
      const data = manager.data() || {};
      if (data.role === 'manager' && data.active !== false && String(data.organizationId || '').trim()) return 'manager.html';
    }
  } catch (_) {}
  try {
    const account = await getDoc(doc(db, 'users', user.uid));
    if (account.exists()) {
      const data = account.data() || {};
      const org = String(data.organizationId || '').trim();
      if (data.active !== false && org && data.role === 'contractor') return 'mobile-map.html';
      if (data.active !== false && org && data.role === 'supervisor') return 'manager.html';
    }
  } catch (_) {}
  return null;
}

function normalizeObservation(snapshot, organizationId, uid) {
  const data = snapshot.data() || {};
  if (data.organizationId !== organizationId || data.createdByUid !== uid) return null;
  const imageReference = [
    data.imageObjectKey, data.imagePath, data.imageUrl, data.beforeImagePath
  ].find(value => typeof value === 'string' && value.trim()) || null;
  const afterReference = [
    data.afterImageObjectKey, data.afterImagePath, data.afterImageUrl
  ].find(value => typeof value === 'string' && value.trim()) || null;
  const createdAt = typeof data.createdAt?.toMillis === 'function'
    ? data.createdAt.toMillis()
    : Number(data.createdAt || 0);
  return {
    docId: snapshot.id,
    displayId: data.displayId || null,
    title: cleanText(data.title || data.details, 'ملاحظة ميدانية', 120),
    details: cleanText(data.details, '', 280),
    status: data.status || 'PENDING',
    date: cleanText(data.date, '', 40),
    location: cleanText(data.location, '', 120),
    organizationId: data.organizationId,
    createdByUid: data.createdByUid,
    correctedLat: data.correctedLat,
    correctedLng: data.correctedLng,
    lat: data.originalLat ?? data.lat,
    lng: data.originalLng ?? data.lng,
    imageReference,
    afterReference,
    aiAnalysis: data.aiAnalysis && typeof data.aiAnalysis === 'object' ? data.aiAnalysis : null,
    createdAt
  };
}

async function resolveEvidenceReference(user, context, reference) {
  if (!reference) return null;
  try {
    const asset = await resolveObservationImage({
      reference,
      context: {
        uid: user.uid,
        role: 'inspector',
        organizationId: context.organizationId,
        authUser: user,
        getIdToken: () => user.getIdToken()
      }
    });
    return asset?.available ? asset.url : null;
  } catch (_) {
    return null;
  }
}

let activeEvidenceUrls = [];
function releaseActiveEvidenceUrls() {
  activeEvidenceUrls.forEach(url => {
    try { revokeObservationImageUrl(url); } catch (_) {}
  });
  activeEvidenceUrls = [];
}

async function loadMissionEvidence(user, context, observation) {
  const ui = window.SmartHsrInspectorV2;
  releaseActiveEvidenceUrls();
  if (!ui || !observation) return;
  ui.setMissionEvidence({ message: 'جارٍ تحميل الأدلة المصرح بها…' });
  const [beforeUrl, afterUrl] = await Promise.all([
    resolveEvidenceReference(user, context, observation.imageReference),
    resolveEvidenceReference(user, context, observation.afterReference)
  ]);
  activeEvidenceUrls = [beforeUrl, afterUrl].filter(url => typeof url === 'string' && url.startsWith('blob:'));
  ui.setMissionEvidence({
    beforeUrl,
    afterUrl,
    message: afterUrl
      ? 'تم تحميل دليل قبل وبعد من المصدر الموثوق.'
      : (beforeUrl ? 'تم تحميل دليل قبل. لا يوجد دليل بعد متاح حاليًا.' : 'لا توجد أدلة صور متاحة لهذه المهمة.')
  });
}

async function analyzePersistedObservation(user, observation) {
  const ui = window.SmartHsrInspectorV2;
  if (!ui || !observation?.docId) return;
  ui.setAiLoading(true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchWithFirebaseAuth({
      getIdToken: forceRefresh => user.getIdToken(forceRefresh),
      input: '/api/ai/analyze',
      init: {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          observationId: observation.docId,
          correlationId: `v2-${observation.docId}-${Date.now()}`
        }),
        signal: controller.signal
      }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      const code = payload?.errorCode || `ai-http-${response.status}`;
      ui.setAiLoading(false, code === 'AI_APPLICATION_ORGANIZATION_NOT_ENABLED'
        ? 'التحليل الذكي غير مفعّل لهذه المؤسسة حاليًا.'
        : 'تعذر تشغيل التحليل الذكي حاليًا.');
      return;
    }
    ui.setAiResult(payload);
    ui.setAiLoading(false);
  } catch (error) {
    ui.setAiLoading(false, error?.name === 'AbortError' ? 'انتهت مهلة التحليل. أعد المحاولة.' : 'تعذر تشغيل التحليل الذكي حاليًا.');
  } finally {
    clearTimeout(timer);
  }
}

function waitForMap(timeoutMs = 8000) {
  const started = Date.now();
  return new Promise(resolve => {
    const tick = () => {
      const map = window.SmartHsrInspectorV2?.getMap?.();
      if (map) return resolve(map);
      if (Date.now() - started > timeoutMs) return resolve(null);
      setTimeout(tick, 60);
    };
    tick();
  });
}

function renderMapObservations(map, L, items, organizationId, mapContext) {
  if (!map || !L) return;
  if (map.__smartHsrV2ObservationLayer) map.removeLayer(map.__smartHsrV2ObservationLayer);
  const layer = L.layerGroup().addTo(map);
  map.__smartHsrV2ObservationLayer = layer;
  items.forEach(item => {
    const coords = observationCoordinates(item, organizationId);
    item.coords = coords;
    if (!coords) return;
    const marker = L.marker([coords.lat, coords.lng], {
      icon: statusMarkerIcon(L, item.status, { title: item.title })
    });
    marker.bindTooltip(item.title, { direction: 'top', opacity: .9 });
    marker.addTo(layer);
  });
  applyMapAttribution(map);
  openVerifiedMap(map, items, organizationId, mapContext, { maxZoom: 16, padding: [34,34] });
}

async function bootAuthenticated(user, auth, db) {
  let verified = null;
  try { verified = await verifyInspectorAccess(db, user); } catch (_) {}
  if (!verified) {
    const other = await routeOtherRole(db, user);
    if (other) { window.location.replace(other); return; }
    try { await signOut(auth); } catch (_) {}
    redirectToLogin();
    return;
  }

  const ui = window.SmartHsrInspectorV2;
  ui?.setIdentity({ name: verified.name, organizationName: verified.organizationName });

  let mapContext = null;
  try {
    mapContext = await fetchOrganizationMapContext(auth, { organizationId: verified.organizationId });
  } catch (_) {}

  const map = await waitForMap();
  const q = query(
    collection(db, 'observations'),
    where('organizationId', '==', verified.organizationId),
    where('createdByUid', '==', verified.uid),
    orderBy('createdAt', 'desc'),
    limit(25)
  );

  let activeObservation = null;

  const handleMissionOpen = event => {
    const observation = event?.detail?.observation || activeObservation;
    if (observation) loadMissionEvidence(user, verified, observation);
  };
  const handleAiAnalyze = event => {
    const observation = event?.detail?.observation || activeObservation;
    if (observation) analyzePersistedObservation(user, observation);
  };
  window.addEventListener('smart-hsr:mission-open', handleMissionOpen);
  window.addEventListener('smart-hsr:ai-analyze', handleAiAnalyze);

  onSnapshot(q, { includeMetadataChanges: true }, async snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    const observations = [];
    snapshot.forEach(docSnap => {
      const item = normalizeObservation(docSnap, verified.organizationId, verified.uid);
      if (item) observations.push(item);
    });
    observations.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (map && window.L) renderMapObservations(map, window.L, observations, verified.organizationId, mapContext);

    const active = observations.find(item => item.status !== 'COMPLETED') || observations[0] || null;
    activeObservation = active;
    if (active) active.coords = observationCoordinates(active, verified.organizationId);
    ui?.setMission(active);
    ui?.setMissionDistance(active?.coords || null);
    ui?.setTwinStats(observations);

    observations.forEach(item => { item.coords = observationCoordinates(item, verified.organizationId); });
    ui?.setNearbyObservations(observations.filter(item => item.coords));

    // Evidence stays lazy: no private storage read occurs on page load or snapshot refresh.
    ui?.setMissionImage(null);

    gate.hidden = true;
  }, error => {
    console.error('Inspector V2 observation subscription failed', error);
    gate.querySelector('p').textContent = 'تعذر تحميل البيانات الموثوقة. لم يتم عرض بيانات مخزنة مؤقتًا.';
  });
}

const firebaseConfig = await resolveFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

onAuthStateChanged(auth, user => {
  if (!user) { redirectToLogin(); return; }
  bootAuthenticated(user, auth, db).catch(error => {
    console.error('Inspector V2 runtime boot failed', error);
    gate.querySelector('p').textContent = 'تعذر بدء مساحة العمل الآمنة. أعد تسجيل الدخول.';
  });
});

window.addEventListener('pagehide', () => {
  releaseActiveEvidenceUrls();
  revokeAllObservationImageUrls();
});

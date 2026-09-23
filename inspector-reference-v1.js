/* SMART HSR — Inspector Reference V1 runtime bridge.
   Presentation bridge only. It reads the existing trusted inspector runtime
   and delegates every action to the already-authorized dashboard workflow. */
(() => {
  'use strict';

  let map = null;
  let observationLayer = null;
  let userLayer = null;
  let renderQueued = false;
  let selectedObservationId = null;

  const $ = id => document.getElementById(id);
  const text = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value == null || value === '' ? '—' : String(value);
  };
  const finite = value => Number.isFinite(Number(value));

  function statusLabel(status) {
    const value = String(status || '').toUpperCase();
    if (typeof window.statusArabic === 'function') {
      try { return window.statusArabic(value); } catch (_) {}
    }
    return ({
      PENDING: 'جديد',
      IN_PROGRESS: 'قيد التنفيذ',
      COMPLETED: 'تمت المعالجة'
    })[value] || 'قيد المتابعة';
  }

  function statusClass(status) {
    const value = String(status || '').toUpperCase();
    if (value === 'COMPLETED') return 'completed';
    if (value === 'IN_PROGRESS') return 'progress';
    return 'pending';
  }

  function safeOwnObservations() {
    try {
      if (typeof ownPersonalObservations === 'function') {
        return ownPersonalObservations().filter(Boolean);
      }
    } catch (_) {}
    return [];
  }

  function getPoint(observation) {
    try {
      if (typeof observationCoordinates === 'function') {
        return observationCoordinates(observation, inspectorContext?.organizationId);
      }
    } catch (_) {}
    const lat = Number(observation?.latitude ?? observation?.lat);
    const lng = Number(observation?.longitude ?? observation?.lng);
    if (!finite(lat) || !finite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }

  function currentGpsPoint() {
    const lat = Number($('inputLatitude')?.value);
    const lng = Number($('inputLongitude')?.value);
    if (!finite(lat) || !finite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }

  function newest(list) {
    return list.slice().sort((a, b) => {
      const ad = new Date(a.updatedAt || a.createdAt || a.date || 0).getTime() || 0;
      const bd = new Date(b.updatedAt || b.createdAt || b.date || 0).getTime() || 0;
      return bd - ad;
    })[0] || null;
  }

  function activeMission(list) {
    return list.find(item => String(item.status || '').toUpperCase() === 'IN_PROGRESS')
      || list.find(item => String(item.status || '').toUpperCase() === 'PENDING')
      || newest(list);
  }

  function observationId(observation) {
    return String(observation?.docId || observation?.id || observation?.observationId || '');
  }

  function titleOf(observation) {
    return String(observation?.title || observation?.description || observation?.details || 'ملاحظة ميدانية').trim();
  }

  function locationOf(observation) {
    return String(
      observation?.locationName ||
      observation?.area ||
      observation?.address ||
      observation?.district ||
      'الموقع الموثق'
    ).trim();
  }

  function referenceOf(observation) {
    const id = observationId(observation);
    return id ? ('#' + id.replace(/^#/, '').slice(0, 18)) : '#HSR';
  }

  function syncIdentity() {
    const sourceName = $('userName')?.textContent?.trim() || '';
    const cleanName = sourceName && !/^جاري/.test(sourceName) ? sourceName : 'المراقب';
    const firstName = cleanName.split(/\s+/)[0] || cleanName;
    text('irGreeting', 'مرحباً ' + firstName);
    text('irRole', $('userRole')?.textContent?.trim() || 'المراقب الميداني');

    const monogram = [...cleanName].find(ch => /[\u0600-\u06ffA-Za-z]/.test(ch)) || 'م';
    text('irAvatar', monogram);

    const gps = $('gpsText')?.textContent?.trim() || 'غير متاح';
    text('irGps', gps);
    text('irLocationChip', currentGpsPoint() ? 'بالموقع' : 'تحديد الموقع');
    text('irConnection', navigator.onLine ? 'متصل' : 'غير متصل');
  }

  function renderSelectedCase(observation) {
    const card = $('irSelectedCase');
    if (!card) return;
    if (!observation) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    text('irSelectedRef', referenceOf(observation));
    text('irSelectedTitle', titleOf(observation));
    const point = getPoint(observation);
    text('irSelectedDistance', point ? 'موقع موثّق' : 'بدون إحداثيات');
  }

  function setMission(observation) {
    const empty = $('irMissionEmpty');
    const body = $('irMissionBody');
    if (!observation) {
      if (empty) empty.hidden = false;
      if (body) body.hidden = true;
      text('irMissionStatus', 'لا توجد مهمة');
      return;
    }
    if (empty) empty.hidden = true;
    if (body) body.hidden = false;

    text('irMissionRef', referenceOf(observation));
    text('irMissionTitle', titleOf(observation));
    text('irMissionLocation', locationOf(observation));
    text('irMissionStatusText', statusLabel(observation.status));
    const statusPill = $('irMissionStatus');
    if (statusPill) {
      statusPill.textContent = statusLabel(observation.status);
      statusPill.dataset.status = String(observation.status || '').toUpperCase();
    }

    const point = getPoint(observation);
    text('irMissionDistance', point ? 'موقع موثّق' : '—');
    text('irMissionSla', 'متابعة نشطة');
  }

  function renderRecent(list) {
    const root = $('irRecentRow');
    if (!root) return;
    root.replaceChildren();
    const sorted = list.slice().sort((a, b) => {
      const ad = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
      const bd = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
      return bd - ad;
    }).slice(0, 6);

    if (!sorted.length) {
      const empty = document.createElement('div');
      empty.className = 'ir-empty';
      empty.textContent = 'لا توجد بلاغات ميدانية مؤكدة حتى الآن.';
      root.appendChild(empty);
      return;
    }

    sorted.forEach(observation => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'ir-recent-card';
      card.setAttribute('aria-label', 'فتح ' + titleOf(observation));

      const thumb = document.createElement('span');
      thumb.className = 'ir-recent-thumb';
      thumb.innerHTML = '<i data-lucide="image" aria-hidden="true"></i>';

      const copy = document.createElement('span');
      copy.className = 'ir-recent-copy';

      const title = document.createElement('b');
      title.textContent = titleOf(observation);

      const meta = document.createElement('span');
      meta.textContent = locationOf(observation);

      const state = document.createElement('small');
      state.className = 'is-' + statusClass(observation.status);
      state.textContent = statusLabel(observation.status);

      copy.append(title, meta, state);
      card.append(thumb, copy);
      card.addEventListener('click', () => {
        selectedObservationId = observationId(observation);
        renderSelectedCase(observation);
        if (typeof showObservationDetail === 'function') {
          try { showObservationDetail(observation); } catch (_) {}
        }
        if (typeof focusPersonalObservations === 'function') {
          try { focusPersonalObservations(); } catch (_) {}
        }
      });
      root.appendChild(card);
    });
    window.lucide?.createIcons();
  }

  function iconFor(status, selected) {
    try {
      if (typeof statusMarkerIcon === 'function' && window.L) {
        return statusMarkerIcon(L, status, { selected: Boolean(selected), title: statusLabel(status) });
      }
    } catch (_) {}
    return undefined;
  }

  function ensureMap() {
    if (map || !window.L || !$('refMapCanvas')) return;
    map = L.map('refMapCanvas', {
      zoomControl: false,
      attributionControl: false,
      keyboard: true,
      preferCanvas: true
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    observationLayer = L.layerGroup().addTo(map);
    userLayer = L.layerGroup().addTo(map);
    try {
      if (typeof centerInspectorMap === 'function') {
        const center = organizationMapContext?.mapCenter;
        if (Array.isArray(center) && center.length === 2 && finite(center[0]) && finite(center[1])) {
          map.setView([Number(center[0]), Number(center[1])], Number(organizationMapContext?.mapDefaultZoom) || 13);
        } else {
          map.setView([19.1264, 41.0789], 13);
        }
      } else {
        map.setView([19.1264, 41.0789], 13);
      }
    } catch (_) {
      map.setView([19.1264, 41.0789], 13);
    }
  }

  function renderMap(list) {
    ensureMap();
    if (!map || !observationLayer || !userLayer) return;

    observationLayer.clearLayers();
    userLayer.clearLayers();

    const points = [];
    list.forEach(observation => {
      const point = getPoint(observation);
      if (!point) return;
      points.push([point.lat, point.lng]);
      const id = observationId(observation);
      const marker = L.marker([point.lat, point.lng], {
        icon: iconFor(observation.status, id === selectedObservationId),
        keyboard: true,
        title: titleOf(observation),
        alt: titleOf(observation)
      }).addTo(observationLayer);
      marker.on('click', () => {
        selectedObservationId = id;
        renderSelectedCase(observation);
        setMission(observation);
        renderMap(list);
      });
    });

    const gps = currentGpsPoint();
    const orbit = $('irCenterOrbit');
    if (gps) {
      const userIcon = L.divIcon({
        className: 'ir-user-marker',
        html: '<span style="display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#1677d2;border:4px solid #fff;box-shadow:0 0 0 9px rgba(22,119,210,.18),0 6px 16px rgba(0,0,0,.35)"></span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      L.marker([gps.lat, gps.lng], { icon: userIcon, interactive: false }).addTo(userLayer);
      points.push([gps.lat, gps.lng]);
      orbit?.classList.add('is-visible');
    } else {
      orbit?.classList.remove('is-visible');
    }

    if (points.length) {
      if (points.length === 1) map.setView(points[0], 15);
      else map.fitBounds(points, { padding: [35, 35], maxZoom: 15 });
    } else {
      try {
        const bounds = organizationMapContext?.mapBounds;
        if (Array.isArray(bounds) && bounds.length === 2) map.fitBounds(bounds, { padding: [22, 22], maxZoom: 14 });
      } catch (_) {}
    }
    requestAnimationFrame(() => map?.invalidateSize());
  }

  function renderKpis(list) {
    text('irTotal', String(list.length));
    text('irProgress', String(list.filter(o => String(o.status).toUpperCase() === 'IN_PROGRESS').length));
    text('irCompleted', String(list.filter(o => String(o.status).toUpperCase() === 'COMPLETED').length));
  }

  function renderAll() {
    renderQueued = false;
    if (!document.body.classList.contains('inspector-v3-active')) return;

    syncIdentity();
    const list = safeOwnObservations();
    renderKpis(list);

    let selected = list.find(o => observationId(o) === selectedObservationId);
    if (!selected) selected = activeMission(list);
    if (selected) selectedObservationId = observationId(selected);

    renderSelectedCase(selected);
    setMission(selected);
    renderRecent(list);
    renderMap(list);

    window.lucide?.createIcons();
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(renderAll);
  }

  function delegate(id, targetId, handler) {
    $(id)?.addEventListener('click', event => {
      event.preventDefault();
      if (handler) return handler(event);
      const target = $(targetId);
      target?.click();
    });
  }

  function activateInspectorShell() {
    document.body.classList.add('inspector-v3-active');
    const root = $('inspector-reference-dashboard');
    root?.classList.add('inspector-v3');
    root?.classList.remove('hidden');
    queueRender();
    setTimeout(queueRender, 250);
    setTimeout(queueRender, 900);
  }

  function bind() {
    delegate('irNotifications', 'refNotificationBtn');
    delegate('irLocate', 'headerLocationBtn');
    delegate('irOpenMap', 'refMapOpenBtn');
    delegate('irLayers', 'refMapOpenBtn');
    delegate('irTwin', 'refTwinBtn');
    delegate('irMissionDetails', null, () => {
      if (typeof focusPersonalObservations === 'function') focusPersonalObservations();
    });
    delegate('irDirections', 'refMapOpenBtn');
    delegate('irQuickPhoto', null, () => window.openModal?.('smartInputModal'));
    delegate('irQuickNote', null, () => window.openModal?.('smartInputModal'));
    delegate('irQuickReport', null, () => window.openModal?.('smartInputModal'));
    delegate('irQuickScan', null, () => window.openModal?.('smartInputModal'));
    delegate('irAiAction', null, () => {
      if (typeof focusPersonalObservations === 'function') focusPersonalObservations();
    });

    delegate('irDockHome', null, () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    delegate('irDockMap', 'refMapOpenBtn');
    delegate('irDockAdd', null, () => window.openModal?.('smartInputModal'));
    delegate('irDockLog', null, () => {
      if (typeof focusPersonalObservations === 'function') focusPersonalObservations();
    });
    delegate('irDockAccount', 'mobileNavSettings');

    $('irMapTabCases')?.addEventListener('click', () => {
      document.querySelectorAll('.ir-map-tab').forEach(x => x.classList.remove('is-active'));
      $('irMapTabCases')?.classList.add('is-active');
      renderMap(safeOwnObservations());
    });
    $('irMapTabNearby')?.addEventListener('click', () => {
      document.querySelectorAll('.ir-map-tab').forEach(x => x.classList.remove('is-active'));
      $('irMapTabNearby')?.classList.add('is-active');
      renderMap(safeOwnObservations());
    });
    $('irMapTabContractors')?.addEventListener('click', () => {
      document.querySelectorAll('.ir-map-tab').forEach(x => x.classList.remove('is-active'));
      $('irMapTabContractors')?.classList.add('is-active');
      if (typeof openPersonalMap === 'function') openPersonalMap();
    });
    $('irMapTabAll')?.addEventListener('click', () => {
      document.querySelectorAll('.ir-map-tab').forEach(x => x.classList.remove('is-active'));
      $('irMapTabAll')?.classList.add('is-active');
      renderMap(safeOwnObservations());
    });

    window.addEventListener('online', queueRender, { passive: true });
    window.addEventListener('offline', queueRender, { passive: true });
    window.addEventListener('resize', () => map?.invalidateSize(), { passive: true });

    const observer = new MutationObserver(queueRender);
    ['userName', 'userRole', 'gpsText', 'refTotalCount', 'refLatestDescription', 'observationsList'].forEach(id => {
      const node = $(id);
      if (node) observer.observe(node, { subtree: true, childList: true, characterData: true });
    });

    $('inputLatitude')?.addEventListener('change', queueRender);
    $('inputLongitude')?.addEventListener('change', queueRender);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();

    // dashboard.html is already protected by the existing inspector Auth guard.
    // We activate only when the legacy inspector identity shell exists.
    if ($('hsrHeader') && $('inspector-reference-dashboard')) activateInspectorShell();
  });
})();

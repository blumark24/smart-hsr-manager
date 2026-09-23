(() => {
  'use strict';

  const state = {
    map: null,
    locationMarker: null,
    lastPosition: null,
    hasCenteredOnce: false,
    toastTimer: null,
    theme: 'dark',
    mapView: 'operational',
    missionCoords: null,
    activeMission: null,
    selectedMapObservation: null,
    detailObservation: null,
    locationWatchId: null
  };

  const $ = (id) => document.getElementById(id);

  function showToast(message = 'سيتم ربط هذه الوظيفة في المرحلة التالية من Inspector V2.') {
    const toast = $('inspectorToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2300);
  }

  function preferredTheme() {
    const saved = localStorage.getItem('smartHSRInspectorTheme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(theme, persist = true) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    const toggle = $('themeToggleBtn');
    if (toggle) toggle.setAttribute('aria-pressed', String(state.theme === 'light'));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', state.theme === 'light' ? '#f4f8f6' : '#04162f');
    if (persist) localStorage.setItem('smartHSRInspectorTheme', state.theme);
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    if (state.map) setTimeout(() => state.map.invalidateSize({ animate: false }), 30);
  }

  function createLocationIcon() {
    return L.divIcon({
      className: '',
      html: '<div class="user-location-marker" aria-label="موقعك الحالي"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
  }

  function initMap() {
    const root = $('inspectorLiveMap');
    if (!root || !window.L) {
      const note = $('mapNote');
      if (note) note.textContent = 'تعذر تحميل محرك الخريطة.';
      return;
    }

    state.map = L.map(root, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      minZoom: 3,
      maxZoom: 20
    }).setView([23.8859, 45.0792], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);

    requestLocation();
  }

  function clearLiveLocationWatch() {
    if (state.locationWatchId !== null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(state.locationWatchId); } catch (_) {}
    }
    state.locationWatchId = null;
  }

  function requestLocation() {
    const gps = $('gpsStateText');
    const loc = $('locationStateText');
    if (!navigator.geolocation) {
      if (gps) gps.textContent = 'غير مدعوم';
      if (loc) loc.textContent = 'الموقع غير متاح';
      return;
    }

    if (state.locationWatchId !== null) return;
    if (gps) gps.textContent = 'جارٍ الاتصال';
    state.locationWatchId = navigator.geolocation.watchPosition(
      onPosition,
      onPositionError,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 14000 }
    );
  }

  function onPosition(position) {
    state.lastPosition = position;
    const { latitude, longitude, accuracy } = position.coords;
    const latlng = [latitude, longitude];

    if ($('gpsStateText')) $('gpsStateText').textContent = accuracy ? `دقة ±${Math.round(accuracy)}م` : 'متصل';
    if ($('locationStateText')) $('locationStateText').textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    if ($('mapFeedState')) $('mapFeedState').textContent = 'GPS Live';
    if ($('mapNote')) $('mapNote').textContent = 'الموقع الحالي حي. الحالات الموثوقة تظهر من المصدر التشغيلي عند توفر إحداثيات صالحة.';

    if (!state.locationMarker) {
      state.locationMarker = L.marker(latlng, { icon: createLocationIcon(), keyboard: false }).addTo(state.map);
    } else {
      state.locationMarker.setLatLng(latlng);
    }

    if (state.selectedMapObservation && $('mapMarkerDistance')) {
      $('mapMarkerDistance').textContent = formatDistance(observationDistance(state.selectedMapObservation));
    }

    if (!state.hasCenteredOnce) {
      state.map.setView(latlng, 16, { animate: false });
      state.hasCenteredOnce = true;
    }
  }

  function onPositionError(error) {
    if ($('gpsStateText')) $('gpsStateText').textContent = 'بحاجة إذن';
    if ($('locationStateText')) $('locationStateText').textContent = 'لم يتم تحديد الموقع';
    if ($('mapFeedState')) $('mapFeedState').textContent = 'Map Ready';
    if ($('mapNote')) $('mapNote').textContent = 'اسمح بالوصول للموقع لتفعيل GPS الحي.';
    if (error && error.code === 1) showToast('يلزم السماح بالوصول للموقع لتفعيل الخريطة الحية.');
  }

  function centerOnUser() {
    if (!state.map || !state.lastPosition) {
      showToast('لم يتم الحصول على موقعك بعد.');
      requestLocation();
      return;
    }
    const { latitude, longitude } = state.lastPosition.coords;
    state.map.flyTo([latitude, longitude], Math.max(state.map.getZoom(), 16), { duration: .55 });
  }

  const OBS_STATUS_LABELS = Object.freeze({
    PENDING:'قيد الانتظار',
    IN_PROGRESS:'قيد المعالجة',
    PENDING_REVIEW:'بانتظار المراجعة',
    COMPLETED:'مغلقة'
  });

  function observationDistance(observation) {
    if (!observation?.coords || !state.lastPosition) return null;
    return haversineMeters(
      { lat: state.lastPosition.coords.latitude, lng: state.lastPosition.coords.longitude },
      observation.coords
    );
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return '—';
    return meters < 1000 ? Math.round(meters) + ' م' : (meters/1000).toFixed(1) + ' كم';
  }

  function setSelectedMapObservation(observation) {
    state.selectedMapObservation = observation || null;
    const sheet = $('mapMarkerSheet');
    if (!sheet) return;

    if (!observation) {
      sheet.classList.remove('is-open');
      sheet.setAttribute('aria-hidden','true');
      return;
    }

    const status = observation.status || 'PENDING';
    if ($('mapMarkerStatus')) {
      $('mapMarkerStatus').textContent = OBS_STATUS_LABELS[status] || status;
      $('mapMarkerStatus').dataset.status = status;
    }
    if ($('mapMarkerTitle')) $('mapMarkerTitle').textContent = observation.title || 'ملاحظة ميدانية';
    if ($('mapMarkerLocation')) $('mapMarkerLocation').textContent = observation.location || 'موقع موثق';
    if ($('mapMarkerId')) $('mapMarkerId').textContent = observation.displayId || observation.docId || '—';
    if ($('mapMarkerDistance')) $('mapMarkerDistance').textContent = formatDistance(observationDistance(observation));
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden','false');

    if (observation.coords && state.map) {
      const zoom = document.body.classList.contains('map-expanded') ? Math.max(state.map.getZoom(), 16) : Math.max(state.map.getZoom(), 15);
      state.map.flyTo([observation.coords.lat, observation.coords.lng], zoom, { duration: .45 });
    }
  }

  function closeMapMarkerSheet() {
    setSelectedMapObservation(null);
  }

  function focusSelectedMapObservation() {
    const observation = state.selectedMapObservation;
    if (!observation?.coords || !state.map) {
      showToast('لا توجد إحداثيات موثوقة لهذه الحالة.');
      return;
    }
    state.map.flyTo([observation.coords.lat, observation.coords.lng], Math.max(state.map.getZoom(), 17), { duration: .45 });
  }

  function openSelectedMapObservation() {
    const observation = state.selectedMapObservation;
    if (!observation) {
      showToast('اختر حالة من الخريطة أولاً.');
      return;
    }
    openMissionDetail('evidence', observation);
  }

  function routeObservation(observation) {
    const coords = observation?.coords || null;
    if (!state.map || !coords) {
      showToast('لا توجد إحداثيات موثوقة لهذه المهمة.');
      return;
    }
    const destination = [coords.lat, coords.lng];
    if (state.lastPosition) {
      const origin = [state.lastPosition.coords.latitude, state.lastPosition.coords.longitude];
      state.map.fitBounds([origin, destination], { padding: [54,54], maxZoom: 17 });
      showToast('تم عرض نطاق الحركة بين موقعك والمهمة.');
    } else {
      state.map.flyTo(destination, 17, { duration: .55 });
      showToast('تم فتح موقع المهمة على الخريطة.');
    }
  }

  function routeToMission() {
    if (!state.missionCoords) {
      showToast('لا توجد إحداثيات موثوقة للمهمة الحالية.');
      return;
    }
    routeObservation({ coords: state.missionCoords });
  }

  function routeDetailObservation() {
    const observation = state.detailObservation || state.activeMission;
    if (!observation) {
      showToast('لا توجد مهمة قابلة للتوجيه.');
      return;
    }
    closeMissionDetail();
    if (!document.body.classList.contains('map-expanded')) toggleMapExpanded();
    setTimeout(() => {
      setSelectedMapObservation(observation);
      routeObservation(observation);
    }, 140);
  }

  function syncBodyScrollLock() {
    const locked = document.body.classList.contains('map-expanded')
      || $('missionSheet')?.classList.contains('is-open')
      || $('analysisSheet')?.classList.contains('is-open');
    document.body.style.overflow = locked ? 'hidden' : '';
  }

  function toggleMapExpanded() {
    document.body.classList.toggle('map-expanded');
    const expanded = document.body.classList.contains('map-expanded');
    const button = $('expandMapBtn');
    if (button) button.setAttribute('aria-label', expanded ? 'تصغير الخريطة' : 'تكبير الخريطة');
    syncBodyScrollLock();
    setTimeout(() => {
      if (state.map) state.map.invalidateSize({ animate: false });
    }, 60);
  }

  function missionTab(name) {
    document.querySelectorAll('[data-mission-tab]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.missionTab === name);
    });
    document.querySelectorAll('[data-mission-panel]').forEach(panel => {
      panel.classList.toggle('is-active', panel.dataset.missionPanel === name);
    });
  }

  function populateMissionSheet(observation) {
    if (!observation) return;
    const status = observation.status || 'PENDING';
    if ($('missionSheetTaskTitle')) $('missionSheetTaskTitle').textContent = observation.title || 'ملاحظة ميدانية';
    if ($('missionSheetStatus')) {
      $('missionSheetStatus').textContent = OBS_STATUS_LABELS[status] || status;
      $('missionSheetStatus').dataset.status = status;
    }
    if ($('missionSheetLocation')) $('missionSheetLocation').textContent = observation.location || 'موقع موثق';
    if ($('missionTimelineStatus')) $('missionTimelineStatus').textContent = OBS_STATUS_LABELS[status] || status;
    if ($('missionTimelineDate')) $('missionTimelineDate').textContent = observation.date || '—';
    if ($('missionTimelineId')) $('missionTimelineId').textContent = observation.displayId || observation.docId || '—';
  }

  function openMissionDetail(tab = 'evidence', observation = state.activeMission) {
    if (!observation) {
      showToast('لا توجد مهمة نشطة لعرضها.');
      return;
    }
    const sheet = $('missionSheet');
    if (!sheet) return;
    state.detailObservation = observation;
    populateMissionSheet(observation);
    if ($('missionAiResult')) $('missionAiResult').innerHTML = '<p>لم يتم تشغيل التحليل لهذه المهمة في هذه الجلسة بعد.</p>';
    missionTab(tab);
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden','false');
    syncBodyScrollLock();
    window.dispatchEvent(new CustomEvent('smart-hsr:mission-open', { detail: { observation } }));
  }

  function closeMissionDetail() {
    const sheet = $('missionSheet');
    if (!sheet) return;
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden','true');
    state.detailObservation = null;
    syncBodyScrollLock();
  }

  function setMissionEvidence({ beforeUrl = null, afterUrl = null, message = '' } = {}) {
    const paint = (id, url, fallback) => {
      const root = $(id);
      if (!root) return;
      root.replaceChildren();
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = fallback;
        root.appendChild(img);
      } else {
        const span = document.createElement('span');
        span.textContent = fallback;
        root.appendChild(span);
      }
    };
    paint('missionBeforeImage', beforeUrl, 'لا يوجد دليل قبل متاح');
    paint('missionAfterImage', afterUrl, 'لا يوجد دليل بعد متاح');
    if ($('missionEvidenceHint')) $('missionEvidenceHint').textContent = message || 'تم تحميل الأدلة المصرح بها للمهمة.';
  }

  function setAiLoading(loading, message = '') {
    for (const id of ['missionRunAiBtn','runVisionAnalysisBtn']) {
      const btn = $(id);
      if (btn) btn.disabled = Boolean(loading);
    }
    if (loading && $('missionAiResult')) $('missionAiResult').innerHTML = '<p>جارٍ تشغيل التحليل الآمن على الدليل الموثق…</p>';
    if (!loading && message && $('missionAiResult')) $('missionAiResult').innerHTML = '<p></p>', $('missionAiResult').querySelector('p').textContent = message;
  }

  function setAiResult(payload) {
    const root = $('missionAiResult');
    if (!root) return;
    const analysis = payload?.analysis || {};
    const intelligence = payload?.intelligence || {};
    root.replaceChildren();

    const summary = document.createElement('p');
    summary.textContent = analysis.shortSummaryAr || analysis.summaryAr || 'تم استلام تحليل استرشادي من النظام.';
    root.appendChild(summary);

    const grid = document.createElement('div');
    grid.className = 'ai-result-grid';
    const fields = [
      ['التصنيف', analysis.categoryLabelAr || analysis.categoryCode || '—'],
      ['الشدة', analysis.severity || '—'],
      ['الأولوية', intelligence.prioritySuggestion?.prioritySuggestion || analysis.prioritySuggestion || '—'],
      ['الإجراء', analysis.recommendedActionAr || intelligence.recommendedActionAr || '—']
    ];
    fields.forEach(([label,value]) => {
      const item = document.createElement('div');
      item.className = 'ai-result-item';
      const small = document.createElement('small'); small.textContent = label;
      const strong = document.createElement('strong'); strong.textContent = String(value);
      item.append(small,strong); grid.appendChild(item);
    });
    root.appendChild(grid);

    const rootCause = analysis.rootCauseAr || intelligence.rootCauseAr;
    if (rootCause) {
      const item = document.createElement('div'); item.className='ai-result-item'; item.style.marginTop='7px';
      const small=document.createElement('small'); small.textContent='السبب المحتمل';
      const strong=document.createElement('strong'); strong.textContent=String(rootCause);
      item.append(small,strong); root.appendChild(item);
    }

    const notice=document.createElement('div');
    notice.className='ai-review-notice';
    notice.textContent='التحليل استرشادي ويتطلب مراجعة واعتماد المراقب. لا يغيّر الحالة أو الإسناد تلقائيًا.';
    root.appendChild(notice);
  }

  function requestAiAnalysis() {
    const observation = state.detailObservation || state.activeMission;
    if (!observation) { showToast('لا توجد مهمة قابلة للتحليل.'); return; }
    openMissionDetail('ai', observation);
    window.dispatchEvent(new CustomEvent('smart-hsr:ai-analyze', { detail: { observation } }));
  }

  function printMission() {
    const observation = state.detailObservation || state.activeMission;
    if (!observation) { showToast('لا توجد مهمة للطباعة.'); return; }
    openMissionDetail('timeline', observation);
    setTimeout(() => window.print(), 120);
  }

  function openAnalysis() {
    const sheet = $('analysisSheet');
    if (!sheet) return;
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    syncBodyScrollLock();
  }

  function closeAnalysis() {
    const sheet = $('analysisSheet');
    if (!sheet) return;
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    syncBodyScrollLock();
  }

  function applyMapView(view) {
    state.mapView = view === 'twin' ? 'twin' : 'operational';
    const shell = $('urbanMapShell');
    if (shell) shell.setAttribute('data-map-view', state.mapView);

    document.querySelectorAll('[data-map-view]').forEach((button) => {
      const active = button.getAttribute('data-map-view') === state.mapView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });

    if ($('urbanMapTitle')) {
      $('urbanMapTitle').textContent = state.mapView === 'twin' ? 'التوأم الرقمي الميداني' : 'الخريطة التشغيلية الحية';
    }
    if ($('mapFeedState')) {
      $('mapFeedState').textContent = state.mapView === 'twin' ? 'Twin View' : (state.lastPosition ? 'GPS Live' : 'Live Map');
    }
    if ($('mapNote')) {
      $('mapNote').textContent = state.mapView === 'twin'
        ? 'عرض التوأم يغيّر طبقة القراءة فقط؛ لن تظهر أضرار أو أصول غير قادمة من بيانات موثوقة.'
        : (state.lastPosition ? 'الموقع الحالي حي. الحالات تظهر فقط من المصدر التشغيلي الحقيقي.' : 'الموقع حي، وتظهر الحالات عند ربط المصدر التشغيلي الحقيقي.');
    }
  }

  function bindMapMode() {
    document.querySelectorAll('[data-map-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.getAttribute('data-map-mode');
        if (mode === '3d') {
          showToast('سيتم تفعيل 3D بمحرك خريطة حقيقي بعد تثبيت طبقة التوأم والبيانات التشغيلية.');
          return;
        }
        document.querySelectorAll('[data-map-mode]').forEach((item) => item.classList.remove('is-active'));
        button.classList.add('is-active');
      });
    });

    document.querySelectorAll('[data-map-view]').forEach((button) => {
      button.addEventListener('click', () => applyMapView(button.getAttribute('data-map-view')));
    });
  }

  function openTrustedCapture() {
    const overlay = $('captureTransition');
    if (overlay) {
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden','false');
    }
    const theme = state.theme === 'light' ? 'light' : 'dark';
    const target = 'dashboard.html?capture=v2&theme=' + encodeURIComponent(theme);
    setTimeout(() => window.location.assign(target), 180);
  }

  function bindActions() {
    $('themeToggleBtn')?.addEventListener('click', toggleTheme);
    $('quickCaptureBtn')?.addEventListener('click', openTrustedCapture);
    $('quickObservationBtn')?.addEventListener('click', openTrustedCapture);
    $('dockCaptureBtn')?.addEventListener('click', openTrustedCapture);
    $('openMissionBtn')?.addEventListener('click', () => openMissionDetail('evidence'));
    $('closeMissionBtn')?.addEventListener('click', closeMissionDetail);
    $('missionBackdrop')?.addEventListener('click', closeMissionDetail);
    $('missionSheetRouteBtn')?.addEventListener('click', routeDetailObservation);
    $('missionRunAiBtn')?.addEventListener('click', requestAiAnalysis);
    $('runVisionAnalysisBtn')?.addEventListener('click', requestAiAnalysis);
    $('openMissionEvidenceBtn')?.addEventListener('click', () => { closeAnalysis(); openMissionDetail('evidence'); });
    $('openMissionLifecycleBtn')?.addEventListener('click', () => { closeAnalysis(); openMissionDetail('timeline'); });
    $('printMissionBtn')?.addEventListener('click', printMission);
    document.querySelectorAll('[data-mission-tab]').forEach(button => button.addEventListener('click', () => missionTab(button.dataset.missionTab)));
    $('centerMapBtn')?.addEventListener('click', centerOnUser);
    $('expandMapBtn')?.addEventListener('click', toggleMapExpanded);
    $('closeExpandedMapBtn')?.addEventListener('click', () => {
      if (document.body.classList.contains('map-expanded')) toggleMapExpanded();
    });
    $('closeMapMarkerSheetBtn')?.addEventListener('click', closeMapMarkerSheet);
    $('focusMapMarkerBtn')?.addEventListener('click', focusSelectedMapObservation);
    $('openMapMarkerDetailBtn')?.addEventListener('click', openSelectedMapObservation);
    $('routeMissionBtn')?.addEventListener('click', routeToMission);
    $('openAnalysisBtn')?.addEventListener('click', openAnalysis);
    $('quickAnalysisBtn')?.addEventListener('click', openAnalysis);
    $('closeAnalysisBtn')?.addEventListener('click', closeAnalysis);
    $('analysisBackdrop')?.addEventListener('click', closeAnalysis);

    document.querySelectorAll('[data-action="toast"]').forEach((button) => {
      button.addEventListener('click', () => showToast());
    });

    window.addEventListener('smart-hsr:map-observation-select', event => {
      setSelectedMapObservation(event?.detail?.observation || null);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if ($('missionSheet')?.classList.contains('is-open')) { closeMissionDetail(); return; }
      if ($('analysisSheet')?.classList.contains('is-open')) { closeAnalysis(); return; }
      if ($('mapMarkerSheet')?.classList.contains('is-open')) { closeMapMarkerSheet(); return; }
      if (document.body.classList.contains('map-expanded')) toggleMapExpanded();
    });
  }

  function setRuntimeIdentity({ name, organizationName } = {}) {
    if ($('inspectorDisplayName')) $('inspectorDisplayName').textContent = name || 'المراقب';
    if ($('inspectorOrgName')) $('inspectorOrgName').textContent = organizationName || 'SMART HSR';
  }

  function setRuntimeMission(observation) {
    state.activeMission = observation || null;
    if (!observation) {
      if ($('missionTitleText')) $('missionTitleText').textContent = 'لا توجد مهمة مفتوحة';
      if ($('missionDescription')) $('missionDescription').textContent = 'لا توجد ملاحظة ميدانية نشطة ضمن حسابك حاليًا.';
      if ($('missionStatusPill')) $('missionStatusPill').textContent = 'لا توجد مهمة';
      if ($('missionLocationText')) $('missionLocationText').textContent = '—';
      if ($('missionDateText')) $('missionDateText').textContent = '—';
      return;
    }
    const statusLabels = {
      PENDING:'قيد الانتظار',
      IN_PROGRESS:'قيد المعالجة',
      PENDING_REVIEW:'بانتظار المراجعة',
      COMPLETED:'مغلقة'
    };
    if ($('missionTitleText')) $('missionTitleText').textContent = observation.title || observation.details || 'ملاحظة ميدانية';
    if ($('missionDescription')) $('missionDescription').textContent = observation.details || 'ملاحظة ميدانية موثقة ضمن حسابك.';
    if ($('missionStatusPill')) {
      $('missionStatusPill').textContent = statusLabels[observation.status] || observation.status || '—';
      $('missionStatusPill').dataset.status = observation.status || '';
    }
    if ($('missionLocationText')) $('missionLocationText').textContent = observation.location || 'موقع موثق';
    if ($('missionDateText')) $('missionDateText').textContent = observation.date || '—';

  }

  function haversineMeters(a, b) {
    if (!a || !b) return null;
    const rad = value => value * Math.PI / 180;
    const R = 6371000;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const x = Math.sin(dLat/2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng/2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function setRuntimeDistance(coords) {
    state.missionCoords = coords || null;
    const position = state.lastPosition;
    const el = $('missionDistance');
    if (!el) return;
    if (!coords || !position) { el.textContent = '—'; return; }
    const meters = haversineMeters(
      { lat: position.coords.latitude, lng: position.coords.longitude },
      coords
    );
    if (!Number.isFinite(meters)) { el.textContent = '—'; return; }
    el.textContent = meters < 1000 ? Math.round(meters) + ' م' : (meters/1000).toFixed(1) + ' كم';
  }

  function setMissionImage(url) {
    const art = $('missionArt');
    if (!art) return;
    if (!url) {
      art.className = 'mission-art is-empty';
      art.innerHTML = '<span>لا توجد صورة موثقة متاحة على هذا الجهاز.</span>';
      return;
    }
    art.className = 'mission-art is-runtime-image';
    art.innerHTML = '';
    const img = document.createElement('img');
    img.alt = 'صورة الملاحظة الميدانية';
    img.src = url;
    img.loading = 'eager';
    art.appendChild(img);
  }

  function setTwinStats(items = []) {
    const open = items.filter(item => item.status === 'PENDING').length;
    const progress = items.filter(item => item.status === 'IN_PROGRESS' || item.status === 'PENDING_REVIEW').length;
    const closed = items.filter(item => item.status === 'COMPLETED').length;
    if ($('twinOpenCount')) $('twinOpenCount').textContent = String(open);
    if ($('twinProgressCount')) $('twinProgressCount').textContent = String(progress);
    if ($('twinClosedCount')) $('twinClosedCount').textContent = String(closed);
  }

  function setNearbyObservations(items = []) {
    const root = $('nearbyList');
    if (!root) return;
    root.innerHTML = '';
    const ownPosition = state.lastPosition ? { lat: state.lastPosition.coords.latitude, lng: state.lastPosition.coords.longitude } : null;
    const rows = items.map(item => {
      const distance = item.coords && ownPosition ? haversineMeters(ownPosition, item.coords) : null;
      return { ...item, distance };
    }).sort((a,b) => {
      if (Number.isFinite(a.distance) && Number.isFinite(b.distance)) return a.distance - b.distance;
      if (Number.isFinite(a.distance)) return -1;
      if (Number.isFinite(b.distance)) return 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    }).slice(0,3);

    rows.forEach(item => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'nearby-card';
      const marker = document.createElement('span');
      marker.className = 'nearby-card__marker';
      marker.dataset.status = item.status || 'PENDING';
      marker.textContent = item.status === 'COMPLETED' ? '✓' : item.status === 'PENDING' ? '!' : '↻';
      const copy = document.createElement('span');
      copy.className = 'nearby-card__copy';
      const title = document.createElement('strong');
      title.textContent = item.title || 'ملاحظة ميدانية';
      const meta = document.createElement('small');
      meta.textContent = [item.location, item.date].filter(Boolean).join(' · ') || 'بيانات موثقة';
      copy.append(title, meta);
      const distance = document.createElement('span');
      distance.className = 'nearby-card__distance';
      distance.textContent = Number.isFinite(item.distance) ? (item.distance < 1000 ? Math.round(item.distance) + ' م' : (item.distance/1000).toFixed(1) + ' كم') : '—';
      card.append(marker, copy, distance);
      card.addEventListener('click', () => {
        setSelectedMapObservation(item);
        if (!document.body.classList.contains('map-expanded')) toggleMapExpanded();
      });
      root.appendChild(card);
    });
  }

  window.SmartHsrInspectorV2 = Object.freeze({
    getMap: () => state.map,
    getPosition: () => state.lastPosition,
    setIdentity: setRuntimeIdentity,
    setMission: setRuntimeMission,
    setMissionDistance: setRuntimeDistance,
    setMissionImage,
    setMissionEvidence,
    setAiLoading,
    setAiResult,
    setSelectedMapObservation,
    setTwinStats,
    setNearbyObservations,
    showToast
  });

  window.addEventListener('pagehide', clearLiveLocationWatch);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearLiveLocationWatch();
  }, { passive:true });

  function boot() {
    applyTheme(preferredTheme(), false);
    applyMapView('operational');
    if (window.lucide) window.lucide.createIcons();
    bindActions();
    bindMapMode();
    initMap();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
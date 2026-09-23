(() => {
  'use strict';

  const state = {
    map: null,
    locationMarker: null,
    lastPosition: null,
    hasCenteredOnce: false,
    toastTimer: null,
    theme: 'dark',
    mapView: 'operational'
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

  function requestLocation() {
    const gps = $('gpsStateText');
    const loc = $('locationStateText');
    if (!navigator.geolocation) {
      if (gps) gps.textContent = 'غير مدعوم';
      if (loc) loc.textContent = 'الموقع غير متاح';
      return;
    }

    if (gps) gps.textContent = 'جارٍ الاتصال';
    navigator.geolocation.watchPosition(
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
    if ($('mapNote')) $('mapNote').textContent = 'الموقع الحالي حي. نقاط البلاغات ستظهر بعد ربط مصدر التشغيل.';

    if (!state.locationMarker) {
      state.locationMarker = L.marker(latlng, { icon: createLocationIcon(), keyboard: false }).addTo(state.map);
    } else {
      state.locationMarker.setLatLng(latlng);
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

  function toggleMapExpanded() {
    document.body.classList.toggle('map-expanded');
    const expanded = document.body.classList.contains('map-expanded');
    const button = $('expandMapBtn');
    if (button) button.setAttribute('aria-label', expanded ? 'تصغير الخريطة' : 'تكبير الخريطة');
    setTimeout(() => {
      if (state.map) state.map.invalidateSize({ animate: false });
    }, 60);
  }

  function openAnalysis() {
    const sheet = $('analysisSheet');
    if (!sheet) return;
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeAnalysis() {
    const sheet = $('analysisSheet');
    if (!sheet) return;
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    if (!document.body.classList.contains('map-expanded')) document.body.style.overflow = '';
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

  function bindActions() {
    $('themeToggleBtn')?.addEventListener('click', toggleTheme);
    $('centerMapBtn')?.addEventListener('click', centerOnUser);
    $('expandMapBtn')?.addEventListener('click', toggleMapExpanded);
    $('openAnalysisBtn')?.addEventListener('click', openAnalysis);
    $('quickAnalysisBtn')?.addEventListener('click', openAnalysis);
    $('closeAnalysisBtn')?.addEventListener('click', closeAnalysis);
    $('analysisBackdrop')?.addEventListener('click', closeAnalysis);

    document.querySelectorAll('[data-action="toast"]').forEach((button) => {
      button.addEventListener('click', () => showToast());
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if ($('analysisSheet')?.classList.contains('is-open')) closeAnalysis();
      if (document.body.classList.contains('map-expanded')) toggleMapExpanded();
    });
  }

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
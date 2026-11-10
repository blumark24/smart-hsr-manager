// SMART HSR access surfaces — mounts the shared Living Municipal Twin canvases
// with the exact per-surface presets and per-breakpoint camera frames used by
// the approved Cloud Design boards (3a–3j). Presentation only: no auth,
// routing or session logic lives here.
(function () {
  var PRE = {
    gate:  { pal: 'light', weights: { parcels: 1, roads: .9, field: .7, routes: .6, dept: .45, decision: .6, scan: .4, service: .5 }, tilt: .96 },
    lead:  { pal: 'dark',  weights: { decision: 1.0, dept: .5, parcels: .75, roads: .6, field: .5, analysis: .35 }, tilt: 1.0 },
    users: { pal: 'light', weights: { routes: 1.4, dept: 1.1, roads: .8, parcels: .6, field: .5 }, tilt: .98 }
  };
  var mqMobile = window.matchMedia('(max-width:600px)');
  var mqTablet = window.matchMedia('(min-width:601px) and (max-width:899px), (min-width:601px) and (max-width:1024px) and (orientation:portrait)');
  var unmounts = [];

  function frame(cv) {
    var key = mqMobile.matches ? 'm' : (mqTablet.matches ? 't' : 'd');
    var raw = cv.getAttribute('data-' + key) || cv.getAttribute('data-d') || '';
    var p = raw.split(',').map(Number);
    return { seed: p[0] || 7, cx: p[1], cy: p[2], sw: p[3], sh: p[4] };
  }

  function mountAll() {
    if (!window.HSRTwin) return;
    unmounts.forEach(function (u) { u(); });
    unmounts = Array.prototype.map.call(document.querySelectorAll('canvas[data-tw]'), function (cv) {
      var pre = PRE[cv.getAttribute('data-tw')], f = frame(cv);
      return window.HSRTwin.mount(cv, f.seed, function (m) {
        return Object.assign({}, pre, {
          cxF: f.cx, cyF: f.cy, sw: f.sw, sh: f.sh,
          yaw: -.22 + m.x * .08, tilt: pre.tilt + m.y * .04, still: false
        });
      });
    });
  }

  // Mobile sheets drop the field labels and use the Arabic placeholder from 3h/3j.
  function placeholders() {
    document.querySelectorAll('[data-ph-m]').forEach(function (el) {
      if (!el.hasAttribute('data-ph-d')) el.setAttribute('data-ph-d', el.getAttribute('placeholder') || '');
      el.setAttribute('placeholder', mqMobile.matches ? el.getAttribute('data-ph-m') : el.getAttribute('data-ph-d'));
    });
  }

  function onChange() { mountAll(); placeholders(); }
  [mqMobile, mqTablet].forEach(function (mq) {
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onChange); else onChange();
})();

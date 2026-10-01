// SMART HSR — Living Municipal Twin renderer (shared by website + board)
(function () {
  if (window.HSRTwin) return;
  const rng = s => { let a = (s * 7919) % 2147483646 + 1; return () => (a = a * 16807 % 2147483647) / 2147483647; };
  const cl = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const KEYS = ['parcels', 'roads', 'field', 'gis', 'analysis', 'routes', 'dept', 'decision', 'scan', 'service'];
  const PAL = {
    light: { ink: '14,26,36', emer: '12,132,43', deep: '7,51,36', turq: '31,169,161', fill: '255,255,255', fillA: .66, strokeA: .13, node: '#0C842B', cmd: '#073324', ring: '7,51,36', line: '14,26,36' },
    dark: { ink: '214,236,224', emer: '108,214,150', deep: '4,34,26', turq: '86,214,204', fill: '255,255,255', fillA: .03, strokeA: .15, node: '#6CD696', cmd: '#FFFFFF', ring: '255,255,255', line: '255,255,255' }
  };

  function build(seed, small) {
    const r = rng(seed), E = 1.3, ru = [], rv = [];
    for (let u = -E + .1 + r() * .1; u < E - .05; u += (small ? .34 : .22) + r() * .18) ru.push(u);
    for (let v = -E + .1 + r() * .1; v < E - .05; v += (small ? .3 : .2) + r() * .16) rv.push(v);
    const us = [-E, ...ru, E], vs = [-E, ...rv, E], parcels = [];
    for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < vs.length - 1; j++) {
      const u0 = us[i] + .025, u1 = us[i + 1] - .025, v0 = vs[j] + .025, v1 = vs[j + 1] - .025;
      if (u1 - u0 < .05 || v1 - v0 < .05) continue;
      const nx = 1 + Math.floor(r() * 3), ny = 1 + Math.floor(r() * 2), pw = (u1 - u0) / nx, ph = (v1 - v0) / ny;
      for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) {
        const t = r();
        parcels.push({ u0: u0 + a * pw + .008, v0: v0 + b * ph + .008, u1: u0 + (a + 1) * pw - .008, v1: v0 + (b + 1) * ph - .008, e: t < .12, h: t < .12 ? .02 + r() * .05 : (t < .22 ? .012 : 0) });
      }
    }
    parcels.sort((a, b) => b.v0 - a.v0);
    const pick = a => a[Math.floor(r() * a.length)];
    const field = [];
    for (let n = 0; n < (small ? 14 : 28); n++) { const p = pick(parcels); field.push({ u: (p.u0 + p.u1) / 2, v: (p.v0 + p.v1) / 2, p: r() * 3, par: p }); }
    let cu = ru[0], cv = rv[0];
    ru.forEach(u => { if (Math.abs(u - .05) < Math.abs(cu - .05)) cu = u; });
    rv.forEach(v => { if (Math.abs(v - .1) < Math.abs(cv - .1)) cv = v; });
    const cmd = { u: cu, v: cv }, ops = [];
    for (let g = 0; ops.length < 6 && g < 200; g++) { const u = pick(ru), v = pick(rv); if (Math.hypot(u - cu, v - cv) > .3 && Math.hypot(u, v) < 1.05 && !ops.some(o => o.u === u && o.v === v)) ops.push({ u, v, p: r() * 3 }); }
    const routes = [];
    for (let k = 0; k < 3; k++) {
      let i = Math.floor(r() * ru.length), j = Math.floor(r() * rv.length); const pts = [[ru[i], rv[j]]];
      for (let s = 0; s < 10; s++) {
        if (s % 2) i = cl(i + (r() < .5 ? -1 : 1) * (1 + Math.floor(r() * 2)), 0, ru.length - 1); else j = cl(j + (r() < .5 ? -1 : 1), 0, rv.length - 1);
        const q = [ru[i], rv[j]], l = pts[pts.length - 1]; if (q[0] !== l[0] || q[1] !== l[1]) pts.push(q);
      }
      const seg = []; let L = 0;
      for (let s = 1; s < pts.length; s++) { const d = Math.hypot(pts[s][0] - pts[s - 1][0], pts[s][1] - pts[s - 1][1]); seg.push(d); L += d; }
      routes.push({ pts, seg, L: L || 1, o: r() });
    }
    const zones = [0, 1, 2].map(() => { const f = pick(field); return { u: f.u, v: f.v, R: .18 + r() * .2, p: r() * 6 }; });
    const art = []; for (let s = 0; s <= 30; s++) { const f = s / 30, a = 1 - f; art.push([a * a * -E + 2 * a * f * .1 + f * f * E, a * a * -.95 + 2 * a * f * -.2 + f * f * .75]); }
    const su = pick(ru.slice(0, Math.max(1, ru.length / 2))), sv = pick(rv.slice(Math.floor(rv.length / 2)));
    const service = { u0: su - .45, u1: su + .1, v0: sv - .1, v1: sv + .38 };
    let land = parcels.filter(p => p.e && Math.hypot((p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2) < .9); land = land.length ? land : parcels;
    land = land.reduce((b, p) => (Math.hypot((p.u0 + p.u1) / 2 + .45, (p.v0 + p.v1) / 2 + .45) < Math.hypot((b.u0 + b.u1) / 2 + .45, (b.v0 + b.v1) / 2 + .45) ? p : b), land[0]);
    return { E, ru, rv, parcels, field, cmd, ops, routes, zones, art, service, land };
  }

  function along(R, d) {
    for (let i = 0; i < R.seg.length; i++) {
      if (d <= R.seg[i]) { const a = R.pts[i], b = R.pts[i + 1], f = R.seg[i] ? d / R.seg[i] : 0; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
      d -= R.seg[i];
    }
    return R.pts[R.pts.length - 1];
  }

  function draw(c, w, h, t, S, o) {
    const K = PAL[o.pal || 'light'], W = o.w, dark = o.pal === 'dark';
    const yaw = o.yaw || 0, tilt = o.tilt == null ? 1 : o.tilt, cx = w * (o.cxF == null ? .5 : o.cxF), cy = h * (o.cyF == null ? .5 : o.cyF);
    const scale = Math.min(w * (o.sw || .45), h * (o.sh || .6)) * (o.zoom || 1), D = 3.2, F = scale * D / 1.3;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const P = (u, v, z = 0) => { const x = u * cyw - v * syw, y = u * syw + v * cyw, ry = y * ct + z * st, d = D + y * st - z * ct; return [cx + x * F / d, cy - ry * F / d]; };
    const fade = (u, v) => cl((1 - Math.hypot(u, v) / 1.42) / .34);
    const A = (c3, a) => `rgba(${c3},${a < 0 ? 0 : a > 1 ? 1 : a})`;
    const path = pts => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); };
    const quad = (pts, fill, stroke) => { path(pts); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); } };
    const circ = (u, v, z, R, n = 28) => { const pts = []; for (let i = 0; i <= n; i++) { const a = i / n * 6.2832; pts.push(P(u + Math.cos(a) * R, v + Math.sin(a) * R, z)); } return pts; };
    const arc3 = (a, b, za, zb, lift, n = 20) => { const pts = [], d = Math.hypot(b.u - a.u, b.v - a.v); for (let i = 0; i <= n; i++) { const f = i / n; pts.push(P(a.u + (b.u - a.u) * f, a.v + (b.v - a.v) * f, za + (zb - za) * f + Math.sin(Math.PI * f) * lift * d)); } return pts; };
    const onPath = (pts, f) => { const i = Math.min(pts.length - 2, Math.floor(f * (pts.length - 1))), g = f * (pts.length - 1) - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * g, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * g]; };
    const E = S.E; c.lineWidth = 1; c.lineCap = 'round';
    const scanV = ((t * .14) % 3.4) - 1.7;

    if (W.gis > .02) {
      for (let g = -E; g <= E + .001; g += .1) {
        for (let s = -E; s < E; s += .26) {
          const f1 = fade(g, s + .13) * W.gis;
          if (f1 < .02) continue;
          c.strokeStyle = A(K.line, .06 * f1); path([P(g, s), P(g, s + .26)]); c.stroke(); path([P(s, g), P(s + .26, g)]); c.stroke();
        }
      }
    }
    if (W.parcels > .02) for (const p of S.parcels) {
      const mu = (p.u0 + p.u1) / 2, mv = (p.v0 + p.v1) / 2, f = fade(mu, mv) * Math.min(1, W.parcels); if (f < .02) continue;
      const hh = p.h * (o.extrude == null ? 1 : o.extrude) * (p.e ? Math.min(1.4, W.parcels) : 1);
      const a = P(p.u0, p.v0, hh), b = P(p.u1, p.v0, hh), cc = P(p.u1, p.v1, hh), d = P(p.u0, p.v1, hh);
      if (hh > .001) quad([P(p.u0, p.v0, 0), P(p.u1, p.v0, 0), b, a], A(p.e ? K.deep : K.ink, (p.e ? (dark ? .5 : .32) : (dark ? .06 : .07)) * f));
      const isLand = p === S.land && o.focus === 'lands';
      quad([a, b, cc, d], p.e ? A(K.emer, (dark ? .2 : .17) * f * Math.min(1.5, W.parcels) + (isLand ? .3 : 0)) : A(K.fill, K.fillA * f), A(p.e ? K.emer : K.ink, (p.e ? .4 : K.strokeA) * f));
      if (W.scan > .02 && Math.abs(mv - scanV) < .1) quad([a, b, cc, d], A(K.turq, .2 * W.scan * f * (1 - Math.abs(mv - scanV) / .1)));
    }
    if (W.scan > .02) { c.strokeStyle = A(K.turq, .5 * W.scan); c.lineWidth = 1.2; const sp = []; for (let u = -E; u <= E; u += .1) sp.push(P(u, scanV)); c.globalAlpha = cl(1 - Math.abs(scanV) / 1.3); path(sp); c.stroke(); c.globalAlpha = 1; c.lineWidth = 1; }
    if (W.roads > .02) {
      const road = pts => { for (let i = 0; i < pts.length - 1; i++) { const f = fade((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2) * W.roads; if (f < .02) continue; c.strokeStyle = A(K.ink, (dark ? .22 : .2) * f); path([P(pts[i][0], pts[i][1]), P(pts[i + 1][0], pts[i + 1][1])]); c.stroke(); } };
      const seg = (a0, a1, fixed, vert) => { const pts = []; for (let s = a0; s <= a1 + .001; s += .2) pts.push(vert ? [fixed, s] : [s, fixed]); return pts; };
      S.ru.forEach(u => road(seg(-E, E, u, true))); S.rv.forEach(v => road(seg(-E, E, v, false)));
      c.lineWidth = 2.2; for (let i = 0; i < S.art.length - 1; i++) { const q = S.art[i], n = S.art[i + 1], f = fade(q[0], q[1]) * W.roads; c.strokeStyle = A(K.emer, .45 * f); path([P(q[0], q[1]), P(n[0], n[1])]); c.stroke(); } c.lineWidth = 1;
    }
    if (W.analysis > .02) S.zones.forEach(z => {
      const br = 1 + .05 * Math.sin(t * .8 + z.p);
      for (let k = 3; k >= 1; k--) quad(circ(z.u, z.v, 0, z.R * k / 3 * br), A(K.emer, .06 * W.analysis), A(K.emer, .32 * W.analysis * (1.2 - k / 3)));
    });
    if (W.service > .02) {
      const s = S.service, z = .17, pts = [P(s.u0, s.v0, z), P(s.u1, s.v0, z), P(s.u1, s.v1, z), P(s.u0, s.v1, z)];
      c.setLineDash([2, 4]); [[s.u0, s.v0], [s.u1, s.v0], [s.u1, s.v1], [s.u0, s.v1]].forEach(q => { c.strokeStyle = A(K.emer, .35 * W.service); path([P(q[0], q[1], 0), P(q[0], q[1], z)]); c.stroke(); }); c.setLineDash([]);
      quad(pts, A(dark ? '255,255,255' : '255,255,255', (dark ? .05 : .32) * W.service), A(K.emer, .55 * W.service));
      c.strokeStyle = A(K.emer, .18 * W.service); for (let g = 1; g < 5; g++) { const u = s.u0 + (s.u1 - s.u0) * g / 5; path([P(u, s.v0, z), P(u, s.v1, z)]); c.stroke(); }
    }
    if (W.gis > .05) S.field.forEach((f, i) => {
      if (i % 2) return; const p = f.par, a = fade(f.u, f.v) * W.gis;
      quad([P(p.u0, p.v0), P(p.u1, p.v0), P(p.u1, p.v1), P(p.u0, p.v1)], null, A(K.turq, .7 * a));
    });
    if (W.routes > .02) S.routes.forEach(R => {
      c.lineWidth = 1.6;
      for (let i = 0; i < R.pts.length - 1; i++) { const q = R.pts[i], n = R.pts[i + 1], f = fade((q[0] + n[0]) / 2, (q[1] + n[1]) / 2) * Math.min(1, W.routes); c.strokeStyle = A(K.turq, .6 * f); path([P(q[0], q[1], .004), P(n[0], n[1], .004)]); c.stroke(); }
      c.lineWidth = 1;
      for (let k = 0; k < 2; k++) {
        const d = ((t * .1 + R.o + k * .5) % 1) * R.L, q = along(R, d), q2 = along(R, Math.max(0, d - .1)), f = fade(q[0], q[1]) * Math.min(1, W.routes), a = P(q[0], q[1], .004), b = P(q2[0], q2[1], .004);
        const g = c.createLinearGradient(a[0], a[1], b[0], b[1]); g.addColorStop(0, A(K.turq, f)); g.addColorStop(1, A(K.turq, 0));
        c.strokeStyle = g; c.lineWidth = 3; path([a, b]); c.stroke(); c.lineWidth = 1;
        c.fillStyle = A(dark ? '255,255,255' : K.turq, f); c.beginPath(); c.arc(a[0], a[1], 3, 0, 7); c.fill();
      }
    });
    if (W.field > .02) S.field.forEach(f => {
      const a = fade(f.u, f.v) * Math.min(1.2, W.field); if (a < .03) return;
      const ph = ((t + f.p) % 3) / 3; c.strokeStyle = A(K.emer, (1 - ph) * .6 * a); path(circ(f.u, f.v, 0, .015 + ph * .085, 20)); c.stroke();
      const p = P(f.u, f.v); c.fillStyle = A(K.emer, a); c.beginPath(); c.arc(p[0], p[1], 2.6 * (W.field > 1.1 ? 1.25 : 1), 0, 7); c.fill();
    });
    const wOps = Math.max(W.dept, W.routes * .7, W.decision * .7);
    const zc = .12 + .32 * cl(W.decision), cmdTop = P(S.cmd.u, S.cmd.v, zc);
    if (W.dept > .02) S.ops.forEach((a, i) => {
      [S.ops[(i + 1) % S.ops.length], i % 2 ? null : S.ops[(i + 3) % S.ops.length]].forEach((b, j) => {
        if (!b) return; const pts = arc3(a, b, .1, .1, .32);
        c.strokeStyle = A(K.emer, .42 * W.dept); c.lineWidth = 1.1; path(pts); c.stroke(); c.lineWidth = 1;
        const q = onPath(pts, (t * .16 + i * .17 + j * .4) % 1); c.fillStyle = A(dark ? '255,255,255' : K.emer, W.dept); c.beginPath(); c.arc(q[0], q[1], 2.2, 0, 7); c.fill();
      });
    });
    if (W.decision > .02) {
      const src = S.ops.map(o2 => ({ o: o2, z: .1 })).concat(S.field.filter((_, i) => i % 3 === 0).map(f => ({ o: f, z: 0 })));
      src.forEach((s, i) => {
        const pts = arc3(s.o, S.cmd, s.z, zc, .22, 18), a = fade(s.o.u, s.o.v);
        c.setLineDash([2, 4]); c.strokeStyle = A(K.ring, .3 * W.decision * a); path(pts); c.stroke(); c.setLineDash([]);
        const q = onPath(pts, (t * .22 + i * .11) % 1); c.fillStyle = A(dark ? '255,255,255' : K.deep, W.decision * a); c.beginPath(); c.arc(q[0], q[1], 1.9, 0, 7); c.fill();
      });
    }
    if (wOps > .02) S.ops.forEach(n => {
      const b = P(n.u, n.v, 0), tp = P(n.u, n.v, .1), ph = ((t + n.p) % 3) / 3;
      c.strokeStyle = A(K.emer, (1 - ph) * .5 * wOps); path(circ(n.u, n.v, 0, .03 + ph * .07, 20)); c.stroke();
      c.strokeStyle = A(K.emer, .8 * wOps); c.lineWidth = 1.4; path([b, tp]); c.stroke(); c.lineWidth = 1;
      c.fillStyle = A(dark ? '255,255,255' : '255,255,255', wOps); c.beginPath(); c.arc(tp[0], tp[1], 4.2, 0, 7); c.fill();
      c.strokeStyle = A(K.emer, wOps); c.lineWidth = 1.6; c.stroke(); c.lineWidth = 1;
    });
    const wc = Math.max(.55, cl(W.decision));
    for (let k = 1; k <= 3; k++) { const ph = ((t * .5 + k / 3) % 1); c.strokeStyle = A(K.ring, (1 - ph) * .35 * wc); path(circ(S.cmd.u, S.cmd.v, 0, .04 + ph * .22, 32)); c.stroke(); }
    const cb = P(S.cmd.u, S.cmd.v, 0);
    const lg = c.createLinearGradient(cb[0], cb[1], cmdTop[0], cmdTop[1]); lg.addColorStop(0, A(K.ring, .1)); lg.addColorStop(1, A(K.ring, .9 * wc));
    c.strokeStyle = lg; c.lineWidth = 2; path([cb, cmdTop]); c.stroke(); c.lineWidth = 1;
    if (W.decision > .3) { const r0 = .12 * cl(W.decision); quad([P(S.cmd.u - r0, S.cmd.v - r0, zc), P(S.cmd.u + r0, S.cmd.v - r0, zc), P(S.cmd.u + r0, S.cmd.v + r0, zc), P(S.cmd.u - r0, S.cmd.v + r0, zc)], A(dark ? '255,255,255' : '255,255,255', dark ? .06 : .4), A(K.ring, .4 * W.decision)); }
    c.fillStyle = A(K.ring, .12 * wc); c.beginPath(); c.arc(cmdTop[0], cmdTop[1], 14, 0, 7); c.fill();
    c.fillStyle = K.cmd; c.beginPath(); c.arc(cmdTop[0], cmdTop[1], 5.5, 0, 7); c.fill();
    c.strokeStyle = A(K.ring, .7 * wc); c.beginPath(); c.arc(cmdTop[0], cmdTop[1], 9.5, 0, 7); c.stroke();

    const lp = S.land, R0 = S.routes[0];
    const anchors = {
      field: P(S.field[0].u, S.field[0].v), lands: P((lp.u0 + lp.u1) / 2, (lp.v0 + lp.v1) / 2, lp.h),
      mobility: (q => P(q[0], q[1]))(along(R0, R0.L * .5)), command: cmdTop
    };
    if (o.cards) o.cards.forEach(cd => {
      const an = anchors[cd.key]; if (!an) return;
      const px = cl(an[0], cd.l, cd.r), py = cl(an[1], cd.t, cd.b), hi = o.focus === cd.key;
      c.strokeStyle = A(K.line, hi ? .55 : .26); c.lineWidth = 1; c.setLineDash(hi ? [] : [3, 3]); path([an, [px, py]]); c.stroke(); c.setLineDash([]);
      c.strokeStyle = A(K.line, hi ? .7 : .4); c.beginPath(); c.arc(an[0], an[1], hi ? 8 : 6, 0, 7); c.stroke();
      c.fillStyle = A(K.line, .6); c.beginPath(); c.arc(px, py, 2.2, 0, 7); c.fill();
    });
    return anchors;
  }

  const DEF = { parcels: 0, roads: 0, field: 0, gis: 0, analysis: 0, routes: 0, dept: 0, decision: 0, scan: 0, service: 0 };
  const items = new Set(), vmap = new Map(), mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let raf = 0, last = 0;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  addEventListener('pointermove', e => { mouse.tx = e.clientX / innerWidth - .5; mouse.ty = e.clientY / innerHeight - .5; }, { passive: true });
  const io = new IntersectionObserver(es => es.forEach(e => { const it = vmap.get(e.target); if (it) it.vis = e.isIntersecting; }), { rootMargin: '200px' });
  function render(it, ts) {
    const cv = it.cv, w = cv.offsetWidth, h = cv.offsetHeight; if (!w || !h) return;
    if (it.w !== w || it.h !== h) {
      const d = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * d); cv.height = Math.round(h * d); it.w = w; it.h = h;
      it.ctx = cv.getContext('2d'); it.ctx.setTransform(d, 0, 0, d, 0, 0); it.S = build(it.seed, w < 520);
    }
    const o = it.get(mouse) || {}, t = (reduce || o.still) ? 8 : ts / 1000, tw = Object.assign({}, DEF, o.weights || {}), rate = o.rate || .07;
    KEYS.forEach(k => { it.cw[k] = it.cw[k] == null ? tw[k] : it.cw[k] + (tw[k] - it.cw[k]) * rate; });
    ['tilt', 'zoom', 'yaw', 'cxF', 'cyF', 'sw', 'sh'].forEach(k => { if (o[k] == null) return; it.cam[k] = it.cam[k] == null ? o[k] : it.cam[k] + (o[k] - it.cam[k]) * (o.camRate || .08); });
    it.ctx.clearRect(0, 0, w, h);
    const a = draw(it.ctx, w, h, t, it.S, Object.assign({}, o, it.cam, { w: it.cw }));
    if (o.after) o.after(a);
  }
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (ts - last < 20) return; last = ts;
    mouse.x += (mouse.tx - mouse.x) * .05; mouse.y += (mouse.ty - mouse.y) * .05;
    items.forEach(it => { if (!it.cv.isConnected) { items.delete(it); return; } if (it.vis) render(it, ts); });
  }
  function mount(cv, seed, get) {
    if (!cv) return () => {};
    const it = { cv, seed, get, cw: {}, cam: {}, vis: true }; items.add(it); vmap.set(cv, it); io.observe(cv);
    if (!raf) raf = requestAnimationFrame(loop);
    return () => { items.delete(it); io.unobserve(cv); vmap.delete(cv); };
  }
  window.HSRTwin = { mount, mouse, KEYS };
})();

/* 星愿地球 - WISH GLOBE.
   Canvas orthographic globe, drag / touch to rotate, slow idle spin.
   392 cities from the original wish-map data (data/cities.json);
   wish counts fetched live from the running site's /api/wishes,
   falling back to the bundled snapshot when cross-origin blocks us.
   Symbol language: · city  + wished city  ✦ brightest cities. */
(function () {
  'use strict';

  var canvas = document.getElementById('sky-globe');
  var tipEl = document.getElementById('sky-tip');
  var srcEl = document.getElementById('sky-src');
  var totalEl = document.getElementById('sky-total');
  var wishesEl = document.getElementById('sky-wishes');
  var ctx = canvas.getContext('2d');

  var CSS = getComputedStyle(document.documentElement);
  var C_LINE = CSS.getPropertyValue('--line').trim() || '#B3BFD5';
  var C_INK = CSS.getPropertyValue('--ink').trim() || '#3A4358';
  var C_FAINT = CSS.getPropertyValue('--faint').trim() || '#8A96AD';
  var C_ACC = CSS.getPropertyValue('--accent').trim() || '#A8975C';

  var cities = [];
  var counts = {};           /* cityId -> n */
  var topIds = {};           /* the few brightest -> ✦ */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* view state: centered on China */
  var lon0 = 105, lat0 = 32, targetSpin = reduced ? 0 : 0.018;
  var dragging = false, lastX = 0, lastY = 0, vx = 0, idleT = 0;
  var W = 0, H = 0, R = 0, DPR = 1, zoom = 1.35, baseR = 0;
  var pinch = null;

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width;
    H = Math.max(460, Math.min(720, window.innerHeight * 0.72));
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.height = H + 'px';
    baseR = Math.min(W, H) * 0.40;
    R = baseR * zoom;
  }

  var D2R = Math.PI / 180;
  function project(lon, lat) {
    var la = lat * D2R, lo = (lon - lon0) * D2R, la0 = lat0 * D2R;
    var cosc = Math.sin(la0) * Math.sin(la) + Math.cos(la0) * Math.cos(la) * Math.cos(lo);
    return {
      x: W / 2 + R * Math.cos(la) * Math.sin(lo),
      y: H / 2 - R * (Math.cos(la0) * Math.sin(la) - Math.sin(la0) * Math.cos(la) * Math.cos(lo)),
      v: cosc
    };
  }

  function drawArc(points) {
    ctx.beginPath();
    var pen = false;
    for (var i = 0; i < points.length; i++) {
      var p = project(points[i][0], points[i][1]);
      if (p.v > 0) {
        if (pen) ctx.lineTo(p.x, p.y); else { ctx.moveTo(p.x, p.y); pen = true; }
      } else pen = false;
    }
    ctx.stroke();
  }

  var projected = [];        /* for hover hit-testing */

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    /* sphere rim */
    ctx.strokeStyle = C_LINE;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2);
    ctx.stroke();

    /* graticule */
    ctx.globalAlpha = 0.38;
    ctx.lineWidth = 0.7;
    var lat, lon, pts, t;
    for (lat = -60; lat <= 60; lat += 20) {
      pts = [];
      for (t = -180; t <= 180; t += 4) pts.push([t, lat]);
      drawArc(pts);
    }
    for (lon = -180; lon < 180; lon += 20) {
      pts = [];
      for (t = -84; t <= 84; t += 4) pts.push([lon, t]);
      drawArc(pts);
    }
    ctx.globalAlpha = 1;

    /* cities */
    projected = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < cities.length; i++) {
      var c = cities[i];
      var p = project(c.lon, c.lat);
      if (p.v <= 0.02) continue;
      var n = counts[c.id] || 0;
      projected.push({ x: p.x, y: p.y, c: c, n: n });
      if (topIds[c.id]) {
        ctx.fillStyle = C_ACC;
        ctx.font = '12px ui-monospace, Menlo, monospace';
        ctx.fillText('✦', p.x, p.y);
      } else if (n > 0) {
        ctx.fillStyle = C_INK;
        ctx.globalAlpha = 0.75;
        ctx.font = '11px ui-monospace, Menlo, monospace';
        ctx.fillText('+', p.x, p.y);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = C_FAINT;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function tick() {
    if (!dragging) {
      if (Math.abs(vx) > 0.005) {          /* inertia */
        lon0 += vx;
        vx *= 0.94;
      } else if (!reduced && ++idleT > 90) {
        lon0 += targetSpin;                 /* quiet idle spin */
      }
      lat0 = Math.max(-70, Math.min(70, lat0));
      render();
    }
    requestAnimationFrame(tick);
  }

  /* ---------- drag / touch ---------- */
  var pointers = {};
  canvas.addEventListener('pointerdown', function (e) {
    pointers[e.pointerId] = [e.clientX, e.clientY];
    targetSpin = 0;                     /* the visitor has taken the wheel */
    dragging = true; idleT = 0; vx = 0;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoom = Math.max(0.6, Math.min(3, zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
    R = baseR * zoom;
    render();
  }, { passive: false });
  canvas.addEventListener('pointermove', function (e) {
    if (pointers[e.pointerId]) pointers[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(pointers);
    if (ids.length === 2) {             /* pinch to zoom */
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) {
        zoom = Math.max(0.6, Math.min(3, zoom * d / pinch));
        R = baseR * zoom;
        render();
      }
      pinch = d;
      return;
    }
    pinch = null;
    if (dragging) {
      var k = 0.35 * (600 / R);
      lon0 += (e.clientX - lastX) * -k * 0.5;
      lat0 += (e.clientY - lastY) * k * 0.5;
      lat0 = Math.max(-70, Math.min(70, lat0));
      vx = (e.clientX - lastX) * -k * 0.5;
      lastX = e.clientX; lastY = e.clientY;
      render();
    } else {
      hover(e);
    }
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    canvas.addEventListener(ev, function (e) {
      delete pointers[e.pointerId];
      pinch = null;
      dragging = false; idleT = 0;
    });
  });

  function hover(e) {
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var best = null, bd = 144;
    for (var i = 0; i < projected.length; i++) {
      var p = projected[i];
      var d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my);
      if (d < bd && (p.n > 0 || d < 36)) { bd = d; best = p; }
    }
    if (best) {
      idleT = 0;
      tipEl.innerHTML = (topIds[best.c.id] ? '<span class="accent">✦ </span>' : '') +
        best.c.prov + ' · ' + best.c.city +
        (best.n > 0 ? '<br><span class="dim">' + best.n + ' 次晨光正在这里闪耀</span>'
                    : '<br><span class="dim">还没有星愿落在这里</span>');
      tipEl.style.left = Math.min(W - 190, best.x + 14) + 'px';
      tipEl.style.top = (best.y + 14) + 'px';
      tipEl.classList.add('on');
    } else {
      tipEl.classList.remove('on');
    }
  }
  canvas.addEventListener('pointerleave', function () { tipEl.classList.remove('on'); });

  /* ---------- data ---------- */
  function applyCounts(list, live, at) {
    var total = 0;
    list.forEach(function (r) { counts[r.city_id] = r.count; total += r.count; });
    var top = list.slice().sort(function (a, b) { return b.count - a.count; }).slice(0, 3);
    top.forEach(function (r) { topIds[r.city_id] = true; });
    totalEl.textContent = String(total).padStart(4, '0');
    srcEl.textContent = live ? 'LIVE / hk.weizichen.cn' : 'SNAPSHOT / ' + at;
  }

  function showWishes(ws) {
    if (!ws || !ws.length) return;
    wishesEl.innerHTML = '<p class="coord-label dim">RECENT WISHES</p>' +
      ws.slice(0, 5).map(function (w) {
        return '<p class="sky-w"><span class="coord-label dim">· ' +
          esc(w.nickname || '匿名') + '</span>' + esc(w.content || '') + '</p>';
      }).join('');
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  Promise.all([
    fetch('/data/cities.json').then(function (r) { return r.json(); }),
    fetch('/data/wishes-snapshot.json').then(function (r) { return r.json(); })
  ]).then(function (res) {
    cities = res[0];
    var snap = res[1];
    applyCounts(snap.cityCounts, false, snap.at);
    showWishes(snap.wishes);
    resize();
    render();
    tick();
    /* then try the real thing: same-origin first, else the live site */
    var api = location.hostname.indexOf('weizichen.cn') >= 0
      ? '/api/wishes' : 'https://hk.weizichen.cn/api/wishes';
    fetch(api).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.cityCounts) {
        counts = {}; topIds = {};
        applyCounts(d.cityCounts, true);
        if (d.wishes) showWishes(d.wishes);
        render();
      }
    }).catch(function () { /* snapshot already on screen */ });
  });

  window.addEventListener('resize', function () { resize(); render(); });
})();

/* 闪光坐标 · progressive path drawing + photo resolve
   No dependencies. Everything is a progressive enhancement:
   without JS the page renders fully, lines already drawn. */

document.documentElement.classList.add('js');

var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* prepare solid paths for draw-on-scroll */
var paths = [];
if (!reduced) {
  document.querySelectorAll('svg.path path:not(.p-faint)').forEach(function (p) {
    var len = p.getTotalLength();
    p.classList.add('drawable');
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = len;
    paths.push(p);
  });
}

var io = new IntersectionObserver(function (entries) {
  entries.forEach(function (e) {
    if (!e.isIntersecting) return;
    var el = e.target;
    el.classList.add('inview');
    el.querySelectorAll('svg.path path.drawable').forEach(function (p) {
      p.style.strokeDashoffset = 0;
    });
    io.unobserve(el);
  });
}, { threshold: 0.18 });

document.querySelectorAll('section, .photo, .pt').forEach(function (el) {
  io.observe(el);
});

/* desktop coordinate readout: tiny X/Y values trailing the crosshair
   over empty canvas; hidden over interactive or photographic elements */
if (window.matchMedia('(pointer: fine)').matches && window.innerWidth > 900 && !reduced) {
  var readout = document.createElement('span');
  readout.className = 'cursor-readout';
  readout.setAttribute('aria-hidden', 'true');
  document.body.appendChild(readout);
  var rx = 0, ry = 0, over = false, ticking = false;
  document.addEventListener('mousemove', function (e) {
    rx = e.clientX; ry = e.clientY;
    var t = e.target;
    over = !(t && t.closest && t.closest('a, img, figure, nav, header, footer, .pt, .hl-copy, .ed-margin'));
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        readout.style.transform = 'translate(' + (rx + 14) + 'px,' + (ry + 18) + 'px)';
        var px = String(Math.round(rx)).padStart(4, '0');
        var py = String(Math.round(ry + window.scrollY)).padStart(4, '0');
        readout.textContent = 'X:' + px + ' Y:' + py;
        readout.classList.toggle('on', over);
      });
    }
  });
  document.addEventListener('mouseleave', function () { readout.classList.remove('on'); });
}

/* today signal: a few coordinates from other years share today's date */
(function () {
  var slot = document.getElementById('today-signal');
  if (!slot) return;
  var n = new Date();
  var mmdd = String(n.getMonth() + 1).padStart(2, '0') + '.' +
             String(n.getDate()).padStart(2, '0');
  fetch('/data/archive.json').then(function (r) { return r.json(); }).then(function (data) {
    var hits = data.records.filter(function (r) {
      return r.date && r.date.slice(5) === mmdd;
    });
    var html;
    if (!hits.length) {
      html = '<p class="coord-label dim">TODAY / ' + mmdd + '</p>' +
        '<p class="coord-label dim">NO ARCHIVED COORDINATES TODAY</p>' +
        '<p class="ts-zh">今天没有留下坐标。</p>';
    } else {
      var en = hits.length === 1
        ? '1 COORDINATE IS SHINING TODAY'
        : hits.length + ' COORDINATES ARE SHINING TODAY';
      html = '<p class="coord-label accent">✦ TODAY / ' + mmdd + '</p>' +
        '<p class="coord-label">' + en + '</p>' +
        '<p class="ts-zh">那些散落在不同年份的今天，<br>又亮起来了。</p>' +
        '<a class="coord-label" href="/today.html">→ LOCATE</a>';
    }
    slot.innerHTML = html;
    slot.hidden = false;
  }).catch(function () { /* stay hidden */ });
})();

/* QA helpers: /?y=1200 jumps instantly; /?debug=1 writes layout report */
var q = new URLSearchParams(location.search);
if (q.has('y')) {
  /* translate instead of scroll: headless --screenshot only rasterizes the
     top viewport, so shift the page up to photograph lower regions */
  document.body.style.transform = 'translateY(-' + (parseInt(q.get('y'), 10) || 0) + 'px)';
}
if (q.has('debug')) {
  var report = [].map.call(document.querySelectorAll('main > section'), function (s) {
    var b = s.getBoundingClientRect();
    return [s.id || s.className, Math.round(b.top + window.scrollY), Math.round(b.height)].join(':');
  }).join(' | ');
  document.title = 'DBG ' + window.innerWidth + 'x' + window.innerHeight + ' h' +
    document.documentElement.scrollHeight + ' :: ' + report;
}

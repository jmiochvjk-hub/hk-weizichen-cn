/* ABOUT -> archive evidence: each .ev[data-q] fragment resolves to the
   first matching real record and links to its coordinate page. If nothing
   matches, the fragment simply stays unlinked - graceful absence. */
(function () {
  'use strict';
  var evs = document.querySelectorAll('.ev[data-q]');
  if (!evs.length) return;
  fetch('/data/archive.json').then(function (r) { return r.json(); }).then(function (data) {
    var recs = data.records;
    evs.forEach(function (el) {
      var kw = el.dataset.q;
      var hit = null;
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if ((r.title + ' ' + (r.text || '')).indexOf(kw) >= 0) { hit = r; break; }
      }
      if (hit) {
        el.innerHTML = '<a class="coord-label dim" href="/coord.html?id=' + hit.id +
          '">→ COORD. ' + hit.id + '</a>';
      }
    });
  });
})();

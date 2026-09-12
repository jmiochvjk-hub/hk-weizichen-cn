/* INDEX: dense searchable catalogue of every archive record. */
(function () {
  'use strict';

  var body = document.getElementById('idx-body');
  var q = document.getElementById('idx-q');
  var selYear = document.getElementById('idx-year');
  var selType = document.getElementById('idx-type');
  var selSeries = document.getElementById('idx-series');
  var countEl = document.getElementById('idx-count');
  var totalEl = document.getElementById('idx-total');
  var emptyEl = document.getElementById('idx-empty');
  var preview = document.getElementById('idx-preview');

  var SYM = { video: '▶', photo: '□', audio: '⌁' };
  var recs = [];

  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  window.SCData.loadCoordinates().then(function (data) {
    recs = data.records.slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id);
    });
    totalEl.textContent = String(data.total).padStart(4, '0');

    var years = {}, series = {};
    recs.forEach(function (r) {
      if (r.date) years[r.date.slice(0, 4)] = 1; else years['未标注'] = 1;
      if (r.series) series[r.series] = (series[r.series] || 0) + 1;
    });
    Object.keys(years).sort().forEach(function (y) {
      selYear.insertAdjacentHTML('beforeend', '<option value="' + y + '">' + y + '</option>');
    });
    Object.keys(series).sort(function (a, b) { return series[b] - series[a]; })
      .filter(function (s) { return series[s] >= 4; })
      .forEach(function (s) {
        selYear.length; /* noop for lint */
        selSeries.insertAdjacentHTML('beforeend',
          '<option value="' + esc(s) + '">' + esc(s) + ' (' + series[s] + ')</option>');
      });

    /* deep links: /archive.html?q=...&year=...&type=...&series=... */
    var qp = new URLSearchParams(location.search);
    if (qp.get('q')) q.value = qp.get('q');
    if (qp.get('year')) selYear.value = qp.get('year');
    if (qp.get('type')) selType.value = qp.get('type');
    if (qp.get('series')) selSeries.value = qp.get('series');

    render();
  });

  function match(r) {
    var kw = q.value.trim().toLowerCase();
    if (kw && (r.title + ' ' + (r.series || '') + ' ' + (r.source || '') + ' ' + r.id)
        .toLowerCase().indexOf(kw) === -1) return false;
    if (selYear.value) {
      if (selYear.value === '未标注') { if (r.date) return false; }
      else if (!r.date || r.date.slice(0, 4) !== selYear.value) return false;
    }
    if (selType.value && r.type !== selType.value) return false;
    if (selSeries.value && r.series !== selSeries.value) return false;
    return true;
  }

  function render() {
    var rows = [];
    var n = 0;
    recs.forEach(function (r) {
      if (!match(r)) return;
      n++;
      rows.push(
        '<tr data-id="' + r.id + '"' + (r.cover ? ' data-cover="' + esc(r.cover) + '"' : '') + '>' +
        '<td><a class="coord-label" href="/coord.html?id=' + r.id + '&from=index">' + r.id + '</a></td>' +
        '<td><span class="coord-label dim">' + (r.date || '—') + '</span></td>' +
        '<td><span class="coord-label dim">' + (SYM[r.type] || '·') + '</span></td>' +
        '<td class="t-title"><a href="/coord.html?id=' + r.id + '&from=index">' + esc(r.title) + '</a></td>' +
        '<td class="t-series"><span class="dim-text">' + esc(r.series || '') + '</span></td>' +
        '<td class="src">' + (r.url ? '<a class="coord-label dim" href="' + esc(r.url) +
          '" target="_blank" rel="noreferrer">↗</a>' : '') + '</td>' +
        '</tr>');
    });
    body.innerHTML = rows.join('');
    countEl.textContent = String(n).padStart(4, '0') + ' HIT' + (n === 1 ? '' : 'S');
    emptyEl.hidden = n > 0;
    /* active filters read as engaged, not decorative */
    [selYear, selType, selSeries].forEach(function (s) {
      s.classList.toggle('on', !!s.value);
    });
    q.classList.toggle('on', !!q.value.trim());
  }

  var t;
  q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(render, 120); });
  [selYear, selType, selSeries].forEach(function (s) { s.addEventListener('change', render); });

  /* hover preview thumbnail */
  body.addEventListener('mouseover', function (e) {
    var tr = e.target.closest('tr');
    if (!tr || !tr.dataset.cover) { preview.classList.remove('on'); return; }
    preview.src = tr.dataset.cover;
    if (tr.dataset.cover.indexOf('http') === 0) preview.referrerPolicy = 'no-referrer';
    preview.classList.add('on');
  });
  body.addEventListener('mouseleave', function () { preview.classList.remove('on'); });

  /* the whole row opens the coordinate (external ↗ excepted) */
  body.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    var tr = e.target.closest('tr');
    if (tr && tr.dataset.id) location.href = '/coord.html?id=' + tr.dataset.id + '&from=index';
  });
})();

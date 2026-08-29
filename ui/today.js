/* 那年今日 - TODAY'S COORDINATES.
   Different years of the same calendar date briefly align into one
   temporary route. Pure lens over data/archive.json: matches local MM.DD
   against each record's date (year ignored), no copied records, no
   substituted nearby dates. QA override: /today.html?d=08.29 */
(function () {
  'use strict';

  function localMMDD() {
    var q = new URLSearchParams(location.search).get('d');
    if (q && /^\d\d\.\d\d$/.test(q)) return q;
    var n = new Date();
    return String(n.getMonth() + 1).padStart(2, '0') + '.' +
           String(n.getDate()).padStart(2, '0');
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var SYM = { video: '▶', photo: '□', audio: '⌁' };
  var mmdd = localMMDD();
  document.getElementById('td-mmdd').textContent = mmdd;
  document.getElementById('td-date').textContent = mmdd.replace('.', ' / ');

  fetch('/data/archive.json').then(function (r) { return r.json(); }).then(function (data) {
    var recs = data.records;
    var hits = recs.filter(function (r) {
      return r.date && r.date.slice(5) === mmdd;
    });
    hits.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : 1); });

    var flow = document.getElementById('td-flow');
    var sub = document.getElementById('td-sub');
    var endEl = document.getElementById('td-end');
    var now = new Date();
    document.getElementById('td-now').textContent =
      '× NOW / ' + now.getFullYear() + '.' + mmdd;

    if (!hits.length) {
      document.getElementById('td-title').textContent = 'TODAY / ' + mmdd;
      sub.textContent = '今天没有留下坐标。';
      flow.innerHTML = '<p class="coord-label dim" style="padding:8vh 48px 0">' +
        'NO ARCHIVED COORDINATES TODAY</p>' +
        '<p class="dim-text" style="padding:1vh 48px 6vh">地图上还有 ' + data.total +
        ' 个别的日子。<a href="/map.html" style="text-decoration:underline">去 MAP 走走</a>。</p>';
      endEl.hidden = false;
      return;
    }

    document.getElementById('td-star').hidden = false;
    sub.textContent = hits.length === 1
      ? '那个散落在往年今天的坐标，又亮起来了。'
      : '那些散落在不同年份的今天，又亮起来了。';

    /* group by year, keep chronology */
    var byYear = {};
    hits.forEach(function (r) {
      var y = r.date.slice(0, 4);
      (byYear[y] = byYear[y] || []).push(r);
    });
    var years = Object.keys(byYear).sort();

    var LEFTS = ['6%', '36%', '16%', '50%', '26%'];
    var IMG_W = ['td-lg', 'td-md', 'td-sm'];
    var JOINTS = ['│', '│', '✦', '│'];
    var html = '';
    var li = 0, wi = 0, ji = 0;

    years.forEach(function (y, yi) {
      var left = LEFTS[li++ % LEFTS.length];
      if (yi > 0) {
        var j = JOINTS[ji++ % JOINTS.length];
        html += '<p class="td-joint' + (j === '✦' ? ' accent' : '') +
          '" style="margin-left:calc(' + left + ' + 3em)">' + j + '</p>';
      }
      html += '<section class="td-year" style="margin-left:' + left + '">';
      html += '<h2 class="td-y coord-label">' + y + '</h2>';
      byYear[y].forEach(function (r, ri) {
        var starred = /Yes Sir》8\.13|首次公开考核|星期五练习生01/.test(r.title + (r.series || ''));
        var size = r.cover ? IMG_W[wi++ % IMG_W.length] : 'td-xs';
        html += '<div class="td-m ' + size + (ri > 0 ? ' td-again' : '') + '">';
        html += '<p class="coord-label' + (starred ? ' accent' : ' dim') + '">' +
          (starred ? '✦ ' : SYM[r.type] ? SYM[r.type] + ' ' : '· ') + 'COORD. ' + r.id + '</p>';
        if (r.cover) {
          html += '<a href="/coord.html?id=' + r.id + '"><img src="' + esc(r.cover) +
            '" alt="" loading="lazy"' +
            (r.cover.indexOf('http') === 0 ? ' referrerpolicy="no-referrer"' : '') + '></a>';
        }
        html += '<a class="td-m-title" href="/coord.html?id=' + r.id + '">' +
          esc(r.title.replace(/【[^】]*】/, '')) + '</a>';
        if (r.text) html += '<p class="td-m-note">「' + esc(r.text) + '」</p>';
        if (r.source) html += '<p class="coord-label dim td-m-src">' + esc(r.source) + '</p>';
        html += '</div>';
      });
      html += '</section>';
    });
    flow.innerHTML = html;
    endEl.hidden = false;
  });
})();

/* MAP: constellations of memories.
   Far away, records group into ~22 labelled clusters drawn from the real
   archive structure (series / theme / year). Hover brings a constellation
   forward; clicking its label focuses it; clicking a point opens it.
   Filter / focus / scroll survive a trip into a coordinate and back. */
(function () {
  'use strict';

  var field = document.getElementById('map-field');
  var stream = document.getElementById('map-stream');
  var tip = document.getElementById('map-tip');
  var totalEl = document.getElementById('map-total');
  var filters = document.getElementById('map-filters');
  var STATE_KEY = 'sc-map-state';

  function hash01(s, salt) {
    var h = 2166136261 ^ salt;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }

  var TYPE_WORD = { video: '▶ VIDEO', photo: '□ PHOTO', audio: '⌁ VOICE' };

  function sym(r) {
    if (r.type === 'photo') return '□';
    if (r.type === 'audio') return '⌁';
    if (r.star) return '✦';
    if (r.notable) return '+';
    return '·';
  }

  /* brightness ladder, 0..4. When the archive later carries real like
     counts, records just need a numeric `likes` field and the ladder
     switches to it automatically; until then a stable hash scatters
     a few brighter stars so the sky already breathes. */
  function tierOf(r) {
    if (typeof r.likes === 'number') {
      return r.likes >= 50 ? 4 : r.likes >= 20 ? 3 : r.likes >= 5 ? 2 : r.likes > 0 ? 1 : 0;
    }
    if (r.star) return 4;
    var h = hash01(r.id, 31);
    if (h > 0.985) return 4;
    if (r.notable || h > 0.92) return 3;
    if (h > 0.7) return 2;
    if (h > 0.34) return 1;
    return 0;
  }

  function clusterKey(r) {
    var yr = r.date ? r.date.slice(0, 4) : '';
    if (r.type === 'audio') return '声音记录';
    if (r.type === 'photo') return '日常照片';
    if ((r.series || '').indexOf('青岛五公·8.13') >= 0 || (r.tags || []).indexOf('五公') >= 0)
      return 'YES! SIR';
    if (r.group === 'fansa' || r.series === '青岛五公饭撒汇总') return '饭撒';
    if (r.series === 'FUN肆·P2K') return '见面会';
    if (r.series === '随舞合集') return '随舞';
    if (r.group === 'fanmade') return '饭制成长向';
    if (r.group === 's' && r.cat === '考核') return '早期考核';
    if (r.group === 's' && r.cat === '舞台') return '舞台与歌曲';
    if ((r.series || '').indexOf('星期五练习生') >= 0) return '星期五练习生 ' + yr;
    if (r.group === 'cuts') return 'CUT ' + (yr || '——');
    return '日常 ' + (yr || '——');
  }

  function loadState() {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveState(patch) {
    try {
      var s = loadState();
      Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
      sessionStorage.setItem(STATE_KEY, JSON.stringify(s));
    } catch (e) { /* private mode: state just not preserved */ }
  }

  var _n = new Date();
  var TODAY_MMDD = String(_n.getMonth() + 1).padStart(2, '0') + '.' +
                   String(_n.getDate()).padStart(2, '0');

  fetch('/data/archive.json').then(function (res) { return res.json(); }).then(function (data) {
    var recs = data.records;
    totalEl.textContent = String(data.total).padStart(4, '0');

    recs.forEach(function (r) {
      r.today = !!(r.date && r.date.slice(5) === TODAY_MMDD);
      r.star = /Yes Sir》8\.13|首次公开考核|星期五练习生01/.test(r.title + (r.series || ''));
      r.notable = !r.star && (
        (r.tags || []).some(function (t) { return /首次|新粉推荐|出圈/.test(t); }) ||
        r.theme === 'milestones');
      r.ck = clusterKey(r);
    });

    var counts = { ALL: recs.length };
    recs.forEach(function (r) { counts[r.cls] = (counts[r.cls] || 0) + 1; });
    Array.prototype.forEach.call(filters.querySelectorAll('button'), function (b) {
      var f = b.dataset.f;
      b.innerHTML += ' <span class="count">' + String(counts[f] || 0).padStart(4, '0') + '</span>';
    });

    /* ---------- build clusters ---------- */
    var clusters = {};
    recs.forEach(function (r) {
      (clusters[r.ck] = clusters[r.ck] || []).push(r);
    });

    var keys = Object.keys(clusters);
    function meanT(rs) {
      var ts = rs.filter(function (r) { return r.date; })
        .map(function (r) { return new Date(r.date.replace(/\./g, '-')).getTime(); });
      if (!ts.length) return Infinity;
      ts.sort();
      return ts[Math.floor(ts.length / 2)];
    }
    keys.sort(function (a, b) { return meanT(clusters[a]) - meanT(clusters[b]); });

    var pos = keys.map(function (k, i) {
      var xf = 0.08 + (i / Math.max(1, keys.length - 1)) * 0.8;
      xf = Math.min(0.88, Math.max(0.06, xf + (hash01(k, 11) - 0.5) * 0.07));
      var yf = 0.16 + hash01(k, 12) * 0.56;
      return { k: k, x: xf, y: yf };
    });
    for (var pass = 0; pass < 24; pass++) {
      for (var i = 0; i < pos.length; i++) {
        for (var j = i + 1; j < pos.length; j++) {
          var dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y;
          if (Math.abs(dx) < 0.085 && Math.abs(dy) < 0.16) {
            var push = dy >= 0 ? 0.02 : -0.02;
            pos[j].y = Math.min(0.76, Math.max(0.14, pos[j].y + push));
            pos[i].y = Math.min(0.76, Math.max(0.14, pos[i].y - push));
          }
        }
      }
    }

    var frag = document.createDocumentFragment();
    pos.forEach(function (p) {
      var rs = clusters[p.k];
      var el = document.createElement('div');
      el.className = 'cl';
      el.dataset.ck = p.k;
      el.style.left = (p.x * 100).toFixed(2) + '%';
      el.style.top = (p.y * 100).toFixed(2) + '%';

      var R = Math.min(7, 2.2 + Math.sqrt(rs.length) * 0.55);
      var starred = rs.some(function (r) { return r.star; });

      rs.forEach(function (r) {
        var ang = hash01(r.id, 21) * Math.PI * 2;
        var rad = Math.sqrt(hash01(r.id, 22)) * R;
        var a = document.createElement('a');
        var tier = tierOf(r);
        a.className = 'pt-mark lum-' + tier + (r.star ? ' n3' : '') +
          (r.type === 'photo' ? ' n-ph' : '') + (r.today ? ' n-today' : '');
        if (tier >= 2) {
          a.style.animationDuration = (4.5 + hash01(r.id, 33) * 5).toFixed(2) + 's';
          a.style.animationDelay = (-hash01(r.id, 34) * 9).toFixed(2) + 's';
        }
        a.href = '/coord.html?id=' + r.id + '&from=map';
        a.textContent = sym(r);
        a.style.left = (Math.cos(ang) * rad).toFixed(2) + 'vw';
        a.style.top = (Math.sin(ang) * rad * 0.62).toFixed(2) + 'vh';
        a.setAttribute('aria-label', 'COORD. ' + r.id + ' ' + (r.date || '') + ' ' + r.title);
        a.dataset.id = r.id;
        el.appendChild(a);
      });

      /* the label is the handle for moving deeper */
      var lab = document.createElement('button');
      lab.type = 'button';
      lab.className = 'cl-label' + (starred ? ' accent' : '');
      var hasToday = rs.some(function (r) { return r.today; });
      lab.innerHTML = (starred ? '✦ ' : '') + p.k +
        '<span class="cl-n">' + rs.length + '</span>' +
        (hasToday ? '<span class="cl-td" title="含那年今日坐标">·</span>' : '');
      lab.style.left = '0';
      lab.style.top = (R * 0.72 + 3.4) + 'vh';
      lab.setAttribute('aria-label', '聚焦星群 ' + p.k + '，' + rs.length + ' 个坐标');
      el.appendChild(lab);

      var tally = {};
      rs.forEach(function (r) { tally[r.cls] = (tally[r.cls] || 0) + 1; });
      el.dataset.cls = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; })[0];
      frag.appendChild(el);
    });

    [['2022', 0.07], ['NOW', 0.93]].forEach(function (t) {
      var tick = document.createElement('span');
      tick.className = 'map-tick';
      tick.textContent = t[0];
      tick.style.left = (t[1] * 100) + '%';
      frag.appendChild(tick);
    });
    field.appendChild(frag);

    /* ---------- tooltip ---------- */
    var byId = {};
    recs.forEach(function (r) { byId[r.id] = r; });

    function showTip(a) {
      var r = byId[a.dataset.id];
      if (!r) return;
      var html = '';
      if (r.today) html += '<p class="coord-label accent" style="margin-bottom:4px">✦ TODAY / 那年今日</p>';
      html += '<span class="coord-label' + (r.star ? ' accent' : '') + '">' +
        sym(r) + ' COORD. ' + r.id + '</span>' +
        '<span class="coord-label dim" style="margin-left:12px">' + (r.date || 'DATE UNKNOWN') + '</span>' +
        '<p class="t-title">' + r.title + '</p>' +
        '<span class="coord-label dim">' + (TYPE_WORD[r.type] || '·') +
        (r.cat ? ' · ' + r.cat : '') + '</span>';
      if (r.source) html += '<br><span class="coord-label dim">' + r.source + '</span>';
      if (r.cover) {
        html += '<img src="' + r.cover + '" alt="" loading="lazy"' +
          (r.cover.indexOf('http') === 0 ? ' referrerpolicy="no-referrer"' : '') + '>';
      }
      html += '<p class="coord-label" style="margin-top:8px">→ LOCATE</p>';
      tip.innerHTML = html;
      tip.classList.add('on');
      var rect = a.getBoundingClientRect();
      var tx = Math.min(rect.left + 16, window.innerWidth - 320);
      var ty = rect.top + 16;
      if (ty > window.innerHeight - 280) ty = rect.top - 230;
      tip.style.left = tx + 'px';
      tip.style.top = ty + 'px';
    }
    field.addEventListener('mouseover', function (e) {
      var a = e.target.closest('a.pt-mark');
      if (a) showTip(a); else tip.classList.remove('on');
    });
    field.addEventListener('mouseleave', function () { tip.classList.remove('on'); });
    field.addEventListener('focusin', function (e) {
      var a = e.target.closest('a.pt-mark');
      if (a) showTip(a);
    });
    field.addEventListener('focusout', function () { tip.classList.remove('on'); });

    /* ---------- cluster focus: move deeper ---------- */
    function focusCluster(ck) {
      Array.prototype.forEach.call(field.querySelectorAll('.cl'), function (el) {
        el.classList.toggle('focused', !!ck && el.dataset.ck === ck);
      });
      field.classList.toggle('has-focus', !!ck);
      saveState({ focus: ck || null });
    }
    field.addEventListener('click', function (e) {
      var lab = e.target.closest('.cl-label');
      if (lab) {
        var cl = lab.closest('.cl');
        focusCluster(cl.classList.contains('focused') ? null : cl.dataset.ck);
        return;
      }
      var a = e.target.closest('a.pt-mark');
      if (a) saveState({ y: window.scrollY });
      else if (!e.target.closest('.cl')) focusCluster(null);
    });

    /* ---------- filters ---------- */
    function applyFilter(f) {
      Array.prototype.forEach.call(filters.querySelectorAll('button'), function (x) {
        x.setAttribute('aria-pressed', x.dataset.f === f ? 'true' : 'false');
      });
      if (f === 'ALL') {
        field.classList.remove('f-on');
        stream.dataset.f = '';
      } else {
        field.classList.add('f-on');
        Array.prototype.forEach.call(field.querySelectorAll('.cl'), function (el) {
          el.classList.toggle('f-hit', el.dataset.cls === f);
        });
        stream.dataset.f = f;
      }
      saveState({ f: f });
      if (stream.offsetParent) buildStream();
    }
    filters.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) applyFilter(b.dataset.f);
    });

    /* ---------- mobile: constellations as a vertical log ---------- */
    var streamBuilt = false;
    function buildStream() {
      var f = stream.dataset.f;
      var html = '';
      pos.forEach(function (p) {
        var rs = clusters[p.k].filter(function (r) { return !f || r.cls === f; });
        if (!rs.length) return;
        var starred = rs.some(function (r) { return r.star; });
        html += '<details class="m-cl"><summary><span class="coord-label' +
          (starred ? ' accent' : '') + '">' + (starred ? '✦ ' : '· ') + p.k +
          '</span><span class="coord-label dim">' + String(rs.length).padStart(3, '0') +
          '</span></summary>';
        rs.forEach(function (r) {
          html += '<a href="/coord.html?id=' + r.id + '&from=map"><span class="coord-label' +
            (r.star ? ' accent' : ' dim') + '">' + r.id + ' ' + sym(r) + '</span><span>' +
            r.title + '</span><span class="coord-label dim m-date">' + (r.date || '') +
            '</span></a>';
        });
        html += '</details>';
      });
      stream.innerHTML = html;
      streamBuilt = true;
    }
    if (stream.offsetParent) buildStream();
    window.addEventListener('resize', function () {
      if (stream.offsetParent && !streamBuilt) buildStream();
    });

    /* ---------- restore state when coming back ---------- */
    var st = loadState();
    if (st.f && st.f !== 'ALL') applyFilter(st.f);
    if (st.focus && clusters[st.focus]) focusCluster(st.focus);
    if (st.y) window.scrollTo(0, st.y);
  });
})();

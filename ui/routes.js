/* ROUTES field + route detail as a curated media journey.
   Route membership is defined as queries over data/archive.json.
   Detail pages feature 5-8 representative coordinates in a deliberate
   rhythm: large -> whitespace -> tiny + note -> medium -> small -> one
   major moment -> quiet ending. Annotations are curator's voice; facts
   and media all come from the archive itself. */
(function () {
  'use strict';

  var ROUTES = {
    '01': { title: '饭制成长向视频', desc: '别人剪好的他，最快的一条近路。三十多条饭制成长向，看完大概就知道他为什么被喜欢。',
            q: function (r) { return r.group === 'fanmade'; },
            ann: [[/努力被更多人/, '不认识他的话，从这条开始看。'],
                  [/无人知晓/, '标题就说完了这四年。']] },
    '02': { title: '第肆象限 · 青岛五公舞台', desc: '2026.08.13，青岛。《Yes Sir》和整场直拍，他最出圈的那个夏夜。',
            q: function (r) { return (r.series || '').indexOf('青岛五公·8.13') >= 0 || (r.tags || []).indexOf('五公') >= 0 || (r.group === 'photos' && r.date === '2026.08.13'); },
            star: /Yes Sir》8\.13/,
            eventDate: '2026.08.13',
            ann: [[/Yes Sir》8\.13/, '8.13 晚上的《Yes Sir》直拍。只看一条的话，看这条。'],
                  [/亲爱的你啊/, '同一个夏天的另一首，温柔很多。']] },
    '03': { title: '互动请求（饭撒）合集', desc: '镜头前的互动请求，每一份心意被认真接住的证据。',
            q: function (r) { return r.group === 'fansa' || r.series === '青岛五公饭撒汇总'; },
            ann: [[/五分钟/, '和瓜瓜互动长达五分钟的那位，是所有人羡慕的对象。'],
                  [/比哭哭/, '「看不到～」然后比了个哭哭。']] },
    '04': { title: '舞台与歌曲', desc: '他唱过的歌、跳过的舞台，一首首认过去。',
            q: function (r) { return r.group === 's' && r.cat === '舞台'; },
            ann: [[/唯一/, '官方推荐给新粉的第一首 cover。']] },
    '05': { title: '考核与成长', desc: '从首次公开考核开始，一场场看过去，就是一部成长记录。',
            q: function (r) { return (r.group === 's' && r.cat === '考核') || (r.group === 'cuts' && r.cat === '考核记录'); },
            star: /首次公开考核/,
            ann: [[/首次公开考核/, '一切开始的地方。'],
                  [/是你/, '那时还青涩，回头看更明显。']] },
    '06': { title: 'FUN肆·P2K 二班见面会', desc: '一整场见面会掰开看，从头看到安可。',
            q: function (r) { return r.series === 'FUN肆·P2K'; },
            ann: [[/Yes sir》版本一/, '后来青岛五公那首的最早现场。']] },
    '07': { title: '随舞合集', desc: '两分钟一条，全是轻松的。跟着跳就行。',
            q: function (r) { return r.series === '随舞合集'; },
            ann: [[/青春修炼手册/, '前辈的歌，跳起来还是他自己的样子。']] },
    '08': { title: '日常物料汇总', desc: '官方镜头里的四年，从 2022 年夏天一直记到现在。',
            q: function (r) { return r.group === 'daily'; },
            ann: [[/月末考核2022|7月月末考核/, '归档里最早的一条影像。'],
                  [/突围/, '最近的大事：《突围II破局》。']] },
    '09': { title: '瓜国大厨房 · 魏子宸 Cut', desc: '不够看的时候，145 条个人 cut 管饱。',
            q: function (r) { return r.group === 'cuts'; },
            ann: [[/月末考核/, '2022 年 8 月，一切的起点。']] }
  };

  var IDX_LINK = {
    '01': '/archive.html?series=' + encodeURIComponent('饭制成长向'),
    '02': '/archive.html?q=' + encodeURIComponent('五公'),
    '03': '/archive.html?q=' + encodeURIComponent('饭撒'),
    '04': '/archive.html?q=' + encodeURIComponent('舞台'),
    '05': '/archive.html?q=' + encodeURIComponent('考核'),
    '06': '/archive.html?series=' + encodeURIComponent('FUN肆·P2K'),
    '07': '/archive.html?series=' + encodeURIComponent('随舞合集'),
    '08': '/archive.html?q=' + encodeURIComponent('TF家族'),
    '09': '/archive.html?series=' + encodeURIComponent('瓜国大厨房 Cut')
  };
  window.SC_ROUTES = ROUTES;   /* coord.html reuses the same route queries */

  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  fetch('/data/archive.json').then(function (r) { return r.json(); }).then(function (data) {
    var recs = data.records;
    var listPage = document.getElementById('routes-list');
    if (listPage) initList(recs, listPage);
    if (document.getElementById('rd-stops')) initDetail(recs);
  });

  function initList(recs, listPage) {
    Array.prototype.forEach.call(listPage.querySelectorAll('[data-route]'), function (row) {
      var def = ROUTES[row.dataset.route];
      if (!def) return;
      var ms = recs.filter(def.q);
      row.querySelector('.r-count').textContent = String(ms.length).padStart(3, '0') + ' PTS';
      var names = ms.slice(0, 3).map(function (r) { return r.title.replace(/【[^】]*】/, ''); });
      var noteEl = row.querySelector('.r-note');
      if (noteEl && def.desc) noteEl.textContent = def.desc;
      row.querySelector('.r-stops').textContent =
        ms.length ? '经过 · ' + names.join('　·　') + (ms.length > 3 ? '　⋯' : '') : '';
    });
  }

  /* ---------- selection: 5-8 representative coordinates ---------- */

  function pickFeatured(ms, def) {
    var MAX = 7;
    if (ms.length <= MAX) return ms.slice();
    var chosen = {};
    ms.forEach(function (r) {
      if (def.star && def.star.test(r.title)) chosen[r.id] = true;
    });
    /* annotated moments earn their place too */
    (def.ann || []).forEach(function (a) {
      for (var i = 0; i < ms.length; i++) {
        if (a[0].test(ms[i].title)) { chosen[ms[i].id] = true; break; }
      }
    });
    chosen[ms[0].id] = true;
    chosen[ms[ms.length - 1].id] = true;
    var need = MAX - Object.keys(chosen).length;
    for (var i = 0; i < need; i++) {
      var at = Math.round((i + 0.5) * ms.length / Math.max(1, need));
      var best = null;
      for (var d = 0; d < 14 && at + d < ms.length; d++) {
        var cand = ms[Math.min(ms.length - 1, at + d)];
        if (chosen[cand.id]) continue;
        if (cand.cover) { best = cand; break; }
        if (!best) best = cand;
      }
      if (best) chosen[best.id] = true;
    }
    return ms.filter(function (r) { return chosen[r.id]; });
  }

  /* ---------- rhythm ---------- */
  /* image slots cycle for covered records; bare coordinates stay tiny */
  var IMG_SLOTS = [
    { cls: 'rd-lg',    left: '4%'  },
    { cls: 'rd-tiny',  left: '58%' },
    { cls: 'rd-md',    left: '22%' },
    { cls: 'rd-sm',    left: '52%' },
    { cls: 'rd-quiet', left: '30%' }
  ];
  var BIG_SLOT = { cls: 'rd-big', left: '10%' };
  var XS_LEFTS = ['8%', '46%', '24%'];
  /* broken travel fragments between some moments */
  var FRAGS = [
    '<svg class="rd-frag" width="80" height="52" aria-hidden="true"><path d="M10 4 L70 48"/></svg>',
    '',
    '<svg class="rd-frag" width="60" height="60" aria-hidden="true"><path d="M50 6 L14 30 L20 54"/></svg>',
    '<p class="rd-joint">⋯</p>',
    '',
    '<svg class="rd-frag" width="70" height="46" aria-hidden="true"><path d="M60 6 L12 42"/></svg>'
  ];

  function initDetail(recs) {
    var id = new URLSearchParams(location.search).get('id') || '01';
    var def = ROUTES[id];
    var stopsEl = document.getElementById('rd-stops');
    if (!def) {
      stopsEl.innerHTML = '<p class="dim-text">这条路线还没有画出来。<a href="/routes.html" style="text-decoration:underline">回 ROUTES</a></p>';
      return;
    }
    document.title = 'ROUTE ' + id + ' · ' + def.title + ' · 闪光坐标';
    document.getElementById('rd-id').textContent = 'ROUTE / ' + id;
    document.getElementById('rd-title').textContent = def.title;
    document.getElementById('rd-desc').textContent = def.desc;

    var ms = recs.filter(def.q);
    ms.sort(function (a, b) { return (a.date || '9999') < (b.date || '9999') ? -1 : 1; });
    var feats = pickFeatured(ms, def);

    /* the MAJOR slot goes to the ✦ record when the route has one,
       otherwise to the best-covered moment near the middle */
    var majorIdx = -1;
    feats.forEach(function (r, i) {
      if (def.star && def.star.test(r.title)) majorIdx = i;
    });
    if (majorIdx === -1) {
      var mid = Math.floor(feats.length / 2);
      for (var d = 0; d < feats.length; d++) {
        var i2 = (mid + d) % feats.length;
        if (feats[i2].cover) { majorIdx = i2; break; }
      }
      if (majorIdx === -1) majorIdx = mid;
    }

    var featIds = {};
    feats.forEach(function (r) { featIds[r.id] = true; });
    var byDatePhoto = {};
    ms.forEach(function (r) {
      if (r.type === 'photo' && r.date && r.cover) {
        (byDatePhoto[r.date] = byDatePhoto[r.date] || []).push(r);
      }
    });
    /* prefer a photo that is not already featured on this page */
    Object.keys(byDatePhoto).forEach(function (d) {
      var arr = byDatePhoto[d];
      byDatePhoto[d] = arr.filter(function (r) { return !featIds[r.id]; })[0] || arr[0];
    });

    var usedAnn = {};
    function annFor(r) {
      var list = def.ann || [];
      for (var i = 0; i < list.length; i++) {
        if (!usedAnn[i] && list[i][0].test(r.title)) { usedAnn[i] = true; return list[i][1]; }
      }
      return null;
    }

    var html = '<p class="coord-label" style="margin-bottom:6vh">× START</p>';
    var imgCursor = 0, xsCursor = 0;
    feats.forEach(function (r, i) {
      var starred = def.star && def.star.test(r.title);
      /* the major moment may borrow a same-night photo when its own
         record has no poster (credited below) */
      var borrowed = null;
      var img = r.cover;
      var evDate = r.date || def.eventDate;
      if (i === majorIdx && !img && evDate && byDatePhoto[evDate]) {
        borrowed = byDatePhoto[evDate];
        img = borrowed.cover;
      }
      var slot;
      if (i === majorIdx) {
        slot = BIG_SLOT;
      } else if (!img) {
        slot = { cls: 'rd-xs', left: XS_LEFTS[xsCursor++ % XS_LEFTS.length] };
      } else {
        slot = IMG_SLOTS[imgCursor++ % IMG_SLOTS.length];
      }
      var note = annFor(r);
      if (i > 0) {
        var frag = FRAGS[i % FRAGS.length];
        if (frag) html += '<div class="rd-travel" style="margin-left:' + slot.left + '">' + frag + '</div>';
      }
      html += '<div class="rd-m ' + slot.cls + '" style="margin-left:' + slot.left + '">';
      html += '<p class="coord-label' + (starred ? ' accent' : ' dim') + '">' +
        (starred ? '✦ ' : '') + 'COORD. ' + r.id +
        (r.date ? '<span style="margin-left:14px">' + r.date + '</span>' : '') + '</p>';
      if (img && slot.cls !== 'rd-xs') {
        html += '<a href="/coord.html?id=' + r.id + '&from=route' + id + '"><img src="' + esc(img) +
          '" alt="" loading="lazy"' +
          (img.indexOf('http') === 0 ? ' referrerpolicy="no-referrer"' : '') + '></a>';
      }
      html += '<a class="rd-m-title" href="/coord.html?id=' + r.id + '&from=route' + id + '">' +
        esc(r.title.replace(/【[^】]*】/, '')) + '</a>';
      if (note) html += '<p class="rd-m-note">' + esc(note) + '</p>';
      if (r.text) html += '<p class="rd-m-note">「' + esc(r.text) + '」</p>';
      if (borrowed) {
        html += '<p class="coord-label dim rd-m-src">图 · ' + esc(borrowed.source || '') + ' / 同晚返图</p>';
      }
      if (r.source && slot.cls !== 'rd-xs') {
        html += '<p class="coord-label dim rd-m-src">' + esc(r.source) + '</p>';
      }
      html += '</div>';
    });
    if (ms.length > feats.length) {
      html += '<p class="rd-more dim-text" style="margin-left:28%">这条线一共 ' + ms.length +
        ' 个点，这里只挑了一部分。全部收在 <a style="text-decoration:underline" href="/archive.html">INDEX</a> 里。</p>';
    }
    stopsEl.innerHTML = html;
    document.getElementById('rd-endmark').textContent =
      '× END / ' + String(ms.length).padStart(3, '0') + ' PTS';
    var idxA = document.getElementById('rd-idx-link');
    if (idxA && IDX_LINK[id]) idxA.href = IDX_LINK[id];
  }
})();

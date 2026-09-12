/* Coordinate detail: opening an archival object.
   Metadata sits in a quiet left rail; media is the focus. Bilibili videos
   open poster-first (click to load the player) so no dead black frame. */
(function () {
  'use strict';

  var SYM = { video: '▶', photo: '□', audio: '⌁' };

  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  window.SCData.loadCoordinates().then(function (data) {
    var recs = data.records;
    var params = new URLSearchParams(location.search);
    var id = params.get('id');
    var from = params.get('from') || '';
    var fromQS = from ? '&from=' + from : '';

    /* the page knows where the visitor came from */
    var back = document.getElementById('cd-back');
    if (back) {
      var rm = from.match(/^route(\d\d)$/);
      if (from === 'stars') {
        back.innerHTML = '<a class="coord-label" href="/stars.html">← RETURN TO STAR MAP</a>' +
          '<a class="coord-label dim" href="/archive.html">← INDEX</a>';
      } else if (from === 'map') {
        back.innerHTML = '<a class="coord-label" href="/map.html">← RETURN TO MAP</a>' +
          '<a class="coord-label dim" href="/archive.html">← INDEX</a>';
      } else if (from === 'index') {
        back.innerHTML = '<a class="coord-label" href="/archive.html">← RETURN TO INDEX</a>' +
          '<a class="coord-label dim" href="/stars.html">← STAR MAP</a>';
      } else if (rm) {
        back.innerHTML = '<a class="coord-label" href="/route.html?id=' + rm[1] +
          '">← RETURN TO ROUTE ' + rm[1] + '</a>' +
          '<a class="coord-label dim" href="/stars.html">← STAR MAP</a>';
      }
    }
    var main = document.getElementById('cd-main');
    var idx = -1;
    for (var i = 0; i < recs.length; i++) if (recs[i].id === id) { idx = i; break; }
    if (idx === -1) {
      main.innerHTML = '<p class="coord-label dim">? COORDINATE NOT FOUND</p>' +
        '<p class="dim-text" style="margin-top:2vh">这个坐标还没有被记录。回 ' +
        '<a href="/stars.html" style="text-decoration:underline">STAR MAP</a> 看看别的。</p>';
      return;
    }
    var r = recs[idx];
    document.title = 'COORD. ' + r.id + ' · ' + r.title.slice(0, 24) + ' · 闪光坐标';

    var star = /Yes Sir》8\.13|首次公开考核|星期五练习生01/.test(r.title + (r.series || ''));
    var bv = r.url && r.url.match(/bilibili\.com\/video\/(BV\w+)/);

    /* ---------- left rail ---------- */
    var rail =
      '<p class="coord-label' + (star ? ' accent' : '') + '">' +
      (star ? '✦ ' : '') + 'COORD. ' + r.id + '</p>' +
      '<p class="coord-label dim">' + (r.date || 'DATE UNKNOWN') + '</p>' +
      '<p class="coord-label dim">' + (SYM[r.type] || '·') + ' ' + esc(r.cat || '') + '</p>';
    if (r.series) rail += '<p class="coord-label dim cd-rail-gap">' + esc(r.series) + '</p>';
    if (r.source) rail += '<p class="coord-label dim">' + esc(r.source) + '</p>';
    if (r.url) rail += '<p class="cd-rail-gap"><a class="coord-label" href="' + esc(r.url) +
      '" target="_blank" rel="noreferrer">SOURCE ↗</a></p>';
    var _n = new Date();
    var _mmdd = String(_n.getMonth() + 1).padStart(2, '0') + '.' +
                String(_n.getDate()).padStart(2, '0');
    if (r.date && r.date.slice(5) === _mmdd) {
      rail += '<p class="cd-rail-gap"><a class="coord-label accent" href="/today.html">✦ 那年今日</a></p>';
    }
    rail += '<div class="cd-light cd-rail-gap">' +
      '<button type="button" class="coord-light' + (r.viewerLiked ? ' is-lit' : '') +
      '" aria-pressed="' + (r.viewerLiked ? 'true' : 'false') + '" data-id="' + r.id + '">' +
      '<span class="light-symbol">' + (r.viewerLiked ? '✦' : '◇') + '</span> ' +
      '<span class="light-count">' + r.likes + '</span></button>' +
      '<p class="coord-label dim">LEAVE A LIGHT</p>' +
      '<p class="dim-text">给这颗坐标留一点光</p></div>';

    /* ---------- media ---------- */
    var media = '';
    var refpol = function (u) { return u && u.indexOf('http') === 0 ? ' referrerpolicy="no-referrer"' : ''; };
    if (r.type === 'photo' && r.local) {
      media = '<figure class="photo inview"><img src="' + esc(r.local) + '" alt="' + esc(r.title) + '"></figure>';
    } else if (r.type === 'audio' && r.local) {
      media = '<div class="cd-audio"><span class="coord-label dim">⌁ AUDIO</span>' +
        '<audio controls preload="none" src="' + esc(r.local) + '"></audio></div>';
    } else if (bv && r.cover) {
      media = '<button class="cd-poster" type="button" aria-label="播放视频">' +
        '<img src="' + esc(r.cover) + '" alt=""' + refpol(r.cover) + '>' +
        '<span class="coord-label">▶ PLAY</span></button>';
    } else if (bv) {
      media = '<iframe src="https://player.bilibili.com/player.html?bvid=' + bv[1] +
        '&autoplay=0&danmaku=0" allowfullscreen loading="lazy" ' +
        'referrerpolicy="no-referrer" title="' + esc(r.title) + '"></iframe>';
    } else if (r.cover) {
      media = '<a class="cd-cover" href="' + esc(r.url) + '" target="_blank" rel="noreferrer">' +
        '<img src="' + esc(r.cover) + '" alt="' + esc(r.title) + '"' + refpol(r.cover) + '>' +
        '<span class="coord-label">OPEN AT SOURCE ↗</span></a>';
    } else if (r.url) {
      /* no poster available: restrained placeholder, never a dead rectangle */
      media = '<a class="cd-blank" href="' + esc(r.url) + '" target="_blank" rel="noreferrer">' +
        '<span class="coord-label dim">' + (SYM[r.type] || '·') + ' 视频托管在原平台</span>' +
        '<span class="coord-label">OPEN AT SOURCE ↗</span></a>';
    }

    var body = '<h1>' + esc(r.title) + '</h1>' +
      '<div class="cd-media">' + media + '</div>';
    if (r.text) body += '<p class="cd-text">「' + esc(r.text) + '」</p>';

    /* which curated routes pass through this coordinate */
    if (window.SC_ROUTES) {
      var through = Object.keys(window.SC_ROUTES).filter(function (k) {
        try { return window.SC_ROUTES[k].q(r); } catch (e) { return false; }
      });
      if (through.length) {
        rail += '<p class="coord-label dim cd-rail-gap">ROUTES</p>';
        through.slice(0, 3).forEach(function (k) {
          rail += '<p><a class="coord-label dim" href="/route.html?id=' + k + '">→ ROUTE ' +
            k + '</a></p>';
        });
      }
    }

    main.innerHTML = '<div class="cd-grid"><aside class="cd-rail">' + rail +
      '</aside><div class="cd-body">' + body + '</div></div>';

    var light = main.querySelector('.coord-light[data-id]');
    if (light) light.addEventListener('click', function () {
      if (light.disabled) return;
      var was = light.classList.contains('is-lit');
      light.disabled = true;
      window.SCLights.mutate(r.id, was).then(function (result) {
        light.classList.toggle('is-lit', result.liked);
        light.setAttribute('aria-pressed', result.liked ? 'true' : 'false');
        light.querySelector('.light-symbol').textContent = result.liked ? '✦' : '◇';
        light.querySelector('.light-count').textContent = result.likes;
        if (result.liked) {
          light.classList.remove('pulse'); void light.offsetWidth; light.classList.add('pulse');
        }
      }).catch(function () {
        light.title = '暂时无法连接星图';
      }).finally(function () { light.disabled = false; });
    });

    /* poster -> player swap */
    var poster = main.querySelector('.cd-poster');
    if (poster && bv) {
      poster.addEventListener('click', function () {
        var f = document.createElement('iframe');
        f.src = 'https://player.bilibili.com/player.html?bvid=' + bv[1] + '&autoplay=1&danmaku=0';
        f.allowFullscreen = true;
        f.referrerPolicy = 'no-referrer';
        f.title = r.title;
        poster.replaceWith(f);
      });
    }

    /* ---------- neighbours ---------- */
    var prev = recs[idx - 1], next = recs[idx + 1];
    var nav = document.getElementById('cd-prevnext');
    if (nav) {
      nav.innerHTML =
        (prev ? '<a href="/coord.html?id=' + prev.id + fromQS + '"><span class="coord-label dim">← ' +
          prev.id + '</span> ' + esc(prev.title.slice(0, 22)) + '</a>' : '<span></span>') +
        (next ? '<a class="cd-next" href="/coord.html?id=' + next.id + fromQS + '">' +
          esc(next.title.slice(0, 22)) + ' <span class="coord-label dim">' + next.id +
          ' →</span></a>' : '<span></span>');
    }

    var same = recs.filter(function (x) {
      return x.series === r.series && x.id !== r.id &&
        (!prev || x.id !== prev.id) && (!next || x.id !== next.id);
    }).slice(0, 3);
    var list = document.getElementById('cd-related-list');
    list.innerHTML = same.map(function (x) {
      return '<li><a href="/coord.html?id=' + x.id + '">' +
        '<span class="coord-label dim">' + (SYM[x.type] || '·') + ' ' + x.id + '</span>' +
        esc(x.title.slice(0, 44)) + '</a></li>';
    }).join('');
    document.getElementById('cd-related').hidden = same.length === 0;
  });
})();

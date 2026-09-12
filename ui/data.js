/* Shared coordinate data layer: archive + one aggregated light request. */
(function () {
  'use strict';
  var cache;
  var apiBase = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'https://hk.weizichen.cn' : '';

  function visitorId() {
    var key = 'sc-visitor-id';
    var id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  }

  function getBrightnessLevel(likes, distribution) {
    if (!likes) return 0;
    var p = distribution || {};
    if (likes >= (p.p99 || Infinity)) return 4;
    if (likes >= (p.p90 || Infinity)) return 3;
    if (likes >= (p.p60 || Infinity)) return 2;
    return 1;
  }

  function loadCoordinates(force) {
    if (cache && !force) return cache;
    cache = Promise.all([
      fetch('/data/archive.json').then(function (r) { return r.json(); }),
      fetch(apiBase + '/api/coordinates/likes?visitor_id=' + encodeURIComponent(visitorId()), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .catch(function () { return { counts: {}, viewerLikes: [], distribution: {} }; })
    ]).then(function (parts) {
      var archive = parts[0], light = parts[1];
      var counts = light.counts || {}, mine = new Set(light.viewerLikes || []);
      var records = archive.records.map(function (r) {
        var likes = Number(counts[r.id] || 0);
        return Object.assign({}, r, {
          likes: likes,
          viewerLiked: mine.has(r.id),
          brightnessLevel: getBrightnessLevel(likes, light.distribution)
        });
      });
      return { total: archive.total, records: records, distribution: light.distribution || {} };
    });
    return cache;
  }

  window.SCData = { loadCoordinates: loadCoordinates, visitorId: visitorId, apiBase: apiBase,
    getBrightnessLevel: getBrightnessLevel };
})();

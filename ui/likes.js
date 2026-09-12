/* Coordinate Light UI and mutations. Public totals always come from the API. */
(function () {
  'use strict';
  function mutate(id, liked) {
    return fetch((window.SCData.apiBase || '') + '/api/coordinates/' + encodeURIComponent(id) + '/light', {
      method: liked ? 'DELETE' : 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visitor_id: window.SCData.visitorId() })
    }).then(function (r) {
      if (!r.ok) throw new Error('light_failed');
      return r.json();
    });
  }
  window.SCLights = { mutate: mutate };
})();

/* shared: photos resolve from soft to crisp when entering the viewport */
(function () {
  'use strict';
  var photos = document.querySelectorAll('.photo');
  if (!('IntersectionObserver' in window)) {
    photos.forEach(function (p) { p.classList.add('inview'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('inview'); io.unobserve(e.target); }
    });
  }, { threshold: 0.25 });
  photos.forEach(function (p) { io.observe(p); });
})();

/* QA helper shared with the homepage: /?y=N shifts the page up so
   headless screenshots can photograph lower regions at real viewport vh */
(function () {
  var q = new URLSearchParams(location.search);
  if (q.has('y')) {
    document.body.style.transform = 'translateY(-' + (parseInt(q.get('y'), 10) || 0) + 'px)';
  }
})();

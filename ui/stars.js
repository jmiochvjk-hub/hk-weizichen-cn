/* 3D 闪光星图 - hand-rolled WebGL point-sprite starfield, no libraries.
   Every star is one archive coordinate; brightness ladder is likes-ready
   (falls back to a stable hash). Core + halo + cross rays, breathing and
   asynchronous twinkle all run in the fragment/vertex shaders at 60fps.
   Drag to orbit, wheel/pinch to zoom, click a star to open its page. */
(function () {
  'use strict';

  var canvas = document.getElementById('st-canvas');
  var stage = document.getElementById('st-stage');
  var tip = document.getElementById('st-tip');
  var gl = canvas.getContext('webgl', { antialias: true, alpha: true });
  if (!gl) {
    stage.innerHTML = '<p class="dim-text" style="padding:6vh 48px">这台设备不支持 WebGL。' +
      '完整档案在 <a href="/map.html" style="text-decoration:underline">2D MAP</a>。</p>';
    return;
  }

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- shaders ---------- */
  var VS = [
    'attribute vec3 aPos;',
    'attribute float aTier;',
    'attribute vec3 aColor;',
    'attribute float aPhase;',
    'attribute float aSpeed;',
    'uniform mat4 uMV;',
    'uniform mat4 uP;',
    'uniform float uT;',
    'uniform float uDpr;',
    'uniform float uFade;',
    'varying float vTier;',
    'varying vec3 vColor;',
    'varying float vGlow;',
    'void main() {',
    '  vec4 mv = uMV * vec4(aPos, 1.0);',
    '  gl_Position = uP * mv;',
    '  float dist = max(60.0, -mv.z);',
    '  float amp = 0.06 + aTier * 0.08;',                    /* breathing depth per tier */
    '  float breath = 1.0 + amp * sin(uT * aSpeed + aPhase);',
    '  float spark = pow(max(0.0, sin(uT * aSpeed * 1.73 + aPhase * 3.7)), 32.0);',
    '  vGlow = (breath + spark * (0.15 + aTier * 0.22)) * uFade;',
    '  float px = 3.0 + aTier * aTier * 2.1 + aTier * 2.6;', /* size ladder */
    '  gl_PointSize = clamp(px * uDpr * 430.0 / dist * (0.92 + 0.08 * breath), 1.6, 96.0);',
    '  float depthFade = clamp(1500.0 / dist * 0.55, 0.35, 1.0);',
    '  vGlow *= depthFade;',
    '  vTier = aTier;',
    '  vColor = aColor;',
    '}'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'varying float vTier;',
    'varying vec3 vColor;',
    'varying float vGlow;',
    'void main() {',
    '  vec2 p = gl_PointCoord * 2.0 - 1.0;',
    '  float r = length(p);',
    '  float core = smoothstep(0.18, 0.02, r);',
    '  float halo = exp(-r * r * 5.5) * 0.5;',
    '  float rays = 0.0;',
    '  if (vTier > 1.5) {',
    '    float thin = 26.0 - vTier * 3.0;',                  /* thin, longer with tier */
    '    float lenA = clamp(1.0 - r / (0.35 + vTier * 0.16), 0.0, 1.0);',
    '    float rx = max(0.0, 1.0 - abs(p.y) * thin) * lenA;',
    '    float ry = max(0.0, 1.0 - abs(p.x) * thin) * lenA;',
    '    rays = (rx + ry) * (0.12 + vTier * 0.1);',
    '  }',
    '  float a = (core + halo + rays) * vGlow;',
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(vColor * a, a);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh));
    }
    return sh;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);          /* additive starlight */
  gl.disable(gl.DEPTH_TEST);

  var U = {
    mv: gl.getUniformLocation(prog, 'uMV'),
    p: gl.getUniformLocation(prog, 'uP'),
    t: gl.getUniformLocation(prog, 'uT'),
    dpr: gl.getUniformLocation(prog, 'uDpr'),
    fade: gl.getUniformLocation(prog, 'uFade')
  };

  /* ---------- tiny mat4 ---------- */
  function persp(fov, asp, near, far) {
    var f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    return [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function mv(yaw, pitch, dist) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    /* rotY then rotX then translate -dist */
    return [cy, sy * sp, -sy * cp, 0,
            0, cp, sp, 0,
            sy, -cy * sp, cy * cp, 0,
            0, 0, -dist, 0].map(function (v, i) { return i === 15 ? 1 : v; });
  }

  /* ---------- data -> galaxy ---------- */
  function hash01(s, salt) {
    var h = 2166136261 ^ salt;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }
  function tierOf(r) {
    if (typeof r.likes === 'number') {
      return r.likes > 500 ? 4 : r.likes > 100 ? 3 : r.likes > 20 ? 2 : r.likes > 5 ? 1 : 0;
    }
    if (/Yes Sir》8\.13|首次公开考核|星期五练习生01/.test(r.title + (r.series || ''))) return 4;
    var h = hash01(r.id, 31);
    var t = h > 0.993 ? 4 : h > 0.94 ? 3 : h > 0.84 ? 2 : h > 0.64 ? 1 : 0;
    var notable = (r.tags || []).some(function (x) { return /首次|新粉推荐|出圈/.test(x); }) ||
      r.theme === 'milestones';
    if (notable && t < 2) t = 2;
    return t;
  }
  function clusterKey(r) {
    var yr = r.date ? r.date.slice(0, 4) : '';
    if (r.type === 'audio') return '声音记录';
    if (r.type === 'photo') return '日常照片';
    if ((r.series || '').indexOf('青岛五公·8.13') >= 0 || (r.tags || []).indexOf('五公') >= 0) return 'YES! SIR';
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
  /* tier ramp 冷白→暖白→金, softly tinted by category nebula */
  var TIER_C = [[.82, .88, 1], [.88, .92, 1], [1, 1, 1], [1, .93, .78], [1, .87, .62]];
  var CLS_TINT = {
    STAGE: [1.06, 1, .9], PHOTO: [.97, .94, 1.08], VOICE: [.9, .97, 1.1],
    VARIETY: [1, 1, 1], DAILY: [.94, .97, 1.08]
  };

  var stars = [];        /* {x,y,z,tier,r} for picking */
  var labels = [];       /* {x,y,z,el} */
  var N = 0;

  fetch('/data/archive.json').then(function (r) { return r.json(); }).then(function (data) {
    var recs = data.records;
    var clusters = {};
    recs.forEach(function (r) {
      var k = clusterKey(r);
      (clusters[k] = clusters[k] || []).push(r);
    });
    var keys = Object.keys(clusters);
    function medT(rs) {
      var ts = rs.filter(function (r) { return r.date; }).map(function (r) { return r.date; }).sort();
      return ts.length ? ts[ts.length >> 1] : '9999';
    }
    keys.sort(function (a, b) { return medT(clusters[a]) < medT(clusters[b]) ? -1 : 1; });

    var pos = [], col = [], tier = [], phase = [], speed = [];
    keys.forEach(function (k, ki) {
      var rs = clusters[k];
      var cx = -620 + (ki / Math.max(1, keys.length - 1)) * 1240 + (hash01(k, 11) - 0.5) * 160;
      var cyy = (hash01(k, 12) - 0.5) * 380;
      var cz = (hash01(k, 13) - 0.5) * 520;
      var R = 40 + Math.sqrt(rs.length) * 16;
      var starred = rs.some(function (r) { return tierOf(r) === 4; });

      rs.forEach(function (r) {
        /* soft gaussian-ish scatter */
        function g(salt) {
          return (hash01(r.id, salt) + hash01(r.id, salt + 7) + hash01(r.id, salt + 13) - 1.5) * 0.8;
        }
        var x = cx + g(21) * R, y = cyy + g(22) * R * 0.72, z = cz + g(23) * R;
        var t = tierOf(r);
        var base = TIER_C[t];
        var tint = CLS_TINT[r.cls] || [1, 1, 1];
        pos.push(x, y, z);
        col.push(
          Math.min(1, base[0] * tint[0]),
          Math.min(1, base[1] * tint[1]),
          Math.min(1, base[2] * tint[2]));
        tier.push(t);
        phase.push(hash01(r.id, 41) * Math.PI * 2);
        speed.push(reduced ? 0 : 0.5 + hash01(r.id, 42) * 1.1);
        stars.push({ x: x, y: y, z: z, tier: t, r: r });
      });

      var el = document.createElement('span');
      el.className = 'st-label' + (starred ? ' accent' : '');
      el.innerHTML = (starred ? '✦ ' : '') + k + '<span class="n">' + rs.length + '</span>';
      stage.appendChild(el);
      labels.push({ x: cx, y: cyy - R * 0.9 - 26, z: cz, el: el });
    });

    N = tier.length;
    function buf(arr, loc, size) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      var a = gl.getAttribLocation(prog, loc);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0);
    }
    buf(pos, 'aPos', 3);
    buf(col, 'aColor', 3);
    buf(tier, 'aTier', 1);
    buf(phase, 'aPhase', 1);
    buf(speed, 'aSpeed', 1);
    requestAnimationFrame(frame);
  });

  /* ---------- camera ---------- */
  var qa = new URLSearchParams(location.search).has('nofx');
  var yaw = 0.15, pitch = 0.1, dist = (reduced || qa) ? 950 : 2400, targetDist = 950;
  var vyaw = 0, vpitch = 0;
  var t0 = performance.now();
  var W = 0, H = 0, DPR = 1, P = null;

  function resize() {
    var rect = stage.getBoundingClientRect();
    W = rect.width; H = rect.height;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    gl.viewport(0, 0, canvas.width, canvas.height);
    P = persp(0.9, W / H, 40, 6000);
  }
  resize();
  window.addEventListener('resize', resize);

  function project(x, y, z, M) {
    /* MVP for labels / picking */
    var mx = M[0] * x + M[4] * y + M[8] * z + M[12];
    var my = M[1] * x + M[5] * y + M[9] * z + M[13];
    var mz = M[2] * x + M[6] * y + M[10] * z + M[14];
    var px = P[0] * mx, py = P[5] * my;
    var pw = -mz;
    if (pw < 60) return null;
    return { x: W / 2 + px / pw * W / 2, y: H / 2 - py / pw * H / 2, d: pw };
  }

  var fade = qa ? 1 : 0;
  function frame(now) {
    var t = (now - t0) / 1000;
    /* initial approach: stars condense out of the distance */
    if (!reduced && dist > targetDist) {
      dist = targetDist + (dist - targetDist) * 0.94;
    }
    fade = Math.min(1, fade + 0.018);
    if (!dragging) {
      yaw += vyaw; pitch += vpitch;
      vyaw *= 0.95; vpitch *= 0.95;
      pitch = Math.max(-1.2, Math.min(1.2, pitch));
    }
    var M = mv(yaw, pitch, dist);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(U.mv, false, M);
    gl.uniformMatrix4fv(U.p, false, P);
    gl.uniform1f(U.t, t);
    gl.uniform1f(U.dpr, DPR);
    gl.uniform1f(U.fade, fade);
    if (N) gl.drawArrays(gl.POINTS, 0, N);

    /* cluster labels follow their nebulae */
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i];
      var s = project(L.x, L.y, L.z, M);
      if (!s || s.x < -80 || s.x > W + 80 || s.y < -40 || s.y > H + 40) {
        L.el.style.opacity = '0';
        continue;
      }
      L.el.style.opacity = String(Math.max(0, Math.min(0.9, 1500 / s.d * 0.5)) * fade);
      L.el.style.left = s.x + 'px';
      L.el.style.top = s.y + 'px';
    }
    requestAnimationFrame(frame);
  }

  /* ---------- interaction ---------- */
  var dragging = false, lastX = 0, lastY = 0, moved = 0;
  var pointers = {}, pinchD = null;

  canvas.addEventListener('pointerdown', function (e) {
    pointers[e.pointerId] = [e.clientX, e.clientY];
    dragging = true; moved = 0;
    lastX = e.clientX; lastY = e.clientY;
    vyaw = vpitch = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (pointers[e.pointerId]) pointers[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinchD) {
        targetDist = dist = Math.max(320, Math.min(2600, dist * pinchD / d));
      }
      pinchD = d;
      return;
    }
    pinchD = null;
    if (dragging) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      yaw += dx * 0.0042;
      pitch += dy * 0.0042;
      pitch = Math.max(-1.2, Math.min(1.2, pitch));
      vyaw = dx * 0.0042; vpitch = dy * 0.0042;
      lastX = e.clientX; lastY = e.clientY;
    } else {
      hover(e);
    }
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    canvas.addEventListener(ev, function (e) {
      delete pointers[e.pointerId];
      pinchD = null;
      if (dragging && moved < 6) click(e);
      dragging = false;
    });
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    targetDist = dist = Math.max(320, Math.min(2600, dist * (e.deltaY > 0 ? 1.07 : 0.94)));
  }, { passive: false });

  document.getElementById('st-reset').addEventListener('click', function () {
    yaw = 0.15; pitch = 0.1; targetDist = 950;
    if (reduced) dist = 950;
  });

  function pick(e) {
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var M = mv(yaw, pitch, dist);
    var best = null, bd = 220;
    for (var i = 0; i < stars.length; i++) {
      var s = project(stars[i].x, stars[i].y, stars[i].z, M);
      if (!s) continue;
      var d = (s.x - mx) * (s.x - mx) + (s.y - my) * (s.y - my);
      var reach = 60 + stars[i].tier * 40;
      if (d < bd && d < reach) { bd = d; best = { st: stars[i], sx: s.x, sy: s.y }; }
    }
    return best;
  }

  function hover(e) {
    var b = pick(e);
    if (b) {
      var r = b.st.r;
      tip.innerHTML = '<span class="coord-label' + (b.st.tier === 4 ? ' accent' : ' dim') + '">' +
        (b.st.tier === 4 ? '✦ ' : '· ') + 'COORD. ' + r.id + '</span>' +
        '<span class="coord-label dim" style="margin-left:10px">' + (r.date || '') + '</span>' +
        '<br>' + r.title.slice(0, 40);
      tip.style.left = Math.min(W - 280, b.sx + 16) + 'px';
      tip.style.top = Math.max(8, b.sy - 12) + 'px';
      tip.classList.add('on');
      canvas.style.cursor = 'pointer';
    } else {
      tip.classList.remove('on');
      canvas.style.cursor = 'grab';
    }
  }

  function click(e) {
    var b = pick(e);
    if (!b) return;
    var rect = canvas.getBoundingClientRect();
    var rip = document.createElement('span');
    rip.className = 'st-ripple';
    rip.style.left = (e.clientX - rect.left) + 'px';
    rip.style.top = (e.clientY - rect.top) + 'px';
    stage.appendChild(rip);
    setTimeout(function () {
      location.href = '/coord.html?id=' + b.st.r.id + '&from=map';
    }, 260);
  }
})();

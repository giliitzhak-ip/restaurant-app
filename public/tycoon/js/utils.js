/**
 * MERIDIAN FIELD OPS — Shared helpers: RNG, math, formatting, events.
 */
(function (FST) {
  'use strict';

  var U = {};

  /* ── Deterministic RNG (mulberry32) so saved games replay identically ──── */
  U.makeRng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  var rng = U.makeRng((Date.now() ^ 0x9e3779b9) >>> 0);
  U.setRng = function (fn) { rng = fn; };
  U.random = function () { return rng(); };

  U.rand = function (min, max) { return min + rng() * (max - min); };
  U.randInt = function (min, max) { return Math.floor(min + rng() * (max - min + 1)); };
  U.pick = function (arr) { return arr[Math.floor(rng() * arr.length)]; };
  U.chance = function (p) { return rng() < p; };

  U.weighted = function (entries, weightOf) {
    var total = 0, i;
    for (i = 0; i < entries.length; i++) total += Math.max(0, weightOf(entries[i]));
    if (total <= 0) return entries[0];
    var roll = rng() * total;
    for (i = 0; i < entries.length; i++) {
      roll -= Math.max(0, weightOf(entries[i]));
      if (roll <= 0) return entries[i];
    }
    return entries[entries.length - 1];
  };

  U.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  var idCounter = 0;
  U.uid = function (prefix) {
    idCounter += 1;
    return (prefix || 'id') + '_' + idCounter.toString(36) + Math.floor(rng() * 1e6).toString(36);
  };
  U.seedIdCounter = function (n) { idCounter = Math.max(idCounter, n | 0); };
  U.idCounter = function () { return idCounter; };

  /* ── Math ──────────────────────────────────────────────────────────────── */
  U.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.dist = function (ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
  };
  U.round = function (v, dp) {
    var m = Math.pow(10, dp || 0);
    return Math.round(v * m) / m;
  };
  U.easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };

  /* ── Formatting ────────────────────────────────────────────────────────── */
  U.money = function (n) {
    var neg = n < 0;
    var v = Math.abs(Math.round(n));
    var s = '$' + v.toLocaleString('en-US');
    return neg ? '−' + s : s;
  };

  U.moneyShort = function (n) {
    var neg = n < 0, v = Math.abs(n), s;
    if (v >= 1e9) s = (v / 1e9).toFixed(v >= 1e10 ? 0 : 1) + 'B';
    else if (v >= 1e6) s = (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
    else if (v >= 1e3) s = (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k';
    else s = Math.round(v).toString();
    return (neg ? '−$' : '$') + s;
  };

  U.pct = function (n, dp) { return (n * 100).toFixed(dp === undefined ? 0 : dp) + '%'; };

  /** Minutes-of-day → "HH:MM" (24h). */
  U.clock = function (minutesOfDay) {
    var m = ((minutesOfDay % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mm = Math.floor(m % 60);
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  };

  /** Duration in minutes → "3h 40m" / "45m" / "2d 4h". */
  U.duration = function (mins) {
    var m = Math.max(0, Math.round(mins));
    if (m < 60) return m + 'm';
    if (m < 1440) {
      var h = Math.floor(m / 60), r = m % 60;
      return h + 'h' + (r ? ' ' + r + 'm' : '');
    }
    var d = Math.floor(m / 1440), hr = Math.floor((m % 1440) / 60);
    return d + 'd' + (hr ? ' ' + hr + 'h' : '');
  };

  var C = FST.Config;

  /** Absolute minute count → calendar breakdown. */
  U.calendar = function (totalMinutes) {
    var day = Math.floor(totalMinutes / 1440);
    var dpq = C.TIME.DAYS_PER_QUARTER;
    var qpy = C.TIME.QUARTERS_PER_YEAR;
    var quarter = Math.floor(day / dpq) % qpy;
    var year = Math.floor(day / (dpq * qpy));
    return {
      day: day,
      dayOfQuarter: day % dpq,
      quarter: quarter + 1,
      year: year + 1,
      time: totalMinutes % 1440,
      label: 'Y' + (year + 1) + ' · Q' + (quarter + 1) + ' · D' + ((day % dpq) + 1)
    };
  };

  U.escape = function (str) {
    return String(str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };

  U.titleCase = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };

  /* ── Tiny pub/sub used to decouple simulation from presentation ────────── */
  U.emitter = function () {
    var map = {};
    return {
      on: function (evt, fn) {
        (map[evt] = map[evt] || []).push(fn);
        return function () { map[evt] = map[evt].filter(function (f) { return f !== fn; }); };
      },
      emit: function (evt, payload) {
        var list = map[evt];
        if (!list) return;
        for (var i = 0; i < list.length; i++) {
          try { list[i](payload); } catch (err) { console.error('[' + evt + ']', err); }
        }
      }
    };
  };

  /** Throttle a function to at most one call per `ms`, trailing-edge safe. */
  U.throttle = function (fn, ms) {
    var last = 0, timer = null, lastArgs = null;
    return function () {
      lastArgs = arguments;
      var now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn.apply(null, lastArgs);
      } else if (!timer) {
        timer = setTimeout(function () {
          timer = null; last = Date.now();
          fn.apply(null, lastArgs);
        }, ms - (now - last));
      }
    };
  };

  FST.Utils = U;
})(window.FST = window.FST || {});

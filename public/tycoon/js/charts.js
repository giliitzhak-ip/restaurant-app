/**
 * MERIDIAN FIELD OPS — Dependency-free canvas charts.
 * Every chart is DPR-aware, resizes with its container, and supports hover
 * read-out through a shared tooltip element.
 */
(function (FST) {
  'use strict';

  var U = FST.Utils;
  var Charts = {};

  var PALETTE = {
    grid: 'rgba(148,163,184,0.13)',
    axis: 'rgba(148,163,184,0.45)',
    text: 'rgba(203,213,225,0.75)',
    revenue: '#22d3ee',
    expense: '#fb7185',
    profit: '#4ade80',
    cash: '#38bdf8',
    csat: '#facc15'
  };
  Charts.PALETTE = PALETTE;

  /** Prepare a canvas for crisp drawing; returns the 2D context and CSS size. */
  function surface(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.floor(rect.width));
    var h = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }
  Charts.surface = surface;

  function niceCeil(value) {
    if (value <= 0) return 1;
    var exp = Math.floor(Math.log10(value));
    var base = Math.pow(10, exp);
    var norm = value / base;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return step * base;
  }

  function drawGrid(ctx, box, min, max, ticks, formatter) {
    ctx.save();
    ctx.strokeStyle = PALETTE.grid;
    ctx.fillStyle = PALETTE.text;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var i = 0; i <= ticks; i++) {
      var t = i / ticks;
      var y = Math.round(box.y + box.h - t * box.h) + 0.5;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
      ctx.fillText(formatter(min + (max - min) * t), box.x - 8, y);
    }
    ctx.restore();
  }

  /**
   * Multi-series line/area chart.
   * series: [{ key, label, color, values: number[], area: bool }]
   */
  Charts.line = function (canvas, series, opts) {
    opts = opts || {};
    var s = surface(canvas);
    var ctx = s.ctx;
    var pad = { l: 52, r: 12, t: 14, b: 22 };
    var box = { x: pad.l, y: pad.t, w: Math.max(10, s.w - pad.l - pad.r), h: Math.max(10, s.h - pad.t - pad.b) };
    var count = series.reduce(function (m, ser) { return Math.max(m, ser.values.length); }, 0);

    if (count < 2) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(opts.empty || 'Collecting data…', s.w / 2, s.h / 2);
      return null;
    }

    var min = Infinity, max = -Infinity;
    series.forEach(function (ser) {
      ser.values.forEach(function (v) { if (v < min) min = v; if (v > max) max = v; });
    });
    if (opts.zeroBase) min = Math.min(0, min);
    if (min === max) { max = min + 1; }
    var span = max - min;
    max += span * 0.12;
    min -= span * 0.08;
    if (opts.zeroBase && min > 0) min = 0;

    var fmt = opts.format || U.moneyShort;
    drawGrid(ctx, box, min, max, 4, fmt);

    var xAt = function (i) { return box.x + (i / (count - 1)) * box.w; };
    var yAt = function (v) { return box.y + box.h - ((v - min) / (max - min)) * box.h; };

    series.forEach(function (ser) {
      if (ser.values.length < 2) return;
      if (ser.area) {
        var grad = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
        grad.addColorStop(0, hexA(ser.color, 0.32));
        grad.addColorStop(1, hexA(ser.color, 0));
        ctx.beginPath();
        ctx.moveTo(xAt(0), yAt(ser.values[0]));
        ser.values.forEach(function (v, i) { ctx.lineTo(xAt(i), yAt(v)); });
        ctx.lineTo(xAt(ser.values.length - 1), box.y + box.h);
        ctx.lineTo(xAt(0), box.y + box.h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.beginPath();
      ser.values.forEach(function (v, i) {
        var x = xAt(i), y = yAt(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = ser.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      var lastX = xAt(ser.values.length - 1), lastY = yAt(ser.values[ser.values.length - 1]);
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = ser.color;
      ctx.fill();
    });

    // X axis labels: first and last only, to keep the chart clean.
    if (opts.labels && opts.labels.length) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(opts.labels[0], box.x, box.y + box.h + 6);
      ctx.textAlign = 'right';
      ctx.fillText(opts.labels[opts.labels.length - 1], box.x + box.w, box.y + box.h + 6);
    }

    return { box: box, count: count, xAt: xAt, yAt: yAt, min: min, max: max };
  };

  /**
   * Grouped bar chart.
   * groups: [{ label, bars: [{ color, value }] }]
   */
  Charts.bars = function (canvas, groups, opts) {
    opts = opts || {};
    var s = surface(canvas);
    var ctx = s.ctx;
    var pad = { l: 52, r: 12, t: 14, b: 24 };
    var box = { x: pad.l, y: pad.t, w: Math.max(10, s.w - pad.l - pad.r), h: Math.max(10, s.h - pad.t - pad.b) };

    if (!groups.length) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(opts.empty || 'No data yet', s.w / 2, s.h / 2);
      return;
    }

    var max = 0, min = 0;
    groups.forEach(function (g) {
      g.bars.forEach(function (b) {
        if (b.value > max) max = b.value;
        if (b.value < min) min = b.value;
      });
    });
    max = niceCeil(max || 1);
    if (min < 0) min = -niceCeil(-min);

    drawGrid(ctx, box, min, max, 4, opts.format || U.moneyShort);

    var yAt = function (v) { return box.y + box.h - ((v - min) / (max - min)) * box.h; };
    var slot = box.w / groups.length;
    var barCount = groups[0].bars.length;
    var barW = Math.max(2, Math.min(16, (slot - 6) / barCount));

    groups.forEach(function (g, gi) {
      var gx = box.x + slot * gi + (slot - barW * barCount) / 2;
      g.bars.forEach(function (b, bi) {
        var y0 = yAt(0), y1 = yAt(b.value);
        var top = Math.min(y0, y1), h = Math.max(1.5, Math.abs(y1 - y0));
        ctx.fillStyle = b.color;
        roundRect(ctx, gx + bi * barW, top, barW - 1.5, h, Math.min(2.5, barW / 2));
        ctx.fill();
      });
    });

    if (opts.labels !== false) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(groups[0].label, box.x, box.y + box.h + 7);
      ctx.textAlign = 'right';
      ctx.fillText(groups[groups.length - 1].label, box.x + box.w, box.y + box.h + 7);
    }
  };

  /**
   * Donut breakdown.
   * slices: [{ label, value, color }]
   */
  Charts.donut = function (canvas, slices, opts) {
    opts = opts || {};
    var s = surface(canvas);
    var ctx = s.ctx;
    var total = slices.reduce(function (t, x) { return t + Math.max(0, x.value); }, 0);
    var cx = s.w / 2, cy = s.h / 2;
    var outer = Math.max(10, Math.min(s.w, s.h) / 2 - 6);
    var inner = outer * 0.62;

    if (total <= 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, (outer + inner) / 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(148,163,184,0.18)';
      ctx.lineWidth = outer - inner;
      ctx.stroke();
      ctx.fillStyle = PALETTE.text;
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No spend', cx, cy);
      return;
    }

    var angle = -Math.PI / 2;
    slices.forEach(function (slice) {
      var share = Math.max(0, slice.value) / total;
      if (share <= 0) return;
      var end = angle + share * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outer, angle, end);
      ctx.arc(cx, cy, inner, end, angle, true);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();
      angle = end;
    });

    ctx.fillStyle = 'rgba(226,232,240,0.95)';
    ctx.font = '600 15px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(opts.centerLabel || U.moneyShort(total), cx, cy + 2);
    if (opts.centerSub) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(opts.centerSub, cx, cy + 15);
    }
  };

  /** Minimal inline trend line used inside KPI tiles. */
  Charts.spark = function (canvas, values, color) {
    var s = surface(canvas);
    var ctx = s.ctx;
    if (!values || values.length < 2) return;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (min === max) { max = min + 1; }
    var pad = 2;
    ctx.beginPath();
    values.forEach(function (v, i) {
      var x = (i / (values.length - 1)) * s.w;
      var y = s.h - pad - ((v - min) / (max - min)) * (s.h - pad * 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color || PALETTE.cash;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.lineTo(s.w, s.h);
    ctx.lineTo(0, s.h);
    ctx.closePath();
    ctx.fillStyle = hexA(color || PALETTE.cash, 0.16);
    ctx.fill();
  };

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  Charts.roundRect = roundRect;

  /** '#rrggbb' + alpha → 'rgba(...)'. */
  function hexA(hex, alpha) {
    if (hex.charAt(0) !== '#') return hex;
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  Charts.alpha = hexA;

  FST.Charts = Charts;
})(window.FST = window.FST || {});

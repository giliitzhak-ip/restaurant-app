/**
 * MERIDIAN FIELD OPS — Toast notifications and the rolling activity log.
 */
(function (FST) {
  'use strict';

  var U = FST.Utils, T = FST.I18n;
  var N = {};

  var stack = null, logEl = null, state = null;
  var MAX_TOASTS = 4;
  var MAX_LOG = 220;

  var STYLES = {
    ok: { accent: 'border-s-emerald-400', icon: '✓', tone: 'text-emerald-300' },
    info: { accent: 'border-s-sky-400', icon: 'i', tone: 'text-sky-300' },
    warn: { accent: 'border-s-amber-400', icon: '!', tone: 'text-amber-300' },
    danger: { accent: 'border-s-rose-500', icon: '⚠', tone: 'text-rose-300' }
  };

  N.init = function (stackEl, logContainer, gameState) {
    stack = stackEl;
    logEl = logContainer;
    state = gameState;
    N.renderLog();          // a restored save arrives with its history intact
    return N;
  };

  N.setState = function (s) { state = s; N.renderLog(); };

  /** Transient corner notification. */
  N.toast = function (opts) {
    if (!stack || !state || !state.settings.notifications) return;
    var style = STYLES[opts.kind] || STYLES.info;

    var el = document.createElement('div');
    el.className = 'toast pointer-events-auto w-80 rounded-lg border border-slate-700/70 border-s-4 ' +
      style.accent + ' bg-slate-900/95 shadow-xl shadow-black/40 backdrop-blur px-3.5 py-2.5';
    el.innerHTML =
      '<div class="flex items-start gap-2.5">' +
        '<span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold ' + style.tone + '">' + style.icon + '</span>' +
        '<div class="min-w-0 flex-1">' +
          '<p class="text-[12px] font-semibold text-slate-100">' + U.escape(opts.title || '') + '</p>' +
          '<p class="mt-0.5 text-[11px] leading-snug text-slate-400">' + U.escape(opts.msg || '') + '</p>' +
        '</div>' +
        '<button class="toast-close -me-1 -mt-1 rounded p-1 text-slate-500 transition hover:text-slate-200" aria-label="Dismiss">×</button>' +
      '</div>';

    el.querySelector('.toast-close').addEventListener('click', function () { dismiss(el); });
    stack.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('toast-in'); });

    while (stack.children.length > MAX_TOASTS) dismiss(stack.children[0]);
    setTimeout(function () { dismiss(el); }, opts.kind === 'danger' ? 8500 : 5500);
  };

  function dismiss(el) {
    if (!el || el.dataset.closing) return;
    el.dataset.closing = '1';
    el.classList.remove('toast-in');
    el.classList.add('toast-out');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
  }

  /** Append to the persistent operations log. */
  N.log = function (entry) {
    if (!state) return;
    state.log.push({
      t: state.time.minutes,
      day: state.time.day,
      kind: entry.kind || 'info',
      msg: entry.msg
    });
    if (state.log.length > MAX_LOG) state.log.shift();
    N.renderLog();
  };

  var TONE = {
    ok: 'text-emerald-300', info: 'text-sky-300',
    warn: 'text-amber-300', danger: 'text-rose-300', job: 'text-sky-300'
  };

  N.renderLog = U.throttle(function () {
    if (!logEl || !state) return;
    var rows = state.log.slice(-90).reverse();
    if (!rows.length) {
      logEl.innerHTML = '<p class="px-3 py-6 text-center text-[11px] text-slate-600">' + U.escape(T.t('log.empty')) + '</p>';
      return;
    }
    logEl.innerHTML = rows.map(function (row) {
      return '<div class="flex gap-2.5 border-b border-slate-800/60 px-3 py-1.5 text-[11px] leading-snug">' +
        '<span class="shrink-0 font-mono text-slate-600">' + U.clock(row.t) + '</span>' +
        '<span class="' + (TONE[row.kind] || 'text-slate-300') + ' min-w-0 break-words">' + U.escape(row.msg) + '</span>' +
        '</div>';
    }).join('');
  }, 220);

  N.clearLog = function () {
    if (state) state.log = [];
    N.renderLog();
  };

  FST.Notify = N;
})(window.FST = window.FST || {});

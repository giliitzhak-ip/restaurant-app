/**
 * MERIDIAN FIELD OPS — Bootstrap. Wires the simulation engine to the UI,
 * the map and the notification system, and owns save/load plumbing.
 */
(function (FST) {
  'use strict';

  var C = FST.Config, U = FST.Utils, S = FST.State,
      Engine = FST.Engine, UI = FST.UI, Map = FST.Map, Notify = FST.Notify;
  var I18n = FST.I18n, T = FST.I18n.t;

  var state = null;
  var uiRefresh = 0;

  function boot() {
    var bootEl = document.getElementById('boot');
    var appEl = document.getElementById('app');
    var nameEl = document.getElementById('boot-name');
    var continueBtn = document.getElementById('boot-continue');

    I18n.init();
    buildLanguagePicker();
    nameEl.addEventListener('input', function () { nameEl.dataset.touched = '1'; });

    if (S.hasSave()) continueBtn.classList.remove('hidden');

    document.getElementById('boot-new').addEventListener('click', function () {
      startGame(S.create((nameEl.value || '').trim() || T('boot.company.default')), true);
    });

    continueBtn.addEventListener('click', function () {
      var loaded = S.load();
      if (!loaded) {
        Notify.toast({ kind: 'danger', title: T('save.loadFailed'), msg: T('save.loadFailedMsg') });
        return;
      }
      startGame(loaded, false);
    });

    nameEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('boot-new').click();
    });

    function startGame(newState, isNew) {
      state = newState;
      bootEl.style.opacity = '0';
      bootEl.style.pointerEvents = 'none';
      setTimeout(function () { bootEl.style.display = 'none'; }, 320);
      appEl.classList.remove('opacity-0');
      init(isNew);
    }
  }

  function init(isNew) {
    Engine.init(state);
    Notify.init(document.getElementById('toasts'), document.getElementById('log'), state);
    Map.init(document.getElementById('map'), document.getElementById('map-tooltip'));
    Map.setState(state);
    UI.init(state);
    UI.setState(state);

    wireEngine();
    wireUI();
    wireKeyboard();
    wireLanguage();

    Engine.start();
    Engine.setSpeed(isNew ? 1 : 0);

    if (isNew) {
      Notify.log({ kind: 'ok', msg: T('log.opened', { company: state.company.name, money: U.money(state.finance.cash) }) });
      Notify.toast({ kind: 'info', title: T('boot.welcome'), msg: T('boot.welcomeMsg') });
    } else {
      Notify.toast({ kind: 'info', title: T('boot.restored'), msg: T('boot.restoredMsg') });
    }
  }

  /* ── Engine → presentation ─────────────────────────────────────────────── */

  function wireEngine() {
    Engine.on('frame', function () {
      Map.draw(performance.now());
      // The HUD tracks money and the clock continuously; panels refresh slower.
      if (performance.now() - uiRefresh > 220) {
        uiRefresh = performance.now();
        UI.render(false);
      }
    });

    Engine.on('toast', function (t) { Notify.toast(t); });
    Engine.on('log', function (entry) { Notify.log(entry); });
    Engine.on('speed', function () { UI.render(false); });

    Engine.on('job:new', function () { UI.render(false); });
    Engine.on('job:resolved', function () { UI.render(true); });

    Engine.on('decision', function (evt) { UI.showEvent(evt); });

    Engine.on('milestone', function () { UI.render(true); });

    Engine.on('day', function () { UI.render(true); });

    Engine.on('insolvent', function () { UI.showInsolvency(); });

    Engine.on('saved', function (info) {
      if (!info.auto) Notify.toast({ kind: 'ok', title: T('save.ok'), msg: T('save.okMsg') });
    });
  }

  /* ── UI → engine ───────────────────────────────────────────────────────── */

  function wireUI() {
    UI.on('speed', function (index) { Engine.setSpeed(C.TIME.SPEEDS[index]); });

    UI.on('event-choice', function (index) { Engine.resolveEvent(index); });

    UI.on('save', function () {
      if (S.save(state)) Notify.toast({ kind: 'ok', title: T('save.ok'), msg: T('save.okMsg') });
      else Notify.toast({ kind: 'danger', title: T('save.failed'), msg: T('save.failedMsg') });
    });

    UI.on('load', function () {
      var loaded = S.load();
      if (!loaded) { Notify.toast({ kind: 'danger', title: T('save.none'), msg: T('save.noneMsg') }); return; }
      swapState(loaded);
      Notify.toast({ kind: 'ok', title: T('save.loaded'), msg: T('save.loadedMsg') });
    });

    UI.on('reset', function () {
      S.clearSave();
      window.location.reload();
    });

    UI.on('export', function () { UI.showTransfer('export', S.serialize(state)); });
    UI.on('import', function () { UI.showTransfer('import'); });

    UI.on('download', function (payload) {
      try {
        var blob = new Blob([payload], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'meridian-fieldops-' + U.calendar(state.time.minutes).label.replace(/[^\w]+/g, '-') + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        Notify.toast({ kind: 'ok', title: T('save.exported'), msg: T('save.exportedMsg') });
      } catch (err) {
        // Sandboxed hosts refuse page-initiated downloads; the copy path still works.
        Notify.toast({ kind: 'warn', title: T('save.exportFailed'), msg: T('xfer.downloadBlocked') });
      }
    });

    UI.on('pick-file', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var box = document.getElementById('transfer-text');
          if (box) box.value = String(reader.result);
          else applyImport(String(reader.result));
        };
        reader.readAsText(file);
      });
      input.click();
    });

    UI.on('import-json', applyImport);
  }

  function applyImport(text) {
    try {
      var loaded = S.hydrate(JSON.parse(text));
      swapState(loaded);
      Notify.toast({ kind: 'ok', title: T('save.imported'), msg: T('save.importedMsg') });
    } catch (err) {
      Notify.toast({ kind: 'danger', title: T('save.importFailed'), msg: T('save.importFailedMsg') });
    }
  }

  function swapState(next) {
    state = next;
    Engine.init(state);
    Engine.setSpeed(0);
    Notify.setState(state);
    Map.setState(state);
    UI.setState(state);
  }

  /* ── Language ──────────────────────────────────────────────────────────── */

  function buildLanguagePicker() {
    var host = document.getElementById('boot-lang');
    if (!host) return;
    host.innerHTML = I18n.LANGUAGES.map(function (lang) {
      return '<button class="speed-btn" data-lang="' + lang.id + '" aria-pressed="' +
        (I18n.lang() === lang.id) + '">' + lang.label + '</button>';
    }).join('');
    host.querySelectorAll('[data-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () { I18n.setLang(btn.dataset.lang); });
    });
  }

  function wireLanguage() {
    var btn = document.getElementById('btn-lang');
    if (btn) {
      btn.addEventListener('click', function () {
        var ids = I18n.LANGUAGES.map(function (l) { return l.id; });
        I18n.setLang(ids[(ids.indexOf(I18n.lang()) + 1) % ids.length]);
      });
    }
    I18n.on('change', function () {
      buildLanguagePicker();
      syncLanguageButton();
      if (state) {
        Notify.renderLog();
        UI.retranslate();
      }
    });
    syncLanguageButton();
  }

  /** The header button shows the language you would switch *to*. */
  function syncLanguageButton() {
    var btn = document.getElementById('btn-lang');
    if (!btn) return;
    var ids = I18n.LANGUAGES.map(function (l) { return l.id; });
    var next = I18n.LANGUAGES[(ids.indexOf(I18n.lang()) + 1) % ids.length];
    btn.textContent = next.label;
  }

  /* ── Keyboard ──────────────────────────────────────────────────────────── */

  function wireKeyboard() {
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;

      if (e.key === ' ') { e.preventDefault(); Engine.togglePause(); return; }
      if (e.key === '1') { Engine.setSpeed(1); return; }
      if (e.key === '2') { Engine.setSpeed(2); return; }
      if (e.key === '3') { Engine.setSpeed(4); return; }
      if (e.key === 'Escape') { UI.closeModal(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        UI.emit('save');
      }
    });

    // Never lose an unsaved day to a closed tab.
    window.addEventListener('beforeunload', function () {
      if (state && state.settings.autosave) S.save(state);
    });
  }

  /* ── Map selection ─────────────────────────────────────────────────────── */

  FST.Map.on('select', function (hit) {
    if (!hit) { UI.select(null); return; }
    UI.select(hit.type === 'job' ? { jobId: hit.id } : { unitId: hit.id });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.FST = window.FST || {});

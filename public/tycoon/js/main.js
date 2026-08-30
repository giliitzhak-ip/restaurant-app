/**
 * MERIDIAN FIELD OPS — Bootstrap. Wires the simulation engine to the UI,
 * the map and the notification system, and owns save/load plumbing.
 */
(function (FST) {
  'use strict';

  var C = FST.Config, U = FST.Utils, S = FST.State,
      Engine = FST.Engine, UI = FST.UI, Map = FST.Map, Notify = FST.Notify;

  var state = null;
  var uiRefresh = 0;

  function boot() {
    var bootEl = document.getElementById('boot');
    var appEl = document.getElementById('app');
    var nameEl = document.getElementById('boot-name');
    var continueBtn = document.getElementById('boot-continue');

    if (S.hasSave()) continueBtn.classList.remove('hidden');

    document.getElementById('boot-new').addEventListener('click', function () {
      startGame(S.create((nameEl.value || '').trim() || 'Meridian Field Services'), true);
    });

    continueBtn.addEventListener('click', function () {
      var loaded = S.load();
      if (!loaded) {
        Notify.toast({ kind: 'danger', title: 'Load failed', msg: 'The saved game could not be read.' });
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

    Engine.start();
    Engine.setSpeed(isNew ? 1 : 0);

    if (isNew) {
      Notify.log({ kind: 'ok', msg: 'OPERATION OPENED · ' + state.company.name + ' · ' + U.money(state.finance.cash) + ' starting capital' });
      Notify.toast({
        kind: 'info', title: 'Welcome to the floor',
        msg: 'Two units, three technicians and an empty board. Calls will start coming in — dispatch them before the SLA runs out.'
      });
    } else {
      Notify.toast({ kind: 'info', title: 'Operation restored', msg: 'Resumed and paused. Press Space to start the clock.' });
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
      if (!info.auto) Notify.toast({ kind: 'ok', title: 'Saved', msg: 'Operation written to browser storage.' });
    });
  }

  /* ── UI → engine ───────────────────────────────────────────────────────── */

  function wireUI() {
    UI.on('speed', function (index) { Engine.setSpeed(C.TIME.SPEEDS[index]); });

    UI.on('event-choice', function (index) { Engine.resolveEvent(index); });

    UI.on('save', function () {
      if (S.save(state)) Notify.toast({ kind: 'ok', title: 'Saved', msg: 'Operation written to browser storage.' });
      else Notify.toast({ kind: 'danger', title: 'Save failed', msg: 'Browser storage rejected the write.' });
    });

    UI.on('load', function () {
      var loaded = S.load();
      if (!loaded) { Notify.toast({ kind: 'danger', title: 'No save found', msg: 'Nothing to restore.' }); return; }
      swapState(loaded);
      Notify.toast({ kind: 'ok', title: 'Loaded', msg: 'Saved operation restored and paused.' });
    });

    UI.on('reset', function () {
      S.clearSave();
      window.location.reload();
    });

    UI.on('export', function () {
      try {
        var blob = new Blob([S.serialize(state)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'meridian-fieldops-' + U.calendar(state.time.minutes).label.replace(/[^\w]+/g, '-') + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        Notify.toast({ kind: 'ok', title: 'Exported', msg: 'Save file downloaded.' });
      } catch (err) {
        Notify.toast({ kind: 'danger', title: 'Export failed', msg: String(err.message || err) });
      }
    });

    UI.on('import', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var loaded = S.hydrate(JSON.parse(String(reader.result)));
            swapState(loaded);
            Notify.toast({ kind: 'ok', title: 'Imported', msg: 'Save file loaded and paused.' });
          } catch (err) {
            Notify.toast({ kind: 'danger', title: 'Import failed', msg: 'That file is not a valid save.' });
          }
        };
        reader.readAsText(file);
      });
      input.click();
    });
  }

  function swapState(next) {
    state = next;
    Engine.init(state);
    Engine.setSpeed(0);
    Notify.setState(state);
    Map.setState(state);
    UI.setState(state);
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

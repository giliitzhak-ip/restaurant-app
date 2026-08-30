/**
 * pwa.js — installability: service-worker registration, the install prompt,
 * and the platform-specific instructions for browsers that have no prompt
 * (every iOS browser, and desktop Safari).
 */
'use strict';

/** True when the game is running from the home screen rather than a tab. */
export function isStandalone() {
  return (
    (window.matchMedia &&
      window.matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)').matches) ||
    navigator.standalone === true
  );
}

export function platform() {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  const android = /Android/.test(ua);
  const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  const firefox = /Firefox|FxiOS/.test(ua);
  return { iOS, android, safari, firefox };
}

/**
 * Manual install instructions, per browser. Returned as {title, steps[], note}
 * so the UI can render them consistently.
 */
export function installInstructions() {
  const p = platform();
  if (p.iOS) {
    return {
      title: 'Add SKYLINE to your Home Screen',
      steps: [
        'Open this page in <b>Safari</b> — Chrome and Firefox on iOS cannot install web apps.',
        'Tap the <b>Share</b> button (the square with an arrow) in the toolbar.',
        'Scroll down and tap <b>Add to Home Screen</b>.',
        'Tap <b>Add</b>. SKYLINE gets its own icon and launches without browser bars.',
      ],
      note: 'iOS does not offer a one-tap install prompt to web apps, so this is the only route. ' +
        'Once added, the game runs fullscreen and works offline.',
    };
  }
  if (p.firefox) {
    return {
      title: 'Install from the Firefox menu',
      steps: [
        'Open the <b>⋮</b> menu in the toolbar.',
        'Choose <b>Install</b> (on Android) or <b>Add to Home screen</b>.',
        'Confirm. The game then launches in its own window.',
      ],
      note: 'Firefox on desktop does not install web apps; use Chrome or Edge there, or just ' +
        'bookmark the page — the game works exactly the same in a tab.',
    };
  }
  return {
    title: 'Install from the browser menu',
    steps: [
      'Open the browser menu (<b>⋮</b> or <b>⋯</b>).',
      'Choose <b>Install app</b>, <b>Install SKYLINE</b> or <b>Add to Home screen</b>.',
      'Confirm the prompt.',
    ],
    note: 'If you do not see the option, the page may not be served over HTTPS — installation ' +
      'and offline play both require a secure origin (https:// or localhost).',
  };
}

/**
 * Wires up the service worker and the install prompt.
 * `onState({ canInstall, installed })` is called whenever either changes.
 */
export class InstallManager {
  /**
   * @param {(state) => void} onState  install-state changes
   * @param {() => boolean} isBusy     true while a mission is in progress, so
   *                                   an update never reloads mid-flight
   */
  constructor(onState, isBusy) {
    this.onState = onState || (() => {});
    this.isBusy = isBusy || (() => false);
    this.deferred = null;
    this.installed = isStandalone();
    this.swReady = false;
    /** A new build has installed and taken over; reload when it is safe. */
    this.updatePending = false;
    this._updateReady = false;
    this._reloading = false;
  }

  start() {
    // Installability and offline play both need a secure context. Over plain
    // http on a LAN address neither is available; the game still runs.
    if ('serviceWorker' in navigator && window.isSecureContext) {
      // Taking over from a previous worker means a genuinely new build. The
      // very first registration also fires controllerchange (via claim), and
      // that one must not reload — hence the explicit update flag.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!this._updateReady) return;
        this.updatePending = true;
        this.maybeReload();
      });

      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js', { scope: './' })
          .then((reg) => {
            this.swReady = true;
            reg.addEventListener('updatefound', () => {
              const worker = reg.installing;
              if (!worker) return;
              worker.addEventListener('statechange', () => {
                if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                  this._updateReady = true;
                }
              });
            });
            // Look for a new build when the player comes back to the tab.
            document.addEventListener('visibilitychange', () => {
              if (document.visibilityState === 'visible') reg.update().catch(() => {});
            });
          })
          .catch(() => { /* offline support unavailable; not fatal */ });
      });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e;
      this._emit();
    });

    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.installed = true;
      this._emit();
    });

    if (window.matchMedia) {
      const mq = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)');
      const onChange = () => { this.installed = isStandalone(); this._emit(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }

    this._emit();
  }

  _emit() {
    this.onState({
      canInstall: !this.installed && (this.deferred !== null || this.manualPossible()),
      hasPrompt: this.deferred !== null,
      installed: this.installed,
    });
  }

  /**
   * Reload onto the new build, but never in the middle of a mission — a
   * reload there would throw away the flight. Call again from a safe point.
   */
  maybeReload() {
    if (!this.updatePending || this._reloading) return false;
    if (this.isBusy()) return false;
    this._reloading = true;
    window.location.reload();
    return true;
  }

  /** Browsers with no prompt can still install by hand — offer instructions. */
  manualPossible() {
    const p = platform();
    return p.iOS || p.android || p.firefox;
  }

  /**
   * Fire the native prompt if we have one. Resolves 'accepted', 'dismissed'
   * or 'unavailable' (caller should then show instructions).
   */
  async prompt() {
    if (!this.deferred) return 'unavailable';
    const e = this.deferred;
    this.deferred = null;
    try {
      e.prompt();
      const choice = await e.userChoice;
      this._emit();
      return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
    } catch (err) {
      this._emit();
      return 'unavailable';
    }
  }
}

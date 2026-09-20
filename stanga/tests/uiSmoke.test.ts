// @vitest-environment jsdom
/**
 * Smoke test for the shipped UI: every screen in index.html exists, the main
 * buttons respond, difficulty and quality selection work, and settings survive
 * a round trip through storage.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { UIManager, type UICallbacks } from '../src/ui/UIManager';
import {
  defaultSettings,
  loadSettings,
  saveSettings,
  type GameSettings,
} from '../src/core/Settings';
import { createMatchState } from '../src/game/MatchState';
import { GameConfig } from '../src/config/GameConfig';

// Read the real index.html the game ships with, so a renamed element fails here.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const bodyMatch = /<body>([\s\S]*)<\/body>/.exec(html);
const BODY = bodyMatch?.[1]?.replace(/<script[\s\S]*?<\/script>/g, '') ?? '';

function mountDocument(): void {
  document.documentElement.lang = 'he';
  document.documentElement.dir = 'rtl';
  document.body.innerHTML = BODY;
}

/** Every callback is a spy, while still satisfying the real UICallbacks shape. */
type MockedCallbacks = { [K in keyof UICallbacks]: Mock<UICallbacks[K]> };

function makeCallbacks(): MockedCallbacks {
  return {
    onPlayPressed: vi.fn<UICallbacks['onPlayPressed']>(),
    onLocalPlayPressed: vi.fn<UICallbacks['onLocalPlayPressed']>(),
    onStartMatch: vi.fn<UICallbacks['onStartMatch']>(),
    onResume: vi.fn<UICallbacks['onResume']>(),
    onRestart: vi.fn<UICallbacks['onRestart']>(),
    onExitToMenu: vi.fn<UICallbacks['onExitToMenu']>(),
    onPauseRequested: vi.fn<UICallbacks['onPauseRequested']>(),
    onSettingsChanged: vi.fn<UICallbacks['onSettingsChanged']>(),
    onInteraction: vi.fn<UICallbacks['onInteraction']>(),
    onReload: vi.fn<UICallbacks['onReload']>(),
    onLobbyStart: vi.fn<UICallbacks['onLobbyStart']>(),
    onLobbySwapSides: vi.fn<UICallbacks['onLobbySwapSides']>(),
    onLobbyLeave: vi.fn<UICallbacks['onLobbyLeave']>(),
    onLobbyTouchJoin: vi.fn<UICallbacks['onLobbyTouchJoin']>(),
    onLobbyName: vi.fn<UICallbacks['onLobbyName']>(),
    onLobbyColor: vi.fn<UICallbacks['onLobbyColor']>(),
    onOnlinePlayPressed: vi.fn<UICallbacks['onOnlinePlayPressed']>(),
    onOnlineQuickMatch: vi.fn<UICallbacks['onOnlineQuickMatch']>(),
    onOnlineCreateRoom: vi.fn<UICallbacks['onOnlineCreateRoom']>(),
    onOnlineJoinRoom: vi.fn<UICallbacks['onOnlineJoinRoom']>(),
    onOnlineReady: vi.fn<UICallbacks['onOnlineReady']>(),
    onOnlineLeave: vi.fn<UICallbacks['onOnlineLeave']>(),
    onOnlineTeamSwitch: vi.fn<UICallbacks['onOnlineTeamSwitch']>(),
    onOnlineShuffleTeams: vi.fn<UICallbacks['onOnlineShuffleTeams']>(),
    onOnlineSurrender: vi.fn<UICallbacks['onOnlineSurrender']>(),
    onOnlineQuickChat: vi.fn<UICallbacks['onOnlineQuickChat']>(),
    onPrimerDismissed: vi.fn<UICallbacks['onPrimerDismissed']>(),
    onReconnectResume: vi.fn<UICallbacks['onReconnectResume']>(),
    onReconnectUseAi: vi.fn<UICallbacks['onReconnectUseAi']>(),
    onBindingsChanged: vi.fn<UICallbacks['onBindingsChanged']>(),
    onBindingsReset: vi.fn<UICallbacks['onBindingsReset']>(),
  };
}

function click(id: string): void {
  document.getElementById(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('UI smoke', () => {
  beforeEach(() => {
    mountDocument();
    localStorage.clear();
  });

  it('has the document set up for Hebrew right-to-left', () => {
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('contains every screen the game switches between', () => {
    for (const id of [
      'screen-loading',
      'screen-menu',
      'screen-difficulty',
      'screen-settings',
      'screen-pause',
      'screen-result',
      'screen-lobby',
      'screen-primer',
      'screen-reconnect',
      'screen-bindings',
      'hud',
      'rotate-notice',
      'fatal-error',
      'render-canvas',
      'touch-root',
      'resume-countdown',
      'small-screen-advice',
    ]) {
      expect(document.getElementById(id), `#${id} is missing`).not.toBeNull();
    }
  });

  it('offers local two-player as a live button, not a locked one', () => {
    const button = document.getElementById('btn-play-local') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('שני שחקנים');
    expect(button.className).not.toContain('btn--locked');
  });

  it('still marks every unreleased mode as coming soon and disables it', () => {
    const locked = [...document.querySelectorAll<HTMLButtonElement>('.btn--locked')];
    expect(locked.length).toBe(2);
    for (const button of locked) {
      expect(button.disabled).toBe(true);
      expect(button.textContent).toContain('בקרוב');
    }
    const labels = locked.map((button) => button.textContent ?? '');
    for (const mode of ['קריירה', 'טורנירים']) {
      expect(labels.some((label) => label.includes(mode))).toBe(true);
    }
    // Online shipped in 0.3.0 and 2x2 in 0.4.0, so both are real buttons now
    // rather than promises.
    for (const shipped of ['אונליין', '2 נגד 2']) {
      expect(labels.some((label) => label.includes(shipped))).toBe(false);
    }
  });

  it('offers online play from the menu and opens the online screen', () => {
    const callbacks = makeCallbacks();
    const ui = new UIManager(callbacks, defaultSettings());
    ui.showScreen('menu');

    const button = document.getElementById('btn-play-online') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();

    expect(callbacks.onOnlinePlayPressed).toHaveBeenCalled();
    expect(document.getElementById('screen-online')?.classList.contains('is-hidden')).toBe(false);
  });

  it('constructs without throwing and shows the menu', () => {
    const ui = new UIManager(makeCallbacks(), defaultSettings());
    ui.showScreen('menu');
    expect(document.getElementById('screen-menu')?.classList.contains('is-hidden')).toBe(false);
    expect(document.getElementById('screen-settings')?.classList.contains('is-hidden')).toBe(true);
  });

  it('moves from the menu to difficulty selection and starts a match', () => {
    const callbacks = makeCallbacks();
    const ui = new UIManager(callbacks, defaultSettings());
    ui.showScreen('menu');

    click('btn-play');
    expect(callbacks.onPlayPressed).toHaveBeenCalledTimes(1);
    expect(document.getElementById('screen-difficulty')?.classList.contains('is-hidden')).toBe(
      false,
    );

    document
      .querySelector<HTMLButtonElement>('[data-difficulty="hard"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('[data-difficulty="hard"]')?.getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(document.querySelector('[data-difficulty="normal"]')?.getAttribute('aria-checked')).toBe(
      'false',
    );

    click('btn-start-match');
    expect(callbacks.onStartMatch).toHaveBeenCalledWith('hard');
  });

  it('drives pause, resume, restart and exit', () => {
    const callbacks = makeCallbacks();
    new UIManager(callbacks, defaultSettings());

    click('btn-pause');
    expect(callbacks.onPauseRequested).toHaveBeenCalled();
    click('btn-resume');
    expect(callbacks.onResume).toHaveBeenCalled();
    click('btn-pause-restart');
    expect(callbacks.onRestart).toHaveBeenCalled();
    click('btn-pause-menu');
    expect(callbacks.onExitToMenu).toHaveBeenCalled();
    click('btn-rematch');
    expect(callbacks.onRestart).toHaveBeenCalledTimes(2);
    click('btn-result-menu');
    expect(callbacks.onExitToMenu).toHaveBeenCalledTimes(2);
  });

  it('reports settings changes and reflects them in the form', () => {
    const callbacks = makeCallbacks();
    const ui = new UIManager(callbacks, defaultSettings());
    ui.showScreen('settings');

    const master = document.getElementById('set-master') as HTMLInputElement;
    master.value = '20';
    master.dispatchEvent(new Event('input', { bubbles: true }));
    expect(callbacks.onSettingsChanged).toHaveBeenCalled();
    const last = callbacks.onSettingsChanged.mock.calls.at(-1)?.[0];
    expect(last?.masterVolume).toBeCloseTo(0.2);
    expect(document.getElementById('out-master')?.textContent).toBe('20%');

    document
      .querySelector<HTMLButtonElement>('[data-quality="low"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('[data-quality="low"]')?.getAttribute('aria-checked')).toBe(
      'true',
    );

    // Vibration ships off (support is unreliable), so one click turns it on.
    expect(document.getElementById('set-vibration')?.getAttribute('aria-checked')).toBe('false');
    click('set-vibration');
    expect(document.getElementById('set-vibration')?.getAttribute('aria-checked')).toBe('true');
    expect(document.getElementById('out-vibration')?.textContent).toBe('פעיל');
  });

  it('exposes every accessibility toggle and reports the change', () => {
    const callbacks = makeCallbacks();
    const ui = new UIManager(callbacks, defaultSettings());
    ui.showScreen('settings');

    for (const [id, read] of [
      ['set-contrast', (s: GameSettings) => s.accessibility.highContrast],
      ['set-flashes', (s: GameSettings) => s.accessibility.reduceFlashes],
      ['set-motion', (s: GameSettings) => s.accessibility.reduceCameraMotion],
      ['set-captions', (s: GameSettings) => s.accessibility.audioCaptions],
    ] as const) {
      click(id);
      const last = callbacks.onSettingsChanged.mock.calls.at(-1)?.[0];
      expect(last, `${id} reported no change`).toBeDefined();
      expect(read(last as GameSettings), `${id} did not flip`).toBe(true);
      expect(document.getElementById(id)?.getAttribute('aria-checked')).toBe('true');
    }
  });

  it('applies accessibility choices to the document so the stylesheet can react', () => {
    const ui = new UIManager(makeCallbacks(), defaultSettings());
    ui.applySettingsToForm({
      ...defaultSettings(),
      accessibility: {
        highContrast: true,
        reduceFlashes: true,
        reduceCameraMotion: true,
        hudScale: 'large',
        audioCaptions: true,
        muteQuickChat: true,
      },
    });
    expect(document.documentElement.dataset.contrast).toBe('high');
    expect(document.documentElement.dataset.hudScale).toBe('large');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
  });

  it('round-trips settings through the real localStorage', () => {
    const settings = { ...defaultSettings(), quality: 'high' as const, masterVolume: 0.1 };
    expect(saveSettings(settings)).toBe(true);
    expect(loadSettings()).toEqual(settings);

    const ui = new UIManager(makeCallbacks(), loadSettings());
    ui.showScreen('settings');
    expect(document.querySelector('[data-quality="high"]')?.getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(document.getElementById('out-master')?.textContent).toBe('10%');
  });

  it('renders the HUD from match state', () => {
    const ui = new UIManager(makeCallbacks(), defaultSettings());
    const state = createMatchState();
    state.phase = 'playing';
    state.score.home = 5;
    state.score.away = 2;
    state.timeRemaining = 61;
    state.players[0]!.stamina = GameConfig.player.staminaMax / 2;

    // The HUD reads where the shot is aimed, not a flat/lofted flag.
    state.players[0]!.verticalAim = 0.9;
    ui.updateHud(state, [0.5]);

    expect(document.getElementById('hud-score-home')?.textContent).toBe('5');
    expect(document.getElementById('hud-score-away')?.textContent).toBe('2');
    expect(document.getElementById('hud-clock')?.textContent).toBe('1:01');
    expect(document.getElementById('meter-power')?.style.width).toBe('50%');
    expect(document.getElementById('meter-stamina')?.style.width).toBe('50%');
    expect(document.getElementById('hud-shot-type')?.textContent).toBe('בעיטה מוגבהת');
  });

  it('shows a scoring banner naming the scorer', () => {
    const ui = new UIManager(makeCallbacks(), defaultSettings());
    ui.showEvent('junction', 5, 'דנה', 0);
    expect(document.getElementById('hud-event')?.hidden).toBe(false);
    expect(document.getElementById('hud-event-scorer')?.textContent).toBe('דנה');
    expect(document.getElementById('hud-event-kind')?.textContent).toBe('חיבור!');
    expect(document.getElementById('hud-event-points')?.textContent).toBe('+5 נקודות');
  });

  it('labels an own goal instead of crediting a scorer', () => {
    const ui = new UIManager(makeCallbacks(), defaultSettings());
    ui.showEvent('goal', 1, 'דנה', 0, true);
    expect(document.getElementById('hud-event-scorer')?.textContent).toBe('שער עצמי');
  });

  it('shows win, loss and draw on the result screen', () => {
    const ui = new UIManager(makeCallbacks(), defaultSettings());

    ui.showResult('homeWin', 7, 3);
    expect(document.getElementById('result-title')?.textContent).toBe('ניצחון');
    expect(document.getElementById('result-score')?.textContent).toBe('7 : 3');
    expect(document.getElementById('screen-result')?.classList.contains('is-hidden')).toBe(false);

    ui.showResult('awayWin', 1, 4);
    expect(document.getElementById('result-title')?.textContent).toBe('הפסד');

    ui.showResult('draw', 2, 2);
    expect(document.getElementById('result-title')?.textContent).toBe('תיקו');
  });

  it('toggles the rotate notice and the loading bar', () => {
    const ui = new UIManager(makeCallbacks(), defaultSettings());

    ui.setRotateNoticeVisible(true);
    expect(document.getElementById('rotate-notice')?.classList.contains('is-hidden')).toBe(false);
    ui.setRotateNoticeVisible(false);
    expect(document.getElementById('rotate-notice')?.classList.contains('is-hidden')).toBe(true);

    ui.setLoadingProgress(0.42, 'בונה את המגרש');
    expect(document.getElementById('loading-fill')?.style.width).toBe('42%');
    expect(document.getElementById('loading-status')?.textContent).toBe('בונה את המגרש');
  });
});

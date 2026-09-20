// @vitest-environment jsdom
/**
 * The full local two-player journey, driven through the real index.html and the
 * real UIManager:
 *
 *   main menu → local match → assign two devices → start → pause → resume →
 *   full time → rematch
 *
 * The 3D engine is not involved, so this runs in milliseconds and still fails
 * if a screen, a button or a callback goes missing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { UIManager, type LobbySlotView, type UICallbacks } from '../src/ui/UIManager';
import { defaultSettings } from '../src/core/Settings';
import { createMatchState } from '../src/game/MatchState';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const BODY =
  /<body>([\s\S]*)<\/body>/.exec(html)?.[1]?.replace(/<script[\s\S]*?<\/script>/g, '') ?? '';

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

function visible(id: string): boolean {
  return !document.getElementById(id)?.classList.contains('is-hidden');
}

function slot(
  index: 1 | 2,
  deviceLabel: string | null,
  name = `שחקן ${index}`,
  canJoinByTouch = false,
): LobbySlotView {
  return {
    index,
    name,
    colorId: index - 1,
    deviceLabel,
    attackingLabel: index === 1 ? 'תוקף את השער הצפוני' : 'תוקף את השער הדרומי',
    canJoinByTouch,
  };
}

describe('local two-player flow', () => {
  let callbacks: MockedCallbacks;
  let ui: UIManager;

  beforeEach(() => {
    document.documentElement.lang = 'he';
    document.documentElement.dir = 'rtl';
    document.body.innerHTML = BODY;
    localStorage.clear();
    callbacks = makeCallbacks();
    ui = new UIManager(callbacks, defaultSettings());
  });

  it('walks the whole journey from menu to rematch', () => {
    // 1. Main menu.
    ui.showScreen('menu');
    expect(visible('screen-menu')).toBe(true);

    // 2. Choose the local match.
    click('btn-play-local');
    expect(callbacks.onLocalPlayPressed).toHaveBeenCalledTimes(1);
    ui.showScreen('lobby');
    expect(visible('screen-lobby')).toBe(true);

    // 3. Nobody has joined: starting is refused.
    ui.renderLobby([slot(1, null), slot(2, null)], false, null);
    expect((document.getElementById('btn-lobby-start') as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById('lobby-status-1')?.textContent).toContain('ממתין');

    // 4. One device joins: still refused.
    ui.renderLobby([slot(1, 'מקלדת — צד שמאל'), slot(2, null)], false, null);
    expect((document.getElementById('btn-lobby-start') as HTMLButtonElement).disabled).toBe(true);

    // 5. Both joined: starting opens up.
    ui.renderLobby(
      [slot(1, 'מקלדת — צד שמאל', 'דנה'), slot(2, 'מקלדת — צד ימין', 'יואב')],
      true,
      null,
    );
    expect((document.getElementById('btn-lobby-start') as HTMLButtonElement).disabled).toBe(false);
    expect(document.getElementById('lobby-status-2')?.textContent).toContain('מקלדת — צד ימין');
    expect(document.getElementById('lobby-badge-1')?.textContent).toBe('דנה');

    // 6. Start the match.
    click('btn-lobby-start');
    expect(callbacks.onLobbyStart).toHaveBeenCalledTimes(1);
    ui.showScreen(null);
    ui.setHudVisible(true);
    ui.setTwoPlayerHud(true);
    expect(visible('hud')).toBe(true);
    expect(visible('hud-meters-2')).toBe(true);

    // 7. Either player can pause.
    click('btn-pause');
    expect(callbacks.onPauseRequested).toHaveBeenCalledTimes(1);
    ui.showScreen('pause');
    expect(visible('screen-pause')).toBe(true);

    // 8. Resume runs a countdown before play restarts.
    click('btn-resume');
    expect(callbacks.onResume).toHaveBeenCalledTimes(1);
    ui.showScreen(null);
    ui.showResumeCountdown(3);
    expect(visible('resume-countdown')).toBe(true);
    expect(document.getElementById('resume-countdown')?.textContent).toBe('3');
    ui.showResumeCountdown(null);
    expect(visible('resume-countdown')).toBe(false);

    // 9. Full time, with the winner named.
    ui.setHudVisible(false);
    ui.showResult('homeWin', 7, 3, { home: 'דנה', away: 'יואב' });
    expect(visible('screen-result')).toBe(true);
    expect(document.getElementById('result-title')?.textContent).toBe('דנה מנצח');
    expect(document.getElementById('result-score')?.textContent).toBe('7 : 3');

    // 10. Rematch.
    click('btn-rematch');
    expect(callbacks.onRestart).toHaveBeenCalledTimes(1);
  });

  it('names the second player as the winner when they win', () => {
    ui.showResult('awayWin', 2, 9, { home: 'דנה', away: 'יואב' });
    expect(document.getElementById('result-title')?.textContent).toBe('יואב מנצח');
  });

  it('shows a plain draw with no winner named', () => {
    ui.showResult('draw', 4, 4, { home: 'דנה', away: 'יואב' });
    expect(document.getElementById('result-title')?.textContent).toBe('תיקו');
  });

  it('keeps the single-player result wording when there is no second person', () => {
    ui.showResult('homeWin', 5, 1);
    expect(document.getElementById('result-title')?.textContent).toBe('ניצחון');
  });

  it('reports a name change and a colour choice from the lobby', () => {
    ui.showScreen('lobby');
    ui.renderLobby([slot(1, 'מקלדת — צד שמאל'), slot(2, 'מקלדת — צד ימין')], true, null);

    const input = document.getElementById('lobby-name-1') as HTMLInputElement;
    input.value = 'דנה';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(callbacks.onLobbyName).toHaveBeenCalledWith(1, 'דנה');

    const swatch = document.querySelector('#kit-picker-2 [data-kit="3"]') as HTMLButtonElement;
    swatch.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(callbacks.onLobbyColor).toHaveBeenCalledWith(2, 3);
  });

  it('offers a kit swatch per colour, each labelled in words as well', () => {
    const swatches = document.querySelectorAll('#kit-picker-1 [data-kit]');
    expect(swatches.length).toBeGreaterThanOrEqual(4);
    for (const swatch of swatches) {
      // The name is shown, so choosing never depends on colour vision alone.
      expect(swatch.textContent?.trim().length).toBeGreaterThan(0);
      expect(swatch.getAttribute('aria-label')?.length).toBeGreaterThan(0);
    }
  });

  it('lets a player release their device and swap sides', () => {
    ui.showScreen('lobby');
    ui.renderLobby([slot(1, 'בקר 1'), slot(2, 'בקר 2')], true, null);

    expect(visible('lobby-leave-1')).toBe(true);
    click('lobby-leave-1');
    expect(callbacks.onLobbyLeave).toHaveBeenCalledWith(1);

    click('btn-lobby-swap');
    expect(callbacks.onLobbySwapSides).toHaveBeenCalledTimes(1);
  });

  it('offers a touch join on a touch device, so a phone is not a dead end', () => {
    ui.showScreen('lobby');
    ui.renderLobby([slot(1, null, 'שחקן 1', true), slot(2, null, 'שחקן 2', true)], false, null);

    expect(visible('lobby-touch-1')).toBe(true);
    expect(visible('lobby-touch-2')).toBe(true);

    click('lobby-touch-1');
    expect(callbacks.onLobbyTouchJoin).toHaveBeenCalledWith(1);
  });

  it('hides the touch join where there is no touch screen', () => {
    ui.showScreen('lobby');
    ui.renderLobby([slot(1, null), slot(2, null)], false, null);
    expect(visible('lobby-touch-1')).toBe(false);
  });

  it('hides the touch join once the slot is filled', () => {
    ui.showScreen('lobby');
    ui.renderLobby(
      [slot(1, 'מגע — צד שמאל', 'שחקן 1', true), slot(2, null, 'שחקן 2', true)],
      false,
      null,
    );
    expect(visible('lobby-touch-1')).toBe(false);
    expect(visible('lobby-touch-2')).toBe(true);
  });

  it('hides the release button while a slot is still empty', () => {
    ui.showScreen('lobby');
    ui.renderLobby([slot(1, null), slot(2, null)], false, null);
    expect(visible('lobby-leave-1')).toBe(false);
  });

  it('surfaces a notice when the same device tries to join twice', () => {
    ui.showScreen('lobby');
    ui.renderLobby([slot(1, 'בקר 1'), slot(2, null)], false, 'בקר 1 כבר משויך לשחקן אחר.');
    expect(visible('lobby-notice')).toBe(true);
    expect(document.getElementById('lobby-notice')?.textContent).toContain('כבר משויך');
  });

  it('tells each player which goal they attack', () => {
    ui.showScreen('lobby');
    ui.renderLobby([slot(1, 'בקר 1'), slot(2, 'בקר 2')], true, null);
    expect(document.getElementById('lobby-goal-1')?.textContent).toContain('השער');
    expect(document.getElementById('lobby-goal-2')?.textContent).toContain('השער');
    expect(document.getElementById('lobby-goal-1')?.textContent).not.toBe(
      document.getElementById('lobby-goal-2')?.textContent,
    );
  });

  it('shows the controls primer once and reports the dismissal', () => {
    ui.renderPrimer([
      { title: 'שחקן 1 — מקלדת', rows: [['W A S D', 'תנועה']] },
      { title: 'שחקן 2 — מקלדת', rows: [['← ↑ ↓ →', 'תנועה']] },
    ]);
    ui.showScreen('primer');
    expect(visible('screen-primer')).toBe(true);
    expect(document.getElementById('primer-body')?.textContent).toContain('שחקן 2');

    click('btn-primer-ok');
    expect(callbacks.onPrimerDismissed).toHaveBeenCalledTimes(1);
  });

  it('blocks resuming until the controller is back, then allows it', () => {
    ui.showScreen('reconnect');
    ui.setReconnectMessage('דנה: בקר 1 התנתק.', false);
    const resumeButton = document.getElementById('btn-reconnect-resume') as HTMLButtonElement;
    expect(resumeButton.disabled).toBe(true);
    expect(document.getElementById('reconnect-message')?.textContent).toContain('התנתק');

    ui.setReconnectMessage('דנה: בקר 1 חובר מחדש.', true);
    expect(resumeButton.disabled).toBe(false);
    click('btn-reconnect-resume');
    expect(callbacks.onReconnectResume).toHaveBeenCalledTimes(1);
  });

  it('only hands a player to the computer when explicitly asked', () => {
    ui.showScreen('reconnect');
    ui.setReconnectMessage('בקר התנתק.', false);
    // Nothing has happened yet just by showing the screen.
    expect(callbacks.onReconnectUseAi).not.toHaveBeenCalled();

    click('btn-reconnect-ai');
    expect(callbacks.onReconnectUseAi).toHaveBeenCalledTimes(1);
  });

  it('shows two power meters, one per player, with their own names', () => {
    const state = createMatchState();
    state.phase = 'playing';
    state.players[0]!.isHuman = true;
    state.players[1]!.isHuman = true;
    state.players[0]!.name = 'דנה';
    state.players[1]!.name = 'יואב';
    state.players[1]!.verticalAim = 0.9;

    ui.setTwoPlayerHud(true);
    ui.updateHud(state, [0.25, 0.75]);

    expect(document.getElementById('hud-meters-name-1')?.textContent).toBe('דנה');
    expect(document.getElementById('hud-meters-name-2')?.textContent).toBe('יואב');
    expect(document.getElementById('meter-power')?.style.width).toBe('25%');
    expect(document.getElementById('meter-power-2')?.style.width).toBe('75%');
    expect(document.getElementById('hud-shot-type')?.textContent).toBe('בעיטה שטוחה');
    expect(document.getElementById('hud-shot-type-2')?.textContent).toBe('בעיטה מוגבהת');
  });

  it('edits a key binding through the editor', () => {
    ui.showScreen('bindings');
    const firstKey = document.querySelector('.bindings__key') as HTMLButtonElement;
    expect(firstKey).not.toBeNull();

    firstKey.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ui.isCapturingKey).toBe(true);
    expect(firstKey.textContent).toContain('לחץ');

    expect(ui.captureKey('KeyZ')).toBe(true);
    expect(callbacks.onBindingsChanged).toHaveBeenCalledWith('keyboard-left', 'up', 'KeyZ');
    expect(ui.isCapturingKey).toBe(false);
  });

  it('cancels a key capture on Escape without changing anything', () => {
    ui.showScreen('bindings');
    (document.querySelector('.bindings__key') as HTMLButtonElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(ui.captureKey('Escape')).toBe(true);
    expect(callbacks.onBindingsChanged).not.toHaveBeenCalled();
  });

  it('warns when a binding change creates a duplicate', () => {
    const settings = defaultSettings();
    settings.keyBindings.right.shoot = ['KeyF']; // already player 1's shoot key
    ui.applySettingsToForm(settings);
    ui.showScreen('bindings');

    expect(visible('bindings-warning')).toBe(true);
    expect(document.getElementById('bindings-warning')?.textContent).toContain('F');
  });

  it('resets the bindings on request', () => {
    ui.showScreen('bindings');
    click('btn-bindings-reset');
    expect(callbacks.onBindingsReset).toHaveBeenCalledTimes(1);
  });

  it('shows and dismisses the small-screen advice without blocking play', () => {
    ui.showSmallScreenAdvice();
    expect(visible('small-screen-advice')).toBe(true);
    // It is a status message, never a dialog.
    expect(document.getElementById('small-screen-advice')?.getAttribute('role')).toBe('status');
    click('btn-advice-close');
    expect(visible('small-screen-advice')).toBe(false);
  });
});

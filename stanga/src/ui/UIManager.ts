/**
 * UIManager — owns every DOM screen, the HUD and the settings form.
 * It never touches the simulation: it receives state and emits intent.
 */
import type { Difficulty, QualityLevel, ScoreKind } from '../config/GameConfig';
import { GameConfig } from '../config/GameConfig';
import type { GameSettings } from '../core/Settings';
import { formatClock } from '../game/MatchRules';
import type { MatchOutcome, MatchState } from '../game/MatchState';
import { OUTCOME_DETAILS, OUTCOME_TITLES, SCORE_KIND_LABELS, pointsLabel } from './labels';

export type ScreenName = 'loading' | 'menu' | 'difficulty' | 'settings' | 'pause' | 'result';

export interface UICallbacks {
  onPlayPressed: () => void;
  onStartMatch: (difficulty: Difficulty) => void;
  onResume: () => void;
  onRestart: () => void;
  onExitToMenu: () => void;
  onPauseRequested: () => void;
  onSettingsChanged: (settings: GameSettings) => void;
  onInteraction: () => void;
  onReload: () => void;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`UI element #${id} is missing from index.html`);
  return element as T;
}

export class UIManager {
  private readonly screens: Record<ScreenName, HTMLElement>;
  private readonly hud: HTMLElement;
  private readonly rotateNotice: HTMLElement;
  private readonly fatal: HTMLElement;

  private readonly scoreHome: HTMLElement;
  private readonly scoreAway: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly eventBanner: HTMLElement;
  private readonly eventKind: HTMLElement;
  private readonly eventPoints: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly powerFill: HTMLElement;
  private readonly staminaFill: HTMLElement;
  private readonly shotType: HTMLElement;

  private readonly loadingFill: HTMLElement;
  private readonly loadingStatus: HTMLElement;
  private readonly resultTitle: HTMLElement;
  private readonly resultScore: HTMLElement;
  private readonly resultDetail: HTMLElement;

  private readonly sliders: Record<'master' | 'music' | 'sensitivity', HTMLInputElement>;
  private readonly outputs: Record<'master' | 'music' | 'sensitivity', HTMLElement>;
  private readonly vibrationToggle: HTMLButtonElement;
  private readonly vibrationState: HTMLElement;

  private settings: GameSettings;
  private difficulty: Difficulty;
  private settingsReturnTo: ScreenName = 'menu';
  private currentScreen: ScreenName | null = null;
  private lastClockText = '';
  private lastEventTick = -1;

  constructor(
    private readonly callbacks: UICallbacks,
    settings: GameSettings,
  ) {
    this.settings = { ...settings };
    this.difficulty = settings.difficulty;

    this.screens = {
      loading: requireElement('screen-loading'),
      menu: requireElement('screen-menu'),
      difficulty: requireElement('screen-difficulty'),
      settings: requireElement('screen-settings'),
      pause: requireElement('screen-pause'),
      result: requireElement('screen-result'),
    };

    this.hud = requireElement('hud');
    this.rotateNotice = requireElement('rotate-notice');
    this.fatal = requireElement('fatal-error');

    this.scoreHome = requireElement('hud-score-home');
    this.scoreAway = requireElement('hud-score-away');
    this.clock = requireElement('hud-clock');
    this.eventBanner = requireElement('hud-event');
    this.eventKind = requireElement('hud-event-kind');
    this.eventPoints = requireElement('hud-event-points');
    this.countdown = requireElement('hud-countdown');
    this.powerFill = requireElement('meter-power');
    this.staminaFill = requireElement('meter-stamina');
    this.shotType = requireElement('hud-shot-type');

    this.loadingFill = requireElement('loading-fill');
    this.loadingStatus = requireElement('loading-status');
    this.resultTitle = requireElement('result-title');
    this.resultScore = requireElement('result-score');
    this.resultDetail = requireElement('result-detail');

    this.sliders = {
      master: requireElement<HTMLInputElement>('set-master'),
      music: requireElement<HTMLInputElement>('set-music'),
      sensitivity: requireElement<HTMLInputElement>('set-sensitivity'),
    };
    this.outputs = {
      master: requireElement('out-master'),
      music: requireElement('out-music'),
      sensitivity: requireElement('out-sensitivity'),
    };
    this.vibrationToggle = requireElement<HTMLButtonElement>('set-vibration');
    this.vibrationState = requireElement('out-vibration');

    this.bindMenu();
    this.bindDifficulty();
    this.bindSettings();
    this.bindPause();
    this.bindResult();
    this.applySettingsToForm(this.settings);
  }

  // ── Screens ─────────────────────────────────────────────────────────────────

  showScreen(name: ScreenName | null): void {
    for (const [key, element] of Object.entries(this.screens)) {
      element.classList.toggle('is-hidden', key !== name);
    }
    this.currentScreen = name;
  }

  get activeScreen(): ScreenName | null {
    return this.currentScreen;
  }

  setHudVisible(visible: boolean): void {
    this.hud.classList.toggle('is-hidden', !visible);
  }

  setRotateNoticeVisible(visible: boolean): void {
    this.rotateNotice.classList.toggle('is-hidden', !visible);
  }

  showFatal(message: string): void {
    requireElement('fatal-message').textContent = message;
    this.fatal.classList.remove('is-hidden');
    this.showScreen(null);
    this.setHudVisible(false);
  }

  setLoadingProgress(ratio: number, status: string): void {
    const percent = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
    this.loadingFill.style.width = `${percent}%`;
    this.loadingStatus.textContent = status;
  }

  // ── HUD ─────────────────────────────────────────────────────────────────────

  updateHud(state: MatchState, chargeRatio: number, lofted: boolean): void {
    this.scoreHome.textContent = String(state.score.home);
    this.scoreAway.textContent = String(state.score.away);

    const clockText = formatClock(state.timeRemaining);
    if (clockText !== this.lastClockText) {
      this.clock.textContent = clockText;
      this.lastClockText = clockText;
      this.clock.classList.toggle('is-urgent', state.timeRemaining <= 15);
    }

    this.powerFill.style.width = `${Math.round(chargeRatio * 100)}%`;

    const human = state.players.find((player) => player.isHuman);
    const stamina = human ? human.stamina / GameConfig.player.staminaMax : 1;
    this.staminaFill.style.width = `${Math.round(stamina * 100)}%`;

    this.shotType.textContent = lofted ? 'בעיטה מוגבהת' : 'בעיטה שטוחה';

    if (state.phase === 'kickoff') {
      const remaining = Math.ceil(state.phaseTimer);
      this.countdown.hidden = false;
      this.countdown.textContent = remaining > 0 ? String(remaining) : 'קדימה!';
    } else if (!this.countdown.hidden) {
      this.countdown.hidden = true;
    }

    if (state.lastEvent && state.lastEvent.tick !== this.lastEventTick) {
      this.lastEventTick = state.lastEvent.tick;
      this.showEvent(state.lastEvent.kind, state.lastEvent.points);
    }
    if (state.phase !== 'celebration' && !this.eventBanner.hidden) {
      this.eventBanner.hidden = true;
    }
  }

  showEvent(kind: ScoreKind, points: number): void {
    this.eventKind.textContent = SCORE_KIND_LABELS[kind];
    this.eventPoints.textContent = `+${pointsLabel(points)}`;
    this.eventBanner.hidden = false;
  }

  showResult(outcome: MatchOutcome, home: number, away: number): void {
    this.resultTitle.textContent = OUTCOME_TITLES[outcome];
    this.resultScore.textContent = `${home} : ${away}`;
    this.resultDetail.textContent = OUTCOME_DETAILS[outcome];
    this.showScreen('result');
  }

  resetHud(): void {
    this.lastClockText = '';
    this.lastEventTick = -1;
    this.eventBanner.hidden = true;
    this.countdown.hidden = true;
    this.powerFill.style.width = '0%';
  }

  // ── Bindings ────────────────────────────────────────────────────────────────

  private bindMenu(): void {
    this.onClick('btn-play', () => {
      this.callbacks.onInteraction();
      this.callbacks.onPlayPressed();
      this.showScreen('difficulty');
    });
    this.onClick('btn-settings', () => {
      this.callbacks.onInteraction();
      this.settingsReturnTo = 'menu';
      this.showScreen('settings');
    });
  }

  private bindDifficulty(): void {
    const group = requireElement('difficulty-group');
    for (const button of group.querySelectorAll<HTMLButtonElement>('[data-difficulty]')) {
      button.addEventListener('click', () => {
        this.callbacks.onInteraction();
        this.difficulty = (button.dataset.difficulty ?? 'normal') as Difficulty;
        this.updateRadioGroup(group, 'difficulty', this.difficulty);
        this.settings = { ...this.settings, difficulty: this.difficulty };
        this.callbacks.onSettingsChanged(this.settings);
      });
    }
    this.updateRadioGroup(group, 'difficulty', this.difficulty);

    this.onClick('btn-start-match', () => {
      this.callbacks.onInteraction();
      this.callbacks.onStartMatch(this.difficulty);
    });
    this.onClick('btn-difficulty-back', () => {
      this.callbacks.onInteraction();
      this.showScreen('menu');
    });
  }

  private bindSettings(): void {
    const update = (patch: Partial<GameSettings>) => {
      this.settings = { ...this.settings, ...patch };
      this.applySettingsToForm(this.settings);
      this.callbacks.onSettingsChanged(this.settings);
    };

    this.sliders.master.addEventListener('input', () => {
      update({ masterVolume: Number(this.sliders.master.value) / 100 });
    });
    this.sliders.music.addEventListener('input', () => {
      update({ musicVolume: Number(this.sliders.music.value) / 100 });
    });
    this.sliders.sensitivity.addEventListener('input', () => {
      update({ sensitivity: Number(this.sliders.sensitivity.value) / 100 });
    });

    const qualityGroup = requireElement('quality-group');
    for (const button of qualityGroup.querySelectorAll<HTMLButtonElement>('[data-quality]')) {
      button.addEventListener('click', () => {
        this.callbacks.onInteraction();
        update({ quality: (button.dataset.quality ?? 'medium') as QualityLevel });
      });
    }

    this.vibrationToggle.addEventListener('click', () => {
      this.callbacks.onInteraction();
      update({ vibration: !this.settings.vibration });
    });

    this.onClick('btn-settings-close', () => {
      this.callbacks.onInteraction();
      this.showScreen(this.settingsReturnTo);
    });
  }

  private bindPause(): void {
    this.onClick('btn-pause', () => this.callbacks.onPauseRequested());
    this.onClick('btn-resume', () => {
      this.callbacks.onInteraction();
      this.callbacks.onResume();
    });
    this.onClick('btn-pause-settings', () => {
      this.callbacks.onInteraction();
      this.settingsReturnTo = 'pause';
      this.showScreen('settings');
    });
    this.onClick('btn-pause-restart', () => {
      this.callbacks.onInteraction();
      this.callbacks.onRestart();
    });
    this.onClick('btn-pause-menu', () => {
      this.callbacks.onInteraction();
      this.callbacks.onExitToMenu();
    });
  }

  private bindResult(): void {
    this.onClick('btn-rematch', () => {
      this.callbacks.onInteraction();
      this.callbacks.onRestart();
    });
    this.onClick('btn-result-menu', () => {
      this.callbacks.onInteraction();
      this.callbacks.onExitToMenu();
    });
    this.onClick('btn-reload', () => this.callbacks.onReload());
  }

  private onClick(id: string, handler: () => void): void {
    requireElement(id).addEventListener('click', handler);
  }

  private updateRadioGroup(group: HTMLElement, attribute: string, value: string): void {
    for (const button of group.querySelectorAll<HTMLButtonElement>(`[data-${attribute}]`)) {
      button.setAttribute('aria-checked', String(button.dataset[attribute] === value));
    }
  }

  /** Pushes stored settings into the form controls. */
  applySettingsToForm(settings: GameSettings): void {
    this.settings = { ...settings };
    this.difficulty = settings.difficulty;

    this.sliders.master.value = String(Math.round(settings.masterVolume * 100));
    this.sliders.music.value = String(Math.round(settings.musicVolume * 100));
    this.sliders.sensitivity.value = String(Math.round(settings.sensitivity * 100));

    this.outputs.master.textContent = `${Math.round(settings.masterVolume * 100)}%`;
    this.outputs.music.textContent = `${Math.round(settings.musicVolume * 100)}%`;
    this.outputs.sensitivity.textContent = settings.sensitivity.toFixed(1);

    this.vibrationToggle.setAttribute('aria-checked', String(settings.vibration));
    this.vibrationState.textContent = settings.vibration ? 'פעיל' : 'כבוי';

    this.updateRadioGroup(requireElement('quality-group'), 'quality', settings.quality);
    this.updateRadioGroup(requireElement('difficulty-group'), 'difficulty', settings.difficulty);
  }
}

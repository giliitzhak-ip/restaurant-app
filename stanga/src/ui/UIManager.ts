/**
 * UIManager — owns every DOM screen, the HUD and the forms.
 * It never touches the simulation: it receives state and emits intent.
 */
import {
  GameConfig,
  type Difficulty,
  type HudScale,
  type QualityLevel,
  type ScoreKind,
  type ShakeLevel,
} from '../config/GameConfig';
import type { GameSettings } from '../core/Settings';
import { formatClock } from '../game/MatchRules';
import type {
  MatchOutcome,
  MatchState,
  PlayerState,
  PlayerStats,
  TeamId,
} from '../game/MatchState';
import {
  QUICK_CHAT,
  QUICK_CHAT_IDS,
  isQuickChatId,
  type OnlineMode,
  type QuickChatId,
} from '../net/protocol';
import {
  ACTION_LABELS,
  BINDABLE_ACTIONS,
  findConflicts,
  ghostingRisk,
  keyLabel,
  type BindableAction,
  type KeyboardProfileId,
  type KeyMap,
} from '../input/KeyBindings';
import {
  aimedShotType,
  AUDIO_CAPTIONS,
  teamLabel,
  OUTCOME_DETAILS,
  OUTCOME_TITLES,
  SCORE_KIND_LABELS,
  SHOT_TYPE_LABELS,
  localOutcomeTitle,
  pointsLabel,
} from './labels';

export type ScreenName =
  | 'loading'
  | 'menu'
  | 'difficulty'
  | 'settings'
  | 'pause'
  | 'result'
  | 'lobby'
  | 'online'
  | 'primer'
  | 'reconnect'
  | 'bindings';

export interface LobbySlotView {
  index: 1 | 2;
  name: string;
  colorId: number;
  /** Label of the assigned device, or null while still waiting. */
  deviceLabel: string | null;
  attackingLabel: string;
  /**
   * True when this slot could be filled by tapping. A touch-only device has no
   * key to press and no button to click, so without this there is no way in.
   */
  canJoinByTouch: boolean;
}

/** One row in the online room's roster. */
export interface OnlinePlayerView {
  playerId: string;
  name: string;
  team: TeamId;
  teamLabel: string;
  slotIndex: number;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  /** True while a server-side bot is standing in for this seat. */
  isBot: boolean;
  isYou: boolean;
  roundTripMs: number | null;
}

/** One row of the end-of-match table. */
export interface ResultStatsRow {
  name: string;
  team: TeamId;
  stats: PlayerStats;
}

export interface OnlineRoomView {
  /** Already-localized line describing what the room is waiting for. */
  status: string;
  mode: OnlineMode;
  playersPerTeam: number;
  /** How many seats are taken, and how many there are. */
  seated: number;
  capacity: number;
  /** Empty while not in a private room. */
  inviteCode: string;
  inviteLink: string;
  players: readonly OnlinePlayerView[];
  /** Round-trip time in milliseconds, or null before the first pong. */
  roundTripMs: number | null;
  canReady: boolean;
  canSwitchTeam: boolean;
  canShuffle: boolean;
  /** Host of a private room with a friend in it and a seat still free. */
  canFindOpponents: boolean;
  readyLabel: string;
}

export interface UICallbacks {
  onPlayPressed: () => void;
  onLocalPlayPressed: () => void;
  onStartMatch: (difficulty: Difficulty) => void;
  onResume: () => void;
  onRestart: () => void;
  onExitToMenu: () => void;
  onPauseRequested: () => void;
  onSettingsChanged: (settings: GameSettings) => void;
  onInteraction: () => void;
  onReload: () => void;
  onLobbyStart: () => void;
  onLobbySwapSides: () => void;
  onLobbyLeave: (index: 1 | 2) => void;
  /** The player asked to take the touch half of the screen for this slot. */
  onLobbyTouchJoin: (index: 1 | 2) => void;
  onLobbyName: (index: 1 | 2, name: string) => void;
  onLobbyColor: (index: 1 | 2, colorId: number) => void;
  onOnlinePlayPressed: (mode: OnlineMode) => void;
  onOnlineQuickMatch: (displayName: string) => void;
  onOnlineCreateRoom: (displayName: string) => void;
  onOnlineJoinRoom: (displayName: string, code: string) => void;
  onOnlineReady: () => void;
  onOnlineLeave: () => void;
  onOnlineTeamSwitch: (team: TeamId) => void;
  onOnlineShuffleTeams: () => void;
  /** Ask the server to throw this private room open to matchmaking. */
  onOnlineFindOpponents: () => void;
  onOnlineSurrender: () => void;
  onOnlineQuickChat: (id: QuickChatId) => void;
  onPrimerDismissed: () => void;
  onReconnectResume: () => void;
  onReconnectUseAi: () => void;
  onBindingsChanged: (profile: KeyboardProfileId, action: BindableAction, code: string) => void;
  onBindingsReset: () => void;
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
  private readonly advice: HTMLElement;
  private readonly resumeCountdown: HTMLElement;

  private readonly scoreHome: HTMLElement;
  private readonly scoreAway: HTMLElement;
  private readonly nameHome: HTMLElement;
  private readonly nameAway: HTMLElement;
  private readonly swatchHome: HTMLElement;
  private readonly swatchAway: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly eventBanner: HTMLElement;
  private readonly eventScorer: HTMLElement;
  private readonly eventKind: HTMLElement;
  private readonly eventPoints: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly touchBadge: HTMLElement;
  private readonly touchDot: HTMLElement;
  private readonly touchText: HTMLElement;
  private readonly chatFeed: HTMLElement;
  private readonly meters: {
    root: HTMLElement;
    name: HTMLElement;
    power: HTMLElement;
    stamina: HTMLElement;
    shotType: HTMLElement;
  }[];

  private readonly loadingFill: HTMLElement;
  private readonly loadingStatus: HTMLElement;
  private readonly resultTitle: HTMLElement;
  private readonly resultScore: HTMLElement;
  private readonly resultDetail: HTMLElement;

  private readonly sliders: Record<
    'master' | 'music' | 'sensitivity' | 'deadzone' | 'aimassist',
    HTMLInputElement
  >;
  private readonly outputs: Record<
    'master' | 'music' | 'sensitivity' | 'deadzone' | 'aimassist',
    HTMLElement
  >;
  private readonly toggles: Record<
    'vibration' | 'contrast' | 'flashes' | 'motion' | 'captions' | 'quickChat',
    { button: HTMLButtonElement; state: HTMLElement }
  >;

  private settings: GameSettings;
  private difficulty: Difficulty;
  private settingsReturnTo: ScreenName = 'menu';
  private currentScreen: ScreenName | null = null;
  private lastClockText = '';
  private lastEventTick = -1;
  private lastViolationTick = -1;
  private captionTimer: number | null = null;
  private chatTimer: number | null = null;
  private adviceTimer: number | null = null;
  /** Action currently waiting for a key press in the bindings editor. */
  private captureTarget: { profile: KeyboardProfileId; action: BindableAction } | null = null;
  private inviteLink = '';
  /** Which team the switch button would move you to, decided at render time. */
  private pendingTeamSwitch: TeamId = 'away';

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
      lobby: requireElement('screen-lobby'),
      online: requireElement('screen-online'),
      primer: requireElement('screen-primer'),
      reconnect: requireElement('screen-reconnect'),
      bindings: requireElement('screen-bindings'),
    };

    this.hud = requireElement('hud');
    this.rotateNotice = requireElement('rotate-notice');
    this.fatal = requireElement('fatal-error');
    this.advice = requireElement('small-screen-advice');
    this.resumeCountdown = requireElement('resume-countdown');

    this.scoreHome = requireElement('hud-score-home');
    this.scoreAway = requireElement('hud-score-away');
    this.nameHome = requireElement('hud-name-home');
    this.nameAway = requireElement('hud-name-away');
    this.swatchHome = requireElement('hud-swatch-home');
    this.swatchAway = requireElement('hud-swatch-away');
    this.clock = requireElement('hud-clock');
    this.eventBanner = requireElement('hud-event');
    this.eventScorer = requireElement('hud-event-scorer');
    this.eventKind = requireElement('hud-event-kind');
    this.eventPoints = requireElement('hud-event-points');
    this.countdown = requireElement('hud-countdown');
    this.caption = requireElement('hud-caption');
    this.touchBadge = requireElement('hud-touch');
    this.touchDot = requireElement('hud-touch-dot');
    this.touchText = requireElement('hud-touch-text');
    this.chatFeed = requireElement('hud-chat');

    this.meters = [
      {
        root: requireElement('hud-meters-1'),
        name: requireElement('hud-meters-name-1'),
        power: requireElement('meter-power'),
        stamina: requireElement('meter-stamina'),
        shotType: requireElement('hud-shot-type'),
      },
      {
        root: requireElement('hud-meters-2'),
        name: requireElement('hud-meters-name-2'),
        power: requireElement('meter-power-2'),
        stamina: requireElement('meter-stamina-2'),
        shotType: requireElement('hud-shot-type-2'),
      },
    ];

    this.loadingFill = requireElement('loading-fill');
    this.loadingStatus = requireElement('loading-status');
    this.resultTitle = requireElement('result-title');
    this.resultScore = requireElement('result-score');
    this.resultDetail = requireElement('result-detail');

    this.sliders = {
      master: requireElement<HTMLInputElement>('set-master'),
      music: requireElement<HTMLInputElement>('set-music'),
      sensitivity: requireElement<HTMLInputElement>('set-sensitivity'),
      deadzone: requireElement<HTMLInputElement>('set-deadzone'),
      aimassist: requireElement<HTMLInputElement>('set-aimassist'),
    };
    this.outputs = {
      master: requireElement('out-master'),
      music: requireElement('out-music'),
      sensitivity: requireElement('out-sensitivity'),
      deadzone: requireElement('out-deadzone'),
      aimassist: requireElement('out-aimassist'),
    };
    this.toggles = {
      vibration: {
        button: requireElement<HTMLButtonElement>('set-vibration'),
        state: requireElement('out-vibration'),
      },
      contrast: {
        button: requireElement<HTMLButtonElement>('set-contrast'),
        state: requireElement('out-contrast'),
      },
      flashes: {
        button: requireElement<HTMLButtonElement>('set-flashes'),
        state: requireElement('out-flashes'),
      },
      motion: {
        button: requireElement<HTMLButtonElement>('set-motion'),
        state: requireElement('out-motion'),
      },
      captions: {
        button: requireElement<HTMLButtonElement>('set-captions'),
        state: requireElement('out-captions'),
      },
      quickChat: {
        button: requireElement<HTMLButtonElement>('set-quickchat'),
        state: requireElement('out-quickchat'),
      },
    };

    this.buildKitPickers();
    this.bindMenu();
    this.bindDifficulty();
    this.bindSettings();
    this.bindPause();
    this.bindResult();
    this.bindLobby();
    this.bindOnline();
    this.bindPrimer();
    this.bindReconnect();
    this.bindBindings();
    this.applySettingsToForm(this.settings);
  }

  // ── Screens ─────────────────────────────────────────────────────────────────

  showScreen(name: ScreenName | null): void {
    for (const [key, element] of Object.entries(this.screens)) {
      element.classList.toggle('is-hidden', key !== name);
    }
    this.currentScreen = name;
    if (name === 'bindings') this.renderBindings();
  }

  get activeScreen(): ScreenName | null {
    return this.currentScreen;
  }

  setHudVisible(visible: boolean): void {
    this.hud.classList.toggle('is-hidden', !visible);
  }

  /** Shows the second player's meters only in a two-human match. */
  setTwoPlayerHud(enabled: boolean): void {
    this.meters[1]?.root.classList.toggle('is-hidden', !enabled);
  }

  setRotateNoticeVisible(visible: boolean): void {
    this.rotateNotice.classList.toggle('is-hidden', !visible);
  }

  /** Non-blocking advice for a cramped screen. Dismissible, never modal. */
  showSmallScreenAdvice(): void {
    this.advice.classList.remove('is-hidden');
    if (this.adviceTimer !== null) window.clearTimeout(this.adviceTimer);
    this.adviceTimer = window.setTimeout(() => {
      this.advice.classList.add('is-hidden');
    }, 9000);
  }

  hideSmallScreenAdvice(): void {
    this.advice.classList.add('is-hidden');
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

  /** Big number shown while play restarts after a pause. */
  showResumeCountdown(value: number | null): void {
    if (value === null) {
      this.resumeCountdown.classList.add('is-hidden');
      return;
    }
    this.resumeCountdown.classList.remove('is-hidden');
    this.resumeCountdown.textContent = value > 0 ? String(value) : 'קדימה!';
  }

  // ── HUD ─────────────────────────────────────────────────────────────────────

  updateHud(state: MatchState, charges: readonly number[]): void {
    this.scoreHome.textContent = String(state.score.home);
    this.scoreAway.textContent = String(state.score.away);

    const home = state.players.find((player) => player.team === 'home');
    const away = state.players.find((player) => player.team === 'away');
    if (home) {
      this.nameHome.textContent = home.name;
      this.swatchHome.style.background = kitColor(home.colorId);
    }
    if (away) {
      this.nameAway.textContent = away.name;
      this.swatchAway.style.background = kitColor(away.colorId);
    }

    const clockText = formatClock(state.timeRemaining);
    if (clockText !== this.lastClockText) {
      this.clock.textContent = clockText;
      this.lastClockText = clockText;
      this.clock.classList.toggle('is-urgent', state.timeRemaining <= 15);
    }

    const humans = state.players.filter((player) => player.isHuman);
    for (let i = 0; i < this.meters.length; i += 1) {
      const meter = this.meters[i];
      const player = humans[i];
      if (!meter || !player) continue;
      this.renderMeter(meter, player, charges[i] ?? 0);
    }

    if (state.phase === 'kickoff') {
      const remaining = Math.ceil(state.phaseTimer);
      this.countdown.hidden = false;
      this.countdown.textContent = remaining > 0 ? String(remaining) : 'קדימה!';
    } else if (!this.countdown.hidden) {
      this.countdown.hidden = true;
    }

    if (state.lastEvent && state.lastEvent.tick !== this.lastEventTick) {
      this.lastEventTick = state.lastEvent.tick;
      const scorer = state.players.find((player) => player.id === state.lastEvent?.playerId);
      this.showEvent(
        state.lastEvent.kind,
        state.lastEvent.points,
        scorer?.name ?? null,
        scorer?.colorId ?? null,
        state.lastEvent.ownGoal,
      );
    }
    if (state.lastViolation && state.lastViolation.tick !== this.lastViolationTick) {
      this.lastViolationTick = state.lastViolation.tick;
      const offender = state.players.find((player) => player.id === state.lastViolation?.playerId);
      this.showViolation(offender?.name ?? null, teamLabel(state.lastViolation.restartTeam));
    }
    // The banner belongs to whatever stopped play; once play resumes it goes.
    if (state.phase !== 'celebration' && state.phase !== 'violation' && !this.eventBanner.hidden) {
      this.eventBanner.hidden = true;
      this.eventBanner.classList.remove('is-violation');
    }
  }

  private renderMeter(
    meter: (typeof this.meters)[number],
    player: PlayerState,
    charge: number,
  ): void {
    meter.name.textContent = player.name;
    meter.name.style.color = kitColor(player.colorId);
    meter.power.style.width = `${Math.round(charge * 100)}%`;
    meter.stamina.style.width = `${Math.round(
      (player.stamina / GameConfig.player.staminaMax) * 100,
    )}%`;
    // What this player's next strike would be, given where they are aiming.
    meter.shotType.textContent = SHOT_TYPE_LABELS[aimedShotType(player)];
  }

  showEvent(
    kind: ScoreKind,
    points: number,
    scorerName: string | null,
    colorId: number | null,
    ownGoal = false,
  ): void {
    this.eventScorer.textContent = ownGoal ? 'שער עצמי' : (scorerName ?? '');
    this.eventScorer.style.color = colorId === null ? '' : kitColor(colorId);
    this.eventKind.textContent = SCORE_KIND_LABELS[kind];
    this.eventPoints.textContent = `+${pointsLabel(points)}`;
    this.eventBanner.hidden = false;
  }

  /** Written stand-in for an audio cue, for players who cannot rely on sound. */
  /**
   * Shows whose turn it is to touch the ball.
   *
   * `null` hides it entirely, which is what happens outside live play. The
   * juggle counter is what tells a player their aerial chain is still alive.
   */
  setTouchState(view: { canTouch: boolean; juggles: number } | null): void {
    if (view === null) {
      this.touchBadge.hidden = true;
      return;
    }
    this.touchBadge.hidden = false;
    this.touchBadge.classList.toggle('is-spent', !view.canTouch);
    this.touchBadge.classList.toggle('is-juggling', view.juggles > 1);
    this.touchText.textContent = view.canTouch
      ? view.juggles > 1
        ? `הקפצות · ${view.juggles}`
        : 'הנגיעה שלך'
      : 'הנגיעה נוצלה';
    void this.touchDot;
  }

  /** Announces a touch-rule call on the same banner a goal uses. */
  showViolation(offenderName: string | null, restartTeamLabel: string): void {
    this.eventScorer.textContent = offenderName ?? '';
    this.eventScorer.style.color = '';
    this.eventKind.textContent = 'נגיעה כפולה';
    this.eventPoints.textContent = `הכדור ל${restartTeamLabel}`;
    this.eventBanner.hidden = false;
    this.eventBanner.classList.add('is-violation');
  }

  /**
   * Shows one quick-chat phrase. The id is looked up in the fixed table here,
   * so nothing a client sent can reach the DOM as text.
   */
  showQuickChat(name: string, id: QuickChatId, team: TeamId): void {
    if (this.settings.accessibility.muteQuickChat) return;
    this.chatFeed.textContent = `${name}: ${QUICK_CHAT[id]}`;
    this.chatFeed.classList.toggle('is-away', team === 'away');
    this.chatFeed.hidden = false;
    if (this.chatTimer !== null) window.clearTimeout(this.chatTimer);
    this.chatTimer = window.setTimeout(() => {
      this.chatFeed.hidden = true;
    }, 2600);
  }

  showCaption(key: string): void {
    if (!this.settings.accessibility.audioCaptions) return;
    const text = AUDIO_CAPTIONS[key];
    if (!text) return;
    this.caption.textContent = text;
    this.caption.hidden = false;
    if (this.captionTimer !== null) window.clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => {
      this.caption.hidden = true;
    }, 1400);
  }

  /**
   * One line per player on the result screen.
   *
   * Offline it comes from the local simulation; online the very same numbers
   * arrive from the server, so the two clients never show different tallies.
   */
  showResultStats(rows: readonly ResultStatsRow[]): void {
    const table = requireElement('result-stats');
    const body = requireElement('result-stats-body');
    body.replaceChildren();
    table.classList.toggle('is-hidden', rows.length === 0);
    if (rows.length === 0) return;

    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.className = row.team === 'home' ? 'is-home' : 'is-away';
      const cells = [
        row.name,
        row.stats.points,
        row.stats.ownGoals > 0 ? `${row.stats.goals} (${row.stats.ownGoals}-)` : row.stats.goals,
        row.stats.assists,
        row.stats.passes,
        row.stats.juggles,
        row.stats.violations,
      ];
      for (const value of cells) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        tr.append(cell);
      }
      body.append(tr);
    }
  }

  showResult(
    outcome: MatchOutcome,
    home: number,
    away: number,
    names?: { home: string; away: string },
  ): void {
    this.resultTitle.textContent = names
      ? localOutcomeTitle(outcome, names.home, names.away)
      : OUTCOME_TITLES[outcome];
    this.resultScore.textContent = `${home} : ${away}`;
    this.resultDetail.textContent = names
      ? outcome === 'draw'
        ? 'אף אחד לא ויתר — תיקו.'
        : 'משחק חוזר?'
      : OUTCOME_DETAILS[outcome];
    this.showScreen('result');
  }

  resetHud(): void {
    this.touchBadge.hidden = true;
    this.eventBanner.classList.remove('is-violation');
    this.lastViolationTick = -1;
    this.lastClockText = '';
    this.lastEventTick = -1;
    this.eventBanner.hidden = true;
    this.countdown.hidden = true;
    this.caption.hidden = true;
    for (const meter of this.meters) meter.power.style.width = '0%';
  }

  // ── Lobby ───────────────────────────────────────────────────────────────────

  /**
   * Online, opening this screen does not stop anything: the server keeps
   * playing. The title says so, and "משחק חדש" is hidden rather than left as a
   * button that would do nothing.
   */
  setPauseMode(online: boolean): void {
    requireElement('pause-title').textContent = online ? 'תפריט — המשחק ממשיך לרוץ' : 'המשחק מושהה';
    requireElement('btn-pause-restart').classList.toggle('is-hidden', online);
    // Surrender exists only online, and the server still decides whether a
    // vote counts — this button asks, it does not concede.
    requireElement('btn-pause-surrender').classList.toggle('is-hidden', !online);
  }

  /** The key list on the pause screen, built from the bindings in force. */
  renderPauseKeys(rows: readonly [string, string][]): void {
    const list = requireElement('pause-keys');
    list.replaceChildren();
    for (const [keys, action] of rows) {
      const item = document.createElement('li');
      const kbd = document.createElement('kbd');
      kbd.textContent = keys;
      item.append(kbd, document.createTextNode(` ${action}`));
      list.append(item);
    }
  }

  /** The in-match quick-chat row. 2×2 online only; nobody else has a partner. */
  setQuickChatVisible(visible: boolean): void {
    requireElement('hud-quickchat').classList.toggle('is-hidden', !visible);
  }

  renderLobby(slots: readonly LobbySlotView[], canStart: boolean, notice: string | null): void {
    for (const slot of slots) {
      const status = requireElement(`lobby-status-${slot.index}`);
      const badge = requireElement(`lobby-badge-${slot.index}`);
      const goal = requireElement(`lobby-goal-${slot.index}`);
      const leave = requireElement(`lobby-leave-${slot.index}`);
      const card = requireElement(`lobby-card-${slot.index}`);
      const input = requireElement<HTMLInputElement>(`lobby-name-${slot.index}`);

      badge.textContent = slot.name;
      badge.style.background = kitColor(slot.colorId);
      goal.textContent = slot.attackingLabel;
      if (document.activeElement !== input) input.value = slot.name;

      const joined = slot.deviceLabel !== null;
      status.textContent = joined ? `מחובר: ${slot.deviceLabel}` : 'ממתין לחיבור…';
      status.classList.toggle('is-joined', joined);
      card.classList.toggle('is-joined', joined);
      leave.classList.toggle('is-hidden', !joined);

      const touchJoin = requireElement(`lobby-touch-${slot.index}`);
      touchJoin.classList.toggle('is-hidden', joined || !slot.canJoinByTouch);

      this.updateKitPicker(slot.index, slot.colorId);
    }

    requireElement<HTMLButtonElement>('btn-lobby-start').disabled = !canStart;
    const noticeElement = requireElement('lobby-notice');
    noticeElement.textContent = notice ?? '';
    noticeElement.classList.toggle('is-hidden', notice === null);
  }

  setReconnectMessage(message: string, canResume: boolean): void {
    requireElement('reconnect-message').textContent = message;
    requireElement<HTMLButtonElement>('btn-reconnect-resume').disabled = !canResume;
  }

  /** Fills the one-time controls primer with the layout actually in use. */
  renderPrimer(sections: readonly { title: string; rows: readonly [string, string][] }[]): void {
    const body = requireElement('primer-body');
    body.replaceChildren();
    for (const section of sections) {
      const block = document.createElement('div');
      block.className = 'primer__block';
      const heading = document.createElement('h3');
      heading.textContent = section.title;
      block.appendChild(heading);
      const list = document.createElement('dl');
      for (const [control, action] of section.rows) {
        const dt = document.createElement('dt');
        dt.textContent = control;
        const dd = document.createElement('dd');
        dd.textContent = action;
        list.append(dt, dd);
      }
      block.appendChild(list);
      body.appendChild(block);
    }
  }

  // ── Bindings editor ─────────────────────────────────────────────────────────

  private renderBindings(): void {
    const body = requireElement('bindings-body');
    body.replaceChildren();

    const profiles: { id: KeyboardProfileId; title: string; map: KeyMap }[] = [
      { id: 'keyboard-left', title: 'שחקן 1 — צד שמאל', map: this.settings.keyBindings.left },
      { id: 'keyboard-right', title: 'שחקן 2 — צד ימין', map: this.settings.keyBindings.right },
    ];

    for (const profile of profiles) {
      const block = document.createElement('div');
      block.className = 'bindings__profile';
      const heading = document.createElement('h3');
      heading.textContent = profile.title;
      block.appendChild(heading);

      for (const action of BINDABLE_ACTIONS) {
        const row = document.createElement('div');
        row.className = 'bindings__row';

        const label = document.createElement('span');
        label.className = 'bindings__action';
        label.textContent = ACTION_LABELS[action];

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bindings__key';
        button.textContent = profile.map[action].map(keyLabel).join(' / ');
        button.setAttribute('aria-label', `שנה מקש עבור ${ACTION_LABELS[action]}`);
        button.addEventListener('click', () => {
          this.callbacks.onInteraction();
          this.beginCapture(profile.id, action, button);
        });

        row.append(label, button);
        block.appendChild(row);
      }
      body.appendChild(block);
    }

    this.renderBindingWarnings();
  }

  private beginCapture(
    profile: KeyboardProfileId,
    action: BindableAction,
    button: HTMLButtonElement,
  ): void {
    this.captureTarget = { profile, action };
    button.textContent = 'לחץ מקש…';
    button.classList.add('is-capturing');
  }

  /**
   * Feeds a raw key press into the editor.
   * Returns true when the press was consumed, so the caller can stop it from
   * reaching the game.
   */
  captureKey(code: string): boolean {
    const target = this.captureTarget;
    if (!target) return false;
    this.captureTarget = null;
    if (code !== 'Escape') {
      this.callbacks.onBindingsChanged(target.profile, target.action, code);
    }
    this.renderBindings();
    return true;
  }

  get isCapturingKey(): boolean {
    return this.captureTarget !== null;
  }

  private renderBindingWarnings(): void {
    const warning = requireElement('bindings-warning');
    const conflicts = findConflicts(
      this.settings.keyBindings.left,
      this.settings.keyBindings.right,
    );
    const messages: string[] = [];

    if (conflicts.length > 0) {
      const names = conflicts.map((conflict) => keyLabel(conflict.code)).join(', ');
      messages.push(`אותו מקש משויך ליותר מפעולה אחת: ${names}.`);
    }
    const ghost = ghostingRisk(this.settings.keyBindings.left, this.settings.keyBindings.right);
    if (ghost) messages.push(ghost);

    warning.textContent = messages.join(' ');
    warning.classList.toggle('is-hidden', messages.length === 0);
  }

  // ── Bindings of the DOM itself ──────────────────────────────────────────────

  private bindMenu(): void {
    this.onClick('btn-play', () => {
      this.callbacks.onInteraction();
      this.callbacks.onPlayPressed();
      this.showScreen('difficulty');
    });
    this.onClick('btn-play-local', () => {
      this.callbacks.onInteraction();
      this.callbacks.onLocalPlayPressed();
    });
    this.onClick('btn-play-online', () => {
      this.callbacks.onInteraction();
      // The screen first, then the callback: the game may want to put the
      // controls primer on top of it.
      this.showScreen('online');
      this.callbacks.onOnlinePlayPressed('oneVsOne');
    });
    this.onClick('btn-play-online-2v2', () => {
      this.callbacks.onInteraction();
      this.showScreen('online');
      this.callbacks.onOnlinePlayPressed('twoVsTwo');
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
    const updateAccessibility = (patch: Partial<GameSettings['accessibility']>) => {
      update({ accessibility: { ...this.settings.accessibility, ...patch } });
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
    this.sliders.deadzone.addEventListener('input', () => {
      update({ deadZone: Number(this.sliders.deadzone.value) / 100 });
    });
    this.sliders.aimassist.addEventListener('input', () => {
      update({ aimAssist: Number(this.sliders.aimassist.value) / 100 });
    });

    const qualityGroup = requireElement('quality-group');
    for (const button of qualityGroup.querySelectorAll<HTMLButtonElement>('[data-quality]')) {
      button.addEventListener('click', () => {
        this.callbacks.onInteraction();
        update({ quality: (button.dataset.quality ?? 'medium') as QualityLevel });
      });
    }

    const shakeGroup = requireElement('shake-group');
    for (const button of shakeGroup.querySelectorAll<HTMLButtonElement>('[data-shake]')) {
      button.addEventListener('click', () => {
        this.callbacks.onInteraction();
        update({ cameraShake: (button.dataset.shake ?? 'subtle') as ShakeLevel });
      });
    }

    const hudScaleGroup = requireElement('hudscale-group');
    for (const button of hudScaleGroup.querySelectorAll<HTMLButtonElement>('[data-hudscale]')) {
      button.addEventListener('click', () => {
        this.callbacks.onInteraction();
        updateAccessibility({ hudScale: (button.dataset.hudscale ?? 'normal') as HudScale });
      });
    }

    this.toggles.vibration.button.addEventListener('click', () => {
      this.callbacks.onInteraction();
      update({ vibration: !this.settings.vibration });
    });
    this.toggles.contrast.button.addEventListener('click', () => {
      this.callbacks.onInteraction();
      updateAccessibility({ highContrast: !this.settings.accessibility.highContrast });
    });
    this.toggles.flashes.button.addEventListener('click', () => {
      this.callbacks.onInteraction();
      updateAccessibility({ reduceFlashes: !this.settings.accessibility.reduceFlashes });
    });
    this.toggles.motion.button.addEventListener('click', () => {
      this.callbacks.onInteraction();
      updateAccessibility({
        reduceCameraMotion: !this.settings.accessibility.reduceCameraMotion,
      });
    });
    this.toggles.captions.button.addEventListener('click', () => {
      this.callbacks.onInteraction();
      updateAccessibility({ audioCaptions: !this.settings.accessibility.audioCaptions });
    });
    this.toggles.quickChat.button.addEventListener('click', () => {
      this.callbacks.onInteraction();
      updateAccessibility({ muteQuickChat: !this.settings.accessibility.muteQuickChat });
    });

    this.onClick('btn-settings-close', () => {
      this.callbacks.onInteraction();
      this.showScreen(this.settingsReturnTo);
    });
    this.onClick('btn-open-bindings', () => {
      this.callbacks.onInteraction();
      this.showScreen('bindings');
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
    this.onClick('btn-pause-surrender', () => {
      this.callbacks.onInteraction();
      this.callbacks.onOnlineSurrender();
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
    this.onClick('btn-advice-close', () => this.hideSmallScreenAdvice());
  }

  private bindLobby(): void {
    this.onClick('btn-lobby-start', () => {
      this.callbacks.onInteraction();
      this.callbacks.onLobbyStart();
    });
    this.onClick('btn-lobby-swap', () => {
      this.callbacks.onInteraction();
      this.callbacks.onLobbySwapSides();
    });
    this.onClick('btn-lobby-back', () => {
      this.callbacks.onInteraction();
      this.showScreen('menu');
    });
    for (const index of [1, 2] as const) {
      this.onClick(`lobby-leave-${index}`, () => {
        this.callbacks.onInteraction();
        this.callbacks.onLobbyLeave(index);
      });
      this.onClick(`lobby-touch-${index}`, () => {
        this.callbacks.onInteraction();
        this.callbacks.onLobbyTouchJoin(index);
      });
      const input = requireElement<HTMLInputElement>(`lobby-name-${index}`);
      input.addEventListener('input', () => {
        this.callbacks.onLobbyName(index, input.value);
      });
    }
  }

  private bindOnline(): void {
    this.onClick('btn-online-quick', () => {
      this.callbacks.onInteraction();
      this.callbacks.onOnlineQuickMatch(this.onlineName());
    });
    this.onClick('btn-online-create', () => {
      this.callbacks.onInteraction();
      this.callbacks.onOnlineCreateRoom(this.onlineName());
    });
    this.onClick('btn-online-join', () => {
      this.callbacks.onInteraction();
      const code = requireElement<HTMLInputElement>('online-code').value;
      this.callbacks.onOnlineJoinRoom(this.onlineName(), code);
    });
    this.onClick('btn-online-ready', () => {
      this.callbacks.onInteraction();
      this.callbacks.onOnlineReady();
    });
    this.onClick('btn-online-back', () => {
      this.callbacks.onInteraction();
      this.callbacks.onOnlineLeave();
      this.showScreen('menu');
    });
    this.onClick('btn-online-switch', () => {
      this.callbacks.onInteraction();
      this.callbacks.onOnlineTeamSwitch(this.pendingTeamSwitch);
    });
    this.onClick('btn-online-shuffle', () => {
      this.callbacks.onInteraction();
      this.callbacks.onOnlineShuffleTeams();
    });
    this.onClick('btn-online-open', () => {
      this.callbacks.onInteraction();
      this.callbacks.onOnlineFindOpponents();
    });
    this.onClick('btn-online-surrender', () => {
      this.callbacks.onInteraction();
      this.callbacks.onOnlineSurrender();
    });
    // The lobby chips are in the markup; the HUD row is built here from the
    // same list of ids, so the two can never drift apart.
    const hudChat = requireElement('hud-quickchat');
    for (const id of QUICK_CHAT_IDS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'btn btn--ghost btn--chip';
      chip.dataset.quickChat = id;
      chip.textContent = QUICK_CHAT[id];
      hudChat.append(chip);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-quick-chat]')) {
      const id = button.dataset.quickChat;
      if (!isQuickChatId(id)) continue;
      button.addEventListener('click', () => {
        this.callbacks.onInteraction();
        this.callbacks.onOnlineQuickChat(id);
      });
    }
    this.onClick('btn-online-copy', () => {
      this.callbacks.onInteraction();
      void this.copyInviteLink();
    });

    // Codes are typed in Latin on a Hebrew keyboard layout; normalise as we go
    // so the field always shows exactly what the server will be asked for.
    const code = requireElement<HTMLInputElement>('online-code');
    code.addEventListener('input', () => {
      code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
  }

  private onlineName(): string {
    return requireElement<HTMLInputElement>('online-name').value;
  }

  /** Pre-fills the name field from the saved profile. */
  setOnlineName(name: string): void {
    const input = requireElement<HTMLInputElement>('online-name');
    if (document.activeElement !== input) input.value = name;
  }

  /**
   * Titles the online screen for the mode that is about to be played, so the
   * panel never says "1 על 1" over a four-player lobby.
   */
  setOnlineMode(mode: OnlineMode): void {
    requireElement('online-title').textContent =
      mode === 'twoVsTwo' ? 'אונליין — 2 נגד 2' : 'אונליין — 1 על 1';
    requireElement('online-lead').textContent =
      mode === 'twoVsTwo'
        ? 'ארבעה שחקנים, שניים בכל קבוצה. חפשו משחק לבד, או פתחו חדר פרטי, הזמינו חבר לקבוצה שלכם ובקשו מהשרת יריבים.'
        : 'שחקו מול חבר במכשיר אחר. חפשו יריב, או פתחו חדר פרטי ושלחו קישור.';
  }

  /** Shows the entry form (search / create / join) and hides the room panel. */
  showOnlineEntry(notice: string | null = null): void {
    requireElement('online-entry').classList.remove('is-hidden');
    requireElement('online-room').classList.add('is-hidden');
    requireElement('btn-online-ready').classList.add('is-hidden');
    this.setOnlineNotice(notice);
  }

  setOnlineNotice(notice: string | null): void {
    const element = requireElement('online-notice');
    element.textContent = notice ?? '';
    element.classList.toggle('is-hidden', notice === null);
  }

  renderOnlineRoom(view: OnlineRoomView): void {
    requireElement('online-entry').classList.add('is-hidden');
    requireElement('online-room').classList.remove('is-hidden');
    requireElement('online-status').textContent = view.status;
    requireElement('online-seats').textContent = `${view.seated}/${view.capacity}`;

    const invite = requireElement('online-invite');
    invite.classList.toggle('is-hidden', view.inviteCode.length === 0);
    requireElement('online-invite-code').textContent = view.inviteCode;
    this.inviteLink = view.inviteLink;

    // Two columns, one per side, each with a row per seat. 1×1 gets the same
    // layout with one row a side, so there is only ever one lobby to maintain.
    const board = requireElement('online-teams');
    board.replaceChildren();
    for (const team of ['home', 'away'] as const) {
      const column = document.createElement('div');
      column.className = `online__team online__team--${team}`;

      const heading = document.createElement('h3');
      heading.className = 'online__team-title';
      heading.textContent = teamLabel(team);
      column.append(heading);

      for (let slot = 0; slot < view.playersPerTeam; slot += 1) {
        const player = view.players.find(
          (candidate) => candidate.team === team && candidate.slotIndex === slot,
        );
        column.append(this.renderOnlineSeat(player));
      }
      board.append(column);
    }

    requireElement('online-ping').textContent =
      view.roundTripMs === null ? '' : `השהיית רשת: ${Math.round(view.roundTripMs)} מילישניות`;

    const ready = requireElement<HTMLButtonElement>('btn-online-ready');
    ready.classList.toggle('is-hidden', !view.canReady);
    ready.textContent = view.readyLabel;

    const switchTeam = requireElement<HTMLButtonElement>('btn-online-switch');
    switchTeam.classList.toggle('is-hidden', !view.canSwitchTeam);
    const you = view.players.find((candidate) => candidate.isYou);
    switchTeam.textContent =
      you?.team === 'home' ? 'עבור לכחולים' : you?.team === 'away' ? 'עבור לכתומים' : 'החלף קבוצה';
    this.pendingTeamSwitch = you?.team === 'home' ? 'away' : 'home';

    requireElement('btn-online-shuffle').classList.toggle('is-hidden', !view.canShuffle);
    requireElement('btn-online-open').classList.toggle('is-hidden', !view.canFindOpponents);
    requireElement('online-quickchat').classList.toggle(
      'is-hidden',
      view.mode !== 'twoVsTwo' || view.seated < 2,
    );
  }

  /** One seat in the lobby: filled, or an empty chair waiting for somebody. */
  private renderOnlineSeat(player: OnlinePlayerView | undefined): HTMLElement {
    const item = document.createElement('div');
    item.className = 'online__seat';
    if (!player) {
      item.classList.add('is-empty');
      item.textContent = 'מקום פנוי';
      return item;
    }

    item.classList.toggle('is-connected', player.connected);
    item.classList.toggle('is-ready', player.ready);
    item.classList.toggle('is-you', player.isYou);

    const dot = document.createElement('span');
    dot.className = 'online__player-dot';
    const name = document.createElement('span');
    name.className = 'online__seat-name';
    name.textContent = player.isYou ? `${player.name} (אתה)` : player.name;

    const note = document.createElement('span');
    note.className = 'online__player-note';
    note.textContent = player.isBot
      ? 'בוט מחליף'
      : !player.connected
        ? 'מנותק — ממתינים לחזרה'
        : player.ready
          ? 'מוכן'
          : player.isHost
            ? 'בעל החדר'
            : '';

    item.append(dot, name, note);
    return item;
  }

  private async copyInviteLink(): Promise<void> {
    if (this.inviteLink.length === 0) return;
    try {
      await navigator.clipboard.writeText(this.inviteLink);
      this.setOnlineNotice('הקישור הועתק');
    } catch {
      // Clipboard access can be refused; showing the link is the fallback.
      this.setOnlineNotice(this.inviteLink);
    }
  }

  private bindPrimer(): void {
    this.onClick('btn-primer-ok', () => {
      this.callbacks.onInteraction();
      this.callbacks.onPrimerDismissed();
    });
  }

  private bindReconnect(): void {
    this.onClick('btn-reconnect-resume', () => {
      this.callbacks.onInteraction();
      this.callbacks.onReconnectResume();
    });
    this.onClick('btn-reconnect-ai', () => {
      this.callbacks.onInteraction();
      this.callbacks.onReconnectUseAi();
    });
    this.onClick('btn-reconnect-menu', () => {
      this.callbacks.onInteraction();
      this.callbacks.onExitToMenu();
    });
  }

  private bindBindings(): void {
    this.onClick('btn-bindings-close', () => {
      this.callbacks.onInteraction();
      this.captureTarget = null;
      this.showScreen('settings');
    });
    this.onClick('btn-bindings-reset', () => {
      this.callbacks.onInteraction();
      this.callbacks.onBindingsReset();
    });
  }

  private buildKitPickers(): void {
    for (const index of [1, 2] as const) {
      const picker = requireElement(`kit-picker-${index}`);
      picker.replaceChildren();
      for (const kit of GameConfig.kits) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'kit-swatch';
        button.dataset.kit = String(kit.id);
        button.style.background = kit.shirt;
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', 'false');
        button.setAttribute('aria-label', kit.name);
        button.title = kit.name;
        // The pattern name is shown as well, so the choice never relies on colour.
        const tag = document.createElement('span');
        tag.className = 'kit-swatch__tag';
        tag.textContent = kit.name;
        button.appendChild(tag);
        button.addEventListener('click', () => {
          this.callbacks.onInteraction();
          this.callbacks.onLobbyColor(index, kit.id);
        });
        picker.appendChild(button);
      }
    }
  }

  private updateKitPicker(index: 1 | 2, colorId: number): void {
    const picker = requireElement(`kit-picker-${index}`);
    for (const button of picker.querySelectorAll<HTMLButtonElement>('[data-kit]')) {
      button.setAttribute('aria-checked', String(Number(button.dataset.kit) === colorId));
    }
  }

  private onClick(id: string, handler: () => void): void {
    requireElement(id).addEventListener('click', handler);
  }

  private updateRadioGroup(group: HTMLElement, attribute: string, value: string): void {
    for (const button of group.querySelectorAll<HTMLButtonElement>(`[data-${attribute}]`)) {
      button.setAttribute('aria-checked', String(button.dataset[attribute] === value));
    }
  }

  /** Pushes stored settings into the form controls and the document theme. */
  applySettingsToForm(settings: GameSettings): void {
    this.settings = { ...settings };
    this.difficulty = settings.difficulty;

    this.sliders.master.value = String(Math.round(settings.masterVolume * 100));
    this.sliders.music.value = String(Math.round(settings.musicVolume * 100));
    this.sliders.sensitivity.value = String(Math.round(settings.sensitivity * 100));
    this.sliders.deadzone.value = String(Math.round(settings.deadZone * 100));
    this.sliders.aimassist.value = String(Math.round(settings.aimAssist * 100));

    this.outputs.master.textContent = `${Math.round(settings.masterVolume * 100)}%`;
    this.outputs.music.textContent = `${Math.round(settings.musicVolume * 100)}%`;
    this.outputs.sensitivity.textContent = settings.sensitivity.toFixed(1);
    this.outputs.deadzone.textContent = `${Math.round(settings.deadZone * 100)}%`;
    this.outputs.aimassist.textContent =
      settings.aimAssist <= 0 ? 'כבוי' : `${Math.round(settings.aimAssist * 100)}%`;

    setToggle(this.toggles.vibration, settings.vibration);
    setToggle(this.toggles.contrast, settings.accessibility.highContrast);
    setToggle(this.toggles.flashes, settings.accessibility.reduceFlashes);
    setToggle(this.toggles.motion, settings.accessibility.reduceCameraMotion);
    setToggle(this.toggles.captions, settings.accessibility.audioCaptions);
    setToggle(this.toggles.quickChat, settings.accessibility.muteQuickChat);

    this.updateRadioGroup(requireElement('quality-group'), 'quality', settings.quality);
    this.updateRadioGroup(requireElement('difficulty-group'), 'difficulty', settings.difficulty);
    this.updateRadioGroup(requireElement('shake-group'), 'shake', settings.cameraShake);
    this.updateRadioGroup(
      requireElement('hudscale-group'),
      'hudscale',
      settings.accessibility.hudScale,
    );

    // Accessibility options are applied as data attributes the stylesheet reads.
    const root = document.documentElement;
    root.dataset.contrast = settings.accessibility.highContrast ? 'high' : 'normal';
    root.dataset.hudScale = settings.accessibility.hudScale;
    root.dataset.reduceMotion = settings.accessibility.reduceCameraMotion ? 'true' : 'false';

    if (this.currentScreen === 'bindings') this.renderBindings();
  }
}

function setToggle(
  toggle: { button: HTMLButtonElement; state: HTMLElement },
  value: boolean,
): void {
  toggle.button.setAttribute('aria-checked', String(value));
  toggle.state.textContent = value ? 'פעיל' : 'כבוי';
}

function kitColor(colorId: number): string {
  const kits = GameConfig.kits;
  const index = Number.isFinite(colorId) ? Math.abs(Math.trunc(colorId)) % kits.length : 0;
  return kits[index]?.shirt ?? kits[0].shirt;
}

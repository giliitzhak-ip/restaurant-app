/**
 * Game — the composition root.
 *
 * It owns the Babylon engine and scene, the fixed-timestep loop, and the wiring
 * between devices, session, simulation, rendering, audio and UI.
 *
 * Every match runs through the same path regardless of who is playing: the mode
 * only decides which controllers end up in the session's PlayerSlots.
 */
import { Engine } from '@babylonjs/core/Engines/engine';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Scene } from '@babylonjs/core/scene';
import { AIController } from '../ai/AIController';
import { AudioManager } from '../audio/AudioManager';
import {
  GameConfig,
  type Difficulty,
  type GoalPart,
  type QualityLevel,
} from '../config/GameConfig';
import { MatchEngine } from '../game/MatchEngine';
import { MatchViews } from '../rendering/MatchViews';
import { outcomeOf } from '../game/MatchRules';
import { configFor } from '../game/MatchConfig';
import { rosterFor } from '../game/MatchRoster';
import { MatchSession, type MatchMode, type PlayerSlot } from '../game/MatchSession';
import { canPlayerTouch } from '../game/TouchRuleEngine';
import {
  createPlayerStats,
  type MatchState,
  type PlayerState,
  type TeamId,
} from '../game/MatchState';
import { DeviceManager, type InputDevice } from '../input/DeviceManager';
import { KeyboardState } from '../input/KeyboardState';
import { CompositeController } from '../input/controllers/CompositeController';
import { HumanGamepadController } from '../input/controllers/GamepadController';
import { HumanKeyboardController } from '../input/controllers/KeyboardController';
import { HumanTouchController } from '../input/controllers/TouchController';
import {
  ACTION_LABELS,
  BINDABLE_ACTIONS,
  defaultKeyMapFor,
  keyLabel,
  soloKeyMap,
  type BindableAction,
  type KeyMap,
  type KeyboardProfileId,
} from '../input/KeyBindings';
import { NetworkController } from '../input/controllers/NetworkController';
import type { PlayerController } from '../input/PlayerController';
import { OnlineMatch } from '../net/OnlineMatch';
import { ConnectError, RoomClient } from '../net/RoomClient';
import {
  normalizeInviteCode,
  type JoinIntent,
  type NetChat,
  type OnlineMode,
} from '../net/protocol';
import type { RoomStage } from '../net/schema';
import { loadHavok } from '../physics/loadHavokBrowser';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { AimIndicator } from '../rendering/AimIndicator';
import { Crowd } from '../rendering/Crowd';
import { Environment } from '../rendering/Environment';
import { PostProcessing } from '../rendering/PostProcessing';
import { EdgeArrows, type EdgeArrowTarget } from '../rendering/EdgeArrows';
import { PlayerMarkers } from '../rendering/PlayerMarkers';
import { buildArena, type ArenaHandles } from '../rendering/Arena';
import { CameraRig } from '../rendering/CameraRig';
import { ContactShadows } from '../rendering/ContactShadows';
import { Effects } from '../rendering/Effects';
import { QualityManager } from '../rendering/QualityManager';
import { SharedMatchCamera } from '../rendering/SharedMatchCamera';
import {
  UIManager,
  type LobbySlotView,
  type OnlinePlayerView,
  type ScreenName,
} from '../ui/UIManager';
import {
  attackingGoalLabel,
  connectErrorLabel,
  LOADING_STEPS,
  roomStageLabel,
  teamLabel,
} from '../ui/labels';
import { loadSettings, saveSettings, type GameSettings } from './Settings';
import { SimulationLoop } from './SimulationLoop';

type AppPhase = 'loading' | 'menu' | 'lobby' | 'playing' | 'paused' | 'finished';

interface LobbySlotAssignment {
  device: InputDevice | null;
  name: string;
  colorId: number;
  team: TeamId;
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly touchRoot: HTMLElement;

  private engine!: Engine;
  private scene!: Scene;
  private world!: PhysicsWorld;
  private match!: MatchEngine;
  private views!: MatchViews;
  private arena!: ArenaHandles;
  private soloCamera!: CameraRig;
  private sharedCamera!: SharedMatchCamera;
  private quality!: QualityManager;
  private effects!: Effects;
  private aimIndicator!: AimIndicator;
  private environment!: Environment;
  private post!: PostProcessing;
  private crowd!: Crowd;
  private markers!: PlayerMarkers;
  private edgeArrows!: EdgeArrows;
  private contactShadows!: ContactShadows;

  private readonly audio = new AudioManager();
  private readonly keyboard = new KeyboardState();
  private readonly ui: UIManager;
  private readonly devices: DeviceManager;
  private readonly loop: SimulationLoop;

  private session: MatchSession | null = null;
  private online: OnlineMatch | null = null;
  /** Which online mode the player picked from the menu. */
  private onlineMode: OnlineMode = 'oneVsOne';
  /** Whose player the camera follows and whose meters the HUD shows. */
  private localPlayerId = 'home-1';
  private mode: MatchMode = 'vsComputer';
  private settings: GameSettings;
  private phase: AppPhase = 'loading';
  private disposed = false;

  private readonly shadowHandles = new Map<string, number>();
  private readonly playerShadowPool: number[] = [];
  private ballShadowHandle = -1;
  private readonly touchPads = new Map<string, HumanTouchController>();
  private readonly cleanups: (() => void)[] = [];

  private hudTimer = 0;
  /** Rolling frame-time window for the graphics screen. */
  private frameSamples = 0;
  private frameMsTotal = 0;
  /** Mouse drag on the canvas, in screen fractions, waiting to be applied. */
  private readonly pointerLook = { x: 0, y: 0 };
  private lookPointerId: number | null = null;
  private lookPointerLast = { x: 0, y: 0 };
  /** The preset actually running, which auto-degradation may lower. */
  private effectiveQuality: QualityLevel = 'medium';
  private slowFrames = 0;
  private slowWindowMs = 0;
  private resumeCountdown = 0;
  private celebratingTeam: TeamId | null = null;
  private defeatedTeam: TeamId | null = null;
  private stopJoinListening: (() => void) | null = null;
  /** Where to go back to once the controls primer is dismissed. */
  private primerReturnTo: ScreenName | null = null;
  private pendingDisconnect: PlayerSlot | null = null;
  private readonly lobby: [LobbySlotAssignment, LobbySlotAssignment];

  constructor(canvas: HTMLCanvasElement, touchRoot: HTMLElement) {
    this.canvas = canvas;
    this.touchRoot = touchRoot;
    this.settings = loadSettings();

    this.lobby = [
      {
        device: null,
        name: this.settings.profiles.player1.name,
        colorId: this.settings.profiles.player1.colorId,
        team: 'home',
      },
      {
        device: null,
        name: this.settings.profiles.player2.name,
        colorId: this.settings.profiles.player2.colorId,
        team: 'away',
      },
    ];

    this.devices = new DeviceManager(this.keyboard, isTouchDevice());

    this.ui = new UIManager(
      {
        onPlayPressed: () => this.audio.unlock(),
        onLocalPlayPressed: () => this.openLobby(),
        onStartMatch: (difficulty) => this.startVsComputer(difficulty),
        onResume: () => this.resume(),
        onRestart: () => this.restart(),
        onExitToMenu: () => this.exitToMenu(),
        onPauseRequested: () => this.togglePause(),
        onSettingsChanged: (settings) => this.applySettings(settings),
        onInteraction: () => this.audio.unlock(),
        onReload: () => window.location.reload(),
        onLobbyStart: () => this.startLocalMatch(),
        onLobbySwapSides: () => this.swapLobbySides(),
        onLobbyLeave: (index) => this.leaveLobbySlot(index),
        onLobbyTouchJoin: (index) => this.joinWithTouch(index),
        onLobbyName: (index, name) => this.setLobbyName(index, name),
        onLobbyColor: (index, colorId) => this.setLobbyColor(index, colorId),
        onOnlinePlayPressed: (mode) => this.openOnline(mode),
        onOnlineQuickMatch: (name) => void this.connectOnline({ intent: 'quick', name }),
        onOnlineCreateRoom: (name) => void this.connectOnline({ intent: 'create', name }),
        onOnlineJoinRoom: (name, code) =>
          void this.connectOnline({ intent: 'join', name, inviteCode: code }),
        // One button, two meanings: "ready" in the lobby, "again" after the
        // final whistle. The stage decides, so the label and the message can
        // never disagree.
        onOnlineReady: () => {
          const online = this.online;
          if (!online) return;
          const stage = online.stage;
          if (stage === 'finished' || stage === 'rematchVote') online.sendRematch();
          else online.sendReady();
        },
        onOnlineLeave: () => void this.leaveOnline(),
        onOnlineTeamSwitch: (team) => this.online?.requestTeamSwitch(team),
        onOnlineShuffleTeams: () => this.online?.requestShuffle(),
        onOnlineFindOpponents: () => this.online?.requestOpenRoom(),
        onOnlineSurrender: () => this.online?.voteSurrender(),
        onOnlineQuickChat: (id) => this.online?.sendQuickChat(id),
        onPrimerDismissed: () => this.dismissPrimer(),
        onReconnectResume: () => this.resumeAfterReconnect(),
        onReconnectUseAi: () => this.replaceDisconnectedWithAi(),
        onBindingsChanged: (profile, action, code) => this.rebindKey(profile, action, code),
        onBindingsReset: () => this.resetBindings(),
      },
      this.settings,
    );

    this.loop = new SimulationLoop((dt, tick) => this.simulate(dt, tick));
  }

  // ── Boot ────────────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    const report = (step: number, ratio: number) => {
      this.ui.setLoadingProgress(ratio, LOADING_STEPS[step] ?? '');
    };

    report(0, 0.04);
    this.engine = new Engine(this.canvas, GameConfig.quality[this.settings.quality].antialias, {
      preserveDrawingBuffer: false,
      stencil: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
    this.engine.loadingScreen = { displayLoadingUI() {}, hideLoadingUI() {} } as never;

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.05, 0.06, 0.07, 1);
    this.scene.skipPointerMovePicking = true;

    report(1, 0.2);
    this.world = PhysicsWorld.create(this.scene, await loadHavok());

    report(2, 0.45);
    this.arena = buildArena(this.scene, this.world, GameConfig.quality[this.settings.quality]);

    report(3, 0.62);
    this.quality = new QualityManager(this.engine, this.arena.sun, this.arena.shadowCasters);

    report(4, 0.78);
    this.match = new MatchEngine(this.scene, this.world);
    this.views = new MatchViews(this.scene, this.match);
    this.soloCamera = new CameraRig(this.scene);
    this.sharedCamera = new SharedMatchCamera(this.scene);
    this.aimIndicator = new AimIndicator(this.scene);
    this.markers = new PlayerMarkers(this.scene);
    this.edgeArrows = new EdgeArrows(requireArrowLayer());
    this.effects = new Effects(this.scene);
    this.environment = new Environment(this.scene);
    this.post = new PostProcessing(this.scene);
    this.crowd = new Crowd(this.scene);

    this.applyQuality(this.settings.quality);

    this.contactShadows = new ContactShadows(this.scene, this.arena.sun.direction);
    // One blob per possible player, allocated once: the roster changes between
    // matches, and growing the pool every time would leak meshes.
    for (let i = 0; i < MAX_PLAYERS; i += 1) {
      this.playerShadowPool.push(this.contactShadows.create(`player-${i}`, 0.62));
    }
    this.ballShadowHandle = this.contactShadows.create('ball', GameConfig.ball.radius * 2.1, 0.9);
    this.views.onRebuilt = () => this.refreshRosterVisuals();
    this.refreshRosterVisuals();

    this.keyboard.attach();
    this.keyboard.own(ownedKeyCodes(this.settings));
    this.devices.start();

    this.bindMatchEvents();
    this.bindWindowEvents();
    this.applySettings(this.settings);
    this.handleResize();

    report(5, 1);
    await this.scene.whenReadyAsync();

    this.engine.runRenderLoop(() => this.renderFrame());

    this.phase = 'menu';
    this.ui.showScreen('menu');
    this.ui.setHudVisible(false);
    this.applyInviteLink();
  }

  // ── Match setup ─────────────────────────────────────────────────────────────

  /** Builds the single-player session: one composite human plus the AI. */
  private startVsComputer(difficulty: Difficulty): void {
    this.settings = { ...this.settings, difficulty };
    saveSettings(this.settings);

    const human = this.buildSoloController();
    const ai = new AIController('away-1', 'away', difficulty);

    const slots: PlayerSlot[] = [
      {
        playerId: 'home-1',
        team: 'home',
        name: this.settings.profiles.player1.name,
        colorId: this.settings.profiles.player1.colorId,
        controller: human,
      },
      {
        playerId: 'away-1',
        team: 'away',
        name: 'מחשב',
        colorId: pickContrastingKit(this.settings.profiles.player1.colorId),
        controller: ai,
      },
    ];

    this.beginSession('vsComputer', slots);
  }

  /** Builds the local two-player session from the lobby assignment. */
  private startLocalMatch(): void {
    const first = this.lobby[0];
    const second = this.lobby[1];
    if (!first.device || !second.device) return;
    if (first.device.id === second.device.id) return;

    const slots: PlayerSlot[] = [
      {
        playerId: 'home-1',
        team: first.team,
        name: first.name,
        colorId: first.colorId,
        controller: this.buildController(first.device, 'left'),
      },
      {
        playerId: 'away-1',
        team: second.team,
        name: second.name,
        colorId: second.colorId,
        controller: this.buildController(second.device, 'right'),
      },
    ];

    this.persistProfiles();
    this.beginSession('localTwoPlayer', slots);
  }

  private beginSession(mode: MatchMode, slots: PlayerSlot[]): void {
    this.audio.unlock();
    this.disposeSession();

    this.mode = mode;
    // Online, exactly one slot is driven from this device; that is the player
    // the camera follows and the one whose meters the HUD shows.
    this.localPlayerId =
      slots.find((slot) => slot.controller.kind !== 'ai' && slot.controller.kind !== 'network')
        ?.playerId ??
      slots[0]?.playerId ??
      'home-1';
    // The client predicts online, but decides nothing: the score, the clock and
    // every goal come from the server.
    this.match.setRules(mode === 'online' ? 'mirrored' : 'authoritative');
    // The engine's players keep fixed ids and teams; the slot carries identity.
    for (const slot of slots) {
      const player = this.match.state.players.find((entry) => entry.id === slot.playerId);
      if (player) slot.team = player.team;
    }

    this.session = new MatchSession(this.match, {
      mode,
      slots,
      aimAssist: this.settings.aimAssist,
    });

    for (const slot of slots) {
      const view = this.views.viewFor(slot.playerId);
      view?.applyKit(slot.colorId);
      view?.setMarkerVisible(slot.controller.kind !== 'ai');
    }

    this.match.start();
    this.loop.resetTicks();
    this.celebratingTeam = null;
    this.defeatedTeam = null;
    this.resumeCountdown = 0;

    this.ui.resetHud();
    this.ui.showScreen(null);
    this.ui.setHudVisible(true);
    this.ui.setTwoPlayerHud(mode === 'localTwoPlayer');
    this.ui.showResumeCountdown(null);

    this.ui.setPauseMode(mode === 'online');
    this.ui.renderPauseKeys(
      keyboardSection('', mode === 'localTwoPlayer' ? this.settings.keyBindings.left : soloKeyMap())
        .rows,
    );
    // Talking to a partner only means anything when you have one.
    this.ui.setQuickChatVisible(mode === 'online' && this.onlineMode === 'twoVsTwo');
    this.showTouchPadsFor(slots);
    this.session.resetControllers();

    this.activeCamera().activate?.(this.scene);
    if (mode === 'localTwoPlayer') {
      this.sharedCamera.activate(this.scene);
      this.sharedCamera.snapTo(this.cameraFocus());
    } else {
      this.scene.activeCamera = this.soloCamera.camera;
      const local = this.localPlayer();
      if (local) {
        this.soloCamera.snapTo(local.position, this.match.state.ball.position, local.team);
      }
    }
    // The post chain is bound to one camera, and the two rigs are different
    // cameras, so it follows whichever one the match just activated.
    if (this.scene.activeCamera) {
      this.post.setCamera(this.scene.activeCamera);
    }
    this.handleResize();

    this.phase = 'playing';
    this.audio.play('whistle');
    this.ui.showCaption('whistle');
    this.audio.vibrate(GameConfig.audio.vibration.whistle);
    if (this.settings.musicVolume > 0) this.audio.startMusic();

    // Online the primer would sit over a live match, because the server keeps
    // playing whatever this device does; it is shown in the lobby instead.
    if (!this.settings.seenControlsPrimer && mode !== 'online') this.showPrimer(mode);
  }

  // ── Online 1×1 ──────────────────────────────────────────────────────────────

  /** Opens the online screen. Entry form only — nothing connects yet. */
  private openOnline(mode: OnlineMode = 'oneVsOne'): void {
    this.onlineMode = mode;
    this.audio.unlock();
    this.ui.setOnlineMode(mode);
    this.ui.setOnlineName(this.settings.profiles.player1.name);
    this.ui.showOnlineEntry(null);
    this.ui.setOnlineNotice(
      RoomClient.hasResumableSession() ? 'אפשר לחזור למשחק שנקטע — חפשו יריב כדי לנסות.' : null,
    );
    // Learn the controls before readying up, not on top of a running match.
    // 2×2 gets its own showing even for a veteran of 1×1: rings, arrows and
    // quick chat are all new, and none of them were in the first primer.
    const owed =
      mode === 'twoVsTwo' ? !this.settings.seenTeamPrimer : !this.settings.seenControlsPrimer;
    if (owed) this.showPrimer('online', 'online');
  }

  /**
   * Fills the invite code in from a shared link and opens the online screen,
   * so tapping a friend's link lands directly on "join".
   */
  private applyInviteLink(): void {
    if (typeof window === 'undefined') return;
    const code = normalizeInviteCode(new URL(window.location.href).searchParams.get('invite'));
    if (code === null) return;
    this.openOnline();
    const input = document.getElementById('online-code');
    if (input instanceof HTMLInputElement) input.value = code;
    this.ui.showScreen('online');
    this.ui.setOnlineNotice('הקוד מהקישור מוכן — לחצו "הצטרפות".');
  }

  private async connectOnline(request: {
    intent: JoinIntent;
    name: string;
    inviteCode?: string;
  }): Promise<void> {
    if (this.online) await this.leaveOnline();

    const name = request.name.trim().slice(0, 16);
    if (name.length === 0) {
      this.ui.setOnlineNotice(connectErrorLabel('invalidName'));
      return;
    }
    if (request.intent === 'join' && normalizeInviteCode(request.inviteCode) === null) {
      this.ui.setOnlineNotice(connectErrorLabel('roomNotFound'));
      return;
    }

    this.settings = {
      ...this.settings,
      profiles: {
        ...this.settings.profiles,
        player1: { ...this.settings.profiles.player1, name },
      },
    };
    saveSettings(this.settings);

    const online = new OnlineMatch(this.match, {
      onStage: (stage, secondsLeft) => this.handleOnlineStage(stage, secondsLeft),
      onServerEvent: () => this.refreshOnlineRoom(),
      onOpponentConnected: (connected) => this.handleOpponentConnection(connected),
      onDisconnected: () => this.handleOnlineDisconnect(),
      onPing: () => this.refreshOnlineRoom(),
      onChat: (chat) => this.showQuickChat(chat),
    });
    this.online = online;
    this.ui.setOnlineNotice(null);
    this.ui.renderOnlineRoom({
      status: 'מתחבר…',
      mode: this.onlineMode,
      playersPerTeam: this.onlineMode === 'twoVsTwo' ? 2 : 1,
      seated: 0,
      capacity: this.onlineMode === 'twoVsTwo' ? 4 : 2,
      inviteCode: '',
      inviteLink: '',
      players: [],
      roundTripMs: null,
      canReady: false,
      canSwitchTeam: false,
      canShuffle: false,
      canFindOpponents: false,
      readyLabel: 'מוכן',
    });

    try {
      await online.connect({
        intent: request.intent,
        mode: this.onlineMode,
        displayName: name,
        colorId: this.settings.profiles.player1.colorId,
        inviteCode: normalizeInviteCode(request.inviteCode) ?? undefined,
      });
      this.refreshOnlineRoom();
    } catch (error) {
      this.online = null;
      const reason = error instanceof ConnectError ? error.reason : 'unreachable';
      this.ui.showOnlineEntry(connectErrorLabel(reason));
    }
  }

  private async leaveOnline(): Promise<void> {
    const online = this.online;
    this.online = null;
    if (!online) return;
    await online.leave();
  }

  private handleOnlineStage(stage: RoomStage, secondsLeft: number): void {
    switch (stage) {
      case 'countdown':
        this.ui.showScreen('online');
        this.ui.showResumeCountdown(Math.ceil(secondsLeft));
        break;
      case 'playing':
        this.ui.showResumeCountdown(null);
        if (this.mode !== 'online' || this.phase !== 'playing') this.startOnlineSession();
        break;
      case 'goalFreeze':
        break;
      case 'reconnectPause':
        this.ui.showResumeCountdown(null);
        break;
      case 'disposing':
        void this.leaveOnline();
        this.exitToMenu();
        break;
      default:
        break;
    }
    this.refreshOnlineRoom();
  }

  /** The room said "go": build the session and hand over to the normal match. */
  private startOnlineSession(): void {
    const online = this.online;
    if (!online) return;

    const snapshot = online.client.state;
    const localId = online.localPlayerId;
    const localColor = snapshot?.players.get(localId)?.colorId ?? 0;

    // One slot for this device, one for every other seat in the room. The
    // simulation sees the same PlayerSlot list a local two-player game builds.
    const remotes = new Map<string, NetworkController>();
    const slots: PlayerSlot[] = [
      {
        playerId: localId,
        team: online.localTeam,
        name: this.settings.profiles.player1.name,
        colorId: localColor,
        controller: this.buildSoloController(),
      },
    ];

    for (const remoteId of online.remotePlayerIds) {
      const net = snapshot?.players.get(remoteId);
      const name = net?.name && net.name.length > 0 ? net.name : 'שחקן';
      const controller = new NetworkController(`net-${remoteId}`, name);
      remotes.set(remoteId, controller);
      slots.push({
        playerId: remoteId,
        team: (net?.team as TeamId | undefined) ?? (remoteId.startsWith('home') ? 'home' : 'away'),
        name,
        colorId: net?.colorId ?? pickContrastingKit(localColor),
        controller,
      });
    }

    // The client predicts; the server decides. Everything below this line is
    // the ordinary local game.
    this.match.setRoster(rosterFor(online.playersPerTeam));
    // The prediction has to run on the same numbers as the server, or the
    // corrections would be fighting a difference in the rules.
    this.match.setFriendlyCollision(configFor(online.mode).friendlyCollision);
    this.beginSession('online', slots);
    const session = this.session;
    if (session) online.attach(session, remotes);
  }

  private handleOpponentConnection(connected: boolean): void {
    if (this.mode !== 'online') return;
    this.ui.showCaption(connected ? 'whistle' : 'tackle');
    this.ui.setOnlineNotice(connected ? null : roomStageLabel('reconnectPause'));
    this.refreshOnlineRoom();
  }

  private handleOnlineDisconnect(): void {
    this.online = null;
    this.disposeSession();
    this.match.setRules('authoritative');
    this.phase = 'menu';
    this.hideAllTouchPads();
    this.ui.setHudVisible(false);
    this.ui.showResumeCountdown(null);
    this.ui.showScreen('online');
    this.ui.showOnlineEntry('החיבור לשרת נפל. נסו שוב.');
  }

  /**
   * Quick chat is displayed by id, never by text from the wire: the phrase is
   * looked up locally, so a tampered client can only pick one of five.
   */
  private showQuickChat(chat: NetChat): void {
    const speaker = this.online?.client.state?.players.get(chat.playerId);
    const name = speaker?.name ?? '';
    if (name.length === 0) return;
    this.ui.showQuickChat(name, chat.id, chat.team);
  }

  private refreshOnlineRoom(): void {
    const online = this.online;
    if (!online) return;
    const snapshot = online.client.state;
    const stage = online.stage;

    // Everybody in the room, grouped by side, in seat order. The server owns
    // the grouping; this just reads it.
    const players: OnlinePlayerView[] = [];
    snapshot?.players.forEach((player, id) => {
      if (player.name.length === 0) return;
      players.push({
        playerId: id,
        name: player.name,
        team: player.team as TeamId,
        teamLabel: teamLabel(player.team as TeamId),
        slotIndex: player.slotIndex,
        connected: player.connected,
        ready: player.ready,
        isHost: player.isHost,
        isBot: player.botControlled,
        isYou: id === online.localPlayerId,
        roundTripMs:
          id === online.localPlayerId && online.roundTripMs > 0 ? online.roundTripMs : null,
      });
    });
    players.sort((a, b) => a.team.localeCompare(b.team) || a.slotIndex - b.slotIndex);

    const code = online.inviteCode;
    const you = snapshot?.players.get(online.localPlayerId);
    const seated = players.length;
    this.ui.renderOnlineRoom({
      status: roomStageLabel(stage),
      mode: online.mode,
      playersPerTeam: online.playersPerTeam,
      seated,
      capacity: online.playersPerTeam * 2,
      inviteCode: code,
      inviteLink: code.length > 0 ? inviteLinkFor(code) : '',
      players,
      roundTripMs: online.roundTripMs > 0 ? online.roundTripMs : null,
      canReady: stage === 'teamSelection' && you?.ready !== true,
      canSwitchTeam: stage === 'waitingForPlayers' || stage === 'teamSelection',
      canShuffle: (you?.isHost ?? false) && stage === 'teamSelection',
      // A party: the host of a private room that still has an empty seat and
      // at least one friend already in it.
      canFindOpponents:
        (you?.isHost ?? false) &&
        (snapshot?.isPrivate ?? false) &&
        seated >= 2 &&
        seated < online.playersPerTeam * 2 &&
        (stage === 'waitingForPlayers' || stage === 'teamSelection'),
      readyLabel: stage === 'finished' || stage === 'rematchVote' ? 'עוד משחק' : 'מוכן',
    });
  }

  private buildSoloController(): PlayerController {
    const keyboard = new HumanKeyboardController(
      'keyboard-solo',
      'מקלדת',
      soloKeyMap(),
      this.keyboard,
    );
    keyboard.setSensitivity(this.settings.sensitivity);
    this.keyboard.own(keyboard.ownedCodes());

    const sources: PlayerController[] = [keyboard];
    if (isTouchDevice()) {
      sources.push(this.ensureTouchPad('touch-solo', 'full', 'שחקן'));
    }
    return new CompositeController('solo', 'מקלדת ומגע', sources);
  }

  private buildController(device: InputDevice, side: 'left' | 'right'): PlayerController {
    switch (device.kind) {
      case 'gamepad': {
        const controller = new HumanGamepadController(
          device.id,
          device.label,
          device.padIndex ?? 0,
          () => this.togglePause(),
        );
        controller.setDeadZone(this.settings.deadZone);
        return controller;
      }
      case 'touch': {
        const pad = this.ensureTouchPad(device.id, side, device.label);
        pad.setSensitivity(this.settings.sensitivity);
        return pad;
      }
      case 'keyboard':
      default: {
        const profile: KeyboardProfileId =
          device.profile ?? (side === 'left' ? 'keyboard-left' : 'keyboard-right');
        const map =
          profile === 'keyboard-left'
            ? this.settings.keyBindings.left
            : this.settings.keyBindings.right;
        const controller = new HumanKeyboardController(device.id, device.label, map, this.keyboard);
        controller.setSensitivity(this.settings.sensitivity);
        this.keyboard.own(controller.ownedCodes());
        return controller;
      }
    }
  }

  private ensureTouchPad(
    id: string,
    side: 'left' | 'right' | 'full',
    label: string,
  ): HumanTouchController {
    const existing = this.touchPads.get(id);
    if (existing) {
      existing.setLabel(label);
      return existing;
    }
    const pad = new HumanTouchController(id, label, side);
    pad.mount(this.touchRoot);
    pad.setVisible(false);
    this.touchPads.set(id, pad);
    return pad;
  }

  private showTouchPadsFor(slots: readonly PlayerSlot[]): void {
    const active = new Set(
      slots
        .filter((slot) => slot.controller.kind === 'touch')
        .map((slot) => slot.controller.deviceId),
    );
    // The solo composite hides its touch pad inside itself, so check explicitly.
    if (this.mode === 'vsComputer' && isTouchDevice()) active.add('touch-solo');

    for (const [id, pad] of this.touchPads) {
      const visible = active.has(id);
      pad.setVisible(visible);
      // The shared camera of a local two-player match frames both players; a
      // swing has nothing to do there, so the zone is off rather than dead.
      pad.setLookEnabled(this.mode !== 'localTwoPlayer');
      if (visible) {
        const slot = slots.find((entry) => entry.controller.deviceId === id);
        if (slot) {
          pad.setLabel(slot.name);
          pad.setAccentColor(
            GameConfig.kits[slot.colorId % GameConfig.kits.length]?.shirt ?? '#ffa524',
          );
        }
      }
    }
  }

  private hideAllTouchPads(): void {
    for (const pad of this.touchPads.values()) pad.setVisible(false);
  }

  // ── Lobby ───────────────────────────────────────────────────────────────────

  private openLobby(): void {
    this.audio.unlock();
    this.phase = 'lobby';
    this.lobby[0].device = null;
    this.lobby[1].device = null;
    this.lobby[0].team = 'home';
    this.lobby[1].team = 'away';
    this.devices.refreshGamepads();

    this.stopJoinListening?.();
    this.stopJoinListening = this.devices.beginJoinListening();
    const unsubscribe = this.devices.events.on('join', ({ device }) => this.tryJoin(device));
    this.cleanups.push(unsubscribe);

    this.ui.showScreen('lobby');
    this.renderLobby();
  }

  private closeLobby(): void {
    this.stopJoinListening?.();
    this.stopJoinListening = null;
  }

  private tryJoin(device: InputDevice): void {
    if (this.phase !== 'lobby') return;
    // One device may never drive two players.
    if (this.lobby.some((slot) => slot.device?.id === device.id)) {
      this.renderLobby(`${device.label} כבר משויך לשחקן אחר.`);
      return;
    }
    const free = this.lobby.find((slot) => slot.device === null);
    if (!free) return;
    free.device = device;
    this.audio.play('uiClick');
    this.renderLobby();
  }

  /**
   * Assigns a half of the screen to a slot. Slot 1 takes the left half and
   * slot 2 the right, so the two pads can never collide.
   */
  private joinWithTouch(index: 1 | 2): void {
    if (this.phase !== 'lobby') return;
    const deviceId = index === 1 ? 'touch-left' : 'touch-right';
    const device = this.devices.find(deviceId);
    if (!device) return;
    if (this.lobby.some((slot) => slot.device?.id === device.id)) {
      this.renderLobby(`${device.label} כבר משויך לשחקן אחר.`);
      return;
    }
    const target = this.lobby[index - 1];
    if (!target) return;
    target.device = device;
    this.audio.play('uiClick');
    this.renderLobby();
  }

  private leaveLobbySlot(index: 1 | 2): void {
    const slot = this.lobby[index - 1];
    if (slot) slot.device = null;
    this.renderLobby();
  }

  private setLobbyName(index: 1 | 2, name: string): void {
    const slot = this.lobby[index - 1];
    if (!slot) return;
    slot.name = name.trim().slice(0, 16) || `שחקן ${index}`;
    this.persistProfiles();
    this.renderLobby();
  }

  private setLobbyColor(index: 1 | 2, colorId: number): void {
    const slot = this.lobby[index - 1];
    const other = this.lobby[index === 1 ? 1 : 0];
    if (!slot || !other) return;
    if (other.colorId === colorId) {
      this.renderLobby('לשני השחקנים לא יכול להיות אותו צבע.');
      return;
    }
    slot.colorId = colorId;
    this.persistProfiles();
    this.renderLobby();
  }

  private swapLobbySides(): void {
    for (const slot of this.lobby) {
      slot.team = slot.team === 'home' ? 'away' : 'home';
    }
    this.renderLobby();
  }

  private renderLobby(notice: string | null = null): void {
    const views: LobbySlotView[] = this.lobby.map((slot, index) => ({
      index: (index + 1) as 1 | 2,
      name: slot.name,
      colorId: slot.colorId,
      deviceLabel: slot.device?.label ?? null,
      attackingLabel: attackingGoalLabel(slot.team),
      canJoinByTouch: isTouchDevice(),
    }));
    const ready =
      this.lobby[0].device !== null &&
      this.lobby[1].device !== null &&
      this.lobby[0].device.id !== this.lobby[1].device.id;
    this.ui.renderLobby(views, ready, notice);
  }

  private persistProfiles(): void {
    this.settings = {
      ...this.settings,
      profiles: {
        player1: { name: this.lobby[0].name, colorId: this.lobby[0].colorId },
        player2: { name: this.lobby[1].name, colorId: this.lobby[1].colorId },
      },
    };
    saveSettings(this.settings);
  }

  // ── Primer ──────────────────────────────────────────────────────────────────

  private showPrimer(mode: MatchMode, returnTo: ScreenName | null = null): void {
    this.primerReturnTo = returnTo;
    this.ui.renderPrimer(this.primerSections(mode));
    this.ui.showScreen('primer');
    if (this.phase === 'playing') this.pause(false);
  }

  /**
   * The primer is generated from the bindings actually in force, so a remapped
   * key is never taught wrong. The rules block comes first: after the touch
   * rule, knowing which key kicks matters less than knowing that you only get
   * one touch.
   */
  private primerSections(mode: MatchMode): PrimerSection[] {
    const sections: PrimerSection[] = [
      {
        title: 'חוק הנגיעה',
        rows: [
          ['נגיעה אחת', 'אחרי שנגעתם, אי אפשר לגעת שוב עד שמישהו אחר נוגע'],
          ['הקפצה', 'כל עוד הכדור באוויר — אתם ממשיכים. הוא נוגע ברצפה, התור נגמר'],
          ['נגיעה כפולה', 'הכדור עובר ליריב, וכל שער מהנגיעה הזאת מתבטל'],
        ],
      },
      {
        title: 'ניקוד',
        rows: [
          ['שער', '1'],
          ['קורה אנכית', '2'],
          ['רוחבית', '3'],
          ['חיבורים', '5'],
        ],
      },
    ];

    if (this.onlineMode === 'twoVsTwo' && mode === 'online') {
      sections.push({
        title: 'שניים בקבוצה',
        rows: [
          ['הטבעת הכתומה', 'אתם'],
          ['הטבעת הבהירה', 'השותף שלכם'],
          ['טבעת ירוקה', 'היעד שאליו תצא המסירה'],
          ['חץ בקצה המסך', 'הכדור או השותף מחוץ לתמונה, והמרחק במטרים'],
          ['צ׳אט מהיר', 'חמישה משפטים קבועים, בלי כתיבה חופשית'],
        ],
      });
    }

    if (mode === 'localTwoPlayer') {
      sections.push(
        keyboardSection('שחקן 1 — מקלדת', this.settings.keyBindings.left),
        keyboardSection('שחקן 2 — מקלדת', this.settings.keyBindings.right),
      );
    } else {
      sections.push(keyboardSection('מקלדת', soloKeyMap()));
    }

    sections.push({
      title: 'בקר משחק',
      rows: [
        ['מוט שמאלי', 'תנועה'],
        ['מוט ימני', 'גובה הכוונת וסיבוב'],
        ['A', 'בעיטה — החזק ושחרר'],
        ['B', 'מסירה'],
        ['Y', 'הקפצה'],
        ['X', 'חטיפה'],
        ['הדק שמאלי', 'הרמה קצרה'],
        ['הדק ימני', 'ספרינט'],
        ['Start', 'השהיה'],
      ],
    });

    return sections;
  }

  private dismissPrimer(): void {
    this.settings = { ...this.settings, seenControlsPrimer: true, seenTeamPrimer: true };
    saveSettings(this.settings);
    this.ui.showScreen(this.primerReturnTo);
    this.primerReturnTo = null;
    if (this.phase === 'paused') this.resume();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  togglePause(): void {
    if (this.phase === 'playing') this.pause();
    else if (this.phase === 'paused' && this.ui.activeScreen === 'pause') this.resume();
  }

  pause(showScreen = true): void {
    if (this.phase !== 'playing') return;
    // Online there is nothing to pause: the server plays on whatever this
    // device does, so the screen is an overlay and the match keeps running.
    if (this.mode === 'online') {
      if (showScreen) this.ui.showScreen('pause');
      return;
    }
    this.phase = 'paused';
    this.session?.resetControllers();
    this.keyboard.clear();
    this.loop.reset();
    this.audio.suspend();
    if (showScreen) this.ui.showScreen('pause');
  }

  resume(): void {
    if (this.mode === 'online') {
      this.ui.showScreen(null);
      return;
    }
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.loop.reset();
    this.session?.resetControllers();
    this.keyboard.clear();
    this.audio.resume();
    this.ui.showScreen(null);
    // A short countdown so nobody is caught mid-thought when play restarts.
    this.resumeCountdown = 3;
  }

  private restart(): void {
    const session = this.session;
    if (!session) return;
    // A rematch online is a vote, not a local restart.
    if (this.mode === 'online') return;
    this.beginSession(this.mode, session.slots);
  }

  exitToMenu(): void {
    void this.leaveOnline();
    this.match.setRules('authoritative');
    this.phase = 'menu';
    this.loop.reset();
    this.closeLobby();
    this.disposeSession();
    this.hideAllTouchPads();
    this.keyboard.clear();
    this.audio.stopMusic();
    this.audio.resume();
    this.effects.clear();
    this.aimIndicator.hide();
    this.ui.setHudVisible(false);
    this.ui.showResumeCountdown(null);
    this.ui.showScreen('menu');
  }

  private disposeSession(): void {
    if (!this.session) return;
    // Touch pads are pooled and reused, so they are hidden rather than disposed.
    for (const slot of this.session.slots) {
      if (slot.controller.kind !== 'touch') slot.controller.dispose?.();
    }
    this.session = null;
  }

  // ── Disconnect handling ─────────────────────────────────────────────────────

  private checkDisconnects(): void {
    if (this.phase !== 'playing' || !this.session) return;
    // Online drops are the server's business, not a "plug your gamepad back in".
    if (this.mode === 'online') return;
    const reports = this.session.findDisconnected();
    if (reports.length === 0) return;
    const first = reports[0];
    if (!first) return;
    this.pendingDisconnect = first.slot;
    this.pause(false);
    this.ui.setReconnectMessage(
      `${first.slot.name}: ${first.label} התנתק. חברו אותו מחדש כדי להמשיך.`,
      false,
    );
    this.ui.showScreen('reconnect');
  }

  /** Called every frame while the reconnect screen is up. */
  private pollReconnect(): void {
    const slot = this.pendingDisconnect;
    if (!slot) return;
    this.devices.pollConnections();

    // A gamepad can come back in a different slot, so re-resolve it by device id.
    if (slot.controller instanceof HumanGamepadController) {
      const device = this.devices.find(slot.controller.deviceId);
      if (device?.connected) slot.controller.rebind(device.padIndex ?? slot.controller.index);
    }
    this.ui.setReconnectMessage(
      slot.controller.isConnected()
        ? `${slot.name}: ${slot.controller.label} חובר מחדש.`
        : `${slot.name}: ${slot.controller.label} התנתק. חברו אותו מחדש כדי להמשיך.`,
      slot.controller.isConnected(),
    );
  }

  private resumeAfterReconnect(): void {
    if (!this.pendingDisconnect?.controller.isConnected()) return;
    this.pendingDisconnect = null;
    this.resume();
  }

  /** Only ever runs when the player explicitly asks for it. */
  private replaceDisconnectedWithAi(): void {
    const slot = this.pendingDisconnect;
    if (!slot || !this.session) return;
    const ai = new AIController(slot.playerId, slot.team, this.settings.difficulty);
    this.session.replaceController(slot.playerId, ai);
    slot.name = 'מחשב';
    this.pendingDisconnect = null;
    this.resume();
  }

  // ── Frame ───────────────────────────────────────────────────────────────────

  private renderFrame(): void {
    if (this.disposed) return;
    const deltaMs = this.engine.getDeltaTime();
    const dtSeconds = Math.min(deltaMs, GameConfig.simulation.maxFrameDeltaMs) / 1000;

    if (this.phase === 'playing') {
      if (this.resumeCountdown > 0) {
        // Hold the simulation while the restart countdown runs.
        this.resumeCountdown = Math.max(0, this.resumeCountdown - dtSeconds);
        this.ui.showResumeCountdown(Math.ceil(this.resumeCountdown));
        if (this.resumeCountdown === 0) this.ui.showResumeCountdown(null);
      } else {
        this.loop.advance(deltaMs);
      }
      this.checkDisconnects();
    } else if (this.ui.activeScreen === 'reconnect') {
      this.pollReconnect();
    } else if (this.phase === 'lobby') {
      this.devices.pollForJoin();
    }

    this.updatePresentation(dtSeconds);
    this.scene.render();
    this.reportGraphicsStats(deltaMs);
    this.guardFrameBudget(deltaMs);
  }

  /**
   * Steps the preset down when the device plainly cannot hold it.
   *
   * A preset is a promise about frame time, and on a device that cannot keep
   * it the game gets slower rather than uglier, which is the worse of the two.
   * This watches a four-second window while playing and drops one level when
   * the average is twice the budget.
   *
   * It never steps back up, and it never rewrites the player's setting: the
   * stored preference stays theirs, and picking a level by hand puts it back.
   */
  private guardFrameBudget(deltaMs: number): void {
    if (this.phase !== 'playing') return;
    const order: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];
    const index = order.indexOf(this.effectiveQuality);
    if (index <= 0) return;

    const budget = GameConfig.quality[this.effectiveQuality].frameBudgetMs;
    this.slowWindowMs += deltaMs;
    if (deltaMs > budget * 2) this.slowFrames += deltaMs;
    if (this.slowWindowMs < 4000) return;

    const overBudget = this.slowFrames / this.slowWindowMs;
    this.slowWindowMs = 0;
    this.slowFrames = 0;
    if (overBudget < 0.75) return;

    const next = order[index - 1];
    if (!next) return;
    this.applyQuality(next);
    this.ui.setGraphicsFallback(next);
  }

  /**
   * Feeds the graphics screen while it is open, and nothing otherwise.
   *
   * Averaged over half a second: a per-frame number on a page that redraws it
   * is unreadable, and a budget you cannot read is not a budget.
   */
  private reportGraphicsStats(deltaMs: number): void {
    if (this.ui.activeScreen !== 'graphics') {
      this.frameSamples = 0;
      this.frameMsTotal = 0;
      return;
    }
    this.frameSamples += 1;
    this.frameMsTotal += deltaMs;
    if (this.frameMsTotal < 500) return;

    const frameMs = this.frameMsTotal / this.frameSamples;
    this.frameSamples = 0;
    this.frameMsTotal = 0;
    this.ui.setGraphicsStats({
      fps: frameMs > 0 ? 1000 / frameMs : 0,
      frameMs,
      budgetMs: GameConfig.quality[this.effectiveQuality].frameBudgetMs,
      drawCalls: this.scene.getActiveMeshes().length,
      resolutionScale: 1 / this.engine.getHardwareScalingLevel(),
    });
  }

  /**
   * Re-points the shadow blobs and the shadow-map casters at the current
   * line-up. Called once at boot and again whenever the roster changes.
   */
  /**
   * Rings under the players and arrows for whatever is off screen.
   *
   * Only worth drawing once there is somebody to confuse you with: in 1×1 and
   * in a local two-player match everybody is already on screen, so the rings
   * stay off and the pitch stays clean.
   */
  private updateAwareness(humans: readonly PlayerState[]): void {
    const state = this.match.state;
    const crowded = state.playersPerTeam > 1;
    const live = this.phase === 'playing' && state.phase !== 'idle';
    if (!crowded || !live) {
      this.markers.hide();
      this.edgeArrows.hide();
      return;
    }

    const localIds = humans.map((player) => player.id);
    const localTeam = humans[0]?.team ?? null;
    const viewer = humans[0] ?? null;
    this.markers.update(state, localIds, localTeam, this.match.passTargetFor(viewer?.id ?? ''));

    const targets: EdgeArrowTarget[] = [{ kind: 'ball', position: state.ball.position }];
    const mate = state.players.find(
      (player) => player.team === localTeam && !localIds.includes(player.id),
    );
    if (mate) targets.push({ kind: 'mate', position: mate.position });
    this.edgeArrows.update(this.scene, targets, viewer?.position ?? null);
  }

  /**
   * One place that turns a preset into everything it implies: shadows and
   * resolution (QualityManager), the sky capture that lights the PBR
   * materials, the post chain, the crowd and how far LOD reaches.
   */
  private applyQuality(level: QualityLevel): void {
    this.effectiveQuality = level;
    this.slowFrames = 0;
    this.slowWindowMs = 0;
    this.quality.apply(level);
    const profile = GameConfig.quality[level];
    // Only the sky and the backdrop are captured: a probe that had to include
    // the players would have to re-render every frame.
    this.environment.setEnabled(profile.imageBasedLighting, this.arena.environmentSources);
    this.post.setCamera(this.scene.activeCamera ?? this.soloCamera.camera);
    this.post.apply(profile);
    this.crowd.setCount(profile.crowdCount);
    this.views.setLodDistance(profile.lodDistance);
    this.markers.setEnabled(level !== 'low');
  }

  /**
   * Collects this frame's camera swing and applies it.
   *
   * Two sources, one destination: a finger dragged across the middle of the
   * screen, and — on a desktop — the mouse dragged across the canvas. The
   * controllers only report how far they were dragged; deciding what that
   * means for the view is the camera's business, not theirs.
   */
  private applyLookInput(): void {
    let x = this.pointerLook.x;
    let y = this.pointerLook.y;
    this.pointerLook.x = 0;
    this.pointerLook.y = 0;

    for (const pad of this.touchPads.values()) {
      const delta = pad.consumeLook();
      x += delta.x;
      y += delta.y;
    }

    if (x !== 0 || y !== 0) this.soloCamera.look(x, y);
  }

  private refreshRosterVisuals(): void {
    this.quality.setDynamicCasters(this.views.shadowCasters);
    this.markers.setPlayers(this.views.playerIds);
    this.shadowHandles.clear();
    const ids = this.views.playerIds;
    for (let i = 0; i < this.playerShadowPool.length; i += 1) {
      const handle = this.playerShadowPool[i];
      if (handle === undefined) continue;
      const id = ids[i];
      this.contactShadows.setBlobEnabled(handle, id !== undefined);
      if (id !== undefined) this.shadowHandles.set(id, handle);
    }
  }

  /** The player this device drives. */
  private localPlayer() {
    return this.match.state.players.find((player) => player.id === this.localPlayerId);
  }

  /** True for players a person on *this* device controls. */
  private isLocallyDriven(playerId: string): boolean {
    if (this.mode === 'online') return playerId === this.localPlayerId;
    const player = this.match.state.players.find((entry) => entry.id === playerId);
    return player?.isHuman === true;
  }

  private activeCamera(): { activate?: (scene: Scene) => void } {
    return this.mode === 'localTwoPlayer' ? this.sharedCamera : { activate: undefined };
  }

  private get cameraYaw(): number {
    return this.mode === 'localTwoPlayer'
      ? this.sharedCamera.movementYaw
      : this.soloCamera.movementYaw;
  }

  private cameraFocus() {
    const state = this.match.state;
    return {
      points: state.players.map((player) => player.position),
      ball: state.ball.position,
      leadingTeam: this.match.state.ball.lastTouchTeam,
    };
  }

  /** Everything that happens at render rate: visuals, camera, effects, HUD. */
  private updatePresentation(dt: number): void {
    const state = this.match.state;

    this.views.update(dt, this.celebratingTeam, this.defeatedTeam);

    for (const player of state.players) {
      const handle = this.shadowHandles.get(player.id);
      if (handle !== undefined) {
        this.contactShadows.update(handle, player.position, Math.max(0, player.position.y));
      }
    }
    this.contactShadows.update(
      this.ballShadowHandle,
      state.ball.position,
      Math.max(0, state.ball.position.y - GameConfig.ball.radius),
    );

    const ballSpeed = Math.hypot(
      state.ball.velocity.x,
      state.ball.velocity.y,
      state.ball.velocity.z,
    );
    this.effects.update(dt, state.ball.position, ballSpeed);
    this.crowd.update(dt);

    if (this.mode === 'localTwoPlayer') {
      this.sharedCamera.update(this.cameraFocus(), dt);
    } else {
      this.applyLookInput();
      const local = this.localPlayer();
      if (local) this.soloCamera.update(local.position, state.ball.position, local.team, dt);
    }

    // The aim indicator follows whichever human is charging; with two players
    // the one in control wins, so the pitch never fills up with arrows.
    const charging = state.players.find(
      (player) => this.isLocallyDriven(player.id) && player.charging,
    );
    this.aimIndicator.update(charging, charging?.kickCharge ?? 0, charging?.lofted ?? false);

    const humans = state.players.filter((player) => this.isLocallyDriven(player.id));
    this.updateAwareness(humans);
    for (let i = 0; i < humans.length; i += 1) {
      const player = humans[i];
      if (!player) continue;
      const slot = this.session?.slotFor(player.id);
      if (slot?.controller instanceof HumanTouchController) {
        slot.controller.setChargeRatio(player.kickCharge);
        slot.controller.setLofted(player.lofted);
      }
    }

    this.hudTimer += dt;
    if (this.hudTimer >= 1 / 30) {
      this.hudTimer = 0;
      if (this.phase === 'playing' || this.phase === 'paused') {
        this.ui.updateHud(
          state,
          humans.map((player) => player.kickCharge),
        );
        this.ui.setTouchState(
          state.phase === 'playing'
            ? {
                canTouch: canPlayerTouch(state.touch, this.localPlayerId),
                juggles: state.touch.aerialChainActive ? state.touch.aerialTouchCount : 0,
              }
            : null,
        );
      }
    }
  }

  /** One fixed simulation tick: gather commands, then advance the match. */
  private simulate(dt: number, tick: number): void {
    const session = this.session;
    if (!session) return;
    this.online?.beforeTick();
    session.collectCommands(tick, this.cameraYaw, dt);
    this.online?.sendLocalCommand();
    this.match.step(dt, tick);
    this.online?.afterTick();
    // Key edges live for exactly one tick, after every controller has read them.
    this.keyboard.endFrame();
  }

  // ── Wiring ──────────────────────────────────────────────────────────────────

  private bindMatchEvents(): void {
    const events = this.match.events;
    const vibration = GameConfig.audio.vibration;

    events.on('kick', ({ playerId, power }) => {
      this.audio.play(power > 0.45 ? 'kick' : 'kickSoft', 0.4 + power * 0.6);
      this.audio.vibrate(vibration.kick);
      this.ui.showCaption('kick');
      const player = this.match.state.players.find((entry) => entry.id === playerId);
      if (player) this.effects.spawnDust(player.position, power * 0.8, 0.9);
      if (power > 0.7) this.sharedCamera.addShake(power * 0.35);
    });

    events.on('tackle', ({ playerId, success }) => {
      this.audio.play('tackle', success ? 0.8 : 0.4);
      this.ui.showCaption('tackle');
      const player = this.match.state.players.find((entry) => entry.id === playerId);
      if (player && success) this.effects.spawnDust(player.position, 0.7, 1.4);
    });

    events.on('frameHit', ({ part, goal, speed }) => {
      const intensity = Math.min(1, speed / GameConfig.ball.maxSpeed + 0.35);
      // Pitch rises with impact speed, so a rocket off the bar sounds like one.
      const kind = frameSoundFor(part);
      this.audio.play(kind, intensity);
      this.audio.vibrate(
        vibration[kind === 'junction' ? 'junction' : kind === 'crossbar' ? 'crossbar' : 'post'],
      );
      this.ui.showCaption(kind);
      this.sharedCamera.addShake(intensity * 0.55);

      const mesh = this.arena.goals.get(goal)?.parts.get(part);
      if (mesh) this.effects.flashFrame(mesh);
    });

    events.on('scored', (record) => {
      this.audio.play('goal');
      this.audio.vibrate(vibration.goal);
      this.ui.showCaption('goal');
      const scorer = this.match.state.players.find((entry) => entry.id === record.playerId);
      this.ui.showEvent(
        record.kind,
        record.points,
        scorer?.name ?? null,
        scorer?.colorId ?? null,
        record.ownGoal,
      );
      this.celebratingTeam = record.team;
      this.defeatedTeam = null;
      this.sharedCamera.pulseZoom();
      this.sharedCamera.addShake(0.4);
      const celebrant = this.match.state.players.find((entry) => entry.team === record.team);
      if (celebrant) {
        this.effects.celebrate(
          celebrant.position,
          GameConfig.kits[celebrant.colorId % GameConfig.kits.length]?.shirt ?? '#ffa524',
        );
      }
    });

    events.on('possession', ({ playerId }) => {
      void playerId;
    });

    events.on('wallHit', ({ speed }) => {
      this.audio.play('tackle', Math.min(0.7, speed / GameConfig.ball.maxSpeed + 0.2));
    });

    events.on('violation', () => {
      this.audio.play('whistle', 0.7);
      this.audio.vibrate(vibration.whistle);
      this.ui.showCaption('violation');
      this.celebratingTeam = null;
    });

    events.on('kickoff', () => {
      this.celebratingTeam = null;
      if (this.mode === 'localTwoPlayer') this.sharedCamera.snapTo(this.cameraFocus());
    });

    events.on('ballLive', () => {
      this.audio.play('countdown');
    });

    events.on('matchEnd', () => {
      this.phase = 'finished';
      this.audio.play('whistle');
      this.audio.vibrate(vibration.whistle);
      this.ui.showCaption('whistle');
      this.audio.stopMusic();
      this.session?.resetControllers();
      this.hideAllTouchPads();
      this.aimIndicator.hide();

      const state = this.match.state;
      const outcome = outcomeOf(state);
      this.celebratingTeam = outcome === 'draw' ? null : outcome === 'homeWin' ? 'home' : 'away';
      this.defeatedTeam = outcome === 'draw' ? null : outcome === 'homeWin' ? 'away' : 'home';

      const home = state.players.find((player) => player.team === 'home');
      const away = state.players.find((player) => player.team === 'away');
      this.ui.setHudVisible(false);
      this.ui.showResultStats(
        [...state.players]
          .sort(
            (a, b) =>
              a.team.localeCompare(b.team) || a.slotIndex - b.slotIndex || a.id.localeCompare(b.id),
          )
          .map((player) => ({
            name: player.name,
            team: player.team,
            stats: state.stats[player.id] ?? createPlayerStats(),
          })),
      );
      this.ui.showResult(
        outcome,
        state.score.home,
        state.score.away,
        this.mode === 'localTwoPlayer' && home && away
          ? { home: home.name, away: away.name }
          : undefined,
      );
    });
  }

  private bindWindowEvents(): void {
    const onResize = () => this.handleResize();
    const onVisibility = () => this.handleVisibility();
    const onBlur = () => this.handleBlur();
    const onContextMenu = (event: Event) => event.preventDefault();
    const onGesture = (event: Event) => event.preventDefault();
    const onKeyDown = (event: KeyboardEvent) => {
      // The bindings editor swallows the next key press.
      if (this.ui.isCapturingKey) {
        event.preventDefault();
        this.ui.captureKey(event.code);
        return;
      }
      if (event.code === 'Escape') this.handleEscape();
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKeyDown);
    this.canvas.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('gesturestart', onGesture);
    document.addEventListener('dblclick', onGesture);

    // Mouse drag on the pitch swings the view, the same way a finger does on
    // the middle of a phone screen. The canvas has nothing else to click.
    const onLookDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || this.lookPointerId !== null) return;
      if (this.phase !== 'playing' || this.mode === 'localTwoPlayer') return;
      this.lookPointerId = event.pointerId;
      this.lookPointerLast = { x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    };
    const onLookMove = (event: PointerEvent) => {
      if (this.lookPointerId !== event.pointerId) return;
      this.pointerLook.x += (event.clientX - this.lookPointerLast.x) / (window.innerWidth || 1);
      this.pointerLook.y += (event.clientY - this.lookPointerLast.y) / (window.innerHeight || 1);
      this.lookPointerLast = { x: event.clientX, y: event.clientY };
    };
    const onLookUp = (event: PointerEvent) => {
      if (this.lookPointerId !== event.pointerId) return;
      this.lookPointerId = null;
    };
    this.canvas.addEventListener('pointerdown', onLookDown);
    this.canvas.addEventListener('pointermove', onLookMove);
    this.canvas.addEventListener('pointerup', onLookUp);
    this.canvas.addEventListener('pointercancel', onLookUp);

    const unsubscribeDisconnect = this.devices.events.on('gamepadDisconnected', () => {
      if (this.phase === 'lobby') this.renderLobby('בקר התנתק.');
    });
    const unsubscribeConnect = this.devices.events.on('gamepadConnected', () => {
      if (this.phase === 'lobby') this.renderLobby();
    });

    this.cleanups.push(() => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKeyDown);
      this.canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('gesturestart', onGesture);
      document.removeEventListener('dblclick', onGesture);
      this.canvas.removeEventListener('pointerdown', onLookDown);
      this.canvas.removeEventListener('pointermove', onLookMove);
      this.canvas.removeEventListener('pointerup', onLookUp);
      this.canvas.removeEventListener('pointercancel', onLookUp);
      unsubscribeDisconnect();
      unsubscribeConnect();
    });
  }

  private handleEscape(): void {
    if (this.mode === 'online' && this.phase === 'playing') {
      this.ui.showScreen(this.ui.activeScreen === 'pause' ? null : 'pause');
      return;
    }
    if (this.phase === 'playing' || (this.phase === 'paused' && this.ui.activeScreen === 'pause')) {
      this.togglePause();
    }
  }

  private handleResize(): void {
    this.engine.resize();
    this.quality.applyPixelRatio();
    const aspect = this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    this.soloCamera.applyAspect(aspect);
    this.sharedCamera.applyAspect(aspect);
    this.updateOrientationNotice();
  }

  private updateOrientationNotice(): void {
    const portrait = window.innerHeight > window.innerWidth;
    const small = Math.min(window.innerWidth, window.innerHeight) < 560;
    const shouldWarn = portrait && small && isTouchDevice();
    this.ui.setRotateNoticeVisible(shouldWarn);
    if (shouldWarn && this.phase === 'playing') this.pause();

    // Two people sharing a phone deserve a heads-up, but never a blocker.
    // The threshold sits above a typical phone in landscape (844-932 CSS px)
    // and below a small tablet, which is where sharing starts to work.
    const usingTouchPads =
      this.session?.slots.some((slot) => slot.controller.kind === 'touch') ?? false;
    if (
      this.mode === 'localTwoPlayer' &&
      usingTouchPads &&
      !portrait &&
      window.innerWidth < 1000 &&
      isTouchDevice()
    ) {
      this.ui.showSmallScreenAdvice();
    }
  }

  private handleVisibility(): void {
    if (document.hidden) {
      this.audio.suspend();
      this.audio.stopMusic();
      // Online, hiding the tab does not stop the match; the view simply
      // catches up from the server's snapshots when it comes back.
      if (this.phase === 'playing' && this.mode !== 'online') this.pause();
      this.engine.stopRenderLoop();
    } else {
      this.loop.reset();
      this.engine.runRenderLoop(() => this.renderFrame());
      if (this.phase !== 'paused') this.audio.resume();
    }
  }

  private handleBlur(): void {
    this.keyboard.clear();
    this.session?.resetControllers();
    // Dropping the held keys is right in every mode; stopping is not, because
    // an online match keeps going on the server with or without this window.
    if (this.phase === 'playing' && this.mode !== 'online') this.pause();
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  private applySettings(settings: GameSettings): void {
    const qualityChanged = settings.quality !== this.settings.quality;
    this.settings = settings;
    saveSettings(settings);

    this.audio.setMasterVolume(settings.masterVolume);
    this.audio.setMusicVolume(settings.musicVolume);
    this.audio.setVibrationEnabled(settings.vibration);
    if (settings.musicVolume > 0 && this.phase === 'playing') this.audio.startMusic();

    this.sharedCamera.setShakeLevel(settings.cameraShake);
    this.sharedCamera.setReduceMotion(settings.accessibility.reduceCameraMotion);
    this.effects.setReduceFlashes(settings.accessibility.reduceFlashes);
    this.effects.setQuality(settings.quality);
    // The lowest preset drops the rings: four extra transparent meshes is not
    // what a phone struggling to hold 30 frames needs. The arrows stay —
    // they cost nothing and they are the difference between playing and
    // guessing where the ball went.
    this.markers.setEnabled(settings.quality !== 'low');
    this.session?.setAimAssist(settings.aimAssist);

    for (const slot of this.session?.slots ?? []) {
      const controller = slot.controller;
      if (controller instanceof HumanGamepadController) controller.setDeadZone(settings.deadZone);
      if (controller instanceof HumanKeyboardController) {
        controller.setSensitivity(settings.sensitivity);
        if (slot.controller.deviceId === 'keyboard-left') {
          controller.setKeyMap(settings.keyBindings.left);
        } else if (slot.controller.deviceId === 'keyboard-right') {
          controller.setKeyMap(settings.keyBindings.right);
        }
      }
      if (controller instanceof HumanTouchController)
        controller.setSensitivity(settings.sensitivity);
    }
    for (const pad of this.touchPads.values()) pad.setSensitivity(settings.sensitivity);

    this.keyboard.own(ownedKeyCodes(settings));

    if (qualityChanged) {
      this.applyQuality(settings.quality);
      this.effects.setQuality(settings.quality);
    }
  }

  private rebindKey(profile: KeyboardProfileId, action: BindableAction, code: string): void {
    const bindings = {
      left: { ...this.settings.keyBindings.left },
      right: { ...this.settings.keyBindings.right },
    };
    const target = profile === 'keyboard-left' ? bindings.left : bindings.right;
    target[action] = [code];
    this.applySettings({ ...this.settings, keyBindings: bindings });
    this.ui.applySettingsToForm(this.settings);
  }

  private resetBindings(): void {
    this.applySettings({
      ...this.settings,
      keyBindings: {
        left: defaultKeyMapFor('keyboard-left'),
        right: defaultKeyMapFor('keyboard-right'),
      },
    });
    this.ui.applySettingsToForm(this.settings);
  }

  /** Read-only snapshot for the end-to-end tests. Never used by the game. */
  inspectState(): MatchState {
    return this.match.state;
  }

  inspectMode(): MatchMode {
    return this.mode;
  }

  inspectPhase(): string {
    return this.phase;
  }

  inspectOnline(): {
    stage: string;
    serverTick: number;
    ping: number;
    mode: OnlineMode;
    team: TeamId;
    playerId: string;
    seated: number;
    isPrivate: boolean;
    drift: { mean: number; max: number; snaps: number };
  } | null {
    const online = this.online;
    if (!online) return null;
    const snapshot = online.client.state;
    let seated = 0;
    snapshot?.players.forEach((player) => {
      if (player.name.length > 0) seated += 1;
    });
    return {
      stage: online.stage,
      serverTick: snapshot?.tick ?? -1,
      ping: online.roundTripMs,
      mode: online.mode,
      team: online.localTeam,
      playerId: online.localPlayerId,
      seated,
      isPrivate: snapshot?.isPrivate ?? false,
      drift: online.drift,
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.closeLobby();
    this.disposeSession();
    for (const pad of this.touchPads.values()) pad.dispose();
    this.touchPads.clear();
    this.devices.dispose();
    this.keyboard.dispose();
    this.effects.dispose();
    this.audio.dispose();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}

function frameSoundFor(part: GoalPart): 'post' | 'crossbar' | 'junction' {
  if (part === 'crossbar') return 'crossbar';
  if (part.endsWith('Junction')) return 'junction';
  return 'post';
}

/** Kit that is guaranteed to differ from the one already chosen. */
/** Most players any mode fields. 2×2 is the largest; the pools size to it. */
const MAX_PLAYERS = 4;

/** One block of the controls primer. */
interface PrimerSection {
  title: string;
  rows: [string, string][];
}

/**
 * Turns a key map into primer rows. Generated rather than written out, so a
 * player who has remapped their keys is taught the keys they actually have.
 */
function keyboardSection(title: string, map: KeyMap): PrimerSection {
  const rows: [string, string][] = [];
  for (const action of BINDABLE_ACTIONS) {
    const codes = map[action];
    if (codes.length === 0) continue;
    rows.push([codes.map(keyLabel).join(' / '), ACTION_LABELS[action]]);
  }
  return { title, rows };
}

/** The HUD layer the off-screen arrows live in. Present in index.html. */
function requireArrowLayer(): HTMLElement {
  const element = document.getElementById('hud-arrows');
  if (!element) throw new Error('missing #hud-arrows');
  return element;
}

/** The link a host shares. Same page, plus the code as a query parameter. */
function inviteLinkFor(code: string): string {
  if (typeof window === 'undefined') return code;
  const url = new URL(window.location.href);
  url.search = `?invite=${code}`;
  url.hash = '';
  return url.toString();
}

function pickContrastingKit(colorId: number): number {
  return colorId === 1 ? 0 : 1;
}

/** Every key the game consumes, so the page never scrolls during a match. */
function ownedKeyCodes(settings: GameSettings): string[] {
  const codes = new Set<string>(['Space', 'Escape']);
  for (const map of [settings.keyBindings.left, settings.keyBindings.right, soloKeyMap()]) {
    for (const list of Object.values(map)) {
      for (const code of list) codes.add(code);
    }
  }
  return [...codes];
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  );
}

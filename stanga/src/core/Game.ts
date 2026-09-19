/**
 * Game — the composition root.
 *
 * It owns the Babylon engine and scene, the fixed-timestep loop, and the wiring
 * between input, AI, simulation, rendering, audio and UI. Every subsystem it
 * touches is replaceable; in particular, swapping the local simulation for a
 * networked one only changes where commands come from and who owns MatchState.
 */
import { Engine } from '@babylonjs/core/Engines/engine';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Scene } from '@babylonjs/core/scene';
import { AIController } from '../ai/AIController';
import { AudioManager } from '../audio/AudioManager';
import { GameConfig, type Difficulty } from '../config/GameConfig';
import { MatchEngine } from '../game/MatchEngine';
import { outcomeOf } from '../game/MatchRules';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { AimIndicator } from '../rendering/AimIndicator';
import { buildArena } from '../rendering/Arena';
import { CameraRig } from '../rendering/CameraRig';
import { ContactShadows } from '../rendering/ContactShadows';
import { QualityManager } from '../rendering/QualityManager';
import { UIManager } from '../ui/UIManager';
import { LOADING_STEPS } from '../ui/labels';
import { loadSettings, saveSettings, type GameSettings } from './Settings';
import { SimulationLoop } from './SimulationLoop';

type AppPhase = 'loading' | 'menu' | 'playing' | 'paused' | 'finished';

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private engine!: Engine;
  private scene!: Scene;
  private world!: PhysicsWorld;
  private match!: MatchEngine;
  private camera!: CameraRig;
  private quality!: QualityManager;
  private aimIndicator!: AimIndicator;
  private contactShadows!: ContactShadows;
  private readonly shadowHandles = new Map<string, number>();
  private ballShadowHandle = -1;
  private readonly audio = new AudioManager();
  private readonly ai: AIController;
  private readonly input: InputManager;
  private readonly ui: UIManager;
  private readonly loop: SimulationLoop;

  private settings: GameSettings;
  private phase: AppPhase = 'loading';
  private disposed = false;
  private lastVisualUpdate = 0;
  private readonly cleanups: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, touchParent: HTMLElement) {
    this.canvas = canvas;
    this.settings = loadSettings();

    this.ui = new UIManager(
      {
        onPlayPressed: () => this.audio.unlock(),
        onStartMatch: (difficulty) => this.startMatch(difficulty),
        onResume: () => this.resume(),
        onRestart: () => this.startMatch(this.settings.difficulty),
        onExitToMenu: () => this.exitToMenu(),
        onPauseRequested: () => this.togglePause(),
        onSettingsChanged: (settings) => this.applySettings(settings),
        onInteraction: () => this.audio.unlock(),
        onReload: () => window.location.reload(),
      },
      this.settings,
    );

    this.input = new InputManager({
      playerId: 'home-1',
      onPause: () => this.togglePause(),
      touchParent,
    });

    this.ai = new AIController('away-1', 'away', this.settings.difficulty);
    this.loop = new SimulationLoop((dt, tick) => this.simulate(dt, tick));
  }

  /** Boots the engine, loads physics and builds the scene. */
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
    this.world = await PhysicsWorld.create(this.scene);

    report(2, 0.45);
    const arena = buildArena(this.scene, this.world, GameConfig.quality[this.settings.quality]);

    report(3, 0.62);
    this.quality = new QualityManager(this.engine, arena.sun, arena.shadowCasters);

    report(4, 0.78);
    this.match = new MatchEngine(this.scene, this.world);
    this.camera = new CameraRig(this.scene);
    this.aimIndicator = new AimIndicator(this.scene);

    this.quality.addCaster(this.match.ball.mesh);
    for (const player of this.match.players) {
      for (const mesh of player.meshes) this.quality.addCaster(mesh);
    }
    this.quality.apply(this.settings.quality);

    this.contactShadows = new ContactShadows(this.scene, arena.sun.direction);
    for (const player of this.match.players) {
      this.shadowHandles.set(player.id, this.contactShadows.create(player.id, 0.62));
    }
    this.ballShadowHandle = this.contactShadows.create('ball', GameConfig.ball.radius * 2.1, 0.9);

    this.bindMatchEvents();
    this.bindWindowEvents();
    this.input.attach();
    this.applySettings(this.settings);
    this.handleResize();

    report(5, 1);
    await this.scene.whenReadyAsync();

    this.engine.runRenderLoop(() => this.renderFrame());

    this.phase = 'menu';
    this.ui.showScreen('menu');
    this.ui.setHudVisible(false);
  }

  // ── Match lifecycle ─────────────────────────────────────────────────────────

  startMatch(difficulty: Difficulty): void {
    this.audio.unlock();
    this.settings = { ...this.settings, difficulty };
    saveSettings(this.settings);

    this.ai.setDifficulty(difficulty);
    this.ai.reset();
    this.match.start();
    this.loop.resetTicks();

    this.ui.resetHud();
    this.ui.showScreen(null);
    this.ui.setHudVisible(true);
    this.input.setTouchEnabled(isTouchDevice());
    this.input.clear();

    const human = this.match.state.players.find((player) => player.isHuman);
    if (human) {
      this.camera.snapTo(human.position, this.match.state.ball.position, human.team);
    }

    this.phase = 'playing';
    this.audio.play('whistle');
    this.audio.vibrate(GameConfig.audio.vibration.whistle);
    if (this.settings.musicVolume > 0) this.audio.startMusic();
  }

  togglePause(): void {
    if (this.phase === 'playing') this.pause();
    else if (this.phase === 'paused') this.resume();
  }

  pause(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.input.clear();
    this.loop.reset();
    this.audio.suspend();
    this.ui.showScreen('pause');
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.loop.reset();
    this.input.clear();
    this.audio.resume();
    this.ui.showScreen(null);
  }

  exitToMenu(): void {
    this.phase = 'menu';
    this.loop.reset();
    this.input.clear();
    this.input.setTouchEnabled(false);
    this.audio.stopMusic();
    this.audio.resume();
    this.ui.setHudVisible(false);
    this.ui.showScreen('menu');
  }

  // ── Frame ───────────────────────────────────────────────────────────────────

  private renderFrame(): void {
    if (this.disposed) return;
    const deltaMs = this.engine.getDeltaTime();

    if (this.phase === 'playing') {
      this.loop.advance(deltaMs);
    }

    const dtSeconds = Math.min(deltaMs, GameConfig.simulation.maxFrameDeltaMs) / 1000;
    this.updatePresentation(dtSeconds);
    this.scene.render();
  }

  /** Everything that happens at render rate: visuals, camera, HUD. */
  private updatePresentation(dt: number): void {
    const state = this.match.state;
    const human = state.players.find((player) => player.isHuman);

    this.match.updateVisuals(dt);

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

    if (human) {
      this.camera.update(human.position, state.ball.position, human.team, dt);
    }

    const charge = human?.kickCharge ?? 0;
    this.aimIndicator.update(human, charge, this.input.isLofted);
    this.input.setChargeRatio(charge);

    // The HUD does not need a refresh at 120Hz.
    this.lastVisualUpdate += dt;
    if (this.lastVisualUpdate >= 1 / 30) {
      this.lastVisualUpdate = 0;
      if (this.phase === 'playing' || this.phase === 'paused') {
        this.ui.updateHud(state, charge, this.input.isLofted);
      }
    }
  }

  /** One fixed simulation tick: gather commands, then advance the match. */
  private simulate(dt: number, tick: number): void {
    const state = this.match.state;
    const human = state.players.find((player) => player.isHuman);

    this.match.submitCommand(
      this.input.buildCommand(tick, this.camera.movementYaw, human?.facing ?? 0),
    );
    this.match.submitCommand(this.ai.update(state, dt, tick));
    this.match.step(dt, tick);
  }

  // ── Wiring ──────────────────────────────────────────────────────────────────

  private bindMatchEvents(): void {
    const events = this.match.events;
    const vibration = GameConfig.audio.vibration;

    events.on('kick', ({ power }) => {
      this.audio.play(power > 0.45 ? 'kick' : 'kickSoft', 0.4 + power * 0.6);
      this.audio.vibrate(vibration.kick);
    });

    events.on('frameHit', ({ part, speed }) => {
      const intensity = Math.min(1, speed / GameConfig.ball.maxSpeed + 0.35);
      if (part === 'crossbar') {
        this.audio.play('crossbar', intensity);
        this.audio.vibrate(vibration.crossbar);
      } else if (part.endsWith('Junction')) {
        this.audio.play('junction', intensity);
        this.audio.vibrate(vibration.junction);
      } else {
        this.audio.play('post', intensity);
        this.audio.vibrate(vibration.post);
      }
    });

    events.on('scored', (record) => {
      this.audio.play('goal');
      this.audio.vibrate(vibration.goal);
      this.ui.showEvent(record.kind, record.points);
    });

    events.on('touch', () => {
      this.audio.play('kickSoft', 0.35);
    });

    events.on('wallHit', ({ speed }) => {
      this.audio.play('tackle', Math.min(0.7, speed / GameConfig.ball.maxSpeed + 0.2));
    });

    events.on('ballLive', () => {
      this.audio.play('countdown');
    });

    events.on('matchEnd', () => {
      this.phase = 'finished';
      this.audio.play('whistle');
      this.audio.vibrate(vibration.whistle);
      this.audio.stopMusic();
      this.input.clear();
      this.input.setTouchEnabled(false);
      this.aimIndicator.hide();
      const state = this.match.state;
      this.ui.setHudVisible(false);
      this.ui.showResult(outcomeOf(state), state.score.home, state.score.away);
    });
  }

  private bindWindowEvents(): void {
    const onResize = () => this.handleResize();
    const onVisibility = () => this.handleVisibility();
    const onBlur = () => this.handleBlur();
    const onContextMenu = (event: Event) => event.preventDefault();
    const onGesture = (event: Event) => event.preventDefault();

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    this.canvas.addEventListener('contextmenu', onContextMenu);
    // Safari pinch-zoom guards.
    document.addEventListener('gesturestart', onGesture);
    document.addEventListener('dblclick', onGesture);

    this.cleanups.push(() => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      this.canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('gesturestart', onGesture);
      document.removeEventListener('dblclick', onGesture);
    });
  }

  private handleResize(): void {
    this.engine.resize();
    this.quality.applyPixelRatio();
    const aspect = this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    this.camera.applyAspect(aspect);
    this.updateOrientationNotice();
  }

  private updateOrientationNotice(): void {
    // Only phones are asked to rotate; a narrow desktop window stays playable.
    const portrait = window.innerHeight > window.innerWidth;
    const small = Math.min(window.innerWidth, window.innerHeight) < 560;
    const shouldWarn = portrait && small && isTouchDevice();
    this.ui.setRotateNoticeVisible(shouldWarn);
    if (shouldWarn && this.phase === 'playing') this.pause();
  }

  private handleVisibility(): void {
    if (document.hidden) {
      this.audio.suspend();
      this.audio.stopMusic();
      if (this.phase === 'playing') this.pause();
      this.engine.stopRenderLoop();
    } else {
      this.loop.reset();
      this.engine.runRenderLoop(() => this.renderFrame());
      if (this.phase !== 'paused') this.audio.resume();
    }
  }

  private handleBlur(): void {
    this.input.clear();
    if (this.phase === 'playing') this.pause();
  }

  private applySettings(settings: GameSettings): void {
    const qualityChanged = settings.quality !== this.settings.quality;
    this.settings = settings;
    saveSettings(settings);

    this.audio.setMasterVolume(settings.masterVolume);
    this.audio.setMusicVolume(settings.musicVolume);
    this.audio.setVibrationEnabled(settings.vibration);
    if (settings.musicVolume > 0 && this.phase === 'playing') this.audio.startMusic();

    this.input.setSensitivity(settings.sensitivity);
    this.ai.setDifficulty(settings.difficulty);

    if (qualityChanged) {
      this.quality.apply(settings.quality);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.input.dispose();
    this.audio.dispose();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  );
}

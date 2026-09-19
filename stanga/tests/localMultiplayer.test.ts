/**
 * Local two-player: the rules that make two people on one device work.
 *
 * These tests use a fake engine so they can exercise MatchSession, the
 * controllers and the device rules without a browser or a physics world.
 */
import { describe, expect, it, vi } from 'vitest';
import { GameConfig } from '../src/config/GameConfig';
import { Rng } from '../src/core/Rng';
import { AIController } from '../src/ai/AIController';
import { MatchSession, hasDuplicateDevices, type PlayerSlot } from '../src/game/MatchSession';
import type { MatchEngine } from '../src/game/MatchEngine';
import { createMatchState, type MatchState } from '../src/game/MatchState';
import { KeyboardState } from '../src/input/KeyboardState';
import { HumanKeyboardController } from '../src/input/controllers/KeyboardController';
import { CompositeController } from '../src/input/controllers/CompositeController';
import {
  availableDevices,
  gamepadKey,
  profileForKey,
  KEYBOARD_DEVICES,
  type InputDevice,
} from '../src/input/DeviceManager';
import { defaultLeftKeyMap, defaultRightKeyMap } from '../src/input/KeyBindings';
import type { PlayerCommand } from '../src/input/PlayerCommand';
import { createPlayerCommand } from '../src/input/PlayerCommand';
import type { ControlContext, PlayerController } from '../src/input/PlayerController';

/** Minimal stand-in for MatchEngine: records what the session submits. */
class FakeEngine {
  readonly state: MatchState = createMatchState();
  readonly submitted: PlayerCommand[] = [];

  submitCommand(command: PlayerCommand): void {
    // The session reuses command objects, so snapshot what was submitted.
    this.submitted.push({ ...command });
  }
}

function asEngine(fake: FakeEngine): MatchEngine {
  return fake as unknown as MatchEngine;
}

/** A controller that reports a fixed command, for isolating the session. */
class StubController implements PlayerController {
  readonly kind = 'gamepad' as const;
  connected = true;
  resetCount = 0;
  /**
   * The session reuses one ControlContext across slots to avoid allocating per
   * tick, so a controller must read it during poll rather than retain it.
   */
  seenPlayerId: string | undefined;
  seenCameraYaw = 0;
  private readonly command: PlayerCommand;

  constructor(
    readonly deviceId: string,
    readonly label: string,
    private readonly move: { x: number; y: number },
  ) {
    this.command = createPlayerCommand('');
  }

  poll(playerId: string, tickId: number, context: ControlContext): PlayerCommand {
    this.seenPlayerId = context.player?.id;
    this.seenCameraYaw = context.cameraYaw;
    this.command.playerId = playerId;
    this.command.tickId = tickId;
    this.command.moveX = this.move.x;
    this.command.moveY = this.move.y;
    return this.command;
  }

  reset(): void {
    this.resetCount += 1;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

function makeSession(controllers: [PlayerController, PlayerController], aimAssist = 0.5) {
  const engine = new FakeEngine();
  const slots: PlayerSlot[] = [
    {
      playerId: 'home-1',
      team: 'home',
      name: 'שחקן 1',
      colorId: 0,
      controller: controllers[0],
    },
    {
      playerId: 'away-1',
      team: 'away',
      name: 'שחקן 2',
      colorId: 1,
      controller: controllers[1],
    },
  ];
  const session = new MatchSession(asEngine(engine), {
    mode: 'localTwoPlayer',
    slots,
    aimAssist,
  });
  return { engine, session, slots };
}

describe('two controllers drive two different players', () => {
  it('submits one command per slot, each addressed to its own player', () => {
    const { engine, session } = makeSession([
      new StubController('pad-a', 'בקר א', { x: 1, y: 0 }),
      new StubController('pad-b', 'בקר ב', { x: -1, y: 0 }),
    ]);

    session.collectCommands(10, 0, 1 / 60);

    expect(engine.submitted).toHaveLength(2);
    expect(engine.submitted[0]!.playerId).toBe('home-1');
    expect(engine.submitted[1]!.playerId).toBe('away-1');
    // Distinct intent, so neither controller can be driving the other player.
    expect(engine.submitted[0]!.moveX).toBe(1);
    expect(engine.submitted[1]!.moveX).toBe(-1);
  });

  it('gives each controller its own player state, not a shared one', () => {
    const first = new StubController('pad-a', 'בקר א', { x: 0, y: 1 });
    const second = new StubController('pad-b', 'בקר ב', { x: 0, y: -1 });
    const { session } = makeSession([first, second]);

    session.collectCommands(1, 1.25, 1 / 60);

    expect(first.seenPlayerId).toBe('home-1');
    expect(second.seenPlayerId).toBe('away-1');
    // Both see the same shared camera, which is what makes one view workable.
    expect(first.seenCameraYaw).toBe(1.25);
    expect(second.seenCameraYaw).toBe(1.25);
  });

  it('marks both slots as human and mirrors names and colours into the state', () => {
    const { engine } = makeSession([
      new StubController('pad-a', 'בקר א', { x: 0, y: 0 }),
      new StubController('pad-b', 'בקר ב', { x: 0, y: 0 }),
    ]);

    const home = engine.state.players.find((player) => player.id === 'home-1');
    const away = engine.state.players.find((player) => player.id === 'away-1');
    expect(home?.isHuman).toBe(true);
    expect(away?.isHuman).toBe(true);
    expect(home?.name).toBe('שחקן 1');
    expect(away?.name).toBe('שחקן 2');
    expect(home?.colorId).toBe(0);
    expect(away?.colorId).toBe(1);
  });

  it('keeps the AI marked as not human, so the HUD shows one meter panel', () => {
    const engine = new FakeEngine();
    const session = new MatchSession(asEngine(engine), {
      mode: 'vsComputer',
      aimAssist: 0.5,
      slots: [
        {
          playerId: 'home-1',
          team: 'home',
          name: 'שחקן 1',
          colorId: 0,
          controller: new StubController('solo', 'מקלדת', { x: 0, y: 0 }),
        },
        {
          playerId: 'away-1',
          team: 'away',
          name: 'מחשב',
          colorId: 1,
          controller: new AIController('away-1', 'away', 'normal', new Rng(1)),
        },
      ],
    });

    expect(engine.state.players.find((p) => p.id === 'home-1')?.isHuman).toBe(true);
    expect(engine.state.players.find((p) => p.id === 'away-1')?.isHuman).toBe(false);
    expect(session.humanSlots).toHaveLength(1);
  });

  it('never gives the AI aim assist, and scales it down for a keyboard', () => {
    const keyboard = new KeyboardState();
    const engine = new FakeEngine();
    new MatchSession(asEngine(engine), {
      mode: 'localTwoPlayer',
      aimAssist: 1,
      slots: [
        {
          playerId: 'home-1',
          team: 'home',
          name: 'a',
          colorId: 0,
          controller: new HumanKeyboardController(
            'keyboard-left',
            'מקלדת',
            defaultLeftKeyMap(),
            keyboard,
          ),
        },
        {
          playerId: 'away-1',
          team: 'away',
          name: 'b',
          colorId: 1,
          controller: new AIController('away-1', 'away', 'normal', new Rng(1)),
        },
      ],
    });

    expect(engine.state.players.find((p) => p.id === 'home-1')?.aimAssist).toBeCloseTo(
      GameConfig.aimAssist.keyboardScale,
    );
    expect(engine.state.players.find((p) => p.id === 'away-1')?.aimAssist).toBe(0);
  });

  it('resets every controller together', () => {
    const first = new StubController('pad-a', 'בקר א', { x: 0, y: 0 });
    const second = new StubController('pad-b', 'בקר ב', { x: 0, y: 0 });
    const { session } = makeSession([first, second]);

    session.resetControllers();
    expect(first.resetCount).toBe(1);
    expect(second.resetCount).toBe(1);
  });

  it('reports a disconnected controller and names the slot it belongs to', () => {
    const first = new StubController('pad-a', 'בקר א', { x: 0, y: 0 });
    const second = new StubController('pad-b', 'בקר ב', { x: 0, y: 0 });
    const { session } = makeSession([first, second]);

    expect(session.findDisconnected()).toHaveLength(0);

    second.connected = false;
    const reports = session.findDisconnected();
    expect(reports).toHaveLength(1);
    expect(reports[0]!.slot.playerId).toBe('away-1');
    expect(reports[0]!.label).toBe('בקר ב');
  });

  it('swaps sides without touching the controllers', () => {
    const { session, slots } = makeSession([
      new StubController('pad-a', 'בקר א', { x: 0, y: 0 }),
      new StubController('pad-b', 'בקר ב', { x: 0, y: 0 }),
    ]);

    expect(slots[0]!.team).toBe('home');
    session.swapSides();
    expect(slots[0]!.team).toBe('away');
    expect(slots[1]!.team).toBe('home');
    expect(slots[0]!.controller.deviceId).toBe('pad-a');
  });
});

describe('one device may never drive two players', () => {
  it('detects two slots sharing a device', () => {
    const shared = new StubController('pad-a', 'בקר א', { x: 0, y: 0 });
    const slots: PlayerSlot[] = [
      { playerId: 'home-1', team: 'home', name: 'a', colorId: 0, controller: shared },
      { playerId: 'away-1', team: 'away', name: 'b', colorId: 1, controller: shared },
    ];
    expect(hasDuplicateDevices(slots)).toBe(true);
  });

  it('accepts two distinct devices', () => {
    const slots: PlayerSlot[] = [
      {
        playerId: 'home-1',
        team: 'home',
        name: 'a',
        colorId: 0,
        controller: new StubController('pad-a', 'בקר א', { x: 0, y: 0 }),
      },
      {
        playerId: 'away-1',
        team: 'away',
        name: 'b',
        colorId: 1,
        controller: new StubController('pad-b', 'בקר ב', { x: 0, y: 0 }),
      },
    ];
    expect(hasDuplicateDevices(slots)).toBe(false);
  });

  it('treats the two keyboard halves as separate devices', () => {
    const ids = KEYBOARD_DEVICES.map((device) => device.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain('keyboard-left');
    expect(ids).toContain('keyboard-right');
  });

  it('gives two identical gamepads different identities', () => {
    const padA = { index: 0, id: 'Generic Pad' } as Gamepad;
    const padB = { index: 1, id: 'Generic Pad' } as Gamepad;
    expect(gamepadKey(padA)).not.toBe(gamepadKey(padB));
  });

  it('hides a device once it has been taken', () => {
    const all: InputDevice[] = [
      { id: 'keyboard-left', kind: 'keyboard', label: 'שמאל', connected: true },
      { id: 'keyboard-right', kind: 'keyboard', label: 'ימין', connected: true },
      { id: 'gamepad:0:Pad', kind: 'gamepad', label: 'בקר', connected: true },
      { id: 'gamepad:1:Pad', kind: 'gamepad', label: 'בקר 2', connected: false },
    ];
    const free = availableDevices(all, ['keyboard-left']);
    expect(free.map((device) => device.id)).toEqual(['keyboard-right', 'gamepad:0:Pad']);
  });
});

describe('split keyboard maps keys to the right player', () => {
  function pollBoth(keyboard: KeyboardState, tick: number) {
    const left = new HumanKeyboardController(
      'keyboard-left',
      'שמאל',
      defaultLeftKeyMap(),
      keyboard,
    );
    const right = new HumanKeyboardController(
      'keyboard-right',
      'ימין',
      defaultRightKeyMap(),
      keyboard,
    );
    const state = createMatchState();
    const context: ControlContext = {
      cameraYaw: 0,
      player: undefined,
      state,
      dt: 1 / 60,
    };
    return {
      left: { ...left.poll('home-1', tick, context) },
      right: { ...right.poll('away-1', tick, context) },
    };
  }

  it('routes W to player 1 only', () => {
    const keyboard = new KeyboardState();
    keyboard.attach(makeFakeWindow(['KeyW']) as unknown as Window);
    const { left, right } = pollBoth(keyboard, 1);
    expect(left.moveY).toBeGreaterThan(0);
    expect(right.moveY).toBe(0);
    expect(right.moveX).toBe(0);
  });

  it('routes the arrow keys to player 2 only', () => {
    const keyboard = new KeyboardState();
    keyboard.attach(makeFakeWindow(['ArrowUp']) as unknown as Window);
    const { left, right } = pollBoth(keyboard, 1);
    expect(right.moveY).toBeGreaterThan(0);
    expect(left.moveY).toBe(0);
  });

  it('routes F and K to the right player as separate shoot buttons', () => {
    const keyboard = new KeyboardState();
    keyboard.attach(makeFakeWindow(['KeyF']) as unknown as Window);
    const { left, right } = pollBoth(keyboard, 1);
    expect(left.shootHeld).toBe(true);
    expect(right.shootHeld).toBe(false);
  });

  it('lets both players act on the very same tick', () => {
    const keyboard = new KeyboardState();
    keyboard.attach(makeFakeWindow(['KeyD', 'ArrowLeft', 'KeyF', 'KeyK']) as unknown as Window);
    const { left, right } = pollBoth(keyboard, 1);
    expect(left.moveX).toBeGreaterThan(0);
    expect(right.moveX).toBeLessThan(0);
    expect(left.shootHeld).toBe(true);
    expect(right.shootHeld).toBe(true);
  });

  it('assigns a join key to the half of the keyboard it belongs to', () => {
    expect(profileForKey('KeyW')).toBe('keyboard-left');
    expect(profileForKey('KeyF')).toBe('keyboard-left');
    expect(profileForKey('ArrowUp')).toBe('keyboard-right');
    expect(profileForKey('KeyK')).toBe('keyboard-right');
    expect(profileForKey('F9')).toBeNull();
  });
});

describe('composite controller, used only for solo play', () => {
  it('merges two sources without letting an idle one cancel an active one', () => {
    const idle = new StubController('a', 'a', { x: 0, y: 0 });
    const active = new StubController('b', 'b', { x: 0.8, y: -0.2 });
    const composite = new CompositeController('solo', 'מקלדת ומגע', [idle, active]);
    const state = createMatchState();

    const command = composite.poll('home-1', 1, {
      cameraYaw: 0,
      player: undefined,
      state,
      dt: 1 / 60,
    });

    expect(command.moveX).toBeCloseTo(0.8);
    expect(command.moveY).toBeCloseTo(-0.2);
  });
});

/** Minimal Window stand-in that fires the given keys as keydown on attach. */
function makeFakeWindow(codesDown: string[]) {
  const listeners: Record<string, ((event: KeyboardEvent) => void)[]> = {};
  const fake = {
    addEventListener(type: string, listener: (event: KeyboardEvent) => void) {
      (listeners[type] ??= []).push(listener);
      if (type === 'keydown') {
        for (const code of codesDown) {
          listener({ code, repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
        }
      }
    },
    removeEventListener() {},
  };
  return fake;
}

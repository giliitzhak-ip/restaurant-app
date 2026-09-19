/**
 * MatchSession — the only place that knows who is playing.
 *
 * A session is a list of PlayerSlots, each pairing one player in the match with
 * one controller. Everything else is identical whatever the slots contain:
 *
 *   vs computer : [ Slot(home, human), Slot(away, ai) ]
 *   two players : [ Slot(home, human), Slot(away, human) ]
 *   online (3)  : [ Slot(home, human), Slot(away, network) ]
 *
 * There is deliberately no separate code path for local multiplayer.
 */
import { GameConfig } from '../config/GameConfig';
import { clamp } from '../core/math';
import type { ControlContext, PlayerController } from '../input/PlayerController';
import type { MatchEngine } from './MatchEngine';
import type { MatchState, PlayerState, TeamId } from './MatchState';

export type MatchMode = 'vsComputer' | 'localTwoPlayer';

export interface PlayerSlot {
  readonly playerId: string;
  team: TeamId;
  name: string;
  colorId: number;
  controller: PlayerController;
}

export interface SessionOptions {
  mode: MatchMode;
  slots: PlayerSlot[];
  /** Per-player aim assist strength, 0..1. Applied to the simulation state. */
  aimAssist: number;
}

/** Reported when a controller a slot depends on stops responding. */
export interface DisconnectReport {
  slot: PlayerSlot;
  label: string;
}

export class MatchSession {
  readonly mode: MatchMode;
  readonly slots: PlayerSlot[];
  private aimAssist: number;
  private readonly context: ControlContext;

  constructor(
    private readonly engine: MatchEngine,
    options: SessionOptions,
  ) {
    this.mode = options.mode;
    this.slots = options.slots;
    this.aimAssist = clamp(options.aimAssist, 0, 1);
    this.context = {
      cameraYaw: 0,
      player: undefined,
      state: engine.state,
      dt: GameConfig.simulation.fixedDeltaSeconds,
    };
    this.applyIdentityToState();
  }

  get state(): MatchState {
    return this.engine.state;
  }

  /** Slots driven by a person, in slot order. */
  get humanSlots(): PlayerSlot[] {
    return this.slots.filter((slot) => slot.controller.kind !== 'ai');
  }

  slotFor(playerId: string): PlayerSlot | undefined {
    return this.slots.find((slot) => slot.playerId === playerId);
  }

  setAimAssist(value: number): void {
    this.aimAssist = clamp(value, 0, 1);
    this.applyIdentityToState();
  }

  /**
   * Polls every controller and hands the commands to the engine.
   * Called once per fixed simulation tick, before the engine steps.
   */
  collectCommands(tickId: number, cameraYaw: number, dt: number): void {
    this.context.cameraYaw = cameraYaw;
    this.context.dt = dt;

    for (const slot of this.slots) {
      this.context.player = this.playerState(slot.playerId);
      const command = slot.controller.poll(slot.playerId, tickId, this.context);
      this.engine.submitCommand(command);
    }
  }

  /** Any slot whose device has gone away. Empty when everything is healthy. */
  findDisconnected(): DisconnectReport[] {
    const reports: DisconnectReport[] = [];
    for (const slot of this.slots) {
      if (!slot.controller.isConnected()) {
        reports.push({ slot, label: slot.controller.label });
      }
    }
    return reports;
  }

  resetControllers(): void {
    for (const slot of this.slots) slot.controller.reset();
  }

  /** Swaps which goal each team attacks, before kick-off. */
  swapSides(): void {
    for (const slot of this.slots) {
      slot.team = slot.team === 'home' ? 'away' : 'home';
    }
    this.applyIdentityToState();
  }

  setName(playerId: string, name: string): void {
    const slot = this.slotFor(playerId);
    if (!slot) return;
    slot.name = name.trim().slice(0, 16) || slot.playerId;
    this.applyIdentityToState();
  }

  setColor(playerId: string, colorId: number): void {
    const slot = this.slotFor(playerId);
    if (!slot) return;
    slot.colorId = clamp(Math.round(colorId), 0, GameConfig.kits.length - 1);
    this.applyIdentityToState();
  }

  /** Replaces a slot's controller, e.g. after a gamepad is plugged back in. */
  replaceController(playerId: string, controller: PlayerController): void {
    const slot = this.slotFor(playerId);
    if (!slot) return;
    if (slot.controller !== controller) slot.controller.dispose?.();
    slot.controller = controller;
    controller.reset();
  }

  dispose(): void {
    for (const slot of this.slots) slot.controller.dispose?.();
  }

  /**
   * Pushes names, colours and the aim-assist strength into MatchState.
   * The simulation reads plain values only; it never sees a controller.
   */
  private applyIdentityToState(): void {
    for (const slot of this.slots) {
      const player = this.playerState(slot.playerId);
      if (!player) continue;
      player.name = slot.name;
      player.colorId = slot.colorId;
      player.isHuman = slot.controller.kind !== 'ai';
      // Keyboards already aim precisely, so they are given less help.
      const scale = slot.controller.kind === 'keyboard' ? GameConfig.aimAssist.keyboardScale : 1;
      player.aimAssist = slot.controller.kind === 'ai' ? 0 : this.aimAssist * scale;
    }
  }

  private playerState(playerId: string): PlayerState | undefined {
    return this.engine.state.players.find((player) => player.id === playerId);
  }
}

/** Ensures two slots never share one physical device. */
export function hasDuplicateDevices(slots: readonly PlayerSlot[]): boolean {
  const seen = new Set<string>();
  for (const slot of slots) {
    const id = slot.controller.deviceId;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

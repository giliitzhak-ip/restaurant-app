/**
 * DeviceManager — discovers input devices, runs the join flow, and reports
 * connects and disconnects while a match is running.
 *
 * The rule it enforces everywhere: **one device drives at most one player.**
 * The two keyboard halves are separate logical devices, so a single physical
 * keyboard can legitimately host two players without breaking that rule.
 */
import { EventBus } from '../core/EventBus';
import { describeGamepad, JOIN_BUTTONS, readGamepads } from './controllers/GamepadController';
import type { KeyboardProfileId } from './KeyBindings';
import type { KeyboardState } from './KeyboardState';

export type DeviceKind = 'keyboard' | 'gamepad' | 'touch';

export interface InputDevice {
  /** Unique and stable for the lifetime of the device. */
  id: string;
  kind: DeviceKind;
  label: string;
  /** Gamepad slot index, for gamepads only. */
  padIndex?: number;
  /** Keyboard profile, for keyboards only. */
  profile?: KeyboardProfileId;
  connected: boolean;
}

export interface DeviceEventMap extends Record<string, unknown> {
  /** A device announced itself during the join flow. */
  join: { device: InputDevice };
  gamepadConnected: { device: InputDevice };
  gamepadDisconnected: { device: InputDevice };
  listChanged: { devices: InputDevice[] };
}

export const KEYBOARD_DEVICES: readonly InputDevice[] = [
  {
    id: 'keyboard-left',
    kind: 'keyboard',
    label: 'מקלדת — צד שמאל',
    profile: 'keyboard-left',
    connected: true,
  },
  {
    id: 'keyboard-right',
    kind: 'keyboard',
    label: 'מקלדת — צד ימין',
    profile: 'keyboard-right',
    connected: true,
  },
];

export const TOUCH_DEVICES: readonly InputDevice[] = [
  { id: 'touch-left', kind: 'touch', label: 'מגע — צד שמאל', connected: true },
  { id: 'touch-right', kind: 'touch', label: 'מגע — צד ימין', connected: true },
];

export class DeviceManager {
  readonly events = new EventBus<DeviceEventMap>();

  private readonly gamepads = new Map<string, InputDevice>();
  /** Button state from the previous poll, for edge detection during the join flow. */
  private readonly previousButtons = new Map<number, boolean[]>();
  private listening = false;
  private detachKeyboard: (() => void) | null = null;
  private detachWindow: (() => void) | null = null;
  private readonly touchAvailable: boolean;

  constructor(
    private readonly keyboard: KeyboardState,
    touchAvailable: boolean,
  ) {
    this.touchAvailable = touchAvailable;
  }

  /** Starts watching for gamepad connect/disconnect. Safe to call repeatedly. */
  start(): void {
    if (this.detachWindow) return;
    // The event's gamepad is guaranteed by the spec, but a missing one must not
    // throw out of a window handler and take the render loop down with it.
    const onConnect = (event: GamepadEvent) => {
      if (event.gamepad) this.registerGamepad(event.gamepad);
      else this.refreshGamepads();
    };
    const onDisconnect = (event: GamepadEvent) => {
      if (event.gamepad) this.unregisterGamepad(event.gamepad);
      else this.refreshGamepads();
    };
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    this.detachWindow = () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
    this.refreshGamepads();
  }

  /** Every device the player could assign right now. */
  list(): InputDevice[] {
    const devices: InputDevice[] = [...KEYBOARD_DEVICES.map((device) => ({ ...device }))];
    if (this.touchAvailable) {
      devices.push(...TOUCH_DEVICES.map((device) => ({ ...device })));
    }
    for (const pad of this.gamepads.values()) {
      if (pad.connected) devices.push({ ...pad });
    }
    return devices;
  }

  find(id: string): InputDevice | undefined {
    return this.list().find((device) => device.id === id);
  }

  /**
   * Re-reads the gamepad list. Chrome only surfaces pads after a first input,
   * so this is called from the join screen's poll as well as on the event.
   */
  refreshGamepads(): void {
    let changed = false;
    const pads = readGamepads();
    for (let index = 0; index < pads.length; index += 1) {
      const pad = pads[index];
      if (!pad?.connected) continue;
      if (this.registerGamepad(pad, false)) changed = true;
    }
    for (const device of this.gamepads.values()) {
      const stillThere = pads.some((pad) => pad?.connected && gamepadKey(pad) === device.id);
      if (device.connected !== stillThere) {
        device.connected = stillThere;
        changed = true;
        this.events.emit(stillThere ? 'gamepadConnected' : 'gamepadDisconnected', {
          device: { ...device },
        });
      }
    }
    if (changed) this.events.emit('listChanged', { devices: this.list() });
  }

  /**
   * Begins listening for "press anything to join".
   * Returns a function that stops listening.
   */
  beginJoinListening(): () => void {
    if (this.listening) return () => this.endJoinListening();
    this.listening = true;
    this.previousButtons.clear();

    this.detachKeyboard = this.keyboard.onEdge((code, edge) => {
      if (edge !== 'down') return;
      const profile = profileForKey(code);
      if (!profile) return;
      const device = KEYBOARD_DEVICES.find((entry) => entry.profile === profile);
      if (device) this.events.emit('join', { device: { ...device } });
    });

    return () => this.endJoinListening();
  }

  endJoinListening(): void {
    this.listening = false;
    this.detachKeyboard?.();
    this.detachKeyboard = null;
    this.previousButtons.clear();
  }

  /**
   * Polls gamepads for a join press. Must be called from an animation frame:
   * the Gamepad API has no events for button presses.
   */
  pollForJoin(): void {
    if (!this.listening) return;
    this.refreshGamepads();
    const pads = readGamepads();
    for (let index = 0; index < pads.length; index += 1) {
      const pad = pads[index];
      if (!pad?.connected) continue;
      const previous = this.previousButtons.get(index) ?? [];
      const current = pad.buttons.map((button) => button.pressed);
      for (const buttonIndex of JOIN_BUTTONS) {
        if (current[buttonIndex] && !previous[buttonIndex]) {
          const device = this.gamepads.get(gamepadKey(pad));
          if (device) this.events.emit('join', { device: { ...device } });
          break;
        }
      }
      this.previousButtons.set(index, current);
    }
  }

  /** Called every frame during a match so a disconnect is noticed immediately. */
  pollConnections(): void {
    this.refreshGamepads();
  }

  dispose(): void {
    this.endJoinListening();
    this.detachWindow?.();
    this.detachWindow = null;
    this.gamepads.clear();
    this.events.clear();
  }

  private registerGamepad(pad: Gamepad, emit = true): boolean {
    const id = gamepadKey(pad);
    const existing = this.gamepads.get(id);
    if (existing) {
      const wasConnected = existing.connected;
      existing.connected = true;
      existing.padIndex = pad.index;
      if (!wasConnected && emit) {
        this.events.emit('gamepadConnected', { device: { ...existing } });
        this.events.emit('listChanged', { devices: this.list() });
      }
      return !wasConnected;
    }
    const device: InputDevice = {
      id,
      kind: 'gamepad',
      label: describeGamepad(pad, pad.index),
      padIndex: pad.index,
      connected: true,
    };
    this.gamepads.set(id, device);
    if (emit) {
      this.events.emit('gamepadConnected', { device: { ...device } });
      this.events.emit('listChanged', { devices: this.list() });
    }
    return true;
  }

  private unregisterGamepad(pad: Gamepad): void {
    const device = this.gamepads.get(gamepadKey(pad));
    if (!device) return;
    device.connected = false;
    this.events.emit('gamepadDisconnected', { device: { ...device } });
    this.events.emit('listChanged', { devices: this.list() });
  }
}

/**
 * A gamepad's identity.
 *
 * The slot index alone is not stable — unplugging pad 0 shifts nothing, but
 * replugging can reuse an index — so the id is combined with it. Pads with the
 * same id in different slots stay distinct, which is what two identical
 * controllers need.
 */
export function gamepadKey(pad: Gamepad): string {
  return `gamepad:${pad.index}:${(pad.id || 'generic').slice(0, 24)}`;
}

/** Which keyboard half a key belongs to, or null if it is not a join key. */
export function profileForKey(code: string): KeyboardProfileId | null {
  if (/^(Key[QWERTASDFGZXCVB]|ShiftLeft|Digit[1-5]|Space)$/.test(code)) {
    return 'keyboard-left';
  }
  if (
    /^(Arrow(Up|Down|Left|Right)|Key[UIOPHJKLNM]|ShiftRight|Enter|Digit[6-9]|Numpad)/.test(code)
  ) {
    return 'keyboard-right';
  }
  return null;
}

/** Devices still free once the given ones are taken. */
export function availableDevices(
  all: readonly InputDevice[],
  takenIds: readonly string[],
): InputDevice[] {
  const taken = new Set(takenIds);
  return all.filter((device) => device.connected && !taken.has(device.id));
}

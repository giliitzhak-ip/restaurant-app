/**
 * Key bindings for the split-keyboard profiles.
 *
 * Two profiles exist so one physical keyboard can host two players, and they are
 * treated as two distinct logical devices (`keyboard-left`, `keyboard-right`).
 * That keeps the "one device may not drive two players" rule intact without a
 * special case.
 */
import { clamp } from '../core/math';

export type KeyboardProfileId = 'keyboard-left' | 'keyboard-right';

export type BindableAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'sprint'
  | 'shoot'
  | 'tackle'
  /** Cycles the selected shot shape: normal, flat, lofted, curled, chip. */
  | 'style'
  | 'pass'
  | 'juggle'
  /**
   * Held while striking: raises and lowers where the next strike is aimed.
   * A press snaps to the top or the bottom of the range, so one tap of the
   * up key is enough to put the ball in the air.
   */
  | 'aimUp'
  | 'aimDown'
  /** Held while striking: swings the direction the ball is struck along. */
  | 'aimLeft'
  | 'aimRight'
  /** Held while striking: a short chip instead of a full shot. */
  | 'chip'
  /** Held while striking: bends the ball left or right. */
  | 'curlLeft'
  | 'curlRight';

export type KeyMap = Record<BindableAction, string[]>;

export interface KeyboardProfile {
  readonly id: KeyboardProfileId;
  readonly label: string;
  keys: KeyMap;
}

export const BINDABLE_ACTIONS: readonly BindableAction[] = [
  'up',
  'down',
  'left',
  'right',
  'sprint',
  'shoot',
  'pass',
  'juggle',
  'tackle',
  'aimUp',
  'aimDown',
  'aimLeft',
  'aimRight',
  'chip',
  'curlLeft',
  'curlRight',
  'style',
];

export const ACTION_LABELS: Record<BindableAction, string> = {
  up: 'קדימה',
  down: 'אחורה',
  left: 'שמאלה',
  right: 'ימינה',
  sprint: 'ספרינט',
  shoot: 'בעיטה',
  tackle: 'חטיפה',
  style: 'סוג הבעיטה',
  pass: 'מסירה',
  juggle: 'הקפצה',
  aimUp: 'כוון גבוה',
  aimDown: 'כוון נמוך',
  aimLeft: 'כוון שמאלה',
  aimRight: 'כוון ימינה',
  chip: 'הרמה קצרה',
  curlLeft: 'סיבוב שמאלה',
  curlRight: 'סיבוב ימינה',
};

/** Player 1: the WASD cluster plus the keys around it. */
export function defaultLeftKeyMap(): KeyMap {
  return {
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    sprint: ['ShiftLeft'],
    shoot: ['KeyF'],
    tackle: ['KeyG'],
    style: ['KeyR'],
    pass: ['KeyC'],
    juggle: ['KeyV'],
    aimUp: ['KeyT'],
    aimDown: ['KeyB'],
    aimLeft: ['KeyQ'],
    aimRight: ['KeyE'],
    chip: ['KeyX'],
    curlLeft: ['KeyZ'],
    curlRight: ['KeyH'],
  };
}

/** Player 2: the arrow cluster plus the keys around it. */
export function defaultRightKeyMap(): KeyMap {
  return {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    sprint: ['ShiftRight', 'Enter'],
    shoot: ['KeyK'],
    tackle: ['KeyL'],
    style: ['KeyO'],
    pass: ['KeyJ'],
    juggle: ['KeyU'],
    aimUp: ['KeyI'],
    aimDown: ['KeyM'],
    aimLeft: ['KeyY'],
    aimRight: ['KeyP'],
    chip: ['Period'],
    curlLeft: ['KeyN'],
    curlRight: ['Semicolon'],
  };
}

/**
 * The single-player profile.
 *
 * The arrow keys appear twice on purpose, once for movement and once for
 * aiming, and that is not a conflict: the two are never live at the same
 * moment. With no shot charging the arrows walk the player around exactly as
 * they always have; while the shoot key is held they steer the strike instead
 * — left and right swing the direction, up puts the ball in the air, down
 * flattens it. WASD keeps moving throughout, so a player who wants to run and
 * aim at once still can.
 */
export function soloKeyMap(): KeyMap {
  return {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    shoot: ['Space'],
    juggle: ['KeyE'],
    style: ['KeyQ'],
    tackle: ['KeyR'],
    pass: ['KeyC'],
    aimUp: ['ArrowUp', 'KeyT'],
    aimDown: ['ArrowDown', 'KeyG'],
    aimLeft: ['ArrowLeft'],
    aimRight: ['ArrowRight'],
    chip: ['KeyX'],
    curlLeft: ['KeyZ'],
    curlRight: ['KeyV'],
  };
}

/**
 * Keys the solo profile deliberately shares between movement and aiming.
 * The binding editor must not report these as a conflict.
 */
export const SOLO_SHARED_AIM_KEYS: readonly string[] = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
];

export function defaultKeyMapFor(profile: KeyboardProfileId): KeyMap {
  return profile === 'keyboard-left' ? defaultLeftKeyMap() : defaultRightKeyMap();
}

export function allCodesOf(map: KeyMap): string[] {
  return BINDABLE_ACTIONS.flatMap((action) => map[action]);
}

/** A conflict is the same physical key bound to two different actions. */
export interface BindingConflict {
  code: string;
  actions: { profile: KeyboardProfileId; action: BindableAction }[];
}

/**
 * Finds keys claimed more than once across both profiles.
 * A key bound twice inside one profile counts too.
 */
export function findConflicts(left: KeyMap, right: KeyMap): BindingConflict[] {
  const owners = new Map<string, { profile: KeyboardProfileId; action: BindableAction }[]>();
  const record = (profile: KeyboardProfileId, map: KeyMap) => {
    for (const action of BINDABLE_ACTIONS) {
      for (const code of map[action]) {
        const list = owners.get(code) ?? [];
        list.push({ profile, action });
        owners.set(code, list);
      }
    }
  };
  record('keyboard-left', left);
  record('keyboard-right', right);

  const conflicts: BindingConflict[] = [];
  for (const [code, actions] of owners) {
    if (actions.length > 1) conflicts.push({ code, actions });
  }
  return conflicts;
}

/**
 * Key combinations that a cheap membrane keyboard is likely to drop.
 *
 * Most non-gaming keyboards can only report a limited number of simultaneous
 * keys, and keys sharing a matrix row/column block each other ("ghosting").
 * We cannot detect this from the browser, so instead we warn when both players
 * are bound into the same physical region of the keyboard.
 */
const LEFT_REGION = /^(Key[QWERASDFZXCV]|Digit[1-6]|ShiftLeft|ControlLeft|Tab|CapsLock)$/;
const RIGHT_REGION = /^(Arrow|Key[UIOPJKLNM]|Digit[7890]|ShiftRight|Enter|Numpad)/;

export function ghostingRisk(left: KeyMap, right: KeyMap): string | null {
  const leftCodes = allCodesOf(left);
  const rightCodes = allCodesOf(right);

  const leftInLeftRegion = leftCodes.filter((code) => LEFT_REGION.test(code)).length;
  const rightInLeftRegion = rightCodes.filter((code) => LEFT_REGION.test(code)).length;
  const rightInRightRegion = rightCodes.filter((code) => RIGHT_REGION.test(code)).length;

  if (rightInLeftRegion > 0 && leftInLeftRegion > 0) {
    return 'שני השחקנים משתמשים במקשים מאותו אזור במקלדת. במקלדות רבות לחיצות בו־זמניות באזור אחד עלולות להיבלע. מומלץ להרחיק את המיפויים זה מזה.';
  }
  if (rightInRightRegion < rightCodes.length / 2) {
    return 'מיפוי שחקן 2 אינו מרוכז בצד ימין של המקלדת. ייתכנו לחיצות שלא ייקלטו בעת משחק משותף.';
  }
  return null;
}

/** Normalizes untrusted stored data back into a valid key map. */
export function sanitizeKeyMap(raw: unknown, fallback: KeyMap): KeyMap {
  if (typeof raw !== 'object' || raw === null) return fallback;
  const source = raw as Record<string, unknown>;
  const result = {} as KeyMap;
  for (const action of BINDABLE_ACTIONS) {
    const value = source[action];
    const codes = Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      : [];
    // An action with no key left would be unplayable, so fall back to the default.
    result[action] = codes.length > 0 ? codes.slice(0, 3) : [...fallback[action]];
  }
  return result;
}

/** Human-readable key name for the settings screen. Latin names stay LTR-safe. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Space',
    ShiftLeft: 'Shift שמאל',
    ShiftRight: 'Shift ימין',
    ControlLeft: 'Ctrl שמאל',
    ControlRight: 'Ctrl ימין',
    AltLeft: 'Alt שמאל',
    AltRight: 'Alt ימין',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Escape: 'Esc',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
  };
  return named[code] ?? code;
}

/** Guards against a caller storing an absurd number of alternatives. */
export function limitAlternatives(codes: string[], max = 3): string[] {
  return codes.slice(0, clamp(max, 1, 5));
}

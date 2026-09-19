/**
 * The animation state machine and the key-binding rules.
 *
 * PlayerAnimator is pure on purpose: poses are an output of the simulation and
 * can never feed back into it, which is what these tests pin down.
 */
import { describe, expect, it } from 'vitest';
import { GameConfig } from '../src/config/GameConfig';
import {
  PlayerAnimator,
  blendPose,
  neutralPose,
  type AnimationState,
  type AnimatorInputs,
} from '../src/entities/PlayerAnimator';
import { createMatchState, type PlayerState } from '../src/game/MatchState';
import {
  BINDABLE_ACTIONS,
  defaultLeftKeyMap,
  defaultRightKeyMap,
  findConflicts,
  ghostingRisk,
  keyLabel,
  sanitizeKeyMap,
  soloKeyMap,
} from '../src/input/KeyBindings';

const STEP = 1 / 60;

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  const base = createMatchState().players[0]!;
  return { ...base, ...overrides };
}

function inputs(overrides: Partial<AnimatorInputs> = {}): AnimatorInputs {
  return {
    speed: 0,
    hasBall: false,
    kickTriggered: false,
    tackleTriggered: false,
    celebrating: false,
    defeated: false,
    ...overrides,
  };
}

/** Runs the animator for a while and reports the states it passed through. */
function run(
  animator: PlayerAnimator,
  state: PlayerState,
  input: AnimatorInputs,
  seconds: number,
): AnimationState[] {
  const seen: AnimationState[] = [];
  const steps = Math.ceil(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    animator.update(
      state,
      i === 0 ? input : { ...input, kickTriggered: false, tackleTriggered: false },
      STEP,
    );
    seen.push(animator.currentState);
  }
  return seen;
}

describe('animation state machine', () => {
  it('starts idle', () => {
    const animator = new PlayerAnimator();
    animator.update(player(), inputs(), STEP);
    expect(animator.currentState).toBe('Idle');
  });

  it('walks, runs and sprints as the speed rises', () => {
    const animator = new PlayerAnimator();
    animator.update(player(), inputs({ speed: 1.5 }), STEP);
    expect(animator.currentState).toBe('Walk');

    animator.update(player(), inputs({ speed: 5 }), STEP);
    expect(animator.currentState).toBe('Run');

    animator.update(player({ sprinting: true }), inputs({ speed: 8 }), STEP);
    expect(animator.currentState).toBe('Sprint');
  });

  it('dribbles when the player is in control of the ball', () => {
    const animator = new PlayerAnimator();
    animator.update(player(), inputs({ speed: 4, hasBall: true }), STEP);
    expect(animator.currentState).toBe('Dribble');
  });

  it('charges while the shot is held and during the wind-up', () => {
    const animator = new PlayerAnimator();
    animator.update(player({ charging: true, kickCharge: 0.5 }), inputs(), STEP);
    expect(animator.currentState).toBe('ChargeKick');

    animator.update(player({ charging: false, windUpTimer: 0.05 }), inputs(), STEP);
    expect(animator.currentState).toBe('ChargeKick');
  });

  it('plays a flat kick and a lofted kick as different animations', () => {
    const flat = new PlayerAnimator();
    flat.update(player({ lofted: false }), inputs({ kickTriggered: true }), STEP);
    expect(flat.currentState).toBe('Kick');

    const lob = new PlayerAnimator();
    lob.update(player({ lofted: true }), inputs({ kickTriggered: true }), STEP);
    expect(lob.currentState).toBe('LobKick');
  });

  it('never cuts a kick short, even if the player starts running', () => {
    const animator = new PlayerAnimator();
    const seen = run(animator, player(), inputs({ kickTriggered: true, speed: 6 }), 0.2);
    expect(seen.every((state) => state === 'Kick')).toBe(true);
    expect(seen.length).toBeGreaterThan(5);
  });

  it('returns to movement once the kick finishes', () => {
    const animator = new PlayerAnimator();
    run(
      animator,
      player(),
      inputs({ kickTriggered: true, speed: 6 }),
      GameConfig.animation.kickSeconds + 0.05,
    );
    animator.update(player(), inputs({ speed: 6 }), STEP);
    expect(animator.currentState).toBe('Run');
  });

  it('recovers after being dispossessed', () => {
    const animator = new PlayerAnimator();
    animator.update(player({ stunTimer: 0.3 }), inputs({ speed: 3 }), STEP);
    expect(animator.currentState).toBe('Recover');
  });

  it('celebrates and loses, and those two outrank everything else', () => {
    const celebrate = new PlayerAnimator();
    celebrate.update(player(), inputs({ celebrating: true, kickTriggered: true }), STEP);
    expect(celebrate.currentState).toBe('ScoreCelebration');

    const defeat = new PlayerAnimator();
    defeat.update(player(), inputs({ defeated: true, celebrating: true }), STEP);
    expect(defeat.currentState).toBe('Defeat');
  });

  it('covers every documented animation state', () => {
    const states = new Set<AnimationState>();
    const cases: [Partial<PlayerState>, Partial<AnimatorInputs>][] = [
      [{}, {}],
      [{}, { speed: 1.5 }],
      [{}, { speed: 5 }],
      [{ sprinting: true }, { speed: 8 }],
      [{}, { speed: 4, hasBall: true }],
      [{ charging: true }, {}],
      [{ lofted: false }, { kickTriggered: true }],
      [{ lofted: true }, { kickTriggered: true }],
      [{}, { tackleTriggered: true }],
      [{ stunTimer: 0.3 }, {}],
      [{}, { celebrating: true }],
      [{}, { defeated: true }],
    ];
    for (const [playerPatch, inputPatch] of cases) {
      const animator = new PlayerAnimator();
      animator.update(player(playerPatch), inputs(inputPatch), STEP);
      states.add(animator.currentState);
    }
    expect(states).toEqual(
      new Set<AnimationState>([
        'Idle',
        'Walk',
        'Run',
        'Sprint',
        'Dribble',
        'ChargeKick',
        'Kick',
        'LobKick',
        'Tackle',
        'Recover',
        'ScoreCelebration',
        'Defeat',
      ]),
    );
  });

  it('blends between states instead of snapping', () => {
    const animator = new PlayerAnimator();
    // sprinting lives on the player state, not on the animator inputs.
    run(animator, player({ sprinting: true }), inputs({ speed: 8 }), 0.3);
    const sprinting = { ...animator.pose };

    // One tick into the new state, the pose must still be close to the old one.
    animator.update(player(), inputs({ celebrating: true }), STEP);
    const justSwitched = animator.pose;
    expect(Math.abs(justSwitched.armsUp - sprinting.armsUp)).toBeLessThan(0.5);
    expect(justSwitched.armsUp).toBeGreaterThan(0);
  });

  it('never returns a non-finite joint angle', () => {
    const animator = new PlayerAnimator();
    for (let i = 0; i < 300; i += 1) {
      const pose = animator.update(
        player({ kickCharge: (i % 60) / 60, stunTimer: i % 30 === 0 ? 0.2 : 0 }),
        inputs({ speed: (i % 10) * 0.9, kickTriggered: i % 47 === 0 }),
        STEP,
      );
      for (const value of Object.values(pose)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('resets back to neutral', () => {
    const animator = new PlayerAnimator();
    run(animator, player(), inputs({ celebrating: true }), 0.4);
    animator.reset();
    expect(animator.currentState).toBe('Idle');
    expect(animator.pose).toEqual(neutralPose());
  });

  it('blendPose interpolates and clamps', () => {
    const from = neutralPose();
    const to = { ...neutralPose(), leftLeg: 1, armsUp: 1 };
    const out = neutralPose();

    blendPose(from, to, 0.5, out);
    expect(out.leftLeg).toBeCloseTo(0.5);

    blendPose(from, to, 5, out);
    expect(out.armsUp).toBe(1);
  });
});

describe('key bindings', () => {
  it('keeps the two default profiles on opposite sides of the keyboard', () => {
    const left = defaultLeftKeyMap();
    const right = defaultRightKeyMap();
    expect(left.up).toEqual(['KeyW']);
    expect(right.up).toEqual(['ArrowUp']);
    expect(left.shoot).toEqual(['KeyF']);
    expect(right.shoot).toEqual(['KeyK']);
    expect(findConflicts(left, right)).toHaveLength(0);
  });

  it('keeps the solo profile identical to version 0.1.0', () => {
    const solo = soloKeyMap();
    expect(solo.shoot).toEqual(['Space']);
    expect(solo.tackle).toEqual(['KeyE']);
    expect(solo.lob).toEqual(['KeyQ']);
    expect(solo.up).toContain('KeyW');
    expect(solo.up).toContain('ArrowUp');
  });

  it('reports a key bound to two different actions', () => {
    const left = { ...defaultLeftKeyMap(), shoot: ['KeyW'] };
    const conflicts = findConflicts(left, defaultRightKeyMap());
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.code).toBe('KeyW');
    expect(conflicts[0]!.actions).toHaveLength(2);
  });

  it('reports a key claimed by both players', () => {
    const right = { ...defaultRightKeyMap(), shoot: ['KeyF'] };
    const conflicts = findConflicts(defaultLeftKeyMap(), right);
    expect(conflicts.map((conflict) => conflict.code)).toContain('KeyF');
  });

  it('warns when both players are crowded into one region of the keyboard', () => {
    const crowded = { ...defaultRightKeyMap(), up: ['KeyE'], down: ['KeyD'], shoot: ['KeyQ'] };
    expect(ghostingRisk(defaultLeftKeyMap(), crowded)).not.toBeNull();
  });

  it('does not warn about the shipped defaults', () => {
    expect(ghostingRisk(defaultLeftKeyMap(), defaultRightKeyMap())).toBeNull();
  });

  it('repairs a map that would leave an action unbound', () => {
    const repaired = sanitizeKeyMap({ up: [], shoot: ['KeyZ'] }, defaultLeftKeyMap());
    for (const action of BINDABLE_ACTIONS) {
      expect(repaired[action].length).toBeGreaterThan(0);
    }
    expect(repaired.shoot).toEqual(['KeyZ']);
    expect(repaired.up).toEqual(defaultLeftKeyMap().up);
  });

  it('labels keys so they stay readable in a right-to-left interface', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('ShiftRight')).toBe('Shift ימין');
    expect(keyLabel('Space')).toBe('Space');
  });
});

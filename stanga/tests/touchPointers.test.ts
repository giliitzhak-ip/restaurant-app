// @vitest-environment jsdom
/**
 * Multi-touch ownership.
 *
 * Two people share one screen, so every pointer must stay with the control it
 * started on until pointerup or pointercancel. A stray finger may never steal
 * the other player's stick, and a lifted finger may never release someone
 * else's shot.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { HumanTouchController } from '../src/input/controllers/TouchController';
import { createMatchState } from '../src/game/MatchState';
import type { ControlContext } from '../src/input/PlayerController';

const context = (): ControlContext => ({
  cameraYaw: 0,
  player: undefined,
  state: createMatchState(),
  dt: 1 / 60,
});

/** jsdom has no PointerEvent, so build an equivalent event object. */
function pointerEvent(type: string, pointerId: number, x = 0, y = 0): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId, clientX: x, clientY: y });
  return event;
}

function mount(side: 'left' | 'right' = 'left') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const pad = new HumanTouchController(`touch-${side}`, `שחקן ${side}`, side);
  pad.mount(host);

  const zone = pad.root.querySelector('.touch-pad__stick-zone') as HTMLElement;
  const shoot = pad.root.querySelector('.touch-button--kick') as HTMLElement;
  const sprint = pad.root.querySelector('.touch-button--sprint') as HTMLElement;
  const tackle = pad.root.querySelector('.touch-button--tackle') as HTMLElement;
  // jsdom does not implement pointer capture.
  for (const element of [zone, shoot, sprint, tackle]) {
    Object.assign(element, { setPointerCapture: () => {}, releasePointerCapture: () => {} });
  }
  return { pad, zone, shoot, sprint, tackle, host };
}

describe('touch pointer ownership', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('binds the stick to the pointer that started it', () => {
    const { pad, zone } = mount();
    zone.dispatchEvent(pointerEvent('pointerdown', 7, 100, 100));
    expect(pad.ownership.stick).toBe(7);

    // A second finger in the same zone must be ignored.
    zone.dispatchEvent(pointerEvent('pointerdown', 8, 200, 200));
    expect(pad.ownership.stick).toBe(7);
  });

  it('ignores movement from a pointer that does not own the stick', () => {
    const { pad, zone } = mount();
    zone.dispatchEvent(pointerEvent('pointerdown', 7, 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 9, 300, 100));

    const command = pad.poll('home-1', 1, context());
    expect(command.moveX).toBe(0);
    expect(command.moveY).toBe(0);
  });

  it('tracks movement from the owning pointer', () => {
    const { pad, zone } = mount();
    zone.dispatchEvent(pointerEvent('pointerdown', 7, 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 7, 160, 100));

    const command = pad.poll('home-1', 1, context());
    expect(command.moveX).toBeGreaterThan(0);
  });

  it('releases the stick only for its own pointer', () => {
    const { pad, zone } = mount();
    zone.dispatchEvent(pointerEvent('pointerdown', 7, 100, 100));

    zone.dispatchEvent(pointerEvent('pointerup', 8));
    expect(pad.ownership.stick).toBe(7);

    zone.dispatchEvent(pointerEvent('pointerup', 7));
    expect(pad.ownership.stick).toBeNull();
  });

  it('releases the stick on pointercancel', () => {
    const { pad, zone } = mount();
    zone.dispatchEvent(pointerEvent('pointerdown', 3, 50, 50));
    zone.dispatchEvent(pointerEvent('pointercancel', 3));
    expect(pad.ownership.stick).toBeNull();

    const command = pad.poll('home-1', 1, context());
    expect(command.moveX).toBe(0);
  });

  it('keeps the shoot button held by its own pointer', () => {
    const { pad, shoot } = mount();
    shoot.dispatchEvent(pointerEvent('pointerdown', 4));
    expect(pad.ownership.shoot).toBe(4);

    let command = pad.poll('home-1', 1, context());
    expect(command.shootHeld).toBe(true);
    expect(command.shootPressed).toBe(true);

    // Another finger lifting must not fire the shot.
    shoot.dispatchEvent(pointerEvent('pointerup', 5));
    command = pad.poll('home-1', 2, context());
    expect(command.shootHeld).toBe(true);
    expect(command.shootReleased).toBe(false);

    shoot.dispatchEvent(pointerEvent('pointerup', 4));
    command = pad.poll('home-1', 3, context());
    expect(command.shootHeld).toBe(false);
    expect(command.shootReleased).toBe(true);
  });

  it('runs the stick, shoot and sprint at the same time on three fingers', () => {
    const { pad, zone, shoot, sprint } = mount();
    zone.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 1, 100, 40));
    shoot.dispatchEvent(pointerEvent('pointerdown', 2));
    sprint.dispatchEvent(pointerEvent('pointerdown', 3));

    const command = pad.poll('home-1', 1, context());
    // Screen Y grows downwards, so dragging up is forward.
    expect(command.moveY).toBeGreaterThan(0);
    expect(command.shootHeld).toBe(true);
    expect(command.sprintPressed).toBe(true);
    expect(pad.ownership).toEqual({ stick: 1, shoot: 2, sprint: 3 });
  });

  it('keeps two pads completely independent', () => {
    const left = mount('left');
    const right = mount('right');

    left.zone.dispatchEvent(pointerEvent('pointerdown', 10, 100, 100));
    left.zone.dispatchEvent(pointerEvent('pointermove', 10, 40, 100));
    right.shoot.dispatchEvent(pointerEvent('pointerdown', 11));

    const leftCommand = left.pad.poll('home-1', 1, context());
    const rightCommand = right.pad.poll('away-1', 1, context());

    expect(leftCommand.moveX).toBeLessThan(0);
    expect(leftCommand.shootHeld).toBe(false);
    expect(rightCommand.shootHeld).toBe(true);
    expect(rightCommand.moveX).toBe(0);
    expect(left.pad.ownership.shoot).toBeNull();
    expect(right.pad.ownership.stick).toBeNull();
  });

  it('reports a tackle exactly once per tap', () => {
    const { pad, tackle } = mount();
    tackle.dispatchEvent(pointerEvent('pointerdown', 6));

    expect(pad.poll('home-1', 1, context()).tacklePressed).toBe(true);
    expect(pad.poll('home-1', 2, context()).tacklePressed).toBe(false);
  });

  it('drops every pointer when the pad is hidden mid-touch', () => {
    const { pad, zone, shoot } = mount();
    zone.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    shoot.dispatchEvent(pointerEvent('pointerdown', 2));

    pad.setVisible(false);

    expect(pad.ownership).toEqual({ stick: null, shoot: null, sprint: null });
    const command = pad.poll('home-1', 1, context());
    expect(command.shootHeld).toBe(false);
    expect(command.moveX).toBe(0);
  });

  it('places the two pads on opposite physical sides, not mirrored by RTL', () => {
    const left = mount('left');
    const right = mount('right');
    expect(left.pad.root.classList.contains('touch-pad--left')).toBe(true);
    expect(right.pad.root.classList.contains('touch-pad--right')).toBe(true);
    // dir=ltr keeps left/right physical inside an RTL document.
    expect(left.pad.root.dir).toBe('ltr');
    expect(right.pad.root.dir).toBe('ltr');
  });
});

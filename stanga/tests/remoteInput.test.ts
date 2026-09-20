/**
 * The server-side controller for a network player.
 *
 * These are the rules that stop a client buying an advantage with its socket:
 * no replaying a kick, no banking inputs for a burst later, and no one-shot
 * action firing twice because a packet was late.
 */
import { describe, expect, it } from 'vitest';
import { InputFlag, type NetInput } from '../src/net/protocol';
import { RemoteInputController } from '../src/server/RemoteInputController';

function input(n: number, patch: Partial<NetInput> = {}): NetInput {
  return { n, mx: 0, my: 1, ax: 0, ay: 1, va: 0, sn: 0, pt: -1, f: 0, ...patch };
}

describe('RemoteInputController', () => {
  it('consumes one queued input per tick, in order', () => {
    const controller = new RemoteInputController('net:home-1', 'home-1', 6);
    controller.enqueue(input(1, { mx: 0.1 }));
    controller.enqueue(input(2, { mx: 0.2 }));

    expect(controller.poll('home-1', 1).moveX).toBeCloseTo(0.1);
    expect(controller.poll('home-1', 2).moveX).toBeCloseTo(0.2);
    expect(controller.lastProcessedSequence).toBe(2);
  });

  it('refuses a replayed or out-of-order sequence number', () => {
    const controller = new RemoteInputController('net:home-1', 'home-1', 6);
    controller.enqueue(input(5, { f: InputFlag.ShootReleased }));
    controller.poll('home-1', 1);

    // The same packet again, and an older one.
    controller.enqueue(input(5, { f: InputFlag.ShootReleased }));
    controller.enqueue(input(3, { f: InputFlag.ShootReleased }));

    expect(controller.pending).toBe(0);
    expect(controller.poll('home-1', 2).shootReleased).toBe(false);
  });

  it('caps how many inputs a client may bank', () => {
    const controller = new RemoteInputController('net:home-1', 'home-1', 3);
    for (let n = 1; n <= 10; n += 1) controller.enqueue(input(n));

    expect(controller.pending).toBe(3);
    // The newest intent survives; the stale backlog is what gets dropped.
    expect(controller.poll('home-1', 1).sequenceNumber).toBe(8);
  });

  it('holds direction and sprint when a packet is late, but never repeats a kick', () => {
    const controller = new RemoteInputController('net:home-1', 'home-1', 6);
    controller.enqueue(
      input(1, { mx: 0.5, my: 0.5, f: InputFlag.Sprint | InputFlag.ShootReleased }),
    );

    const first = controller.poll('home-1', 1);
    expect(first.shootReleased).toBe(true);
    expect(first.sprintPressed).toBe(true);

    const repeated = controller.poll('home-1', 2);
    expect(repeated.moveX).toBeCloseTo(0.5);
    expect(repeated.moveY).toBeCloseTo(0.5);
    expect(repeated.sprintPressed).toBe(true);
    expect(repeated.shootReleased).toBe(false);
    expect(repeated.shootPressed).toBe(false);
    expect(repeated.tacklePressed).toBe(false);
  });

  it('carries the aim and the chip request across a dropped packet too', () => {
    const controller = new RemoteInputController('net:home-1', 'home-1', 6);
    controller.enqueue(input(1, { va: 0.7, sn: -0.4, pt: 1, f: InputFlag.ChipRequested }));
    controller.poll('home-1', 1);

    const repeated = controller.poll('home-1', 2);
    expect(repeated.verticalAim).toBeCloseTo(0.7);
    expect(repeated.spin).toBeCloseTo(-0.4);
    expect(repeated.preferredPassSlot).toBe(1);
    expect(repeated.chipRequested).toBe(true);
  });

  it('keeps a wind-up alive across a dropped packet', () => {
    const controller = new RemoteInputController('net:home-1', 'home-1', 6);
    controller.enqueue(input(1, { f: InputFlag.ShootHeld }));
    expect(controller.poll('home-1', 1).shootHeld).toBe(true);
    expect(controller.poll('home-1', 2).shootHeld).toBe(true);
  });

  it('goes still and forgets everything when the socket drops', () => {
    const controller = new RemoteInputController('net:home-1', 'home-1', 6);
    controller.enqueue(input(1, { mx: 1, f: InputFlag.Sprint }));
    controller.poll('home-1', 1);

    controller.setConnected(false);
    const command = controller.poll('home-1', 2);

    expect(controller.isConnected()).toBe(false);
    expect(command.moveX).toBe(0);
    expect(command.moveY).toBe(0);
    expect(command.sprintPressed).toBe(false);
  });
});

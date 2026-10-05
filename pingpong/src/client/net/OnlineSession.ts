import { SIM, dirOut, type Side } from '../../shared/constants';
import { type GameEvent, type PracticeStats, type Snapshot, heldBallPosition } from '../../shared/game';
import {
  type AssistMode,
  type Intercept,
  type PaddleInput,
  type PaddleState,
  PROFILES,
  findIntercept,
  homeZ,
  newPaddle,
  updatePaddle,
} from '../../shared/paddle';
import type { ServerMsg } from '../../shared/protocol';
import { type V3, lerp, v3 } from '../../shared/vec';
import type { NetStatus, ScoreView, Session } from '../game/session';
import type { RenderView } from '../render/GameRenderer';
import type { NetClient } from './NetClient';

interface Buffered {
  s: Snapshot;
  /** Server timestamp (ms). */
  st: number;
}

const INPUT_DT = 1 / SIM.inputRate;

/**
 * Online play against the authoritative server.
 *  - Inputs are sent at 60 Hz with increasing sequence numbers.
 *  - The local paddle is predicted immediately with the shared paddle controller;
 *    every snapshot carries the last input the server applied (ack), so we rewind
 *    to the server's paddle and replay the unacknowledged inputs (reconciliation),
 *    hiding any correction with a short visual blend.
 *  - The ball and the opponent are rendered by interpolating between snapshots
 *    slightly in the past (adaptive delay ~40-150 ms based on measured jitter).
 *  - Score, serve, phase and events come only from the server.
 */
export class OnlineSession implements Session {
  readonly kind = 'online' as const;
  names: [string, string];
  styles: [string, string];
  private buf: Buffered[] = [];
  private pending: { seq: number; i: PaddleInput }[] = [];
  private seq = 0;
  private inputAcc = 0;
  private pred: PaddleState;
  private visualOffset: V3 = v3();
  private lastInput: PaddleInput | null = null;
  private intercept: Intercept | null = null;
  private interceptDirty = true;
  private bouncedMySide = false;
  private lastHitter: Side | null = null;
  private eventQueue: { st: number; e: GameEvent }[] = [];
  private arrival: { local: number; st: number }[] = [];
  private jitter = 8;
  private lastArrival = 0;
  private pausedUntil: number | null = null;
  private profileMode: AssistMode;
  private off: () => void;

  constructor(
    private client: NetClient,
    readonly mySide: Side,
    names: [string, string],
    styles: [string, string],
    assist: AssistMode,
  ) {
    this.names = names;
    this.styles = styles;
    this.profileMode = assist;
    this.pred = newPaddle(mySide);
    this.off = client.on((m) => this.onMessage(m));
  }

  private onMessage(m: ServerMsg): void {
    if (m.t === 'state') this.onState(m.s, m.ev, m.st);
    else if (m.t === 'paused') this.pausedUntil = m.until;
    else if (m.t === 'resumed') this.pausedUntil = null;
    else if (m.t === 'start') {
      this.buf = [];
      this.eventQueue = [];
      this.pausedUntil = null;
    }
  }

  private onState(s: Snapshot, ev: GameEvent[], st: number): void {
    const now = performance.now();
    if (this.lastArrival) {
      const gap = now - this.lastArrival;
      this.jitter += (Math.abs(gap - 1000 / SIM.snapshotRate) - this.jitter) * 0.05;
    }
    this.lastArrival = now;
    this.arrival.push({ local: now, st });
    if (this.arrival.length > 120) this.arrival.shift();
    if (this.buf.length && st <= this.buf[this.buf.length - 1].st) st = this.buf[this.buf.length - 1].st + 1;
    this.buf.push({ s, st });
    if (this.buf.length > 90) this.buf.shift();
    for (const e of ev) {
      this.eventQueue.push({ st, e });
      if (e.k === 'hit') {
        this.lastHitter = e.side;
        this.bouncedMySide = false;
        this.interceptDirty = true;
      } else if (e.k === 'table') {
        if (e.side === this.mySide && this.lastHitter !== this.mySide) this.bouncedMySide = true;
        this.interceptDirty = true;
      } else if (e.k === 'net' || e.k === 'floor') this.interceptDirty = true;
    }
    if (this.interceptDirty) {
      this.interceptDirty = false;
      const ballState = { p: v3(s.ball[0], s.ball[1], s.ball[2]), v: v3(s.ball[3], s.ball[4], s.ball[5]), w: v3(s.ball[6], s.ball[7], s.ball[8]) };
      this.intercept = s.phase === 'rally' ? findIntercept(ballState, this.mySide, this.bouncedMySide) : null;
    }
    this.reconcile(s);
  }

  /** Rewind to the server's paddle at `ack`, then replay unacknowledged inputs. */
  private reconcile(s: Snapshot): void {
    const ack = s.ack?.[this.mySide] ?? 0;
    while (this.pending.length && this.pending[0].seq <= ack) this.pending.shift();
    const sp = s.pads[this.mySide];
    const before = { ...this.pred.p };
    const p: PaddleState = {
      p: v3(sp[0], sp[1], sp[2]),
      v: v3(sp[5], sp[6], 0),
      tilt: sp[3],
      spin: sp[4],
      power: false,
    };
    for (const pi of this.pending) this.stepPaddle(p, pi.i, INPUT_DT, s);
    this.pred = p;
    // Hide the correction: carry the difference and let it decay.
    this.visualOffset = {
      x: this.visualOffset.x + before.x - p.p.x,
      y: this.visualOffset.y + before.y - p.p.y,
      z: this.visualOffset.z + before.z - p.p.z,
    };
  }

  private stepPaddle(p: PaddleState, input: PaddleInput, dt: number, s: Snapshot | null): void {
    const phase = s?.phase ?? 'countdown';
    const serving = phase === 'countdown' || phase === 'serve';
    const server = s?.server ?? 0;
    const servingZ = serving ? homeZ(this.mySide) + (server === this.mySide ? dirOut(this.mySide) * 0.05 : 0) : undefined;
    const profile = PROFILES[this.profileMode];
    const ic = serving ? null : this.intercept;
    const sub = 4;
    for (let k = 0; k < sub; k++) updatePaddle(p, input, ic, profile, this.mySide, dt / sub, servingZ);
  }

  update(dt: number, input: PaddleInput): void {
    this.lastInput = input;
    this.inputAcc += Math.min(dt, 0.25);
    const latest = this.buf.length ? this.buf[this.buf.length - 1].s : null;
    while (this.inputAcc >= INPUT_DT) {
      this.inputAcc -= INPUT_DT;
      this.seq++;
      this.client.sendInput(this.seq, input);
      this.pending.push({ seq: this.seq, i: input });
      if (this.pending.length > 240) this.pending.shift();
      this.stepPaddle(this.pred, input, INPUT_DT, latest);
      if (this.intercept) this.intercept.t = Math.max(0, this.intercept.t - INPUT_DT);
    }
    const k = Math.exp(-dt / 0.08);
    this.visualOffset = { x: this.visualOffset.x * k, y: this.visualOffset.y * k, z: this.visualOffset.z * k };
  }

  /** Server time (ms) we are currently rendering. */
  private renderTime(): number {
    const now = performance.now();
    if (!this.arrival.length) return 0;
    // Smallest (arrival - server time) over the window ~ clock offset + min latency.
    let minOff = Infinity;
    for (const a of this.arrival) minOff = Math.min(minOff, a.local - a.st);
    const delay = Math.min(150, Math.max(40, 1000 / SIM.snapshotRate + this.jitter * 2.5));
    return now - minOff - delay;
  }

  private sample(): { a: Buffered; b: Buffered; t: number } | null {
    const buf = this.buf;
    if (!buf.length) return null;
    const rt = this.renderTime();
    if (rt <= buf[0].st) return { a: buf[0], b: buf[0], t: 0 };
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].st <= rt) {
        const a = buf[i];
        const b = buf[i + 1] ?? a;
        const t = b === a ? 0 : (rt - a.st) / (b.st - a.st);
        return { a, b, t: Math.min(1, Math.max(0, t)) };
      }
    }
    return { a: buf[0], b: buf[0], t: 0 };
  }

  myPaddleZ(): number {
    return this.pred.p.z;
  }

  renderView(): RenderView {
    const smp = this.sample();
    const me = this.mySide;
    const opp: Side = me === 0 ? 1 : 0;
    const myPos = {
      x: this.pred.p.x + this.visualOffset.x,
      y: this.pred.p.y + this.visualOffset.y,
      z: this.pred.p.z + this.visualOffset.z,
    };
    const myPad = { p: myPos, tilt: this.pred.tilt, spin: this.lastInput?.spin ?? 0, vx: this.pred.v.x };
    if (!smp) {
      return {
        mySide: me,
        ball: heldBallPosition(myPos, me, 0),
        ballVisible: false,
        pads: me === 0 ? [myPad, { p: v3(0, 1, homeZ(opp)), tilt: 0, spin: 0, vx: 0 }] : [{ p: v3(0, 1, homeZ(opp)), tilt: 0, spin: 0, vx: 0 }, myPad],
        styles: this.styles,
      };
    }
    const { a, b, t } = smp;
    const A = a.s;
    const B = b.s;
    let ball: V3;
    // Bounces/hits are sharp: don't blend across a direction change bigger than a frame.
    const ba = v3(A.ball[0], A.ball[1], A.ball[2]);
    const bb = v3(B.ball[0], B.ball[1], B.ball[2]);
    ball = A.phase === B.phase ? lerp(ba, bb, t) : t < 0.5 ? ba : bb;
    const held = (A.phase === 'serve' || A.phase === 'countdown') && A.server === me;
    if (held) ball = heldBallPosition(myPos, me, A.phaseTime + t / SIM.snapshotRate);
    const po = A.pads[opp];
    const pb = B.pads[opp];
    const oppPad = {
      p: lerp(v3(po[0], po[1], po[2]), v3(pb[0], pb[1], pb[2]), t),
      tilt: po[3] + (pb[3] - po[3]) * t,
      spin: pb[4],
      vx: pb[5],
    };
    return {
      mySide: me,
      ball,
      ballVisible: true,
      pads: me === 0 ? [myPad, oppPad] : [oppPad, myPad],
      styles: this.styles,
    };
  }

  score(): ScoreView {
    const smp = this.sample();
    const s = smp ? smp.a.s : null;
    if (!s) {
      return { phase: 'countdown', phaseTime: 0, points: [0, 0], games: [0, 0], gameNo: 0, server: 0, lastPoint: null, winner: null, bestOf: 1 };
    }
    return {
      phase: s.phase,
      phaseTime: s.phaseTime,
      points: s.points,
      games: s.games,
      gameNo: s.gameNo,
      server: s.server,
      lastPoint: s.lastPoint,
      winner: s.winner,
      bestOf: s.bestOf,
    };
  }

  drainEvents(): GameEvent[] {
    const rt = this.renderTime();
    const out: GameEvent[] = [];
    while (this.eventQueue.length && this.eventQueue[0].st <= rt) out.push(this.eventQueue.shift()!.e);
    // Don't let events pile up if rendering stalls.
    if (this.eventQueue.length > 200) this.eventQueue.splice(0, this.eventQueue.length - 200);
    return out;
  }

  practiceStats(): PracticeStats | null {
    return null;
  }

  net(): NetStatus | null {
    const room = this.client.room;
    const opp = room?.players[this.mySide === 0 ? 1 : 0];
    return {
      state: this.client.state === 'idle' ? 'connecting' : this.client.state,
      ping: this.client.ping,
      opponentConnected: !!opp?.connected,
      pausedUntil: this.pausedUntil,
      rematch: room?.rematch ?? [false, false],
    };
  }

  setPaused(): void {
    /* Online games can't be paused by one player. */
  }

  rematch(): void {
    this.client.rematch();
  }

  dispose(): void {
    this.off();
  }
}

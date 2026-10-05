import WebSocket from 'ws';
import { AiController, type Difficulty } from '../src/shared/ai';
import type { GameEvent, Snapshot } from '../src/shared/game';
import { findIntercept } from '../src/shared/paddle';
import { type ClientMsg, PROTOCOL_VERSION, type ServerMsg } from '../src/shared/protocol';
import { Rng } from '../src/shared/rng';
import { v3 } from '../src/shared/vec';

export interface Latency {
  /** One-way delay in ms. */
  delay: number;
  jitter: number;
}

/**
 * A real WebSocket client. Optional latency delays both directions while keeping
 * order (like TCP), to emulate a slow internet connection.
 */
export class TestClient {
  ws!: WebSocket;
  msgs: ServerMsg[] = [];
  closed = false;
  private waiters: { pred: (m: ServerMsg) => boolean; res: (m: ServerMsg) => void }[] = [];
  private lastOut = 0;
  private lastIn = 0;
  constructor(
    private url: string,
    private latency: Latency | null = null,
    private headers: Record<string, string> = {},
  ) {}

  open(): Promise<void> {
    return new Promise((res, rej) => {
      this.closed = false;
      this.ws = new WebSocket(this.url, { headers: this.headers });
      this.ws.on('open', () => res());
      this.ws.on('error', rej);
      this.ws.on('close', () => (this.closed = true));
      this.ws.on('message', (d) => {
        const m = JSON.parse(d.toString()) as ServerMsg;
        this.later('in', () => this.deliver(m));
      });
    });
  }

  private later(dir: 'in' | 'out', f: () => void): void {
    if (!this.latency) return f();
    const now = Date.now();
    const t = now + this.latency.delay + Math.random() * this.latency.jitter;
    const at = Math.max(t, dir === 'in' ? this.lastIn : this.lastOut);
    if (dir === 'in') this.lastIn = at;
    else this.lastOut = at;
    setTimeout(f, at - now);
  }

  private deliver(m: ServerMsg): void {
    this.msgs.push(m);
    if (this.msgs.length > 5000) this.msgs.splice(0, 2500);
    for (const w of [...this.waiters]) {
      if (w.pred(m)) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.res(m);
      }
    }
    this.onMsg?.(m);
  }

  onMsg: ((m: ServerMsg) => void) | null = null;

  send(m: ClientMsg | Record<string, unknown>): void {
    const raw = JSON.stringify(m);
    this.later('out', () => this.ws.readyState === WebSocket.OPEN && this.ws.send(raw));
  }

  sendRaw(raw: string): void {
    this.ws.send(raw);
  }

  waitFor<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, timeout = 8000): Promise<Extract<ServerMsg, { t: T }>> {
    const existing = this.msgs.find((m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>));
    if (existing) {
      this.msgs.splice(this.msgs.indexOf(existing), 1);
      return Promise.resolve(existing as Extract<ServerMsg, { t: T }>);
    }
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`timeout waiting for ${t}`)), timeout);
      this.waiters.push({
        pred: (m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>),
        res: (m) => {
          clearTimeout(timer);
          const i = this.msgs.indexOf(m);
          if (i >= 0) this.msgs.splice(i, 1);
          res(m as Extract<ServerMsg, { t: T }>);
        },
      });
    });
  }

  close(): void {
    this.ws.close();
  }

  create(name = 'Alice', bestOf: 1 | 3 = 1, assist: 'arcade' | 'advanced' = 'arcade') {
    this.send({ t: 'create', v: PROTOCOL_VERSION, name, paddle: 'red', settings: { bestOf, assist } });
  }
  join(code: string, name = 'Bob') {
    this.send({ t: 'join', v: PROTOCOL_VERSION, code, name, paddle: 'blue' });
  }
}

/**
 * Plays like a real remote client: sees only server snapshots/events and sends
 * PaddleInput at 60 Hz with sequence numbers. Uses the AI to choose inputs.
 */
export class BotPlayer {
  latest: Snapshot | null = null;
  hits: [number, number] = [0, 0];
  points = 0;
  seq = 0;
  events: GameEvent[] = [];
  private ai: AiController;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hitCount = 0;
  private lastHitter: 0 | 1 = 0;
  private bounced = false;
  private intercept: ReturnType<typeof findIntercept> = null;

  constructor(
    private c: TestClient,
    private side: 0 | 1,
    difficulty: Difficulty = 'hard',
    seed = 1,
  ) {
    this.ai = new AiController(side, difficulty, new Rng(seed));
    c.onMsg = (m) => {
      if (m.t !== 'state') return;
      this.latest = m.s;
      let dirty = false;
      for (const e of m.ev) {
        this.events.push(e);
        if (e.k === 'hit') {
          this.hits[e.side]++;
          this.hitCount++;
          this.lastHitter = e.side;
          this.bounced = false;
          dirty = true;
        } else if (e.k === 'table') {
          if (e.side === this.side && this.lastHitter !== this.side) this.bounced = true;
          dirty = true;
        } else if (e.k === 'point') this.points++;
      }
      if (dirty || m.s.phase !== 'rally') {
        const b = m.s.ball;
        this.intercept = m.s.phase === 'rally' ? findIntercept({ p: v3(b[0], b[1], b[2]), v: v3(b[3], b[4], b[5]), w: v3(b[6], b[7], b[8]) }, this.side, this.bounced) : null;
      }
    };
  }

  start(): void {
    const dt = 1 / 60;
    this.timer = setInterval(() => {
      const s = this.latest;
      if (!s) return;
      if (this.intercept) this.intercept.t = Math.max(0, this.intercept.t - dt);
      const input = this.ai.update(
        { phase: s.phase, servingSide: s.server, hitCount: this.hitCount, lastHitter: this.lastHitter, intercept: this.intercept, ballX: s.ball[0] },
        dt,
      );
      this.c.send({ t: 'input', seq: ++this.seq, i: input });
    }, 1000 / 60);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

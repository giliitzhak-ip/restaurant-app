import type { PaddleInput } from '../../shared/paddle';
import { type ClientMsg, type PaddleStyle, PROTOCOL_VERSION, type RoomSettings, type ServerMsg } from '../../shared/protocol';

export type ConnState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
type RoomMsg = Extract<ServerMsg, { t: 'room' }>;

const SESSION_KEY = 'pingpong3d.session';

/** Where the game server lives: VITE_SERVER_URL at build time, else the page's own host. */
export function defaultServerUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function storedSession(): { code: string; token: string } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * WebSocket connection to the authoritative server with automatic reconnection
 * (the server keeps our seat for 60 s), ping/RTT measurement and an event bus.
 */
export class NetClient {
  state: ConnState = 'idle';
  ping: number | null = null;
  code: string | null = null;
  token: string | null = null;
  side: 0 | 1 | null = null;
  room: RoomMsg | null = null;
  private ws: WebSocket | null = null;
  private listeners = new Set<(m: ServerMsg) => void>();
  private stateListeners = new Set<(s: ConnState) => void>();
  private wantOpen = false;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingId = 0;
  private pingsSent = new Map<number, number>();
  private reconnectDeadline = 0;

  constructor(readonly url: string = defaultServerUrl()) {}

  on(f: (m: ServerMsg) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  onState(f: (s: ConnState) => void): () => void {
    this.stateListeners.add(f);
    return () => this.stateListeners.delete(f);
  }

  /** Open the socket. Resolves when connected, rejects if the first attempt fails. */
  connect(): Promise<void> {
    this.wantOpen = true;
    if (this.ws && (this.state === 'open' || this.state === 'connecting')) {
      return this.state === 'open' ? Promise.resolve() : this.waitOpen();
    }
    return this.open(false);
  }

  private waitOpen(): Promise<void> {
    return new Promise((res, rej) => {
      const off = this.onState((s) => {
        if (s === 'open') {
          off();
          res();
        } else if (s === 'closed') {
          off();
          rej(new Error('unreachable'));
        }
      });
    });
  }

  private setState(s: ConnState): void {
    this.state = s;
    for (const f of this.stateListeners) f(s);
  }

  private open(reconnecting: boolean): Promise<void> {
    this.setState(reconnecting ? 'reconnecting' : 'connecting');
    return new Promise((resolve, reject) => {
      let opened = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch (e) {
        this.setState('closed');
        reject(e);
        return;
      }
      this.ws = ws;
      ws.onopen = () => {
        opened = true;
        this.retry = 0;
        this.setState('open');
        this.startPing();
        if (reconnecting && this.code && this.token) {
          this.send({ t: 'resume', v: PROTOCOL_VERSION, code: this.code, token: this.token });
        }
        resolve();
      };
      ws.onmessage = (ev) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        this.handle(msg);
      };
      ws.onclose = () => {
        this.stopPing();
        if (this.ws !== ws) return;
        this.ws = null;
        if (!opened && !reconnecting) {
          this.setState('closed');
          reject(new Error('unreachable'));
          return;
        }
        if (this.wantOpen && this.code && this.token) this.scheduleReconnect();
        else this.setState('closed');
      };
      ws.onerror = () => {
        /* onclose follows */
      };
    });
  }

  private scheduleReconnect(): void {
    if (!this.reconnectDeadline) this.reconnectDeadline = Date.now() + 60_000;
    if (Date.now() > this.reconnectDeadline) {
      this.reconnectDeadline = 0;
      this.clearSession();
      this.setState('closed');
      this.emit({ t: 'error', code: 'SESSION_EXPIRED' });
      return;
    }
    this.setState('reconnecting');
    const delay = Math.min(4000, 400 * 2 ** this.retry) * (0.75 + Math.random() * 0.5);
    this.retry++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open(true).then(
        () => (this.reconnectDeadline = 0),
        () => {},
      );
    }, delay);
  }

  private handle(msg: ServerMsg): void {
    switch (msg.t) {
      case 'joined':
        this.code = msg.code;
        this.token = msg.token;
        this.side = msg.side;
        this.saveSession();
        break;
      case 'room':
        this.room = msg;
        break;
      case 'pong': {
        const sent = this.pingsSent.get(msg.id);
        if (sent !== undefined) {
          this.pingsSent.delete(msg.id);
          const rtt = performance.now() - sent;
          this.ping = this.ping === null ? rtt : this.ping * 0.7 + rtt * 0.3;
        }
        return;
      }
      case 'error':
        if (msg.code === 'SESSION_EXPIRED' || (msg.code === 'ROOM_NOT_FOUND' && this.state === 'open' && this.room)) {
          this.clearSession();
        }
        break;
      case 'closed':
        if (msg.reason !== 'opponentLeft') this.clearSession();
        break;
    }
    this.emit(msg);
  }

  private emit(msg: ServerMsg): void {
    for (const f of [...this.listeners]) f(msg);
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  create(name: string, paddle: PaddleStyle, settings: RoomSettings): void {
    this.send({ t: 'create', v: PROTOCOL_VERSION, name, paddle, settings });
  }

  join(code: string, name: string, paddle: PaddleStyle): void {
    this.send({ t: 'join', v: PROTOCOL_VERSION, code, name, paddle });
  }

  resume(code: string, token: string): void {
    this.code = code;
    this.token = token;
    this.send({ t: 'resume', v: PROTOCOL_VERSION, code, token });
  }

  setReady(ready: boolean): void {
    this.send({ t: 'ready', ready });
  }

  setProfile(name: string, paddle: PaddleStyle): void {
    this.send({ t: 'profile', name, paddle });
  }

  sendInput(seq: number, i: PaddleInput): void {
    this.send({ t: 'input', seq, i });
  }

  rematch(): void {
    this.send({ t: 'rematch' });
  }

  leave(): void {
    this.send({ t: 'leave' });
    this.clearSession();
    this.room = null;
  }

  close(): void {
    this.wantOpen = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.stopPing();
    this.ws?.close();
    this.ws = null;
    this.setState('closed');
  }

  /** Testing aid: drop the socket as if the network failed. */
  simulateDrop(): void {
    this.ws?.close();
  }

  private startPing(): void {
    this.stopPing();
    const tick = () => {
      const id = ++this.pingId;
      this.pingsSent.set(id, performance.now());
      if (this.pingsSent.size > 20) this.pingsSent.delete(this.pingsSent.keys().next().value!);
      this.send({ t: 'ping', id });
    };
    tick();
    this.pingTimer = setInterval(tick, 1000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private saveSession(): void {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: this.code, token: this.token }));
    } catch {
      /* ignore */
    }
  }

  private clearSession(): void {
    this.code = null;
    this.token = null;
    this.side = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
}

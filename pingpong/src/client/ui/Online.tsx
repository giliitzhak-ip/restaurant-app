import { useEffect, useState } from 'react';
import { type PaddleStyle, type RoomSettings, type ServerMsg, cleanName, normalizeCode } from '../../shared/protocol';
import type { ConnState, NetClient } from '../net/NetClient';
import { PaddleBadge, PaddlePicker, Panel, Segmented, useSettings, useT } from './common';

export function useConnState(net: NetClient): ConnState {
  const [s, setS] = useState(net.state);
  useEffect(() => net.onState(setS), [net]);
  return s;
}

export function ConnBadge({ net }: { net: NetClient }) {
  const t = useT();
  const state = useConnState(net);
  const [ping, setPing] = useState<number | null>(net.ping);
  useEffect(() => {
    const id = setInterval(() => setPing(net.ping), 1000);
    return () => clearInterval(id);
  }, [net]);
  const label =
    state === 'open' ? t.connected : state === 'reconnecting' ? t.reconnecting : state === 'connecting' ? t.connecting : t.disconnected;
  return (
    <span className={`conn conn-${state}`}>
      <span className="dot" /> {label}
      {state === 'open' && ping !== null && (
        <span className="ping">
          {' '}
          · {t.ping} {Math.round(ping)}ms
        </span>
      )}
    </span>
  );
}

export function FriendsScreen(props: { net: NetClient; initialCode: string; error: string | null; onBack: () => void; clearError: () => void }) {
  const t = useT();
  const { settings, update } = useSettings();
  const net = props.net;
  const state = useConnState(net);
  const [name, setName] = useState(settings.name);
  const [code, setCode] = useState(props.initialCode);
  const [opts, setOpts] = useState<RoomSettings>({ bestOf: 1, assist: 'arcade' });
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState(false);

  const connect = () => {
    setUnreachable(false);
    net.connect().catch(() => setUnreachable(true));
  };
  useEffect(connect, [net]);
  useEffect(() => {
    if (props.error) setBusy(false);
  }, [props.error]);

  const validName = (): string | null => {
    const n = cleanName(name);
    if (!n) {
      setLocalErr(t.enterName);
      return null;
    }
    update({ name: n });
    return n;
  };

  const create = () => {
    props.clearError();
    setLocalErr(null);
    const n = validName();
    if (!n) return;
    setBusy(true);
    net.create(n, settings.paddle as PaddleStyle, opts);
  };

  const join = () => {
    props.clearError();
    setLocalErr(null);
    const n = validName();
    if (!n) return;
    const c = normalizeCode(code);
    if (!c) {
      setLocalErr(t.invalidCode);
      return;
    }
    setBusy(true);
    net.join(c, n, settings.paddle as PaddleStyle);
  };

  // Joined via an invite link with a saved name: join straight away.
  useEffect(() => {
    if (state === 'open' && props.initialCode && cleanName(settings.name) && normalizeCode(props.initialCode)) join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const err = localErr ?? props.error;
  return (
    <Panel title={t.playFriend} onBack={props.onBack} wide>
      <div className="conn-row">
        <ConnBadge net={net} />
      </div>
      {unreachable && (
        <div className="alert">
          <p>{t.serverUnreachable}</p>
          <p className="muted">
            {t.needServer} <code dir="ltr">{net.url}</code>
          </p>
          <button className="btn" onClick={connect}>
            ↻
          </button>
        </div>
      )}
      <label className="field">
        <span className="field-label">{t.yourName}</span>
        <input className="text" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
      </label>
      <PaddlePicker value={settings.paddle} onChange={(paddle) => update({ paddle })} />
      <div className="two-col">
        <div className="card">
          <h3>{t.createRoom}</h3>
          <Segmented
            label={t.mode}
            value={opts.assist}
            onChange={(assist) => setOpts({ ...opts, assist })}
            options={[
              { value: 'arcade', label: t.arcade },
              { value: 'advanced', label: t.advanced },
            ]}
          />
          <Segmented
            label={t.format}
            value={opts.bestOf}
            onChange={(bestOf) => setOpts({ ...opts, bestOf })}
            options={[
              { value: 1, label: t.singleGame },
              { value: 3, label: t.bestOf3 },
            ]}
          />
          <button className="btn primary wide" disabled={state !== 'open' || busy} onClick={create}>
            {t.createRoom}
          </button>
        </div>
        <div className="card">
          <h3>{t.joinRoom}</h3>
          <label className="field">
            <span className="field-label">{t.roomCode}</span>
            <input
              className="text code-input"
              dir="ltr"
              value={code}
              maxLength={6}
              placeholder="ABC123"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && join()}
            />
          </label>
          <button className="btn primary wide" disabled={state !== 'open' || busy} onClick={join}>
            {t.join}
          </button>
        </div>
      </div>
      {err && (
        <div className="alert" role="alert">
          {err}
        </div>
      )}
    </Panel>
  );
}

export function Lobby(props: { net: NetClient; room: Extract<ServerMsg, { t: 'room' }>; mySide: 0 | 1; notice: string | null; onLeave: () => void }) {
  const t = useT();
  const { room, mySide, net } = props;
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}?room=${room.code}`;
  const me = room.players[mySide];
  const opp = room.players[mySide === 0 ? 1 : 0];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const share = () => navigator.share?.({ title: t.title, text: `${t.roomCode}: ${room.code}`, url: link }).catch(() => {});

  return (
    <Panel title={t.playFriend} wide>
      <div className="conn-row">
        <ConnBadge net={net} />
      </div>
      {props.notice && <div className="alert">{props.notice}</div>}
      <div className="room-code-box">
        <div className="field-label">{t.roomCode}</div>
        <div className="room-code" dir="ltr">
          {room.code}
        </div>
        <div className="field-label">{t.inviteLink}</div>
        <div className="invite">
          <input className="text" dir="ltr" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button className="btn" onClick={copy}>
            {copied ? t.copied : t.copy}
          </button>
          {'share' in navigator && (
            <button className="btn" onClick={share}>
              {t.share}
            </button>
          )}
        </div>
        <div className="muted">
          {room.settings.assist === 'arcade' ? t.arcade : t.advanced} · {room.settings.bestOf === 3 ? t.bestOf3 : t.singleGame}
        </div>
      </div>
      <div className="players">
        <PlayerCard label={t.you} p={me} />
        <div className="vs">VS</div>
        {opp ? <PlayerCard label={t.opponent} p={opp} /> : <div className="player-card waiting">{t.waitingForPlayer}</div>}
      </div>
      <div className="row">
        <button className={me?.ready ? 'btn big' : 'btn primary big'} disabled={!opp} onClick={() => net.setReady(!me?.ready)}>
          {me?.ready ? t.cancelReady : t.imReady}
        </button>
        <button className="btn ghost" onClick={props.onLeave}>
          {t.leave}
        </button>
      </div>
    </Panel>
  );
}

function PlayerCard(props: { label: string; p: { name: string; paddle: string; ready: boolean; connected: boolean } | null }) {
  const t = useT();
  const p = props.p;
  if (!p) return null;
  return (
    <div className={`player-card ${p.ready ? 'is-ready' : ''}`}>
      <div className="muted">{props.label}</div>
      <div className="player-name">
        <PaddleBadge style={p.paddle} /> {p.name}
      </div>
      <div className={p.ready ? 'tag ready' : 'tag'}>{!p.connected ? t.reconnecting : p.ready ? t.ready : t.notReady}</div>
    </div>
  );
}

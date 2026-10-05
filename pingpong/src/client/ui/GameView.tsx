import { useEffect, useRef, useState } from 'react';
import type { Side } from '../../shared/constants';
import type { GameEvent, PracticeStats } from '../../shared/game';
import { sound } from '../audio/sound';
import type { NetStatus, ScoreView, Session, SimStats } from '../game/session';
import { InputController } from '../input/InputController';
import { GameRenderer } from '../render/GameRenderer';
import { isTouchDevice, toggleFullscreen, useSettings, useT } from './common';

interface HudState {
  score: ScoreView;
  net: NetStatus | null;
  fps: number;
  res: string;
  tilt: number;
  stats: PracticeStats | null;
  sim: SimStats | null;
}

type CamMode = GameRenderer['cameraMode'];

export function GameView(props: { session: Session; tutorial: boolean; onExit: () => void; onTutorialDone: () => void }) {
  const { session } = props;
  const t = useT();
  const { settings } = useSettings();
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<InputController | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const touch = isTouchDevice();

  // Renderer, input and the frame loop.
  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new GameRenderer(host, settingsRef.current.quality);
    if (session.kind === 'sim') renderer.cameraMode = 'tv';
    rendererRef.current = renderer;
    const input = new InputController(host);
    inputRef.current = input;
    input.onInteract = () => sound.unlock();
    input.onPause = () => togglePause();
    // Read-only hook for automated browser tests (no effect on gameplay).
    (window as unknown as { __pingpong?: unknown }).__pingpong = {
      view: () => session.renderView(),
      score: () => session.score(),
      screenOf: (x: number, y: number, z: number) => renderer.screenOf(x, y, z),
      paddleZ: () => session.myPaddleZ(),
      fps: () => renderer.fps,
      renderSize: () => renderer.renderSize,
      dropConnection: () => (session as unknown as { client?: { simulateDrop(): void } }).client?.simulateDrop(),
    };
    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(host);

    let raf = 0;
    let last = performance.now();
    let hudTimer = 0;
    let lastCount = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      input.sensitivity = settingsRef.current.sensitivity;
      input.enabled = !pausedRef.current;
      const intent = input.sample(dt, session.mySide, session.myPaddleZ(), (x, y, z) => renderer.project(x, y, z));
      session.update(dt, intent);
      for (const e of session.drainEvents()) handleEvent(e, session.mySide, renderer);
      renderer.reduceEffects = settingsRef.current.reduceEffects;
      renderer.dynamicRes = settingsRef.current.dynamicRes;
      renderer.render(session.renderView(), dt);

      const sc = session.score();
      if (sc.phase === 'countdown') {
        const n = Math.ceil(3 - sc.phaseTime);
        if (n !== lastCount && n >= 1 && n <= 3) sound.beep(false);
        lastCount = n;
      } else if (lastCount !== -1) {
        if (sc.phase === 'serve' && lastCount <= 1) sound.beep(true);
        lastCount = -1;
      }
      hudTimer += dt;
      if (hudTimer >= 0.1) {
        hudTimer = 0;
        const rs = renderer.renderSize;
        setHud({
          score: sc,
          net: session.net(),
          fps: renderer.fps,
          res: `${rs.w}×${rs.h}`,
          tilt: input.getTilt(),
          stats: session.practiceStats(),
          sim: session.simStats(),
        });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      input.dispose();
      renderer.dispose();
      rendererRef.current = null;
      inputRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => rendererRef.current?.setQuality(settings.quality), [settings.quality]);
  useEffect(() => sound.setVolume(settings.volume), [settings.volume]);

  const togglePause = () => {
    const p = !pausedRef.current;
    pausedRef.current = p;
    setPaused(p);
    session.setPaused(p);
  };

  const sc = hud?.score;
  const me = session.mySide;
  const opp: Side = me === 0 ? 1 : 0;
  const isPractice = session.kind === 'practice';
  const isSim = session.kind === 'sim';

  return (
    <div className="game">
      <div className={isSim ? 'game-host spectate' : 'game-host'} ref={hostRef} />
      {sc && (
        <div className="hud" aria-live="polite">
          <div className="topbar">
            <div className="tb-side tb-start">
              {hud?.net && <NetBadge net={hud.net} />}
              {settings.showFps && hud && (
                <span className="fps" dir="ltr">
                  {Math.round(hud.fps)} FPS · {hud.res}
                </span>
              )}
            </div>
            {!isPractice ? <ScoreBar sc={sc} names={session.names} me={me} /> : <div />}
            <div className="tb-side tb-end">
              <button className="btn icon" title={t.fullscreen} aria-label={t.fullscreen} onClick={toggleFullscreen}>
                ⛶
              </button>
              <button className="btn icon" title={t.pause} aria-label={t.pause} onClick={togglePause}>
                ❚❚
              </button>
            </div>
          </div>
          {!isSim && <TiltGauge tilt={hud?.tilt ?? 0} />}
          <Banner sc={sc} me={isSim ? -1 : me} names={session.names} practice={isPractice} />
          {!isSim && sc.phase === 'serve' && sc.server === me && !paused && (
            <div className="serve-hint">{touch ? t.serve : t.yourServe}</div>
          )}
          {hud?.net?.pausedUntil && <DisconnectNotice until={hud.net.pausedUntil} />}
          {isPractice && props.tutorial && hud?.stats && (
            <Tutorial stats={hud.stats} tilt={hud.tilt} onDone={props.onTutorialDone} />
          )}
          {isPractice && !props.tutorial && hud?.stats && <PracticeStatsBox stats={hud.stats} />}
          {isSim && hud?.sim && (
            <SimPanel
              stats={hud.sim}
              camera={rendererRef.current?.cameraMode ?? 'tv'}
              onSpeed={(x) => session.setSpeed(x)}
              onCamera={(m) => {
                if (rendererRef.current) rendererRef.current.cameraMode = m;
              }}
            />
          )}
        </div>
      )}
      {touch && !isSim && inputRef.current && <TouchControls input={inputRef.current} leftHanded={settings.leftHanded} />}
      {paused && (
        <div className="overlay">
          <div className="panel">
            <h2>{t.pause}</h2>
            {session.kind === 'online' && <p className="muted">{t.onlineNoPause}</p>}
            <div className="menu-buttons">
              <button className="btn primary big" onClick={togglePause}>
                {t.resume}
              </button>
              <button className="btn big" onClick={props.onExit}>
                {t.quit}
              </button>
            </div>
          </div>
        </div>
      )}
      {sc?.phase === 'matchOver' && sc.winner !== null && (
        <EndScreen sc={sc} me={me} opp={opp} session={session} onExit={props.onExit} />
      )}
      <div className="rotate-overlay">{t.rotateDevice}</div>
    </div>
  );
}

function handleEvent(e: GameEvent, me: Side, renderer: GameRenderer): void {
  renderer.onEvent(e);
  const mirror = me === 0 ? 1 : -1;
  const near = (z: number) => Math.max(0, Math.min(1, 0.5 + (z * mirror) / 3));
  switch (e.k) {
    case 'hit':
      sound.play('paddle', Math.min(1, e.speed / 14), 0, e.side === me ? 1 : 0.2);
      break;
    case 'table':
      sound.play('table', Math.min(1, e.speed / 10), (e.x * mirror) / 1.2, near(e.z));
      break;
    case 'tableSide':
      sound.play('edge', Math.min(1, e.speed / 10), 0, 0.5);
      break;
    case 'net':
      sound.play('net', Math.min(1, e.speed / 8), 0, 0.5);
      break;
    case 'floor':
      sound.play('floor', Math.min(1, e.speed / 8), 0, 0.5);
      break;
    case 'point':
      sound.chime(e.winner === me);
      break;
    case 'match':
      if (e.winner === me) sound.applause();
      break;
  }
}

function ScoreBar(props: { sc: ScoreView; names: [string, string]; me: Side }) {
  const t = useT();
  const { sc, names, me } = props;
  const order: Side[] = [me, me === 0 ? 1 : 0];
  return (
    <div className="scorebar">
      {order.map((s, i) => (
        <div key={s} className={`score-side ${i === 0 ? 'mine' : 'theirs'}`}>
          <span className="serve-dot" title={t.server} style={{ visibility: sc.server === s ? 'visible' : 'hidden' }}>
            ●
          </span>
          <span className="pname">{names[s]}</span>
          {sc.bestOf > 1 && <span className="games">{sc.games[s]}</span>}
          <span className="pts">{sc.points[s]}</span>
        </div>
      ))}
      {sc.bestOf > 1 && (
        <div className="score-meta">
          {t.game} {sc.gameNo + 1} · {t.bestOf}
          {sc.bestOf}
        </div>
      )}
    </div>
  );
}

function NetBadge({ net }: { net: NetStatus }) {
  const t = useT();
  const label = net.state === 'open' ? t.connected : net.state === 'reconnecting' ? t.reconnecting : net.state === 'connecting' ? t.connecting : t.disconnected;
  return (
    <span className={`conn conn-${net.state}`}>
      <span className="dot" /> {label}
      {net.ping !== null && net.state === 'open' && <span dir="ltr"> · {Math.round(net.ping)}ms</span>}
    </span>
  );
}

function TiltGauge({ tilt }: { tilt: number }) {
  const t = useT();
  return (
    <div className="tilt-gauge" title={t.tilt} aria-label={`${t.tilt} ${Math.round(tilt * 100)}`}>
      <span className="tg-label">{t.open}</span>
      <div className="tg-track">
        <div className="tg-mark" style={{ bottom: `${50 + tilt * 45}%` }} />
      </div>
      <span className="tg-label">{t.closedFace}</span>
    </div>
  );
}

function Banner(props: { sc: ScoreView; me: Side | -1; names: [string, string]; practice: boolean }) {
  const t = useT();
  const { sc, me, names } = props;
  if (sc.phase === 'countdown') {
    const n = Math.ceil(3 - sc.phaseTime);
    return <div className="banner big">{n > 0 ? n : t.countdownGo}</div>;
  }
  if (sc.phase === 'serve' && sc.phaseTime < 0.6 && sc.lastPoint === null) return <div className="banner">{t.countdownGo}</div>;
  if (sc.phase === 'point' && sc.lastPoint) {
    if ('let' in sc.lastPoint) return <div className="banner">{t.let}</div>;
    const lp = sc.lastPoint;
    return (
      <div className={`banner ${me === -1 ? '' : lp.winner === me ? 'good' : 'bad'}`}>
        <div className="reason">{t.reasons[lp.reason]}</div>
        {!props.practice && (
          <div className="small">
            {t.pointTo}
            {names[lp.winner]}
          </div>
        )}
      </div>
    );
  }
  if (sc.phase === 'gameOver') {
    const w: Side = sc.points[0] > sc.points[1] ? 0 : 1;
    return (
      <div className="banner">
        {t.gameWon}: {names[w]} {sc.points[0]}–{sc.points[1]}
      </div>
    );
  }
  if (!props.practice && sc.phase === 'serve' && sc.phaseTime < 2.2) {
    const [a, b] = sc.points;
    if (a >= 10 && b >= 10 && a === b) return <div className="banner small-banner">{t.deuce}</div>;
  }
  return null;
}

function DisconnectNotice({ until }: { until: number }) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="banner warn">
      {t.opponentDisconnected} ({Math.max(0, Math.ceil((until - now) / 1000))}s)
    </div>
  );
}

function PracticeStatsBox({ stats }: { stats: PracticeStats }) {
  const t = useT();
  return (
    <div className="practice-stats">
      {t.hits}: {stats.hits} · {t.returns}: {stats.returns} · {t.goodServes}: {stats.goodServes}
    </div>
  );
}

function Tutorial(props: { stats: PracticeStats; tilt: number; onDone: () => void }) {
  const t = useT();
  const { stats, tilt } = props;
  const [step, setStep] = useState(0);
  const base = useRef<PracticeStats>({ ...stats });
  const tiltMoved = useRef(false);
  if (Math.abs(tilt) > 0.3) tiltMoved.current = true;
  const d = (k: keyof PracticeStats) => stats[k] - base.current[k];
  const goals: (() => boolean)[] = [
    () => d('goodServes') >= 1 || d('hits') >= 1,
    () => d('returns') >= 3,
    () => d('topspin') >= 2,
    () => d('backspin') >= 2,
    () => tiltMoved.current && d('hits') >= 1,
    () => d('power') >= 1,
  ];
  const done = step >= goals.length;
  useEffect(() => {
    if (!done && goals[step]()) {
      base.current = { ...stats };
      setStep(step + 1);
    }
  });
  useEffect(() => {
    if (done) props.onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  return (
    <div className="tutorial">
      <div className="tut-title">
        {t.tutorialTitle} {done ? '✓' : `${step + 1}/${goals.length}`}
      </div>
      <div className="tut-text">{done ? t.tutorialDone : t.tutorialSteps[step]}</div>
      <div className="tut-progress">
        {goals.map((_, i) => (
          <span key={i} className={i < step ? 'dotp on' : i === step ? 'dotp cur' : 'dotp'} />
        ))}
      </div>
      {!done && (
        <button className="btn ghost small" onClick={() => setStep(goals.length)}>
          {t.tutorialSkip}
        </button>
      )}
    </div>
  );
}

function EndScreen(props: { sc: ScoreView; me: Side; opp: Side; session: Session; onExit: () => void }) {
  const t = useT();
  const { sc, me, session } = props;
  const sim = session.kind === 'sim';
  const won = sim || sc.winner === me;
  const [asked, setAsked] = useState(false);
  const net = session.net();
  const oppWants = net?.rematch[props.opp] ?? false;
  const showGames = sc.bestOf > 1;
  return (
    <div className="overlay">
      <div className={`panel end ${won ? 'won' : 'lost'}`}>
        <h2>{sim ? `${session.names[sc.winner!]} ${t.wins}` : won ? t.youWin : t.youLose}</h2>
        <div className="final-score" dir="ltr">
          {showGames ? `${sc.games[me]} – ${sc.games[props.opp]}` : `${sc.points[me]} – ${sc.points[props.opp]}`}
        </div>
        <div className="muted">
          {session.names[sc.winner!]} {t.wins}
        </div>
        {session.kind === 'online' && asked && !oppWants && <p className="muted">{t.waitingRematch}</p>}
        {session.kind === 'online' && oppWants && !asked && <p className="good-text">{t.opponentWantsRematch}</p>}
        <div className="menu-buttons">
          <button
            className="btn primary big"
            disabled={asked && session.kind === 'online'}
            onClick={() => {
              setAsked(true);
              session.rematch();
            }}
          >
            {sim ? t.runAgain : t.rematch}
          </button>
          <button className="btn big" onClick={props.onExit}>
            {t.mainMenu}
          </button>
        </div>
      </div>
    </div>
  );
}

function TouchControls(props: { input: InputController; leftHanded: boolean }) {
  const t = useT();
  const { input } = props;
  const padRef = useRef<HTMLDivElement>(null);
  const [dot, setDot] = useState({ x: 0.5, y: 0.45 });
  const [tilt, setTilt] = useState(input.getTilt());

  const move = (e: React.PointerEvent) => {
    const r = padRef.current!.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const ny = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    input.setTouchPad(nx, ny);
    setDot({ x: nx, y: ny });
  };
  const hold = (b: 'top' | 'back' | 'power') => ({
    onPointerDown: (e: React.PointerEvent) => {
      sound.unlock();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      input.setTouchButton(b, true);
    },
    onPointerUp: () => input.setTouchButton(b, false),
    onPointerCancel: () => input.setTouchButton(b, false),
  });

  return (
    <div className={`touch ${props.leftHanded ? 'lefty' : ''}`}>
      <div className="touch-buttons">
        <button
          className="tbtn serve"
          onPointerDown={() => {
            sound.unlock();
            input.serve();
          }}
        >
          {t.serve}
        </button>
        <div className="tbtn-row">
          <button className="tbtn" {...hold('top')}>
            {t.topspin}
          </button>
          <button className="tbtn" {...hold('back')}>
            {t.backspin}
          </button>
          <button className="tbtn" {...hold('power')}>
            {t.power}
          </button>
        </div>
        <label className="tilt-slider">
          <span>{t.tilt}</span>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={tilt}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTilt(v);
              input.setTilt(v);
            }}
          />
        </label>
      </div>
      <div
        className="touch-pad"
        ref={padRef}
        onPointerDown={(e) => {
          sound.unlock();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => e.buttons && move(e)}
      >
        <div className="pad-dot" style={{ left: `${dot.x * 100}%`, bottom: `${dot.y * 100}%` }} />
      </div>
    </div>
  );
}

const SPEEDS = [0.25, 0.5, 1, 2, 4];

function SimPanel(props: { stats: SimStats; camera: CamMode; onSpeed: (x: number) => void; onCamera: (m: CamMode) => void }) {
  const t = useT();
  const { stats } = props;
  const [cam, setCam] = useState<CamMode>(props.camera);
  const avg = stats.rallies ? stats.totalHits / stats.rallies : 0;
  const reasons = Object.entries(stats.reasons).sort((a, b) => b[1] - a[1]);
  const cams: [CamMode, string][] = [
    ['tv', t.camTv],
    ['side', t.camSide],
    ['top', t.camTop],
    ['player', t.camPlayer],
  ];
  return (
    <div className="sim-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="sim-row">
        <span className="sim-label">{t.speed}</span>
        <div className="sim-seg" role="radiogroup" aria-label={t.speed} dir="ltr">
          {SPEEDS.map((x) => (
            <button key={x} role="radio" aria-checked={stats.speed === x} className={stats.speed === x ? 'on' : ''} onClick={() => props.onSpeed(x)} dir="ltr">
              {x}x
            </button>
          ))}
        </div>
      </div>
      <div className="sim-row">
        <span className="sim-label">{t.camera}</span>
        <div className="sim-seg" role="radiogroup" aria-label={t.camera}>
          {cams.map(([m, label]) => (
            <button
              key={m}
              role="radio"
              aria-checked={cam === m}
              className={cam === m ? 'on' : ''}
              onClick={() => {
                setCam(m);
                props.onCamera(m);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <dl className="sim-stats">
        <div>
          <dt>{t.ballSpeed}</dt>
          <dd>
            {Math.round(stats.ballSpeed)} <small>{t.kmh}</small>
          </dd>
        </div>
        <div>
          <dt>{t.topSpeed}</dt>
          <dd>
            {Math.round(stats.topSpeed)} <small>{t.kmh}</small>
          </dd>
        </div>
        <div>
          <dt>
            {t.lastSpin}
            {stats.lastSpinRpm > 30 ? ` · ${t.topspin}` : stats.lastSpinRpm < -30 ? ` · ${t.backspin}` : ''}
          </dt>
          <dd>
            {Math.round(Math.abs(stats.lastSpinRpm))} <small>{t.rpm}</small>
          </dd>
        </div>
        <div>
          <dt>{t.rallyNow}</dt>
          <dd>{stats.rally}</dd>
        </div>
        <div>
          <dt>{t.longestRally}</dt>
          <dd>{stats.longestRally}</dd>
        </div>
        <div>
          <dt>{t.avgRally}</dt>
          <dd>{avg.toFixed(1)}</dd>
        </div>
      </dl>
      {reasons.length > 0 && (
        <div className="sim-reasons">
          <div className="sim-label">{t.pointsBy}</div>
          {reasons.map(([r, n]) => (
            <div key={r} className="sim-reason">
              <span>{t.reasons[r as keyof typeof t.reasons] ?? r}</span>
              <span className="bar" style={{ width: `${(n / reasons[0][1]) * 100}%` }} />
              <b>{n}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

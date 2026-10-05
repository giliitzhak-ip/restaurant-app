import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ServerMsg } from '../shared/protocol';
import { normalizeCode } from '../shared/protocol';
import { LocalSession } from './game/LocalSession';
import type { Session } from './game/session';
import { STRINGS } from './i18n';
import { NetClient, storedSession } from './net/NetClient';
import { OnlineSession } from './net/OnlineSession';
import { type Settings, loadSettings, saveSettings } from './settings';
import { sound } from './audio/sound';
import { SettingsCtx } from './ui/common';
import { GameView } from './ui/GameView';
import { type AiChoice, FirstTimePrompt, MainMenu, PracticeSetup, SettingsScreen, VsComputerSetup } from './ui/Menus';
import { FriendsScreen, Lobby } from './ui/Online';

type Screen =
  | { k: 'menu' }
  | { k: 'vsai' }
  | { k: 'firstTime'; choice: AiChoice }
  | { k: 'practice' }
  | { k: 'settings'; from: Screen }
  | { k: 'friends' }
  | { k: 'lobby' }
  | { k: 'game'; tutorial: boolean; after?: AiChoice };

type RoomMsg = Extract<ServerMsg, { t: 'room' }>;

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const update = useCallback((p: Partial<Settings>) => {
    setSettings((s) => {
      const n = { ...s, ...p };
      saveSettings(n);
      return n;
    });
  }, []);
  const t = STRINGS[settings.lang];
  const inviteCode = useMemo(() => normalizeCode(new URLSearchParams(location.search).get('room') ?? '') ?? '', []);
  const [screen, setScreen] = useState<Screen>(inviteCode || storedSession() ? { k: 'friends' } : { k: 'menu' });
  const [session, setSession] = useState<Session | null>(null);
  const [net, setNet] = useState<NetClient | null>(null);
  const [room, setRoom] = useState<RoomMsg | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    document.documentElement.lang = settings.lang;
    document.documentElement.dir = settings.lang === 'he' ? 'rtl' : 'ltr';
    document.title = t.title;
  }, [settings.lang, t.title]);
  useEffect(() => sound.setVolume(settings.volume), [settings.volume]);

  const getNet = useCallback((): NetClient => {
    if (net) return net;
    const n = new NetClient();
    setNet(n);
    return n;
  }, [net]);

  const endSession = useCallback(() => {
    sessionRef.current?.dispose();
    setSession(null);
  }, []);

  // Online message routing (lobby / start / errors / closures).
  useEffect(() => {
    if (!net) return;
    const off = net.on((m) => {
      const tt = tRef.current;
      switch (m.t) {
        case 'joined':
          setNetError(null);
          if (!sessionRef.current) setScreen({ k: 'lobby' });
          if (location.search) history.replaceState(null, '', location.pathname);
          break;
        case 'room':
          setRoom(m);
          if (m.phase === 'lobby' && sessionRef.current?.kind === 'online') {
            endSession();
            setScreen({ k: 'lobby' });
          }
          break;
        case 'start': {
          if (sessionRef.current?.kind === 'online') break; // rematch or resume: same session continues
          const r = net.room;
          const side = net.side ?? 0;
          const names: [string, string] = [r?.players[0]?.name ?? 'P1', r?.players[1]?.name ?? 'P2'];
          const styles: [string, string] = [r?.players[0]?.paddle ?? 'red', r?.players[1]?.paddle ?? 'blue'];
          const s = new OnlineSession(net, side, names, styles, m.settings.assist);
          setSession(s);
          setNotice(null);
          setScreen({ k: 'game', tutorial: false });
          break;
        }
        case 'error': {
          const msg = tt.errors[m.code] ?? m.code;
          setNetError(msg);
          if (m.code === 'SESSION_EXPIRED' || m.code === 'ROOM_NOT_FOUND') {
            if (sessionRef.current?.kind === 'online') endSession();
            setRoom(null);
            setScreen({ k: 'friends' });
          }
          break;
        }
        case 'closed':
          setNotice(tt.closed[m.reason]);
          if (sessionRef.current?.kind === 'online') endSession();
          if (m.reason === 'opponentLeft') setScreen({ k: 'lobby' });
          else {
            setRoom(null);
            setNetError(tt.closed[m.reason]);
            setScreen({ k: 'friends' });
          }
          break;
      }
    });
    return off;
  }, [net, endSession]);

  // Page reload during an online game: resume our seat.
  useEffect(() => {
    const st = storedSession();
    if (!st || inviteCode) return;
    const n = getNet();
    n.connect()
      .then(() => n.resume(st.code, st.token))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startLocal = (practice: boolean, tutorial: boolean, c?: AiChoice) => {
    sound.unlock();
    const name = settings.name || t.you;
    const s = new LocalSession({
      practice,
      difficulty: c?.difficulty ?? 'medium',
      assist: c?.assist ?? 'arcade',
      bestOf: c?.bestOf ?? 1,
      names: [name, practice ? t.partner : `${t.computer} (${t[c?.difficulty ?? 'medium']})`],
      styles: [settings.paddle, 'blue'],
    });
    setSession(s);
    setScreen({ k: 'game', tutorial, after: tutorial ? c : undefined });
  };

  const exitGame = () => {
    const wasOnline = session?.kind === 'online';
    endSession();
    if (wasOnline && net) {
      net.leave();
      setRoom(null);
    }
    setScreen({ k: 'menu' });
  };

  let content: React.ReactNode = null;
  switch (screen.k) {
    case 'menu':
      content = (
        <MainMenu
          onVsAi={() => setScreen({ k: 'vsai' })}
          onFriend={() => setScreen({ k: 'friends' })}
          onPractice={() => setScreen({ k: 'practice' })}
          onSettings={() => setScreen({ k: 'settings', from: screen })}
        />
      );
      break;
    case 'vsai':
      content = (
        <VsComputerSetup
          onBack={() => setScreen({ k: 'menu' })}
          onStart={(c) => (settings.tutorialDone ? startLocal(false, false, c) : setScreen({ k: 'firstTime', choice: c }))}
        />
      );
      break;
    case 'firstTime':
      content = (
        <FirstTimePrompt
          onTraining={() => startLocal(true, true, screen.choice)}
          onSkip={() => {
            update({ tutorialDone: true });
            startLocal(false, false, screen.choice);
          }}
        />
      );
      break;
    case 'practice':
      content = <PracticeSetup onBack={() => setScreen({ k: 'menu' })} onStart={(tut) => startLocal(true, tut)} />;
      break;
    case 'settings':
      content = <SettingsScreen onBack={() => setScreen(screen.from)} />;
      break;
    case 'friends':
      content = (
        <FriendsScreen
          net={getNet()}
          initialCode={inviteCode}
          error={netError}
          clearError={() => setNetError(null)}
          onBack={() => {
            setNetError(null);
            setScreen({ k: 'menu' });
          }}
        />
      );
      break;
    case 'lobby':
      content =
        net && room && net.side !== null ? (
          <Lobby
            net={net}
            room={room}
            mySide={net.side}
            notice={notice}
            onLeave={() => {
              net.leave();
              setRoom(null);
              setNotice(null);
              setScreen({ k: 'friends' });
            }}
          />
        ) : (
          <div className="screen">
            <div className="panel">{t.connecting}</div>
          </div>
        );
      break;
    case 'game':
      content = session ? (
        <>
          <GameView
            session={session}
            tutorial={screen.tutorial}
            onExit={exitGame}
            onTutorialDone={() => update({ tutorialDone: true })}
          />
          {screen.tutorial && screen.after && settings.tutorialDone && (
            <div className="tutorial-next">
              <button className="btn primary" onClick={() => startLocal(false, false, screen.after)}>
                {t.vsComputer} ▶
              </button>
            </div>
          )}
        </>
      ) : null;
      break;
  }

  return <SettingsCtx.Provider value={{ settings, update }}>{content}</SettingsCtx.Provider>;
}

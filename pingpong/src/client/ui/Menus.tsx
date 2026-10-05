import { useState } from 'react';
import type { Difficulty } from '../../shared/ai';
import type { AssistMode } from '../../shared/paddle';
import type { Quality } from '../settings';
import { Panel, Segmented, toggleFullscreen, useSettings, useT } from './common';

export function MainMenu(props: { onVsAi: () => void; onFriend: () => void; onPractice: () => void; onSettings: () => void }) {
  const t = useT();
  const { settings, update } = useSettings();
  return (
    <div className="screen menu-screen">
      <div className="menu">
        <div className="logo" aria-hidden>
          <span className="logo-ball" />
        </div>
        <h1>{t.title}</h1>
        <p className="subtitle">{t.subtitle}</p>
        <div className="menu-buttons">
          <button className="btn primary big" onClick={props.onVsAi}>
            {t.vsComputer}
          </button>
          <button className="btn primary big" onClick={props.onFriend}>
            {t.playFriend}
          </button>
          <button className="btn big" onClick={props.onPractice}>
            {t.practice}
          </button>
          <button className="btn big" onClick={props.onSettings}>
            {t.settings}
          </button>
        </div>
        <div className="menu-foot">
          <button className="btn ghost" onClick={() => update({ lang: settings.lang === 'he' ? 'en' : 'he' })}>
            {settings.lang === 'he' ? 'English' : 'עברית'}
          </button>
          <button className="btn ghost" onClick={toggleFullscreen}>
            {t.fullscreen}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface AiChoice {
  difficulty: Difficulty;
  assist: AssistMode;
  bestOf: 1 | 3;
}

export function VsComputerSetup(props: { onStart: (c: AiChoice) => void; onBack: () => void }) {
  const t = useT();
  const [c, setC] = useState<AiChoice>({ difficulty: 'medium', assist: 'arcade', bestOf: 1 });
  return (
    <Panel title={t.vsComputer} onBack={props.onBack}>
      <Segmented
        label={t.difficulty}
        value={c.difficulty}
        onChange={(difficulty) => setC({ ...c, difficulty })}
        options={[
          { value: 'easy', label: t.easy },
          { value: 'medium', label: t.medium },
          { value: 'hard', label: t.hard },
        ]}
      />
      <Segmented
        label={t.mode}
        value={c.assist}
        onChange={(assist) => setC({ ...c, assist })}
        options={[
          { value: 'arcade', label: t.arcade },
          { value: 'advanced', label: t.advanced },
        ]}
      />
      <Segmented
        label={t.format}
        value={c.bestOf}
        onChange={(bestOf) => setC({ ...c, bestOf })}
        options={[
          { value: 1, label: t.singleGame },
          { value: 3, label: t.bestOf3 },
        ]}
      />
      <button className="btn primary big wide" onClick={() => props.onStart(c)}>
        {t.start}
      </button>
    </Panel>
  );
}

export function FirstTimePrompt(props: { onTraining: () => void; onSkip: () => void }) {
  const t = useT();
  return (
    <Panel title={t.firstTimeTitle}>
      <p className="lead">{t.firstTimeText}</p>
      <div className="row">
        <button className="btn primary big" onClick={props.onTraining}>
          {t.goTraining}
        </button>
        <button className="btn big" onClick={props.onSkip}>
          {t.skipTraining}
        </button>
      </div>
    </Panel>
  );
}

export function PracticeSetup(props: { onStart: (tutorial: boolean) => void; onBack: () => void }) {
  const t = useT();
  return (
    <Panel title={t.practice} onBack={props.onBack}>
      <p className="lead">{t.freePractice}</p>
      <div className="row">
        <button className="btn primary big" onClick={() => props.onStart(false)}>
          {t.practice}
        </button>
        <button className="btn big" onClick={() => props.onStart(true)}>
          {t.tutorialTitle}
        </button>
      </div>
    </Panel>
  );
}

export function SettingsScreen(props: { onBack: () => void }) {
  const t = useT();
  const { settings: s, update } = useSettings();
  return (
    <Panel title={t.settings} onBack={props.onBack} wide>
      <div className="settings-grid">
        <label className="field">
          <span className="field-label">
            {t.volume}: {Math.round(s.volume * 100)}%
          </span>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => update({ volume: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span className="field-label">
            {t.sensitivity}: {s.sensitivity.toFixed(2)}
          </span>
          <input
            type="range"
            min={0.6}
            max={1.6}
            step={0.05}
            value={s.sensitivity}
            onChange={(e) => update({ sensitivity: Number(e.target.value) })}
          />
        </label>
        <Segmented<Quality>
          label={t.quality}
          value={s.quality}
          onChange={(quality) => update({ quality })}
          options={[
            { value: 'low', label: t.qLow },
            { value: 'medium', label: t.qMedium },
            { value: 'high', label: t.qHigh },
            { value: 'ultra', label: t.qUltra },
          ]}
        />
        <Segmented
          label={t.language}
          value={s.lang}
          onChange={(lang) => update({ lang })}
          options={[
            { value: 'he', label: 'עברית' },
            { value: 'en', label: 'English' },
          ]}
        />
        <Check label={t.dynamicRes} checked={s.dynamicRes} onChange={(dynamicRes) => update({ dynamicRes })} />
        <Check label={t.reduceEffects} checked={s.reduceEffects} onChange={(reduceEffects) => update({ reduceEffects })} />
        <Check label={t.showFps} checked={s.showFps} onChange={(showFps) => update({ showFps })} />
        <Check label={t.leftHanded} checked={s.leftHanded} onChange={(leftHanded) => update({ leftHanded })} />
      </div>
      <h3>{t.controls}</h3>
      <ul className="controls-help">
        <li>{t.controlsMouse}</li>
        <li>{t.controlsKeys}</li>
        <li>{t.controlsTouch}</li>
      </ul>
      <p className="credits">{t.credits}</p>
    </Panel>
  );
}

function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

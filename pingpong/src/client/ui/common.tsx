import { createContext, type ReactNode, useContext } from 'react';
import { PADDLE_STYLES } from '../../shared/protocol';
import { STRINGS, type Strings } from '../i18n';
import type { Settings } from '../settings';

export const SettingsCtx = createContext<{ settings: Settings; update: (p: Partial<Settings>) => void } | null>(null);

export function useSettings() {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error('SettingsCtx missing');
  return c;
}

export function useT(): Strings {
  return STRINGS[useSettings().settings.lang];
}

export function Segmented<T extends string | number>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="field">
      {props.label && <div className="field-label">{props.label}</div>}
      <div className="segmented" role="radiogroup" aria-label={props.label}>
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === props.value}
            className={o.value === props.value ? 'seg active' : 'seg'}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const SWATCH: Record<string, string> = {
  red: '#d0202a',
  blue: '#1f5fe0',
  black: '#1c1c1f',
  green: '#1c9a4a',
  purple: '#7a3bd0',
  gold: '#d9a520',
};

export function PaddlePicker(props: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <div className="field">
      <div className="field-label">{t.paddle}</div>
      <div className="swatches" role="radiogroup" aria-label={t.paddle}>
        {PADDLE_STYLES.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={p === props.value}
            title={t.paddles[p]}
            aria-label={t.paddles[p]}
            className={p === props.value ? 'swatch active' : 'swatch'}
            onClick={() => props.onChange(p)}
          >
            <span className="paddle-icon" style={{ background: SWATCH[p] }} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function PaddleBadge({ style }: { style: string }) {
  return <span className="paddle-icon small" style={{ background: SWATCH[style] ?? '#888' }} />;
}

export function Panel(props: { title: string; children: ReactNode; onBack?: () => void; wide?: boolean }) {
  const t = useT();
  return (
    <div className="screen">
      <div className={props.wide ? 'panel wide' : 'panel'}>
        <div className="panel-head">
          {props.onBack && (
            <button className="btn ghost back" onClick={props.onBack}>
              {t.back}
            </button>
          )}
          <h2>{props.title}</h2>
        </div>
        {props.children}
      </div>
    </div>
  );
}

export function toggleFullscreen(): void {
  const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement || d.webkitFullscreenElement) {
    (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.())?.catch?.(() => {});
    return;
  }
  const p = el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.();
  Promise.resolve(p)
    .then(() => {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      return o?.lock?.('landscape');
    })
    .catch(() => {});
}

export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !window.matchMedia?.('(hover: hover)').matches));

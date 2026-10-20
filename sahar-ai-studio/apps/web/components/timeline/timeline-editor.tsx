'use client';

import { proposeScenes, type TimeRange } from '@sahar/media';
import {
  Pause,
  Play,
  Save,
  Scissors,
  Sparkles,
  SquarePlay,
  ZoomIn,
  ZoomOut,
  Combine,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { FormError } from '@/components/auth/form-message';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/format';
import { format, isolateLtr, type Dictionary } from '@/lib/i18n/config';
import { saveSceneLayoutAction } from '@/lib/scene-actions';
import {
  mergeWithNext,
  moveBoundary,
  sceneIndexAt,
  splitAt,
  type EditorScene,
} from '@/lib/timeline-model';
import { cn } from '@/lib/utils';

const RULER = 22;
const BAND = 30;
const WAVE = 112;
const HEIGHT = RULER + BAND + WAVE;
const MAX_PPS = 400;
const MIN_COMFORTABLE_PPS = 8;
const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];

interface Waveform {
  peaksPerSecond: number;
  peaks: number[];
}

export interface TimelineEditorProps {
  projectId: string;
  audioAssetId: string;
  waveformAssetId: string | null;
  durationMs: number;
  silences: TimeRange[];
  beats: number[] | null;
  initialScenes: EditorScene[];
  t: Dictionary['timeline'];
}

export function TimelineEditor({
  projectId,
  audioAssetId,
  waveformAssetId,
  durationMs,
  silences,
  beats,
  initialScenes,
  t,
}: TimelineEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const stopAtRef = useRef<number | null>(null);
  const dragRef = useRef<{ boundary: number; pointerId: number } | null>(null);

  const [scenes, setScenes] = useState<EditorScene[]>(initialScenes);
  const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [waveform, setWaveform] = useState<Waveform | null>(null);
  const [viewWidth, setViewWidth] = useState(0);
  const [pps, setPps] = useState<number | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string>();
  const [savedNote, setSavedNote] = useState(false);
  const [saving, startSaving] = useTransition();

  const fitPps = viewWidth > 0 ? viewWidth / (durationMs / 1000) : 1;
  const zoom = pps ?? Math.max(fitPps, Math.min(MIN_COMFORTABLE_PPS, MAX_PPS));
  const contentWidth = Math.max(viewWidth, (durationMs / 1000) * zoom);
  const msToX = useCallback((ms: number) => (ms / 1000) * zoom, [zoom]);

  // ─── Data & layout ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!waveformAssetId) return;
    let cancelled = false;
    fetch(`/api/media/${waveformAssetId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Waveform | null) => {
        if (!cancelled && data && Array.isArray(data.peaks)) setWaveform(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [waveformAssetId]);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(() => setViewWidth(scroller.clientWidth));
    observer.observe(scroller);
    setViewWidth(scroller.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ─── Canvas: ruler, silences, beats, waveform (only the visible window) ───────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const scroller = scrollRef.current;
    if (!canvas || !scroller || viewWidth === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(viewWidth * dpr)) canvas.width = Math.round(viewWidth * dpr);
    if (canvas.height !== Math.round(HEIGHT * dpr)) canvas.height = Math.round(HEIGHT * dpr);
    canvas.style.width = `${viewWidth}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, HEIGHT);

    const scrollX = scroller.scrollLeft;
    const visibleStartMs = (scrollX / zoom) * 1000;
    const visibleEndMs = ((scrollX + viewWidth) / zoom) * 1000;

    ctx.fillStyle = '#111114';
    ctx.fillRect(0, RULER + BAND, viewWidth, WAVE);

    // Silences
    ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
    for (const silence of silences) {
      if (silence.endMs < visibleStartMs || silence.startMs > visibleEndMs) continue;
      const x0 = msToX(silence.startMs) - scrollX;
      ctx.fillRect(x0, RULER + BAND, msToX(silence.endMs - silence.startMs), WAVE);
    }

    // Beats (only when zoomed in enough to be readable)
    if (beats && zoom >= 24) {
      ctx.fillStyle = 'rgba(212, 175, 55, 0.22)';
      for (const beat of beats) {
        if (beat < visibleStartMs || beat > visibleEndMs) continue;
        ctx.fillRect(Math.round(msToX(beat) - scrollX), RULER + BAND, 1, WAVE);
      }
    }

    // Waveform: max peak per pixel column
    if (waveform) {
      const mid = RULER + BAND + WAVE / 2;
      const half = WAVE / 2 - 6;
      ctx.fillStyle = 'rgba(230, 201, 106, 0.9)';
      const perPx = waveform.peaksPerSecond / zoom;
      for (let x = 0; x < viewWidth; x++) {
        const start = Math.floor(((scrollX + x) / zoom) * waveform.peaksPerSecond);
        const end = Math.max(start + 1, Math.floor(start + perPx));
        let peak = 0;
        for (let i = start; i < end && i < waveform.peaks.length; i++)
          peak = Math.max(peak, waveform.peaks[i]!);
        const h = Math.max(1, (peak / 255) * half);
        ctx.fillRect(x, mid - h, 1, h * 2);
      }
    }

    // Ruler
    const step = TICK_STEPS.find((s) => s * zoom >= 64) ?? 300;
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const firstTick = Math.floor(visibleStartMs / 1000 / step) * step;
    for (let sec = firstTick; sec * 1000 <= visibleEndMs; sec += step) {
      const x = Math.round(msToX(sec * 1000) - scrollX);
      ctx.fillRect(x, RULER - 6, 1, 6);
      ctx.fillText(formatTime(sec * 1000, { tenths: step < 1 }), x + 3, RULER / 2 - 1);
    }
  }, [beats, msToX, silences, viewWidth, waveform, zoom]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ─── Playback ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let lastState = 0;
    const tick = (now: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const ms = audio.currentTime * 1000;
      if (stopAtRef.current !== null && ms >= stopAtRef.current) {
        audio.pause();
        stopAtRef.current = null;
      }
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${msToX(ms)}px)`;
      const scroller = scrollRef.current;
      if (scroller) {
        const x = msToX(ms);
        if (x < scroller.scrollLeft || x > scroller.scrollLeft + scroller.clientWidth - 24) {
          scroller.scrollLeft = Math.max(0, x - scroller.clientWidth * 0.2);
        }
      }
      if (now - lastState > 100) {
        lastState = now;
        setPlayheadMs(ms);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, msToX]);

  const seek = useCallback(
    (ms: number) => {
      const clamped = Math.min(Math.max(0, ms), durationMs);
      if (audioRef.current) audioRef.current.currentTime = clamped / 1000;
      setPlayheadMs(clamped);
    },
    [durationMs],
  );

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      stopAtRef.current = null;
      await audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }

  async function playScene() {
    const audio = audioRef.current;
    const scene = scenes[selected];
    if (!audio || !scene) return;
    audio.currentTime = scene.startMs / 1000;
    stopAtRef.current = scene.endMs;
    await audio.play().catch(() => undefined);
  }

  // ─── Editing ──────────────────────────────────────────────────────────────────
  function update(next: EditorScene[], nextSelected = selected) {
    setScenes(next);
    setSelected(Math.min(nextSelected, next.length - 1));
    setDirty(true);
    setSavedNote(false);
    setError(undefined);
  }

  function split() {
    const result = splitAt(scenes, playheadMs);
    if (result) update(result.scenes, result.index);
  }

  function merge() {
    const next = mergeWithNext(scenes, selected);
    if (next) update(next);
    else if (scenes[selected + 1]?.locked) setError(t.hasTakes);
  }

  function autoPropose() {
    if (scenes.some((scene) => scene.locked)) return setError(t.hasTakes);
    if (!window.confirm(t.autoConfirm)) return;
    const proposal = proposeScenes(durationMs, silences, beats);
    update(
      proposal.map((span) => ({ ...span, locked: false })),
      0,
    );
  }

  function save() {
    startSaving(async () => {
      const result = await saveSceneLayoutAction(
        projectId,
        scenes.map(({ id, startMs, endMs }) => ({ ...(id ? { id } : {}), startMs, endMs })),
      );
      if (result.ok && result.scenes) {
        setScenes(result.scenes);
        setDirty(false);
        setSavedNote(true);
        setError(undefined);
      } else {
        setError(result.error ?? t.errors.stale);
      }
    });
  }

  function timeFromClientX(clientX: number) {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return ((clientX - rect.left) / zoom) * 1000;
  }

  function onBackgroundPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const ms = timeFromClientX(event.clientX);
    seek(ms);
    setSelected(sceneIndexAt(scenes, ms));
  }

  function onHandlePointerDown(event: PointerEvent<HTMLDivElement>, boundary: number) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { boundary, pointerId: event.pointerId };
  }

  function onHandlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = moveBoundary(scenes, drag.boundary, timeFromClientX(event.clientX));
    if (next !== scenes) update(next);
  }

  function onHandlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function onHandleKeyDown(event: KeyboardEvent<HTMLDivElement>, boundary: number) {
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!delta) return;
    event.preventDefault();
    const current = scenes[boundary]?.startMs ?? 0;
    update(moveBoundary(scenes, boundary, current + delta * (event.shiftKey ? 1000 : 100)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.key === ' ' &&
      !(event.target instanceof HTMLInputElement) &&
      !(event.target as HTMLElement).closest('[role="slider"]')
    ) {
      event.preventDefault();
      void togglePlay();
    }
  }

  function setZoom(next: number) {
    const value = Math.min(MAX_PPS, Math.max(fitPps, next));
    setPps(value);
    requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      if (scroller)
        scroller.scrollLeft = Math.max(0, (playheadMs / 1000) * value - scroller.clientWidth / 2);
    });
  }

  const current = scenes[selected];
  return (
    <div className="flex flex-col gap-4" onKeyDown={onKeyDown} data-testid="timeline-editor">
      <audio
        ref={audioRef}
        src={`/api/media/${audioAssetId}`}
        preload="auto"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          if (audioRef.current) setPlayheadMs(audioRef.current.currentTime * 1000);
        }}
        onEnded={() => setPlaying(false)}
      />

      {/* Toolbar: transport row, then editing row (labels hidden on phones, names kept for screen readers) */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={togglePlay}
            size="icon"
            aria-label={playing ? t.pause : t.play}
            data-testid="timeline-play"
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <span
            className="min-w-28 rounded-md border border-border bg-surface px-3 py-2 text-sm tabular-nums"
            aria-label={t.playhead}
          >
            <bdi data-testid="timeline-time">
              {formatTime(playheadMs)} / {formatTime(durationMs)}
            </bdi>
          </span>
          <Button
            variant="outline"
            onClick={playScene}
            aria-label={t.playScene}
            data-testid="timeline-play-scene"
          >
            <SquarePlay />
            <span className="hidden sm:inline">{t.playScene}</span>
          </Button>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setZoom(zoom / 1.6)}
              aria-label={t.zoomOut}
              data-testid="timeline-zoom-out"
            >
              <ZoomOut />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setZoom(zoom * 1.6)}
              aria-label={t.zoomIn}
              data-testid="timeline-zoom-in"
            >
              <ZoomIn />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={split}
            aria-label={t.split}
            data-testid="timeline-split"
          >
            <Scissors />
            <span className="hidden sm:inline">{t.split}</span>
          </Button>
          <Button
            variant="outline"
            onClick={merge}
            disabled={selected >= scenes.length - 1}
            aria-label={t.merge}
            data-testid="timeline-merge"
          >
            <Combine />
            <span className="hidden sm:inline">{t.merge}</span>
          </Button>
          <Button
            variant="outline"
            onClick={autoPropose}
            aria-label={t.auto}
            data-testid="timeline-auto"
          >
            <Sparkles />
            <span className="hidden sm:inline">{t.auto}</span>
          </Button>
          <Button
            onClick={save}
            disabled={!dirty || saving}
            className="ms-auto"
            data-testid="timeline-save"
          >
            <Save />
            {saving ? t.saving : t.save}
          </Button>
        </div>
      </div>

      <div
        className="flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-sm"
        data-testid="timeline-status"
      >
        {current ? (
          <span>
            {format(t.selected, {
              n: selected + 1,
              start: isolateLtr(formatTime(current.startMs)),
              end: isolateLtr(formatTime(current.endMs)),
              length: isolateLtr(formatTime(current.endMs - current.startMs)),
            })}
          </span>
        ) : null}
        {dirty ? <span className="text-warning">{t.unsaved}</span> : null}
        {savedNote ? (
          <span role="status" className="text-success">
            {t.saved}
          </span>
        ) : null}
      </div>
      <FormError message={error} />

      {/* Time always runs left → right, also in Hebrew. */}
      <div dir="ltr" className="overflow-hidden rounded-xl border border-border bg-surface">
        <div
          ref={scrollRef}
          className="overflow-x-auto overscroll-x-contain"
          onScroll={draw}
          data-testid="timeline-scroll"
        >
          <div
            ref={contentRef}
            className="relative select-none"
            style={{ width: contentWidth, height: HEIGHT }}
            onPointerDown={onBackgroundPointerDown}
          >
            <canvas
              ref={canvasRef}
              className="pointer-events-none sticky left-0 block"
              style={{ height: HEIGHT }}
              aria-hidden
            />

            {scenes.map((scene, index) => (
              <button
                key={scene.id ?? `new-${scene.startMs}`}
                type="button"
                className={cn(
                  'absolute flex items-center overflow-hidden border-x border-background/60 px-2 text-start text-xs font-medium whitespace-nowrap',
                  index === selected
                    ? 'bg-gold-400/35 text-gold-50 ring-1 ring-gold-300 ring-inset'
                    : index % 2
                      ? 'bg-white/[0.06] text-muted-foreground'
                      : 'bg-gold-400/12 text-muted-foreground',
                )}
                style={{
                  left: msToX(scene.startMs),
                  width: msToX(scene.endMs - scene.startMs),
                  top: RULER,
                  height: BAND,
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  setSelected(index);
                  seek(scene.startMs);
                }}
                aria-pressed={index === selected}
                data-testid="scene-block"
                data-start={scene.startMs}
                data-end={scene.endMs}
              >
                {format(t.sceneLabel, { n: index + 1 })}
              </button>
            ))}

            {scenes.map((scene, index) =>
              index === selected ? (
                <div
                  key={`sel-${index}`}
                  className="pointer-events-none absolute border-x-2 border-gold-300/80 bg-gold-400/8"
                  style={{
                    left: msToX(scene.startMs),
                    width: msToX(scene.endMs - scene.startMs),
                    top: RULER + BAND,
                    height: WAVE,
                  }}
                />
              ) : null,
            )}

            {scenes.slice(1).map((scene, i) => {
              const boundary = i + 1;
              return (
                <div
                  key={`b-${boundary}-${scene.id ?? scene.startMs}`}
                  role="slider"
                  tabIndex={0}
                  aria-label={format(t.sceneLabel, { n: boundary + 1 })}
                  aria-valuemin={0}
                  aria-valuemax={durationMs}
                  aria-valuenow={scene.startMs}
                  aria-valuetext={formatTime(scene.startMs)}
                  className="group absolute top-0 z-10 flex w-7 -translate-x-1/2 cursor-col-resize touch-none justify-center focus-visible:outline-none"
                  style={{ left: msToX(scene.startMs), height: HEIGHT }}
                  onPointerDown={(event) => onHandlePointerDown(event, boundary)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  onPointerCancel={onHandlePointerUp}
                  onKeyDown={(event) => onHandleKeyDown(event, boundary)}
                  data-testid="boundary-handle"
                >
                  <span
                    className="w-0.5 bg-gold-300 group-hover:w-1 group-focus-visible:w-1 group-focus-visible:bg-gold-50"
                    style={{ marginTop: RULER, height: HEIGHT - RULER }}
                  />
                  {/* Grip sits in the scene band so it never covers the ruler's time labels. */}
                  <span
                    className="absolute h-5 w-2.5 rounded-full border border-background/60 bg-gold-300 shadow"
                    style={{ top: RULER + BAND / 2 - 10 }}
                  />
                </div>
              );
            })}

            <div
              ref={playheadRef}
              className="pointer-events-none absolute top-0 left-0 z-20 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
              style={{ height: HEIGHT, transform: `translateX(${msToX(playheadMs)}px)` }}
              data-testid="timeline-playhead"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-3 rounded-sm bg-slate-400/30" />
            {t.legendSilence}
          </span>
          {beats ? (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-px bg-gold-400/60" />
              {t.legendBeat}
            </span>
          ) : null}
          <span>{t.direction}</span>
        </div>
        <span>{t.dragHint}</span>
      </div>
    </div>
  );
}

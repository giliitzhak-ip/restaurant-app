import path from 'node:path';

export interface MockRenderPlan {
  songPath: string;
  referenceImagePath: string | null;
  startMs: number;
  endMs: number;
  width: number;
  height: number;
  fps: number;
  outputPath: string;
  /** Files holding overlay text (drawtext reads them, so no escaping is needed). */
  textFiles: { hebrew: string; english: string; label: string };
  fontRegular: string;
  fontBold: string;
}

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
const seconds = (ms: number) => (ms / 1000).toFixed(3);

/** Escapes a path for use inside an FFmpeg filter argument. */
function filterPath(file: string) {
  return path.resolve(file).replace(/\\/g, '/').replace(/'/g, "'\\''").replace(/:/g, '\\:');
}

/**
 * FFmpeg arguments for a technical test render:
 *  - picture: the scene's reference image (cover-cropped, slow zoom) or a plain dark card;
 *  - audio: the exact song segment, cut sample-accurately with atrim (original timing);
 *  - a live waveform strip, so audio/video sync is visible;
 *  - burned-in labels stating it is a technical test, not AI output;
 *  - H.264 High / yuv420p / AAC-LC, +faststart: plays inline on iPhone Safari.
 */
export function buildMockArgs(plan: MockRenderPlan): string[] {
  const { width: W, height: H, fps } = plan;
  const durationSec = (plan.endMs - plan.startMs) / 1000;
  const frames = Math.max(1, Math.round(durationSec * fps));
  const scale = Math.max(W, H) >= 1080 ? 1 : Math.max(W, H) / 1080;
  const px = (value: number) => Math.round(value * scale);
  const coverW = even(W * 1.08);
  const coverH = even(H * 1.08);
  const waveH = even(H * 0.12);
  const fonts = { regular: filterPath(plan.fontRegular), bold: filterPath(plan.fontBold) };
  const text = {
    hebrew: filterPath(plan.textFiles.hebrew),
    english: filterPath(plan.textFiles.english),
    label: filterPath(plan.textFiles.label),
  };

  const picture = plan.referenceImagePath
    ? `[0:v]scale=${coverW}:${coverH}:force_original_aspect_ratio=increase,crop=${coverW}:${coverH},` +
      `zoompan=z='1+0.07*on/${frames}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${fps},format=yuv420p[bg]`
    : `[0:v]format=yuv420p[bg]`;

  const labelY = `h-th-${waveH + px(70)}`;
  const box = `box=1:boxcolor=black@0.55:boxborderw=${px(12)}`;
  // Each entry is one filter graph segment; segments are joined with ";".
  const graph = [
    `[1:a]atrim=start=${seconds(plan.startMs)}:end=${seconds(plan.endMs)},asetpts=PTS-STARTPTS,aresample=48000,asplit=2[aout][aw]`,
    picture,
    `[aw]showwaves=s=${W}x${waveH}:mode=cline:rate=${fps}:colors=0xE6C96A,format=rgba[wave]`,
    `[bg]drawbox=x=0:y=ih-${waveH}-${px(40)}:w=iw:h=${waveH}:color=black@0.45:t=fill[bgw]`,
    [
      `[bgw][wave]overlay=0:H-h-${px(40)}:shortest=1`,
      `drawbox=x=0:y=0:w=iw:h=${px(150)}:color=black@0.6:t=fill`,
      `drawtext=fontfile='${fonts.bold}':textfile='${text.hebrew}':text_shaping=1:fontsize=${px(54)}:fontcolor=0xE6C96A:x=(w-tw)/2:y=${px(22)}`,
      `drawtext=fontfile='${fonts.regular}':textfile='${text.english}':fontsize=${px(32)}:fontcolor=white:x=(w-tw)/2:y=${px(94)}`,
      `drawtext=fontfile='${fonts.regular}':textfile='${text.label}':fontsize=${px(30)}:fontcolor=white:${box}:x=${px(30)}:y=${labelY}`,
      `drawtext=fontfile='${fonts.regular}':text='song %{pts\\:hms\\:${seconds(plan.startMs)}}':fontsize=${px(30)}:fontcolor=white:${box}:x=w-tw-${px(30)}:y=${labelY}[v]`,
    ].join(','),
  ];

  const pictureInput = plan.referenceImagePath
    ? ['-loop', '1', '-framerate', String(fps), '-i', plan.referenceImagePath]
    : ['-f', 'lavfi', '-i', `color=c=0x141006:s=${W}x${H}:r=${fps}`];

  return [
    '-hide_banner',
    '-nostats',
    '-loglevel',
    'error',
    '-y',
    ...pictureInput,
    '-i',
    plan.songPath,
    '-filter_complex',
    graph.join(';'),
    '-map',
    '[v]',
    '-map',
    '[aout]',
    '-t',
    durationSec.toFixed(3),
    '-r',
    String(fps),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-profile:v',
    'high',
    '-level',
    '4.1',
    '-pix_fmt',
    'yuv420p',
    '-g',
    String(fps * 2),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    plan.outputPath,
  ];
}

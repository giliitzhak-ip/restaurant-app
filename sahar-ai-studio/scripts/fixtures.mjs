// Generates synthetic test media with FFmpeg (no binary fixtures in the repository).
// The song is a click track with a known tempo and a known silence, so analysis results
// can be asserted exactly. Images are FFmpeg test patterns — never pictures of people.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const FIXTURE_FACTS = {
  durationMs: 30_000,
  bpm: 120,
  // Clicks are muted for 10–12 s; the last one before (9.6 s) decays out by ~9.67 s and
  // the next one starts at 12.1 s, so the audible silence is 9.67–12.10 s.
  silence: { startMs: 9_670, endMs: 12_100 },
};

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

function run(args) {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

export function ensureFixtures(dir) {
  mkdirSync(dir, { recursive: true });
  const file = (name) => path.join(dir, name);
  // 1 kHz bursts decaying over ~20 ms, every 0.5 s (120 BPM), first at 0.1 s; silent 10–12 s.
  const click =
    '0.8*sin(2*PI*1000*t)*exp(-60*mod(t-0.1\\,0.5))*gte(t\\,0.1)*not(between(t\\,10\\,12))';
  if (!existsSync(file('song.wav'))) {
    run([
      '-f',
      'lavfi',
      '-i',
      `aevalsrc=${click}|${click}:s=44100:d=30`,
      '-c:a',
      'pcm_s16le',
      file('song.wav'),
    ]);
  }
  if (!existsSync(file('song.mp3'))) {
    run(['-i', file('song.wav'), '-c:a', 'libmp3lame', '-b:a', '192k', file('song.mp3')]);
  }
  if (!existsSync(file('reference.png'))) {
    run([
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=600x800:rate=1',
      '-frames:v',
      '1',
      file('reference.png'),
    ]);
  }
  if (!existsSync(file('reference.jpg'))) {
    run([
      '-f',
      'lavfi',
      '-i',
      'smptebars=size=720x900:rate=1',
      '-frames:v',
      '1',
      '-q:v',
      '3',
      file('reference.jpg'),
    ]);
  }
  if (!existsSync(file('tiny.png'))) {
    run(['-f', 'lavfi', '-i', 'testsrc2=size=100x100:rate=1', '-frames:v', '1', file('tiny.png')]);
  }
  if (!existsSync(file('not-audio.mp3'))) {
    writeFileSync(file('not-audio.mp3'), 'This is a text file pretending to be an MP3.\n');
  }
  // Valid MPEG frame header followed by garbage: passes the magic-byte check, fails ffprobe.
  if (!existsSync(file('corrupt.mp3'))) {
    writeFileSync(
      file('corrupt.mp3'),
      Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(4096, 7)]),
    );
  }
  // MP3 with embedded cover art (ID3 APIC → ffprobe shows an attached_pic video stream).
  if (!existsSync(file('song-cover.mp3'))) {
    run([
      '-i',
      file('song.wav'),
      '-i',
      file('reference.jpg'),
      '-map',
      '0:a',
      '-map',
      '1:v',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      '-c:v',
      'mjpeg',
      '-disposition:v',
      'attached_pic',
      '-id3v2_version',
      '3',
      file('song-cover.mp3'),
    ]);
  }
  if (!existsSync(file('song-48k-24bit-mono.wav'))) {
    run([
      '-i',
      file('song.wav'),
      '-ac',
      '1',
      '-ar',
      '48000',
      '-c:a',
      'pcm_s24le',
      file('song-48k-24bit-mono.wav'),
    ]);
  }
  if (!existsSync(file('reference.webp'))) {
    run([
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=640x800:rate=1',
      '-frames:v',
      '1',
      '-c:v',
      'libwebp',
      file('reference.webp'),
    ]);
  }
  // Random noise compresses badly: a multi-megabyte PNG for size-limit tests.
  if (!existsSync(file('large.png'))) {
    run([
      '-f',
      'lavfi',
      '-i',
      'nullsrc=s=1600x1600,geq=random(1)*255:random(2)*255:random(3)*255',
      '-frames:v',
      '1',
      file('large.png'),
    ]);
  }
  // A real MP4 and an HEIC-like header: both must be refused by content sniffing.
  if (!existsSync(file('clip.mp4'))) {
    run([
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x240:rate=25',
      '-t',
      '1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      file('clip.mp4'),
    ]);
  }
  if (!existsSync(file('photo.heic'))) {
    writeFileSync(
      file('photo.heic'),
      Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(2048, 1)]),
    );
  }
  return {
    songCoverMp3: file('song-cover.mp3'),
    songHiResWav: file('song-48k-24bit-mono.wav'),
    referenceWebp: file('reference.webp'),
    largePng: file('large.png'),
    clipMp4: file('clip.mp4'),
    heic: file('photo.heic'),
    songWav: file('song.wav'),
    songMp3: file('song.mp3'),
    referencePng: file('reference.png'),
    referenceJpg: file('reference.jpg'),
    tinyPng: file('tiny.png'),
    notAudio: file('not-audio.mp3'),
    corruptMp3: file('corrupt.mp3'),
  };
}

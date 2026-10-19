import { describe, expect, it } from 'vitest';
import { validateAudioProbe, validateImageProbe } from './probe';

const mp3 = {
  format: { format_name: 'mp3', duration: '183.512', bit_rate: '320000' },
  streams: [
    {
      index: 0,
      codec_type: 'audio',
      codec_name: 'mp3',
      sample_rate: '44100',
      channels: 2,
      bit_rate: '320000',
    },
    { index: 1, codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } },
  ],
};

describe('validateAudioProbe', () => {
  it('accepts MP3 with cover art and reports normalized info', () => {
    const verdict = validateAudioProbe(mp3);
    expect(verdict).toEqual({
      ok: true,
      info: { durationMs: 183512, sampleRate: 44100, channels: 2, codec: 'mp3', bitRate: 320000 },
    });
  });

  it('accepts PCM WAV', () => {
    const verdict = validateAudioProbe({
      format: { format_name: 'wav', duration: '10.0' },
      streams: [
        {
          index: 0,
          codec_type: 'audio',
          codec_name: 'pcm_s24le',
          sample_rate: '48000',
          channels: 2,
        },
      ],
    });
    expect(verdict.ok).toBe(true);
  });

  it('rejects video, other containers and unsupported codecs', () => {
    expect(
      validateAudioProbe({
        ...mp3,
        streams: [mp3.streams[0]!, { index: 1, codec_type: 'video', codec_name: 'h264' }],
      }).ok,
    ).toBe(false);
    expect(
      validateAudioProbe({
        ...mp3,
        format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '3' },
      }).ok,
    ).toBe(false);
    expect(
      validateAudioProbe({
        format: { format_name: 'wav', duration: '3' },
        streams: [
          {
            index: 0,
            codec_type: 'audio',
            codec_name: 'adpcm_ms',
            sample_rate: '44100',
            channels: 2,
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it('enforces duration bounds', () => {
    const at = (duration: string) =>
      validateAudioProbe({
        format: { format_name: 'mp3', duration },
        streams: [{ ...mp3.streams[0]!, duration }],
      });
    expect(at('0.2').ok).toBe(false);
    expect(at('1300').ok).toBe(false);
    expect(at('1199').ok).toBe(true);
  });
});

describe('validateImageProbe', () => {
  const image = (codec_name: string, width: number, height: number) => ({
    streams: [{ index: 0, codec_type: 'video', codec_name, width, height }],
  });

  it('accepts JPEG/PNG/WebP within size bounds', () => {
    expect(validateImageProbe(image('mjpeg', 1080, 1350))).toEqual({
      ok: true,
      info: { width: 1080, height: 1350, codec: 'mjpeg' },
    });
    expect(validateImageProbe(image('png', 512, 512)).ok).toBe(true);
    expect(validateImageProbe(image('webp', 800, 600)).ok).toBe(true);
  });

  it('rejects tiny, huge, animated or other images', () => {
    expect(validateImageProbe(image('mjpeg', 100, 800)).ok).toBe(false);
    expect(validateImageProbe(image('png', 20_000, 800)).ok).toBe(false);
    expect(validateImageProbe(image('gif', 800, 800)).ok).toBe(false);
    expect(validateImageProbe({ streams: [] }).ok).toBe(false);
  });
});

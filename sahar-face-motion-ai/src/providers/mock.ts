import type { VoiceProvider } from "./types";

/**
 * Mock voice provider: produces a real, valid WAV (a short tone whose length
 * tracks the text length) so the pipeline — storage, preview, download,
 * muxing into video — can be tested end-to-end without a paid API.
 * Output is always labelled in the UI as a test result, never as real speech.
 */
export const mockVoiceProvider: VoiceProvider = {
  id: "mock",
  displayName: "Mock (בדיקות)",
  paid: false,
  requiredEnv: [],
  supportsHebrew: true,
  async listVoices() {
    return [
      { id: "mock-male", name: "בדיקה — גבר", gender: "male" },
      { id: "mock-female", name: "בדיקה — אישה", gender: "female" },
    ];
  },
  async textToSpeech(req) {
    const seconds = Math.min(30, Math.max(1, req.text.length / 14));
    const freq = req.voiceId === "mock-female" ? 330 : 220;
    return { audio: sineWav(seconds, freq), mimeType: "audio/wav" };
  },
};

export function sineWav(seconds: number, freq: number, sampleRate = 22050): Buffer {
  const samples = Math.floor(seconds * sampleRate);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, i / 2000, (samples - i) / 2000);
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 8000 * fade), 44 + i * 2);
  }
  return buf;
}

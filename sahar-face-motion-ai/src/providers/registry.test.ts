import { describe, expect, it } from "vitest";
import { allProviderStatuses, providerStatus } from "./registry";
import { mockVoiceProvider } from "./mock";

describe("provider registry", () => {
  it("defaults to the mock provider, which is ready but flagged as mock", () => {
    const s = providerStatus("faceSwap", {});
    expect(s).toMatchObject({ selectedId: "mock", ready: true, isMock: true });
  });

  it("blocks paid providers without keys and without explicit opt-in", () => {
    const s = providerStatus("voice", { VOICE_PROVIDER: "elevenlabs" });
    expect(s.missingEnv).toEqual(["ELEVENLABS_API_KEY"]);
    expect(s.paidAllowed).toBe(false);
    expect(s.ready).toBe(false);
  });

  it("never reports an unimplemented adapter as ready, even when configured and allowed", () => {
    const s = providerStatus("lipSync", { LIPSYNC_PROVIDER: "sync", SYNC_API_KEY: "k", ALLOW_PAID_PROVIDERS: "true" });
    expect(s.configured).toBe(true);
    expect(s.implemented).toBe(false);
    expect(s.ready).toBe(false);
  });

  it("handles unknown provider ids", () => {
    expect(providerStatus("motion", { MOTION_PROVIDER: "nope" }).ready).toBe(false);
    expect(allProviderStatuses({})).toHaveLength(4);
  });
});

describe("mock voice provider", () => {
  it("returns a valid WAV header", async () => {
    const { audio, mimeType } = await mockVoiceProvider.textToSpeech({ text: "שלום עולם", voiceId: "mock-male", language: "he", format: "wav" });
    expect(mimeType).toBe("audio/wav");
    expect(audio.subarray(0, 4).toString()).toBe("RIFF");
    expect(audio.subarray(8, 12).toString()).toBe("WAVE");
    expect(audio.readUInt32LE(4)).toBe(audio.length - 8);
  });
});

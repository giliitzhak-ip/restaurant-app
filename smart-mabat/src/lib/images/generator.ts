import "server-only";
import { env } from "../env";
import { placeholderImage } from "./brand";

export interface ImageProvider {
  name: string;
  /** Returns raw image bytes (any format sharp can read). */
  generate(prompt: string): Promise<Buffer>;
}

/**
 * OpenAI Images API (gpt-image-1). Requests a portrait image; branding is applied afterwards.
 * We always append "no text" because image models garble Hebrew lettering —
 * the Hebrew headline is rendered by us with a real font instead.
 */
class OpenAIImageProvider implements ImageProvider {
  name = "openai";
  async generate(prompt: string): Promise<Buffer> {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.openaiKey()}` },
      body: JSON.stringify({
        model: env.imageModel(),
        prompt: `${prompt}. Photorealistic, professional commercial photography, dark navy and black palette with subtle tech-blue lighting. Absolutely no text, letters, numbers, logos or watermarks.`,
        size: "1024x1536",
        n: 1,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { b64_json?: string; url?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(`Image API ${res.status}: ${json.error?.message ?? "unknown error"}`);
    const item = json.data?.[0];
    if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
    if (item?.url) {
      const img = await fetch(item.url, { signal: AbortSignal.timeout(60_000) });
      if (!img.ok) throw new Error(`Image download failed: ${img.status}`);
      return Buffer.from(await img.arrayBuffer());
    }
    throw new Error("Image API returned no image");
  }
}

/** Test-mode provider: a branded vector placeholder. No external calls. */
class PlaceholderProvider implements ImageProvider {
  name = "placeholder";
  async generate(prompt: string): Promise<Buffer> {
    let h = 0;
    for (const ch of prompt) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return placeholderImage(h);
  }
}

export function getImageProvider(): ImageProvider {
  return env.openaiKey() ? new OpenAIImageProvider() : new PlaceholderProvider();
}

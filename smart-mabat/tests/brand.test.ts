import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { brandImage, OUT_H, OUT_W, placeholderImage } from "@/lib/images/brand";

describe("brand image", () => {
  it("produces a 1080x1350 JPEG with Hebrew headline and logo", async () => {
    const logo = await sharp({ create: { width: 400, height: 120, channels: 4, background: "#1e90ff" } }).png().toBuffer();
    const out = await brandImage(await placeholderImage(1), { headline: "מצלמות אבטחה 24/7 לעסק שלכם", logo });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([OUT_W, OUT_H]);
    if (process.env.BRAND_SAMPLE) await sharp(out).toFile(process.env.BRAND_SAMPLE);
  });

  it("crops a landscape photo to 4:5", async () => {
    const photo = await sharp({ create: { width: 4032, height: 3024, channels: 3, background: "#334455" } }).jpeg().toBuffer();
    const meta = await sharp(await brandImage(photo)).metadata();
    expect([meta.width, meta.height]).toEqual([OUT_W, OUT_H]);
  });
});

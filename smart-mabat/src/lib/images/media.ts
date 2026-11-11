import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db, MEDIA_BUCKET, must, publicUrl } from "../db";
import type { MediaAsset, Settings } from "../types";
import { brandImage } from "./brand";
import { getImageProvider } from "./generator";

const ALLOWED = new Set(["jpeg", "png", "webp"]);

export async function storeMedia(
  buf: Buffer,
  kind: MediaAsset["kind"],
  meta: { title?: string; tags?: string[]; sourcePrompt?: string; parentId?: string | null } = {},
): Promise<MediaAsset> {
  const info = await sharp(buf).metadata();
  if (!info.format || !ALLOWED.has(info.format)) throw new Error(`סוג קובץ לא נתמך: ${info.format ?? "unknown"}`);
  const ext = info.format === "jpeg" ? "jpg" : info.format;
  const mime = `image/${info.format}`;
  const path = `${kind}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;

  const up = await db().storage.from(MEDIA_BUCKET).upload(path, buf, { contentType: mime, upsert: false });
  if (up.error) throw new Error(`העלאה לאחסון נכשלה: ${up.error.message}`);

  const row = must(
    await db()
      .from("media_assets")
      .insert({
        kind,
        storage_path: path,
        public_url: publicUrl(path),
        mime_type: mime,
        width: info.width ?? null,
        height: info.height ?? null,
        title: meta.title ?? null,
        tags: meta.tags ?? [],
        source_prompt: meta.sourcePrompt ?? null,
        parent_id: meta.parentId ?? null,
      })
      .select("*")
      .single(),
    "save media row",
  );
  return row as unknown as MediaAsset;
}

export async function downloadMedia(asset: Pick<MediaAsset, "storage_path">): Promise<Buffer> {
  const res = await db().storage.from(MEDIA_BUCKET).download(asset.storage_path);
  if (res.error || !res.data) throw new Error(`הורדה מהאחסון נכשלה: ${res.error?.message}`);
  return Buffer.from(await res.data.arrayBuffer());
}

export async function getMedia(id: string): Promise<MediaAsset | null> {
  const { data } = await db().from("media_assets").select("*").eq("id", id).maybeSingle();
  return (data as MediaAsset) ?? null;
}

async function loadLogo(settings: Settings): Promise<Buffer | null> {
  if (!settings.logo_media_id) return null;
  const logo = await getMedia(settings.logo_media_id);
  return logo ? downloadMedia(logo) : null;
}

/** Apply brand frame/headline/logo to a source asset and store the result as a new 'branded' asset. */
export async function makeBranded(
  source: Buffer,
  settings: Settings,
  headline: string | null,
  meta: { parentId?: string | null; sourcePrompt?: string; title?: string },
): Promise<MediaAsset> {
  const out = await brandImage(source, {
    headline: settings.image_headline ? headline : null,
    logo: await loadLogo(settings),
  });
  return storeMedia(out, "branded", { ...meta, tags: ["auto"] });
}

/** Produce the post image according to settings.image_mode. Returns null for 'none' or empty library. */
export async function createPostImage(
  settings: Settings,
  opts: { prompt: string | null; headline: string | null; title: string },
): Promise<MediaAsset | null> {
  if (settings.image_mode === "none") return null;

  if (settings.image_mode === "library") {
    const { data } = await db()
      .from("media_assets")
      .select("*")
      .eq("kind", "upload")
      .order("use_count", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(1);
    const src = (data?.[0] as MediaAsset | undefined) ?? null;
    if (!src) return null;
    await db().from("media_assets").update({ use_count: src.use_count + 1 }).eq("id", src.id);
    return makeBranded(await downloadMedia(src), settings, opts.headline, { parentId: src.id, title: opts.title });
  }

  const provider = getImageProvider();
  const prompt = opts.prompt ?? "Modern IP security camera on a dark wall, blue accent light";
  const raw = await provider.generate(prompt);
  const ai = await storeMedia(await sharp(raw).jpeg({ quality: 92 }).toBuffer(), "ai", {
    sourcePrompt: prompt,
    title: `${opts.title} (${provider.name})`,
  });
  return makeBranded(raw, settings, opts.headline, { parentId: ai.id, sourcePrompt: prompt, title: opts.title });
}

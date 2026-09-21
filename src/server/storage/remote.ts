import { fetchWithTimeout } from "@/server/http/fetch-with-timeout";
import { objectKeySuffix, type StorageDriver } from "./types";

/**
 * Bucket driver for any storage that exposes a signed upload endpoint
 * (S3 with a small signer Lambda, Cloudflare R2, Supabase Storage, …).
 *
 * `STORAGE_UPLOAD_URL` receives a PUT with the file body and the object key as
 * a query parameter; `STORAGE_PUBLIC_BASE_URL` is where the object is then
 * readable. Swapping in the AWS SDK instead is a self-contained change to this
 * file.
 */
export const remoteStorageDriver: StorageDriver = {
  id: "remote",
  async save({ data, contentType, keyHint }) {
    const endpoint = process.env.STORAGE_UPLOAD_URL;
    const base = process.env.STORAGE_PUBLIC_BASE_URL;
    if (!endpoint || !base) {
      throw new Error(
        "STORAGE_DRIVER=remote requires STORAGE_UPLOAD_URL and STORAGE_PUBLIC_BASE_URL",
      );
    }

    const key = `${new Date().toISOString().slice(0, 7)}/${keyHint}-${objectKeySuffix()}`;
    // A bucket that stops answering must not hold a request worker open.
    const response = await fetchWithTimeout(
      `${endpoint}?key=${encodeURIComponent(key)}`,
      {
        method: "PUT",
        headers: {
          "content-type": contentType,
          ...(process.env.STORAGE_API_KEY
            ? { authorization: `Bearer ${process.env.STORAGE_API_KEY}` }
            : {}),
        },
        body: new Uint8Array(data),
        cache: "no-store",
      },
      { timeoutMs: 20_000, label: "storage.save" },
    );

    if (!response.ok) {
      throw new Error(`storage upload failed (${response.status})`);
    }

    return {
      url: `${base.replace(/\/$/, "")}/${key}`,
      key,
      contentType,
      bytes: data.byteLength,
    };
  },
  async remove(key) {
    const endpoint = process.env.STORAGE_UPLOAD_URL;
    if (!endpoint) return;
    await fetchWithTimeout(
      `${endpoint}?key=${encodeURIComponent(key)}`,
      {
        method: "DELETE",
        headers: process.env.STORAGE_API_KEY
          ? { authorization: `Bearer ${process.env.STORAGE_API_KEY}` }
          : undefined,
        cache: "no-store",
      },
      { timeoutMs: 8_000, label: "storage.remove" },
    ).catch(() => undefined);
  },
};

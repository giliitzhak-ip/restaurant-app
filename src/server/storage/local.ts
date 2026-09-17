import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createId } from "@/lib/utils";
import type { StorageDriver } from "./types";

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Development driver: writes into `public/uploads`, which Next serves
 * directly. Fine for a single instance; use a real bucket in production
 * (`STORAGE_DRIVER=remote`).
 */
export const localStorageDriver: StorageDriver = {
  id: "local",
  async save({ data, contentType, keyHint }) {
    const folder = new Date().toISOString().slice(0, 7);
    const extension = extensions[contentType] ?? "bin";
    const name = `${keyHint}-${createId("f").slice(2)}.${extension}`;
    const key = `${folder}/${name}`;
    const directory = join(process.cwd(), "public", "uploads", folder);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, name), data);
    return {
      url: `/uploads/${key}`,
      key,
      contentType,
      bytes: data.byteLength,
    };
  },
  async remove(key) {
    try {
      await unlink(join(process.cwd(), "public", "uploads", key));
    } catch {
      // Already gone — deleting an absent file is not an error here.
    }
  },
};

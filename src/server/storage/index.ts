import { designerConfig } from "@/config/brand";
import { localStorageDriver } from "./local";
import { remoteStorageDriver } from "./remote";
import type { StorageDriver } from "./types";

export function getStorage(): StorageDriver {
  return process.env.STORAGE_DRIVER === "remote"
    ? remoteStorageDriver
    : localStorageDriver;
}

/** Guards an uploaded image before it ever reaches a driver. */
export async function readUploadedImage(file: File) {
  if (!designerConfig.acceptedMimeTypes.includes(file.type as "image/jpeg")) {
    throw new Error("UNSUPPORTED_TYPE");
  }
  if (file.size > designerConfig.maxUploadBytes) {
    throw new Error("FILE_TOO_LARGE");
  }
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Maps a stored URL back to its driver key and removes the file.
 *
 * Deleting a design row is not enough for a privacy promise — the bytes have
 * to go too. Best effort by design: a missing file is not an error.
 */
export async function removeStoredImage(url: string | null | undefined) {
  if (!url) return;
  const driver = getStorage();

  if (driver.id === "local") {
    if (!url.startsWith("/uploads/")) return; // generated media, not an upload
    await driver.remove(url.replace("/uploads/", ""));
    return;
  }

  const base = process.env.STORAGE_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (base && url.startsWith(base)) {
    await driver.remove(url.slice(base.length + 1));
  }
}

export type { StorageDriver, StoredFile } from "./types";

import { isServingProduction } from "@/config/env";
import { localStorageDriver } from "./local";
import { remoteStorageDriver } from "./remote";
import type { StorageDriver } from "./types";

/**
 * Picks the storage driver.
 *
 * Production may only use the remote driver. The local one writes into
 * `public/uploads`, which on any container platform is an ephemeral disk that
 * is not shared between instances — a customer's room photo would upload to
 * one container and 404 from the next, and vanish on the next deploy. Failing
 * loudly here beats discovering that from a support ticket.
 */
export function getStorage(): StorageDriver {
  if (process.env.STORAGE_DRIVER === "remote") return remoteStorageDriver;
  if (isServingProduction) {
    throw new Error(
      "STORAGE_DRIVER must be 'remote' in production — the local driver cannot persist customer uploads.",
    );
  }
  return localStorageDriver;
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

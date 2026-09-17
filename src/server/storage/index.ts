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

export type { StorageDriver, StoredFile } from "./types";

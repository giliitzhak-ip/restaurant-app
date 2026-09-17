import { mockVisionProvider } from "./mock-provider";
import { remoteVisionProvider } from "./remote-provider";
import type { RoomVisionProvider } from "./types";

const providers: Record<string, RoomVisionProvider> = {
  mock: mockVisionProvider,
  heuristic: mockVisionProvider,
  remote: remoteVisionProvider,
};

/**
 * Chosen by ROOM_VISION_PROVIDER. Defaults to the local heuristic provider so
 * the feature works out of the box with no API key and no third party seeing
 * customer photos.
 */
export function getVisionProvider(): RoomVisionProvider {
  const configured = process.env.ROOM_VISION_PROVIDER?.toLowerCase() ?? "mock";
  return providers[configured] ?? mockVisionProvider;
}

/** True when the configured provider needs the full-resolution image. */
export function providerNeedsFullImage() {
  return getVisionProvider().id === "remote";
}

export { mockVisionProvider, remoteVisionProvider };
export type { RoomVisionProvider, RoomImageInput } from "./types";

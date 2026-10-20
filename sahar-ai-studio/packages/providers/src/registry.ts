import { createLocalGpuProvider } from './local-gpu';
import { createMockProvider, DEFAULT_FONTS } from './mock/provider';
import type { ProviderKey, VideoProvider } from './types';

export interface RegistryOptions {
  ffmpegPath: string;
  fontRegular?: string;
  fontBold?: string;
}

/** All providers known to this build. Paid providers are added in later phases. */
export function createProviderRegistry(options: RegistryOptions): Map<ProviderKey, VideoProvider> {
  const providers: VideoProvider[] = [
    createMockProvider({
      ffmpegPath: options.ffmpegPath,
      fontRegular: options.fontRegular ?? DEFAULT_FONTS.regular,
      fontBold: options.fontBold ?? DEFAULT_FONTS.bold,
    }),
    createLocalGpuProvider(),
  ];
  return new Map(providers.map((provider) => [provider.key, provider]));
}

export function isProviderKey(value: unknown): value is ProviderKey {
  return value === 'mock' || value === 'local-gpu';
}

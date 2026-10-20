import 'server-only';
import { createProviderRegistry, type ProviderKey, type VideoProvider } from '@sahar/providers';
import { getServerEnv } from './env';

const globalForProviders = globalThis as unknown as {
  __saharProviders?: Map<ProviderKey, VideoProvider>;
};

export function getProviders(): Map<ProviderKey, VideoProvider> {
  const env = getServerEnv();
  globalForProviders.__saharProviders ??= createProviderRegistry({
    ffmpegPath: env.FFMPEG_PATH,
    fontRegular: env.MOCK_FONT_REGULAR,
    fontBold: env.MOCK_FONT_BOLD,
  });
  return globalForProviders.__saharProviders;
}

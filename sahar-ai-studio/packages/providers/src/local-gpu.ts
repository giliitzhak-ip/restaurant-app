import { ProviderNotImplementedError, type VideoProvider } from './types';

/**
 * Placeholder for a future self-hosted inference server. It is listed so the UI can
 * show it, but it is never operational until a real backend is implemented and tested.
 */
export function createLocalGpuProvider(): VideoProvider {
  const notImplemented = () => {
    throw new ProviderNotImplementedError('local-gpu');
  };
  return {
    key: 'local-gpu',
    kind: 'ai',
    capabilities: {
      operations: ['AUDIO_TO_VIDEO', 'LIP_SYNC'],
      inputs: ['audio', 'reference-image', 'prompt'],
      minDurationMs: 0,
      maxDurationMs: 0,
      aspectRatios: [],
      resolutions: [],
      pricing: { model: 'free', source: 'self-hosted (not implemented)', verifiedAt: '2026-10-19' },
      supportsCancel: false,
      supportsWebhooks: false,
      execution: 'remote',
    },
    availability: () => ({ operational: false, reason: 'not-implemented' }),
    estimateCost: notImplemented,
    execution: {
      kind: 'remote',
      submit: async () => notImplemented(),
      getStatus: async () => notImplemented(),
      fetchResult: async () => notImplemented(),
    },
  };
}

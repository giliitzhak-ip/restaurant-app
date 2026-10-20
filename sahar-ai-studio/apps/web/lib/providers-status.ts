import 'server-only';
import { getServerEnv } from './env';
import { getProviders } from './providers';

export interface ProviderStatusRow {
  id: 'mock' | 'hedra' | 'fal' | 'localGpu';
  envVar: string | null;
  keyConfigured: boolean | null;
  plannedPhase: number;
  /** From the provider registry; providers without an adapter yet are never operational. */
  operational: boolean;
}

/** Only booleans leave the server — never key material. */
export function getProviderStatus(): ProviderStatusRow[] {
  const env = getServerEnv();
  const providers = getProviders();
  return [
    {
      id: 'mock',
      envVar: null,
      keyConfigured: null,
      plannedPhase: 3,
      operational: providers.get('mock')?.availability().operational ?? false,
    },
    {
      id: 'hedra',
      envVar: 'HEDRA_API_KEY',
      keyConfigured: Boolean(env.HEDRA_API_KEY),
      plannedPhase: 4,
      operational: false,
    },
    {
      id: 'fal',
      envVar: 'FAL_KEY',
      keyConfigured: Boolean(env.FAL_KEY),
      plannedPhase: 6,
      operational: false,
    },
    {
      id: 'localGpu',
      envVar: 'LOCAL_GPU_BASE_URL',
      keyConfigured: Boolean(env.LOCAL_GPU_BASE_URL),
      plannedPhase: 7,
      operational: providers.get('local-gpu')?.availability().operational ?? false,
    },
  ];
}

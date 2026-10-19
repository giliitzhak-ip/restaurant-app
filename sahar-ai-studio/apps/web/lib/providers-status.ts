import 'server-only';
import { getServerEnv } from './env';

export interface ProviderStatusRow {
  id: 'mock' | 'hedra' | 'fal' | 'localGpu';
  envVar: string | null;
  keyConfigured: boolean | null;
  plannedPhase: number;
}

/** Only booleans leave the server — never key material. */
export function getProviderStatus(): ProviderStatusRow[] {
  const env = getServerEnv();
  return [
    { id: 'mock', envVar: null, keyConfigured: null, plannedPhase: 3 },
    {
      id: 'hedra',
      envVar: 'HEDRA_API_KEY',
      keyConfigured: Boolean(env.HEDRA_API_KEY),
      plannedPhase: 4,
    },
    { id: 'fal', envVar: 'FAL_KEY', keyConfigured: Boolean(env.FAL_KEY), plannedPhase: 6 },
    {
      id: 'localGpu',
      envVar: 'LOCAL_GPU_BASE_URL',
      keyConfigured: Boolean(env.LOCAL_GPU_BASE_URL),
      plannedPhase: 7,
    },
  ];
}

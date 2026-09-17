import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { logAdminAction, requireAdmin } from '@/lib/api/guards';
import { updateSettingSchema } from '@/lib/validation/admin';
import { getSetting, setSetting, SETTINGS_SCHEMAS, type SettingKey } from '@/lib/services/settings';
import { normaliseWeights } from '@/lib/services/matching/engine';

/** GET /api/admin/settings — every configurable knob, parsed and defaulted. */
export const GET = route(async () => {
  await requireAdmin();

  const keys = Object.keys(SETTINGS_SCHEMAS) as SettingKey[];
  const entries = await Promise.all(keys.map(async (key) => [key, await getSetting(key)] as const));

  return jsonOk({ settings: Object.fromEntries(entries) });
});

/**
 * PUT /api/admin/settings — change one setting.
 *
 * The value is parsed against that key's schema before it is stored, so a bad
 * payload can never brick pricing or matching.
 */
export const PUT = route(async (request: NextRequest) => {
  const { session } = await requireAdmin();
  const input = await parseBody(request, updateSettingSchema);

  let value = input.value;

  if (input.key === 'match_weights') {
    const parsed = SETTINGS_SCHEMAS.match_weights.safeParse(value);
    if (!parsed.success) throw ApiError.badRequest('משקלי ההתאמה אינם תקינים');
    const total = Object.values(parsed.data).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 1) > 0.001) {
      throw ApiError.badRequest('סכום המשקלים חייב להיות 100%');
    }
    value = normaliseWeights(parsed.data);
  }

  try {
    const saved = await setSetting(input.key, value, session.userId);
    await logAdminAction(session.userId, 'settings_update', 'settings', null, { key: input.key });
    return jsonOk({ key: input.key, value: saved });
  } catch (error) {
    throw ApiError.badRequest(
      error instanceof Error ? error.message : 'שמירת ההגדרה נכשלה',
    );
  }
});

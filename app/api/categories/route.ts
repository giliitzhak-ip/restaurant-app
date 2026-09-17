import { route } from '@/lib/api/handler';
import { jsonOk } from '@/lib/api/response';
import { getCatalogue } from '@/lib/services/catalogue';

/** GET /api/categories — the public, database-driven catalogue. */
export const GET = route(async () => {
  const catalogue = await getCatalogue();
  return jsonOk({ categories: catalogue });
});

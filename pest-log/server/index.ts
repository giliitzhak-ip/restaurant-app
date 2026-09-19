import http from 'node:http';
import { loadConfig, type ServerConfig } from './config';
import { bearerToken, RateLimiter, verifyAccessToken } from './auth';
import { createAdminClient } from './supabaseAdmin';
import {
  completePestLog,
  findExistingPdf,
  generateAndStorePdf,
  signUrl,
} from './completion';
import { closeBrowser } from './renderPdf';

/**
 * שירות השרת של יומן ההדברה.
 *
 * אחראי על שלוש פעולות שאסור שיתבצעו בלקוח:
 *  - השלמת יומן (ולידציה מלאה + RPC אטומי)
 *  - הפקת ה-PDF העברי
 *  - פתיחת גרסת תיקון
 *
 * כל הנתיבים דורשים JWT תקף של Supabase. אין כאן מפתחות בקוד.
 */

const config = loadConfig();
const admin = createAdminClient(config);
const limiter = new RateLimiter(config.rateLimit, config.rateWindowMs);
setInterval(() => limiter.sweep(), config.rateWindowMs).unref();

/** גודל מרבי לגוף בקשה — מגן מפני הצפה. */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

function corsHeaders(origin: string | undefined): Record<string, string> {
  const allowed = origin && config.allowedOrigins.includes(origin) ? origin : config.allowedOrigins[0] ?? '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function send(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  origin: string | undefined,
  extraHeaders: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    ...corsHeaders(origin),
    ...extraHeaders,
  });
  res.end(payload);
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('גוף הבקשה גדול מדי.');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('גוף הבקשה אינו JSON תקין.');
  }
}

/** לוג תפעולי בלבד — בלי מידע אישי ובלי תוכן היומן. */
function logRequest(method: string, path: string, status: number, userId?: string): void {
  const actor = userId ? `user:${userId.slice(0, 8)}…` : 'anonymous';
  console.info(`${new Date().toISOString()} ${method} ${path} → ${status} (${actor})`);
}

async function authenticate(
  req: http.IncomingMessage,
  config: ServerConfig,
): Promise<{ userId: string } | { error: string }> {
  const token = bearerToken(req.headers.authorization);
  if (!token) return { error: 'נדרשת התחברות.' };
  try {
    const user = await verifyAccessToken(token, config);
    return { userId: user.userId };
  } catch {
    return { error: 'ההתחברות פגה. יש להתחבר מחדש.' };
  }
}

/** מוודא שהיומן שייך לארגון של המשתמש. */
async function assertLogAccess(
  userId: string,
  logId: string,
): Promise<{ organizationId: string } | { error: string; status: number }> {
  const { data: profile } = await admin
    .from('profiles')
    .select('organization_id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!profile) return { error: 'המשתמש אינו משויך לארגון.', status: 403 };

  const { data: log } = await admin
    .from('pest_logs')
    .select('organization_id')
    .eq('id', logId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!log) return { error: 'היומן לא נמצא.', status: 404 };
  if (log.organization_id !== profile.organization_id) {
    return { error: 'אין הרשאה ליומן זה.', status: 403 };
  }
  return { organizationId: log.organization_id as string };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const server = http.createServer((req, res) => {
  void handleRequest(req, res).catch((error) => {
    console.error('שגיאה לא מטופלת:', error instanceof Error ? error.message : error);
    if (!res.headersSent) send(res, 500, { error: 'שגיאת שרת.' }, req.headers.origin);
  });
});

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const origin = req.headers.origin;
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  if (path === '/healthz') {
    send(res, 200, { ok: true }, origin);
    return;
  }

  const completeMatch = path.match(/^\/api\/logs\/([^/]+)\/complete$/);
  const pdfMatch = path.match(/^\/api\/logs\/([^/]+)\/pdf$/);
  const correctionMatch = path.match(/^\/api\/logs\/([^/]+)\/correction$/);
  const deliveryMatch = path.match(/^\/api\/logs\/([^/]+)\/delivery$/);

  const logId = completeMatch?.[1] ?? pdfMatch?.[1] ?? correctionMatch?.[1] ?? deliveryMatch?.[1];
  if (!logId) {
    send(res, 404, { error: 'נתיב לא נמצא.' }, origin);
    logRequest(req.method ?? '', path, 404);
    return;
  }
  if (!UUID_PATTERN.test(logId)) {
    send(res, 400, { error: 'מזהה יומן לא תקין.' }, origin);
    return;
  }

  const auth = await authenticate(req, config);
  if ('error' in auth) {
    send(res, 401, { error: auth.error }, origin);
    logRequest(req.method ?? '', path, 401);
    return;
  }

  const rate = limiter.check(`${auth.userId}:${path}`);
  if (!rate.allowed) {
    send(res, 429, { error: 'בוצעו יותר מדי בקשות. יש להמתין ולנסות שוב.' }, origin, {
      'Retry-After': String(rate.retryAfterSeconds),
    });
    logRequest(req.method ?? '', path, 429, auth.userId);
    return;
  }

  const access = await assertLogAccess(auth.userId, logId);
  if ('error' in access) {
    send(res, access.status, { error: access.error }, origin);
    logRequest(req.method ?? '', path, access.status, auth.userId);
    return;
  }

  // ── השלמת יומן ──
  if (completeMatch && req.method === 'POST') {
    const body = await readJsonBody(req);
    const idempotencyKey =
      (req.headers['idempotency-key'] as string | undefined) ?? (body.idempotencyKey as string | undefined);
    if (!idempotencyKey || idempotencyKey.length < 8) {
      send(res, 400, { error: 'נדרש Idempotency-Key.' }, origin);
      return;
    }

    const result = await completePestLog({
      admin,
      config,
      userId: auth.userId,
      logId,
      idempotencyKey,
      ...(body.content ? { content: body.content as Record<string, unknown> } : {}),
    });

    const status = result.ok
      ? 200
      : result.code === 'validation'
        ? 422
        : result.code === 'forbidden'
          ? 403
          : result.code === 'conflict'
            ? 409
            : result.code === 'not_found'
              ? 404
              : 500;
    send(res, status, result, origin);
    logRequest(req.method, path, status, auth.userId);
    return;
  }

  // ── קישור ל-PDF (מפיק מחדש אם חסר) ──
  if (pdfMatch && (req.method === 'POST' || req.method === 'GET')) {
    const { data: log } = await admin
      .from('pest_logs')
      .select('id, organization_id, status, snapshot, serial_number, document_version, document_hash')
      .eq('id', logId)
      .maybeSingle();

    if (!log || log.status !== 'completed') {
      send(res, 409, { error: 'ניתן להפיק PDF רק ליומן שהושלם.' }, origin);
      return;
    }

    let path = await findExistingPdf(admin, logId, Number(log.document_version));
    if (!path) {
      path = await generateAndStorePdf({
        admin,
        config,
        logId,
        organizationId: log.organization_id as string,
        snapshot: (log.snapshot ?? {}) as Record<string, unknown>,
        serialNumber: Number(log.serial_number),
        documentVersion: Number(log.document_version),
        documentHash: String(log.document_hash),
        userId: auth.userId,
      });
    }

    send(
      res,
      200,
      {
        ok: true,
        pdfPath: path,
        signedUrl: await signUrl(admin, path, config.signedUrlTtlSeconds),
        expiresInSeconds: config.signedUrlTtlSeconds,
        serialNumber: Number(log.serial_number),
      },
      origin,
    );
    logRequest(req.method, path ?? '', 200, auth.userId);
    return;
  }

  // ── פתיחת גרסת תיקון ──
  if (correctionMatch && req.method === 'POST') {
    const body = await readJsonBody(req);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) {
      send(res, 400, { error: 'יש לציין את סיבת התיקון.' }, origin);
      return;
    }

    const { data, error } = await admin.rpc('open_pest_log_correction', {
      p_source_log_id: logId,
      p_reason: reason,
      p_actor: auth.userId,
      p_idempotency_key: (req.headers['idempotency-key'] as string | undefined) ?? null,
    });
    if (error) {
      send(res, 409, { error: error.message }, origin);
      logRequest(req.method, path, 409, auth.userId);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
    send(res, 200, { ok: true, correctionLogId: row.id, documentVersion: row.document_version }, origin);
    logRequest(req.method, path, 200, auth.userId);
    return;
  }

  // ── תיעוד מסירה נוספת לאחר ההשלמה ──
  // היומן עצמו אינו משתנה. נרשם אירוע ביקורת עם מועד המסירה ודרכה.
  // שם המקבל כבר מתועד ביומן עצמו ולכן אינו נכתב שוב ללוג.
  if (deliveryMatch && req.method === 'POST') {
    const body = await readJsonBody(req);
    const method = typeof body.method === 'string' ? body.method : '';
    if (!method) {
      send(res, 400, { error: 'יש לציין את דרך המסירה.' }, origin);
      return;
    }
    await admin.from('audit_events').insert({
      organization_id: access.organizationId,
      actor_user_id: auth.userId,
      action: 'pest_log.delivered',
      entity_type: 'pest_log',
      entity_id: logId,
      metadata: { method, deliveredAt: new Date().toISOString() },
    });
    send(res, 200, { ok: true }, origin);
    logRequest(req.method, path, 200, auth.userId);
    return;
  }

  send(res, 405, { error: 'שיטת בקשה לא נתמכת.' }, origin);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '');
if (isMain) {
  server.listen(config.port, () => {
    console.info(`שירות יומן ההדברה מאזין על פורט ${config.port}`);
  });

  const shutdown = async () => {
    console.info('סוגר את השירות…');
    await closeBrowser();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

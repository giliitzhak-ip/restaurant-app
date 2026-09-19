import { clientEnv } from './env';
import { getAccessToken } from './supabase';
import type { ValidationProblem } from '@/schema/pestLog';

/**
 * קריאות לשירות השרת: השלמת יומן, הפקת PDF ופתיחת גרסת תיקון.
 * פעולות אלה אינן מתבצעות בלקוח — הן מחייבות ולידציה ו-RPC אטומי בשרת.
 */

export interface CompleteResponse {
  ok: true;
  logId: string;
  serialNumber: number;
  documentHash: string;
  documentVersion: number;
  completedAt: string;
  pdfPath: string;
  signedUrl: string;
}

export interface ApiError {
  ok: false;
  code: 'validation' | 'forbidden' | 'conflict' | 'not_found' | 'error' | 'offline' | 'auth';
  message: string;
  problems?: ValidationProblem[];
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T | ApiError> {
  if (!navigator.onLine) {
    return {
      ok: false,
      code: 'offline',
      message: 'אין חיבור לרשת. הפעולה דורשת חיבור — הטיוטה נשמרה מקומית ותסונכרן בהמשך.',
    };
  }

  const token = await getAccessToken();
  if (!token) return { ok: false, code: 'auth', message: 'ההתחברות פגה. יש להתחבר מחדש.' };

  try {
    const response = await fetch(`${clientEnv.pdfServiceUrl}${path}`, {
      method: options.method ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        code: (payload.code as ApiError['code']) ?? 'error',
        message: (payload.message as string) ?? (payload.error as string) ?? `שגיאה ${response.status}`,
        ...(payload.problems ? { problems: payload.problems as ValidationProblem[] } : {}),
      };
    }
    return payload as T;
  } catch (error) {
    return {
      ok: false,
      code: 'error',
      message: `הפנייה לשרת נכשלה: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function completeLog(
  logId: string,
  content: Record<string, unknown>,
  idempotencyKey: string,
): Promise<CompleteResponse | ApiError> {
  return request<CompleteResponse>(`/api/logs/${logId}/complete`, {
    body: { content },
    idempotencyKey,
  });
}

export interface PdfResponse {
  ok: true;
  pdfPath: string;
  signedUrl: string;
  expiresInSeconds: number;
  serialNumber: number;
}

export function requestPdf(logId: string): Promise<PdfResponse | ApiError> {
  return request<PdfResponse>(`/api/logs/${logId}/pdf`);
}

export interface CorrectionResponse {
  ok: true;
  correctionLogId: string;
  documentVersion: number;
}

export function openCorrection(
  logId: string,
  reason: string,
  idempotencyKey: string,
): Promise<CorrectionResponse | ApiError> {
  return request<CorrectionResponse>(`/api/logs/${logId}/correction`, {
    body: { reason },
    idempotencyKey,
  });
}

/** תיעוד מסירה נוספת לאחר ההשלמה (היומן עצמו אינו משתנה). */
export function recordDelivery(logId: string, method: string): Promise<{ ok: true } | ApiError> {
  return request<{ ok: true }>(`/api/logs/${logId}/delivery`, { body: { method } });
}

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && (value as ApiError).ok === false;
}

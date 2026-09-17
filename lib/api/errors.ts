/**
 * Errors that are safe to show a user. Anything else is logged server-side and
 * surfaced as a generic message — stack traces never cross the wire.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = 'error',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message = 'הבקשה אינה תקינה', details?: unknown) {
    return new ApiError(400, message, 'bad_request', details);
  }
  static unauthorized(message = 'נדרשת התחברות') {
    return new ApiError(401, message, 'unauthorized');
  }
  static forbidden(message = 'אין לך הרשאה לפעולה הזו') {
    return new ApiError(403, message, 'forbidden');
  }
  static notFound(message = 'הפריט המבוקש לא נמצא') {
    return new ApiError(404, message, 'not_found');
  }
  static conflict(message = 'הפעולה מתנגשת עם מצב קיים') {
    return new ApiError(409, message, 'conflict');
  }
  static unprocessable(message = 'לא ניתן לבצע את הפעולה במצב הנוכחי') {
    return new ApiError(422, message, 'unprocessable');
  }
  static rateLimited(message = 'יותר מדי בקשות. נסה שוב בעוד רגע.') {
    return new ApiError(429, message, 'rate_limited');
  }
  static serviceUnavailable(message = 'השירות אינו זמין כרגע') {
    return new ApiError(503, message, 'service_unavailable');
  }
}

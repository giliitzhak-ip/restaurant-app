import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { toErrorResponse } from './response';

type Handler<Ctx> = (request: NextRequest, context: Ctx) => Promise<NextResponse>;

/**
 * Wraps a route handler so that every thrown error — ApiError, ZodError or
 * anything unexpected — becomes a safe JSON response. Nothing leaks a stack.
 */
export function route<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** Next 15+ passes dynamic params as a promise. */
export type RouteParams<T extends Record<string, string>> = { params: Promise<T> };

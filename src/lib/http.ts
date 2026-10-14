import { NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

export const ok = (data: unknown, init?: number) => NextResponse.json(data, { status: init ?? 200 });

export function fail(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: { code: 'invalid_request', message: 'The request was not valid.', details: e.flatten() } }, { status: 400 });
  console.error(JSON.stringify({ level: 'error', msg: 'unhandled', error: e instanceof Error ? e.message : String(e) }));
  return NextResponse.json({ error: { code: 'server_error', message: 'Something went wrong on our side. Please try again.' } }, { status: 500 });
}

export async function body<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try { json = await req.json(); } catch { throw new HttpError(400, 'invalid_json', 'Request body must be JSON.'); }
  return schema.parse(json);
}

export function handler<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A) => { try { return await fn(...a); } catch (e) { return fail(e); } };
}

export function log(level: 'info' | 'warn' | 'error', msg: string, fields: Record<string, unknown> = {}) {
  // Structured logs. Callers must never pass tokens or card data.
  console[level === 'info' ? 'log' : level](JSON.stringify({ level, msg, ...fields, ts: new Date().toISOString() }));
}

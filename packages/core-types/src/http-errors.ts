/**
 * Maps an unexpected exception to a client-safe HTTP error.
 *
 * Domain errors in these services are thrown as `CODE` or `CODE: detail`
 * messages and are safe to return. Anything else (PostgreSQL driver errors,
 * runtime TypeErrors, etc.) may expose schema or internals, so it is logged
 * server-side and returned as a generic 500.
 */
export function toPublicError(err: unknown, service: string): { status: number; body: { error: string } } {
  const message = err instanceof Error ? err.message : String(err);
  if (/^[A-Z][A-Z0-9_]{2,}(?::|$)/.test(message)) return { status: 400, body: { error: message } };
  console.error(`[${service}] Unhandled request error:`, err);
  return { status: 500, body: { error: 'INTERNAL_ERROR' } };
}

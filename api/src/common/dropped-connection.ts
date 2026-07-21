/*
 * Is this rejection just the pooled Postgres connection going away?
 *
 * The pooler drops connections from time to time. When that lands
 * mid-transaction, Prisma's own rollback path rejects with nowhere to catch it,
 * the rejection escapes every request handler, and Node's default is to kill
 * the process — the whole API goes down for a blip that cost one request.
 *
 * Kept narrow on purpose. main.ts swallows only what this returns true for; a
 * blanket "ignore unhandled rejections" would hide real bugs and leave the
 * process running in an unknown state.
 */
export function isDroppedConnection(reason: unknown): boolean {
  const r = reason as { code?: string; message?: string; cause?: { code?: string } } | null;
  const code = r?.code ?? r?.cause?.code;
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ETIMEDOUT') return true;

  const message = String(r?.message ?? reason ?? '');
  return (
    message.includes('Connection terminated') ||
    message.includes('Client has encountered a connection error') ||
    message.includes('server closed the connection')
  );
}

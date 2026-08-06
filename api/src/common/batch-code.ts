/*
 * Minting the sequential batch code (BATCH-0001…).
 *
 * Lives here because TWO services mint it — `subscriptions.service` when an
 * enrolment creates a batch, and `attendance.service` when one is created from
 * the attendance side. They write the same unique index, so they race against
 * each other and not merely against themselves; a private copy in each was how
 * the two drifted apart in the first place.
 *
 * Derived from the MAXIMUM, never from a row count. Both copies used
 * `count() + 1`, which is only equal to the maximum until the first batch is
 * deleted — after that every candidate collides with a code that already
 * exists, the retry burns all its attempts, and the sequence falls through to
 * the timestamp fallback forever. See [[sequential-code-race]] in the project
 * notes; the same shape broke admin "Add Student" outright.
 *
 * Callers should still wrap the INSERT in `retryOnUniqueClash('code', …)` and
 * call this inside the retried closure: nothing holds a lock between the read
 * and the write, so two requests landing together will compute the same code
 * and one has to recompute.
 */

const PREFIX = 'BATCH-';
const PAD = 4;

/** The numeric part of a code, or 0 for anything that does not parse. */
export function batchCodeNumber(code: string | null | undefined): number {
  if (!code || !code.startsWith(PREFIX)) return 0;
  const n = Number(code.slice(PREFIX.length));
  return Number.isFinite(n) ? n : 0;
}

/** Format a batch code from its number. */
export function formatBatchCode(n: number): string {
  return `${PREFIX}${String(Math.max(1, n)).padStart(PAD, '0')}`;
}

/** The highest number among a set of codes. Exported so it can be tested alone. */
export function highestBatchNumber(codes: (string | null | undefined)[]): number {
  return codes.reduce<number>((max, c) => {
    const n = batchCodeNumber(c);
    return n > max ? n : max;
  }, 0);
}

type BatchReader = {
  batch: {
    findMany(args: unknown): Promise<{ code: string | null }[]>;
  };
};

/**
 * The next batch code, one above the highest that exists.
 *
 * The maximum is reduced NUMERICALLY in JS rather than taken from an
 * `orderBy: { code: 'desc' }`, matching `billing.service.nextNumber`. A lexical
 * maximum is right only while every code is the same width: once there are more
 * than 9999 batches, `BATCH-9999` sorts above `BATCH-10000` and the sequence
 * silently restarts. Batches are few enough that reading the column is cheap.
 */
export async function nextBatchCodeFrom(prisma: BatchReader): Promise<string> {
  const rows = await prisma.batch.findMany({
    where: { code: { startsWith: PREFIX } },
    select: { code: true },
  });
  return formatBatchCode(highestBatchNumber(rows.map((r) => r.code)) + 1);
}

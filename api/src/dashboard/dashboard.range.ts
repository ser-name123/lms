/*
 * Shared date-range handling for every dashboard endpoint.
 *
 * The old `/dashboard/overview` had no range parameter at all — the frontend
 * rendered 7d/30d/90d/12m buttons that did nothing. Every dashboard route now
 * accepts `?range=` (and optional explicit `from`/`to`) and resolves it here so
 * the windows are consistent across roles.
 */

export type RangeKey = '7d' | '30d' | '90d' | '12m';

export const RANGE_KEYS: RangeKey[] = ['7d', '30d', '90d', '12m'];

export interface ResolvedRange {
  key: RangeKey;
  from: Date;
  to: Date;
  /** Equal-length window immediately before `from`, for delta comparisons. */
  prevFrom: Date;
  prevTo: Date;
  /** Sensible bucket granularity for charts over this window. */
  bucket: 'day' | 'week' | 'month';
  /** Number of buckets to render. */
  buckets: number;
}

const DAY_MS = 86_400_000;

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveRange(
  rangeKey?: string,
  fromRaw?: string,
  toRaw?: string,
  now: Date = new Date(),
): ResolvedRange {
  const key: RangeKey = RANGE_KEYS.includes(rangeKey as RangeKey) ? (rangeKey as RangeKey) : '30d';

  const explicitFrom = parseDate(fromRaw);
  const explicitTo = parseDate(toRaw);

  const to = explicitTo ?? now;
  let from: Date;
  let bucket: ResolvedRange['bucket'];
  let buckets: number;

  switch (key) {
    case '7d':
      from = new Date(to.getTime() - 7 * DAY_MS);
      bucket = 'day';
      buckets = 7;
      break;
    case '90d':
      from = new Date(to.getTime() - 90 * DAY_MS);
      bucket = 'week';
      buckets = 13;
      break;
    case '12m':
      from = new Date(to.getFullYear(), to.getMonth() - 11, 1);
      bucket = 'month';
      buckets = 12;
      break;
    case '30d':
    default:
      from = new Date(to.getTime() - 30 * DAY_MS);
      bucket = 'day';
      buckets = 30;
      break;
  }

  // An explicit from/to pair wins; pick a bucket that keeps the chart readable.
  if (explicitFrom) {
    from = explicitFrom;
    const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
    if (spanDays <= 31) {
      bucket = 'day';
      buckets = spanDays;
    } else if (spanDays <= 120) {
      bucket = 'week';
      buckets = Math.ceil(spanDays / 7);
    } else {
      bucket = 'month';
      buckets = Math.ceil(spanDays / 30);
    }
  }

  const span = to.getTime() - from.getTime();
  return {
    key,
    from,
    to,
    prevFrom: new Date(from.getTime() - span),
    prevTo: from,
    bucket,
    buckets,
  };
}

/** Start of day, local time. */
export function startOfDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Exclusive end of day, local time. */
export function endOfDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

/** Inclusive bucket boundaries covering a resolved range. */
export function bucketEdges(range: ResolvedRange): { label: string; start: Date; end: Date }[] {
  const out: { label: string; start: Date; end: Date }[] = [];

  if (range.bucket === 'month') {
    for (let i = range.buckets - 1; i >= 0; i--) {
      const start = new Date(range.to.getFullYear(), range.to.getMonth() - i, 1);
      const end = new Date(range.to.getFullYear(), range.to.getMonth() - i + 1, 1);
      out.push({
        label: start.toLocaleString('en-US', { month: 'short' }),
        start,
        end,
      });
    }
    return out;
  }

  const stepDays = range.bucket === 'week' ? 7 : 1;
  const anchor = startOfDay(range.to);
  for (let i = range.buckets - 1; i >= 0; i--) {
    const end = new Date(anchor.getTime() + DAY_MS - i * stepDays * DAY_MS);
    const start = new Date(end.getTime() - stepDays * DAY_MS);
    out.push({
      label:
        range.bucket === 'week'
          ? `${start.getDate()}/${start.getMonth() + 1}`
          : start.toLocaleString('en-US', { day: 'numeric', month: 'short' }),
      start,
      end,
    });
  }
  return out;
}

/** Percent change, one decimal place. Returns 0 when there is no baseline. */
export function delta(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Safe percentage helper — avoids NaN when the denominator is zero. */
export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  // Prisma Decimal exposes toString(); Number() on it would lose precision cues.
  const n = typeof value === 'object' ? Number(value.toString()) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

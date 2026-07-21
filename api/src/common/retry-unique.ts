/*
 * Retry a write that mints a sequential code.
 *
 * Every "next code" helper in this repo reads the highest existing value and
 * adds one. Nothing holds a lock between the read and the insert, so two
 * requests landing together compute the same code and one dies on the unique
 * index with a 500. Recomputing and retrying is the practical fix — the second
 * attempt sees the row the first one committed.
 *
 * Detection is deliberately broad. Prisma 7 on the pg adapter does NOT populate
 * meta.target; the offending columns arrive under
 * meta.driverAdapterError.cause.constraint.fields, and the message spells them
 * out as well. Checking only one of those looks correct and silently never
 * matches, which is exactly how the first version of this went wrong.
 */

export function isUniqueClashOn(e: any, field: string): boolean {
  if (e?.code !== 'P2002') return false;
  const target = e?.meta?.target;
  const fields = e?.meta?.driverAdapterError?.cause?.constraint?.fields;
  const haystack = [
    Array.isArray(target) ? target.join(',') : String(target ?? ''),
    Array.isArray(fields) ? fields.join(',') : String(fields ?? ''),
    String(e?.message ?? ''),
  ].join(' ');
  return haystack.includes(field);
}

export async function retryOnUniqueClash<T>(
  field: string,
  run: () => Promise<T>,
  attempts = 5,
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await run();
    } catch (e) {
      // Anything that is not this exact collision is a real failure and must
      // surface unchanged — a retry loop that swallows other errors is worse
      // than no retry at all.
      if (!isUniqueClashOn(e, field) || i >= attempts - 1) throw e;
    }
  }
}

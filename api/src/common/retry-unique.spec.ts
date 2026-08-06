/*
 * Detection of the sequential-code collision, and the retry built on it.
 *
 * This is the module the whole codebase's code-minting depends on, and its
 * first version was silently broken: it checked only `meta.target`, which
 * Prisma 7's pg adapter never populates. The test that matters most is the one
 * using the REAL error shape — see the P2002 case below.
 */

import { isUniqueClashOn, retryOnUniqueClash } from './retry-unique';

/** A P2002 exactly as Prisma 7 + the pg driver adapter actually raises it. */
const pgAdapterP2002 = (fields: string[]) => ({
  code: 'P2002',
  // Deliberately absent — the adapter does not set it. A check that relies on
  // this field compiles, reads correctly, and never matches.
  meta: {
    driverAdapterError: {
      cause: { constraint: { fields } },
    },
  },
  message: `Unique constraint failed on the fields: (\`${fields.join('`,`')}\`)`,
});

/** The shape the docs describe, which the library-engine path does produce. */
const engineP2002 = (target: string[]) => ({
  code: 'P2002',
  meta: { target },
  message: 'Unique constraint failed',
});

describe('isUniqueClashOn', () => {
  it('matches the pg adapter shape, where meta.target is absent', () => {
    const e = pgAdapterP2002(['studentCode']);
    expect(e.meta).not.toHaveProperty('target');
    expect(isUniqueClashOn(e, 'studentCode')).toBe(true);
  });

  it('matches the engine shape too', () => {
    expect(isUniqueClashOn(engineP2002(['teacherCode']), 'teacherCode')).toBe(true);
  });

  it('matches a composite constraint that includes the field', () => {
    expect(isUniqueClashOn(pgAdapterP2002(['studentId', 'courseId', 'cycleStart']), 'cycleStart')).toBe(true);
  });

  it('does not match a collision on a different column', () => {
    expect(isUniqueClashOn(pgAdapterP2002(['email']), 'studentCode')).toBe(false);
  });

  it('does not match a different error code', () => {
    expect(isUniqueClashOn({ code: 'P2025', meta: { target: ['studentCode'] } }, 'studentCode')).toBe(false);
    expect(isUniqueClashOn(new Error('studentCode blew up'), 'studentCode')).toBe(false);
  });

  it('survives a malformed or empty error without throwing', () => {
    expect(isUniqueClashOn(null, 'studentCode')).toBe(false);
    expect(isUniqueClashOn(undefined, 'studentCode')).toBe(false);
    expect(isUniqueClashOn({}, 'studentCode')).toBe(false);
    expect(isUniqueClashOn({ code: 'P2002' }, 'studentCode')).toBe(false);
  });
});

describe('retryOnUniqueClash', () => {
  it('returns the first success without retrying', async () => {
    const run = jest.fn().mockResolvedValue('S-0001');
    await expect(retryOnUniqueClash('studentCode', run)).resolves.toBe('S-0001');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries a collision and returns the attempt that wins', async () => {
    const run = jest
      .fn()
      .mockRejectedValueOnce(pgAdapterP2002(['studentCode']))
      .mockRejectedValueOnce(pgAdapterP2002(['studentCode']))
      .mockResolvedValue('S-0003');
    await expect(retryOnUniqueClash('studentCode', run)).resolves.toBe('S-0003');
    expect(run).toHaveBeenCalledTimes(3);
  });

  /*
   * The dangerous failure mode of any retry loop is swallowing errors it was
   * not written for. A foreign-key violation retried five times is five
   * identical failures and a much slower 500.
   */
  it('rethrows anything that is not this collision, immediately', async () => {
    const other = Object.assign(new Error('boom'), { code: 'P2003' });
    const run = jest.fn().mockRejectedValue(other);
    await expect(retryOnUniqueClash('studentCode', run)).rejects.toBe(other);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rethrows a collision on a different column immediately', async () => {
    const emailClash = pgAdapterP2002(['email']);
    const run = jest.fn().mockRejectedValue(emailClash);
    await expect(retryOnUniqueClash('studentCode', run)).rejects.toBe(emailClash);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempt limit and surfaces the last error', async () => {
    const clash = pgAdapterP2002(['studentCode']);
    const run = jest.fn().mockRejectedValue(clash);
    await expect(retryOnUniqueClash('studentCode', run, 3)).rejects.toBe(clash);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('defaults to five attempts', async () => {
    const run = jest.fn().mockRejectedValue(pgAdapterP2002(['studentCode']));
    await expect(retryOnUniqueClash('studentCode', run)).rejects.toBeDefined();
    expect(run).toHaveBeenCalledTimes(5);
  });

  /*
   * The code must be recomputed INSIDE the closure. A retry that reuses the
   * stale value just collides again — this asserts the contract callers rely on
   * by proving the closure is genuinely re-entered.
   */
  it('re-enters the closure so the caller can recompute the code', async () => {
    let next = 1;
    const seen: string[] = [];
    const run = jest.fn(async () => {
      const code = `S-${String(next).padStart(4, '0')}`;
      seen.push(code);
      next += 1;
      if (seen.length < 3) throw pgAdapterP2002(['studentCode']);
      return code;
    });
    await expect(retryOnUniqueClash('studentCode', run)).resolves.toBe('S-0003');
    expect(seen).toEqual(['S-0001', 'S-0002', 'S-0003']);
  });
});

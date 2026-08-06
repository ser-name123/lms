/*
 * Batch code minting.
 *
 * Both copies of this used `count() + 1`. The tests that matter are the ones
 * with a gap in the sequence — a count is equal to the maximum only until the
 * first batch is deleted, and every one of these would have failed before.
 */

import { batchCodeNumber, formatBatchCode, highestBatchNumber, nextBatchCodeFrom } from './batch-code';

/** A stand-in for the Prisma client holding a fixed set of codes. */
const readerWith = (codes: (string | null)[]) => ({
  batch: {
    findMany: jest.fn(async () => codes.map((code) => ({ code }))),
  },
});

describe('batchCodeNumber', () => {
  it('reads the sequence out of a code', () => {
    expect(batchCodeNumber('BATCH-0001')).toBe(1);
    expect(batchCodeNumber('BATCH-0042')).toBe(42);
    expect(batchCodeNumber('BATCH-10000')).toBe(10000);
  });

  it('is 0 for anything that is not one of ours', () => {
    expect(batchCodeNumber(null)).toBe(0);
    expect(batchCodeNumber(undefined)).toBe(0);
    expect(batchCodeNumber('')).toBe(0);
    expect(batchCodeNumber('ST-00001')).toBe(0);
    expect(batchCodeNumber('BATCH-')).toBe(0);
    expect(batchCodeNumber('BATCH-abc')).toBe(0);
  });
});

describe('formatBatchCode', () => {
  it('pads to four digits', () => {
    expect(formatBatchCode(1)).toBe('BATCH-0001');
    expect(formatBatchCode(42)).toBe('BATCH-0042');
    expect(formatBatchCode(9999)).toBe('BATCH-9999');
  });

  it('keeps going past the padding width instead of truncating', () => {
    expect(formatBatchCode(10000)).toBe('BATCH-10000');
  });

  it('never mints a zero', () => {
    expect(formatBatchCode(0)).toBe('BATCH-0001');
  });

  it('round-trips with batchCodeNumber', () => {
    for (const n of [1, 9, 10, 99, 100, 9999, 10000, 123456]) {
      expect(batchCodeNumber(formatBatchCode(n))).toBe(n);
    }
  });
});

describe('highestBatchNumber', () => {
  it('is the largest, whatever order the rows arrive in', () => {
    expect(highestBatchNumber(['BATCH-0003', 'BATCH-0001', 'BATCH-0002'])).toBe(3);
  });

  /*
   * The whole reason the maximum is reduced numerically instead of taken from
   * an `orderBy: { code: 'desc' }`: lexically "BATCH-9999" sorts above
   * "BATCH-10000", so past four digits a lexical maximum restarts the sequence
   * and every new batch collides forever.
   */
  it('is not fooled by lexical ordering past four digits', () => {
    expect(highestBatchNumber(['BATCH-9999', 'BATCH-10000'])).toBe(10000);
    expect(highestBatchNumber(['BATCH-10000', 'BATCH-9999'])).toBe(10000);
  });

  it('ignores rows that are not ours', () => {
    expect(highestBatchNumber(['BATCH-0005', null, 'LEGACY-9', 'BATCH-x'])).toBe(5);
  });

  it('is 0 for an empty table', () => {
    expect(highestBatchNumber([])).toBe(0);
  });
});

describe('nextBatchCodeFrom', () => {
  it('starts at 0001 on an empty table', async () => {
    await expect(nextBatchCodeFrom(readerWith([]))).resolves.toBe('BATCH-0001');
  });

  it('continues from the highest existing code', async () => {
    await expect(nextBatchCodeFrom(readerWith(['BATCH-0001', 'BATCH-0002']))).resolves.toBe('BATCH-0003');
  });

  /*
   * THE regression. Three batches were created and the first two deleted; a
   * count-based minter proposes BATCH-0002, which already exists. It then burns
   * every retry attempt on 0003, 0004… and falls through to a timestamp code,
   * permanently — the sequence never recovers.
   */
  it('does not re-issue a code after batches are deleted', async () => {
    const survivors = ['BATCH-0003'];
    await expect(nextBatchCodeFrom(readerWith(survivors))).resolves.toBe('BATCH-0004');
    expect(survivors).not.toContain('BATCH-0004');
  });

  it('skips a hole in the middle rather than filling it', async () => {
    // Reusing a freed number would make an old batch's code ambiguous in any
    // report printed before the deletion.
    await expect(nextBatchCodeFrom(readerWith(['BATCH-0001', 'BATCH-0004']))).resolves.toBe('BATCH-0005');
  });

  it('survives a table holding only foreign codes', async () => {
    await expect(nextBatchCodeFrom(readerWith(['LEGACY-1', null]))).resolves.toBe('BATCH-0001');
  });

  it('filters on the prefix in the query, not in memory', async () => {
    const reader = readerWith(['BATCH-0001']);
    await nextBatchCodeFrom(reader);
    expect(reader.batch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: { startsWith: 'BATCH-' } } }),
    );
  });
});

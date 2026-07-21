/*
 * Deleting a selection, one row at a time, reporting each outcome.
 *
 * Every list in the console that grew a "select several and delete" control
 * needs the same three things, and getting any of them wrong is worse in bulk
 * than singly:
 *
 *  - One failure must not roll back the rest. Refusing nineteen deletions
 *    because the twentieth is protected leaves the user with no idea which
 *    one was the problem and nothing done.
 *  - The refusal has to say why, per row. A bare "3 failed" sends somebody
 *    ticking boxes one at a time to find out which.
 *  - There has to be a ceiling. A selection is a human act; a request to
 *    delete ten thousand rows is a mistake or an attack.
 */

import { BadRequestException } from '@nestjs/common';

export interface BulkDeleteResult {
  deleted: number;
  failed: number;
  deletedItems: { id: string; label?: string }[];
  failures: { id: string; label?: string; reason: string }[];
}

export const BULK_DELETE_LIMIT = 100;

/**
 * @param ids     the selection, as sent by the client
 * @param remove  deletes one row, or throws with a message worth showing.
 *                Return a human label (a title, a code) to name it in the result.
 */
export async function bulkDelete(
  ids: string[],
  remove: (id: string) => Promise<string | void>,
): Promise<BulkDeleteResult> {
  const unique = [...new Set(ids ?? [])].filter(Boolean);
  if (!unique.length) throw new BadRequestException('Select at least one item.');
  if (unique.length > BULK_DELETE_LIMIT) {
    throw new BadRequestException(`Delete up to ${BULK_DELETE_LIMIT} items at a time.`);
  }

  const deletedItems: BulkDeleteResult['deletedItems'] = [];
  const failures: BulkDeleteResult['failures'] = [];

  for (const id of unique) {
    try {
      const label = await remove(id);
      deletedItems.push({ id, label: label || undefined });
    } catch (e: any) {
      failures.push({ id, reason: e?.message ?? 'Could not be deleted.' });
    }
  }

  return {
    deleted: deletedItems.length,
    failed: failures.length,
    deletedItems,
    failures,
  };
}

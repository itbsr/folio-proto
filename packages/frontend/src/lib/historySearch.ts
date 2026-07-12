import type { HistoryItem } from '@my-app/shared';

/**
 * Formats a history item's created_at exactly as the Archive screen's
 * date column renders it, so the visible date string is searchable.
 */
export function formatHistoryDate(createdAt: string): string {
  return new Date(createdAt).toLocaleString('ja-JP');
}

/**
 * Search predicate for the Archive/history screen's search box.
 *
 * Matches case-insensitively over the fields a user actually sees:
 * - the displayed status label (OK / ERR)
 * - the raw status value (success / error)
 * - the error message, if any
 * - the date exactly as displayed in the history row
 *
 * An empty (or whitespace-only) query matches everything.
 */
export function matchesHistorySearch(item: HistoryItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.status === 'success' ? 'OK' : 'ERR',
    item.status,
    item.error_msg ?? '',
    formatHistoryDate(item.created_at),
  ]
    .join('\n')
    .toLowerCase();
  return haystack.includes(q);
}

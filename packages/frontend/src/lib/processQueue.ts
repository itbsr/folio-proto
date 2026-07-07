// Multi-file processing queue — pure advance/next-state decision (issue #31).
//
// DashboardPage keeps a FileJob[] queue plus a `processingIdx` cursor. After
// the current job settles ('done' | 'error'), the page must decide which job
// runs next. That decision lives here so it can be unit-tested without React.

/** Lifecycle of one file in the multi-file processing queue. */
export type JobStatus = 'pending' | 'processing' | 'done' | 'error';

/** Minimal job shape the decision needs; DashboardPage's FileJob satisfies it. */
export interface QueueJobLike {
  status: JobStatus;
}

export type AdvanceDecision =
  /** Point the cursor at `nextIdx` and mark that job 'processing'. */
  | { kind: 'advance'; nextIdx: number }
  /** No runnable job remains — the queue is exhausted; show results. */
  | { kind: 'finished' }
  /** Do nothing (current job still running, or nothing to do). */
  | { kind: 'noop' };

/**
 * Decide what the queue should do after the job at `fromIdx` settles.
 *
 * Rules (issue #31 — a failed conversion must never stall the queue):
 * - If the job at `fromIdx` is still 'pending'/'processing', do nothing:
 *   it has not settled, so advancing now would be a double-advance.
 * - Scan forward from `fromIdx + 1` for the next runnable job, SKIPPING
 *   jobs already settled ('error' — e.g. failed base64/HEIC conversion —
 *   or 'done'). Their status is preserved, never overwritten.
 * - A job ahead already marked 'processing' is re-pointed at (idempotent),
 *   so a duplicate call with a stale `fromIdx` cannot skip over it.
 * - If no runnable job remains, the queue is finished.
 * - An empty queue is a no-op (nothing was processed; do not navigate).
 */
export function decideAdvance(
  queue: readonly QueueJobLike[],
  fromIdx: number,
): AdvanceDecision {
  if (queue.length === 0) return { kind: 'noop' };

  const current = queue[fromIdx];
  if (current && (current.status === 'pending' || current.status === 'processing')) {
    return { kind: 'noop' };
  }

  for (let i = fromIdx + 1; i < queue.length; i++) {
    const s = queue[i].status;
    if (s === 'pending' || s === 'processing') {
      return { kind: 'advance', nextIdx: i };
    }
  }
  return { kind: 'finished' };
}

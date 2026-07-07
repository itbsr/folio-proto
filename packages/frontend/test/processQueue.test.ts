import { describe, expect, it } from 'vitest';
import { decideAdvance, type QueueJobLike, type JobStatus } from '../src/lib/processQueue';

const jobs = (...statuses: JobStatus[]): QueueJobLike[] =>
  statuses.map((status) => ({ status }));

describe('decideAdvance', () => {
  // ── Issue #31 — the reported bug ─────────────────────────────
  // A job whose base64/HEIC conversion failed is already status:'error'
  // with inputImage:null. The queue must NOT point at it (that overwrote
  // the error with 'processing' and stalled forever, because
  // ScreenProcessing's effect bails on a null inputImage); it must skip
  // to the next runnable job.
  describe('advance on failure (issue #31)', () => {
    it('skips a failed job and advances to the next pending one', () => {
      const decision = decideAdvance(jobs('done', 'error', 'pending'), 0);
      expect(decision).toEqual({ kind: 'advance', nextIdx: 2 });
    });

    it('never re-points at an already-failed job', () => {
      const decision = decideAdvance(jobs('done', 'error', 'pending'), 0);
      expect(decision).not.toEqual({ kind: 'advance', nextIdx: 1 });
    });

    it('skips consecutive failed jobs', () => {
      const decision = decideAdvance(jobs('done', 'error', 'error', 'pending'), 0);
      expect(decision).toEqual({ kind: 'advance', nextIdx: 3 });
    });

    it('finishes when every remaining job has already failed', () => {
      const decision = decideAdvance(jobs('done', 'error', 'error'), 0);
      expect(decision).toEqual({ kind: 'finished' });
    });
  });

  // ── Normal flow ──────────────────────────────────────────────
  describe('advance on success', () => {
    it('advances to the next pending job after the current one succeeds', () => {
      const decision = decideAdvance(jobs('done', 'pending'), 0);
      expect(decision).toEqual({ kind: 'advance', nextIdx: 1 });
    });

    it('advances after a mid-queue success', () => {
      const decision = decideAdvance(jobs('done', 'done', 'pending', 'pending'), 1);
      expect(decision).toEqual({ kind: 'advance', nextIdx: 2 });
    });
  });

  describe('advance after the current job fails at processing time', () => {
    it('advances past a job that errored during upload/inference', () => {
      const decision = decideAdvance(jobs('error', 'pending'), 0);
      expect(decision).toEqual({ kind: 'advance', nextIdx: 1 });
    });
  });

  // ── Terminal states ──────────────────────────────────────────
  describe('failure of the last item', () => {
    it('finishes when the last job fails', () => {
      const decision = decideAdvance(jobs('done', 'done', 'error'), 2);
      expect(decision).toEqual({ kind: 'finished' });
    });

    it('finishes when the last job succeeds', () => {
      const decision = decideAdvance(jobs('done', 'done', 'done'), 2);
      expect(decision).toEqual({ kind: 'finished' });
    });
  });

  describe('single-item queue', () => {
    it('finishes when the only job succeeds', () => {
      expect(decideAdvance(jobs('done'), 0)).toEqual({ kind: 'finished' });
    });

    it('finishes when the only job fails', () => {
      expect(decideAdvance(jobs('error'), 0)).toEqual({ kind: 'finished' });
    });
  });

  describe('empty queue', () => {
    it('does nothing on an empty queue (no spurious navigation)', () => {
      expect(decideAdvance([], 0)).toEqual({ kind: 'noop' });
    });
  });

  // ── Double-advance protection ────────────────────────────────
  describe('no double-advance', () => {
    it('does not advance while the current job is still processing', () => {
      const decision = decideAdvance(jobs('processing', 'pending'), 0);
      expect(decision).toEqual({ kind: 'noop' });
    });

    it('does not advance while the current job is still pending (conversion in flight)', () => {
      const decision = decideAdvance(jobs('pending', 'pending'), 0);
      expect(decision).toEqual({ kind: 'noop' });
    });

    it('is idempotent for a stale caller: re-points at the already-running job instead of skipping it', () => {
      // First advance already moved 0 → 1 and marked it 'processing'.
      // A duplicate call still holding fromIdx=0 must not skip job 1.
      const decision = decideAdvance(jobs('done', 'processing', 'pending'), 0);
      expect(decision).toEqual({ kind: 'advance', nextIdx: 1 });
    });
  });
});

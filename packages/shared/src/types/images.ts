import type { z } from 'zod';
import type {
  processStreamEventSchema,
  progressEventSchema,
  usageInfoSchema,
} from '../schemas/images';

export type UsageInfo = z.infer<typeof usageInfoSchema>;

export type ProcessResult = {
  result_image: string;
  usage: UsageInfo;
};

export type HistoryItem = {
  id: number;
  status: 'success' | 'error';
  error_msg: string | null;
  created_at: string;
};

// Design A progress stream (GET /api/images/progress?jobId=…).
// See schemas/images.ts for the exact wire format each event carries.
export type ProgressEvent = z.infer<typeof progressEventSchema>;

// Legacy stream (POST /api/images/process-stream) — keyed by `stage`/`error`,
// and its `done` DOES carry the result payload (+ Worker-injected `usage`).
export type ProcessStreamEvent = z.infer<typeof processStreamEventSchema>;

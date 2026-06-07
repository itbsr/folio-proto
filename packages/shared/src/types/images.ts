export type UsageInfo = {
  used: number;
  limit: number;
  month: string;
};

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
// One SSE carries: ② 推論サーバ到達 (received) → ③ 推論 (infer) → done/error.
// Note: ① CF到達 is NOT here — it comes from the client's XHR upload.onprogress.
export type ProgressEvent =
  | { type: 'received'; pct: number } // ② CF→推論サーバ到達 (0..100)
  | { type: 'infer'; pct: number; step: string } // ③ 推論 (0..100)
  | { type: 'done'; result: string; usage: UsageInfo } // usage は Worker が注入
  | { type: 'error'; message: string };

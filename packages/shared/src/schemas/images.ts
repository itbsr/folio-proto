import { z } from 'zod';

export const processImageSchema = z.object({
  image: z.string().min(1),
});

export const usageInfoSchema = z.object({
  used: z.number(),
  limit: z.number(),
  month: z.string(),
});

// ── Design A progress stream (GET /api/images/progress?jobId=…) ─────────────
// Emitted by ai-server/server.py (POST /upload/{job} → GET /progress/{job})
// and proxied verbatim by the Worker — no fields are injected or removed.
// One SSE carries: ② 上り受信 (received) → ③ 推論 (infer) → ③' 下り送信
// (result_sent) → done/error.
// Note: ① 上り送信 / ④ 下り受信 are NOT here — they are measured client-side
// on the XHR itself, and `done` carries NO payload: the result body and usage
// (X-Usage header) arrive on the XHR response of POST /api/images/upload.
// Members are .strict() so the schema documents the exact wire format; if the
// AI server's events change, this schema must change in the same PR.
export const progressEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('received'), pct: z.number() }).strict(), // ② CF→推論サーバ到達 (0..100)
  z.object({ type: z.literal('infer'), pct: z.number(), step: z.string() }).strict(), // ③ 推論 (0..100)
  z.object({ type: z.literal('result_sent'), pct: z.number() }).strict(), // ③' 推論サーバ送出 (0..100)
  z.object({ type: z.literal('done') }).strict(), // ペイロードなし（結果と usage は XHR 側）
  z.object({ type: z.literal('error'), message: z.string() }).strict(),
]);

// ── Legacy stream (POST /api/images/process-stream) ─────────────────────────
// A different wire format from Design A: events are keyed by `stage`/`error`
// (no `type` field), and `done` DOES carry the result payload. `usage` is
// injected by the Worker when it forwards `stage: 'done'`, so it is absent on
// the AI-server→Worker leg and present on the Worker→client leg.
// Order matters: the done member must be tried before the generic progress
// member, which also matches `stage: 'done'`.
export const processStreamEventSchema = z.union([
  z.object({
    progress: z.number(),
    stage: z.literal('done'),
    result: z.string(),
    usage: usageInfoSchema.optional(),
  }).strict(),
  z.object({ progress: z.number(), stage: z.string() }).strict(),
  z.object({ error: z.string() }).strict(),
]);

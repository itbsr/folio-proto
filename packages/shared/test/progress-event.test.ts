import { describe, expect, it } from 'vitest';
import { processStreamEventSchema, progressEventSchema } from '../src/index';

// Design A stream (ai-server: POST /upload/{job} → GET /progress/{job}).
// Payloads below mirror the exact JSON ai-server/server.py emits.
describe('progressEventSchema (Design A: GET /api/images/progress)', () => {
  it('accepts a received event (② 上り受信)', () => {
    // server.py: await q.put({"type": "received", "pct": pct})
    const result = progressEventSchema.safeParse({ type: 'received', pct: 42 });
    expect(result.success).toBe(true);
  });

  it('accepts an infer event with pct and step (③ 推論)', () => {
    // server.py: {"type": "infer", "pct": pct, "step": stage}
    const result = progressEventSchema.safeParse({ type: 'infer', pct: 55, step: 'bm_inference' });
    expect(result.success).toBe(true);
  });

  it('accepts a result_sent event (③\' 下り送信)', () => {
    // server.py: q.put_nowait({"type": "result_sent", "pct": pct})
    const result = progressEventSchema.safeParse({ type: 'result_sent', pct: 100 });
    expect(result.success).toBe(true);
  });

  it('accepts a payload-free done event', () => {
    // server.py: q.put_nowait({"type": "done"}) — result/usage travel on the XHR
    const result = progressEventSchema.safeParse({ type: 'done' });
    expect(result.success).toBe(true);
  });

  it('accepts an error event with a message', () => {
    // server.py: {"type": "error", "message": "Invalid upload payload"}
    const result = progressEventSchema.safeParse({ type: 'error', message: 'Invalid upload payload' });
    expect(result.success).toBe(true);
  });

  it('narrows the union by type', () => {
    const parsed = progressEventSchema.parse({ type: 'infer', pct: 20, step: 'wc_inference' });
    if (parsed.type === 'infer') {
      expect(parsed.step).toBe('wc_inference');
    } else {
      expect.unreachable('expected an infer event');
    }
  });

  it('rejects done carrying the legacy {result, usage} payload', () => {
    // The old shared type claimed done = { result, usage }; Design A done has no payload.
    const result = progressEventSchema.safeParse({
      type: 'done',
      result: 'aGVsbG8=',
      usage: { used: 1, limit: 50, month: '2026-07' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown event type', () => {
    const result = progressEventSchema.safeParse({ type: 'uploading', pct: 10 });
    expect(result.success).toBe(false);
  });

  it('rejects an infer event missing step', () => {
    const result = progressEventSchema.safeParse({ type: 'infer', pct: 30 });
    expect(result.success).toBe(false);
  });

  it('rejects a received event with a non-numeric pct', () => {
    const result = progressEventSchema.safeParse({ type: 'received', pct: '42' });
    expect(result.success).toBe(false);
  });

  it('rejects an error event without a message', () => {
    const result = progressEventSchema.safeParse({ type: 'error' });
    expect(result.success).toBe(false);
  });

  it('rejects a legacy process-stream event (no type field)', () => {
    const result = progressEventSchema.safeParse({ progress: 50, stage: 'bm_inference' });
    expect(result.success).toBe(false);
  });

  it('rejects non-object payloads', () => {
    expect(progressEventSchema.safeParse('done').success).toBe(false);
    expect(progressEventSchema.safeParse(null).success).toBe(false);
  });
});

// Legacy stream (ai-server: POST /process-stream) — keyed by stage/error, and
// done DOES carry the result (+ usage injected by the Worker before it reaches
// the client).
describe('processStreamEventSchema (legacy: POST /api/images/process-stream)', () => {
  it('accepts a progress event', () => {
    // server.py: {'progress': pct, 'stage': stage}
    const result = processStreamEventSchema.safeParse({ progress: 55, stage: 'bm_inference' });
    expect(result.success).toBe(true);
  });

  it('accepts a done event with result as emitted by the AI server (no usage yet)', () => {
    // server.py: {'progress': 100, 'stage': 'done', 'result': result_b64}
    const result = processStreamEventSchema.safeParse({
      progress: 100,
      stage: 'done',
      result: 'aGVsbG8=',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a done event with Worker-injected usage', () => {
    // backend/src/index.ts injects event.usage before forwarding stage === 'done'
    const parsed = processStreamEventSchema.parse({
      progress: 100,
      stage: 'done',
      result: 'aGVsbG8=',
      usage: { used: 3, limit: 50, month: '2026-07' },
    });
    expect(parsed).toHaveProperty('result', 'aGVsbG8=');
    expect(parsed).toHaveProperty('usage.used', 3);
  });

  it('accepts an error event', () => {
    // server.py: {'error': f'Processing failed: {e}'}
    const result = processStreamEventSchema.safeParse({ error: 'Processing failed: boom' });
    expect(result.success).toBe(true);
  });

  it('rejects a Design A event (type-keyed)', () => {
    const result = processStreamEventSchema.safeParse({ type: 'infer', pct: 20, step: 'decode' });
    expect(result.success).toBe(false);
  });

  it('rejects a done event whose usage has the wrong shape', () => {
    const result = processStreamEventSchema.safeParse({
      progress: 100,
      stage: 'done',
      result: 'aGVsbG8=',
      usage: { used: '3', limit: 50, month: '2026-07' },
    });
    expect(result.success).toBe(false);
  });
});

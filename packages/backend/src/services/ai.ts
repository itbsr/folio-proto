export async function callDewarpNet(
  endpoint: string,
  apiKey: string,
  imageBase64: string,
): Promise<string> {
  const res = await fetch(`${endpoint}/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ image: imageBase64 }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`AI service ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { result_image: string };
  return data.result_image;
}

export async function streamDewarpNet(
  endpoint: string,
  apiKey: string,
  imageBase64: string,
): Promise<Response> {
  const res = await fetch(`${endpoint}/process-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ image: imageBase64 }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`AI service ${res.status}: ${text}`);
  }

  return res;
}

// ── Design A: separate upload + progress streams, correlated by jobId ───────

/**
 * Stream the (base64-JSON) request body to the AI server's /upload/{job}.
 * Uses FixedLengthStream so the forwarded request keeps a Content-Length,
 * letting the AI compute received-byte progress (the "推論サーバ到達" bar).
 * Resolves once the AI has received the whole body and accepted the job.
 */
export async function uploadToAi(
  endpoint: string,
  apiKey: string,
  jobId: string,
  body: ReadableStream<Uint8Array>,
  total: number,
  contentType: string,
): Promise<Response> {
  // FixedLengthStream is a Workers global: an identity transform whose declared
  // length becomes the outgoing Content-Length (a plain ReadableStream body would
  // be chunk-encoded, leaving the AI unable to compute received %). Reached via
  // globalThis so this file also type-checks in the frontend program — which
  // imports backend's AppType for the RPC client but has no @cloudflare/workers-types.
  const FixedLengthStreamCtor = (globalThis as unknown as {
    FixedLengthStream: new (len: number | bigint) => {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
    };
  }).FixedLengthStream;
  const fls = new FixedLengthStreamCtor(total);
  // Don't await: fetch() below pulls from fls.readable as this pipe fills it, and
  // only resolves once the whole body has been sent (i.e. the pipe has finished).
  void body.pipeTo(fls.writable).catch(() => {});

  return fetch(`${endpoint}/upload/${jobId}`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(total),
      Authorization: `Bearer ${apiKey}`,
    },
    body: fls.readable,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

/** Open the AI server's SSE progress stream for a job. */
export function aiProgressStream(
  endpoint: string,
  apiKey: string,
  jobId: string,
): Promise<Response> {
  return fetch(`${endpoint}/progress/${jobId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

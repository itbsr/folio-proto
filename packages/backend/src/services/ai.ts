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

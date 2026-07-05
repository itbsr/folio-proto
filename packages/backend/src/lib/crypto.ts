const ITERATIONS = 100_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

async function derive(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    KEY_BITS,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const hash = await derive(password, salt);
  return `${toHex(salt.buffer as ArrayBuffer)}:${toHex(hash)}`;
}

// Non-empty, even-length hex (lowercase or uppercase). Matches the format
// produced by hashPassword; anything else in `stored` is a corrupt row.
const HEX_RE = /^(?:[0-9a-f]{2})+$/i;

/**
 * Constant-time byte comparison (XOR-accumulate). Portable across workerd,
 * Miniflare and Node, unlike the Workers-only crypto.subtle.timingSafeEqual.
 * A length mismatch returns false; length itself is not secret here.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // A malformed stored value (corrupt row, wrong delimiter, bad hex) must
  // fail verification like any wrong password — never throw into a 500.
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [saltHex, hashHex] = parts;
  if (!HEX_RE.test(saltHex) || !HEX_RE.test(hashHex)) return false;
  const hash = await derive(password, fromHex(saltHex));
  return timingSafeEqual(new Uint8Array(hash), fromHex(hashHex));
}

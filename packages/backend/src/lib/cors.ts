/**
 * CORS origin allowlist (issue #30).
 *
 * The `CORS_ORIGINS` var (wrangler.toml `[vars]`, defined PER environment —
 * wrangler envs do not inherit vars) is a comma-separated list of entries:
 *
 *   - exact origins:      `https://app.example.com`, `http://localhost:5173`
 *   - suffix wildcards:   `https://*.example.pages.dev` (scheme optional,
 *                         defaults to https: `*.example.pages.dev`)
 *
 * Wildcards match by scheme (exactly) plus dot-anchored host suffix — never
 * by substring — so `https://evilexample.pages.dev` does NOT match
 * `*.example.pages.dev`, and neither does `https://x.example.pages.dev.evil.com`.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const WILDCARD_ENTRY = /^(?:(https?):\/\/)?\*\.([^*/]+)$/;

export function isOriginAllowed(origin: string, allowlist: string[]): boolean {
  if (!origin) return false;
  const normalized = origin.toLowerCase();

  let url: URL | null = null;
  try {
    url = new URL(normalized);
  } catch {
    url = null;
  }

  for (const entry of allowlist) {
    const wildcard = WILDCARD_ENTRY.exec(entry);
    if (wildcard) {
      if (!url) continue;
      const scheme = wildcard[1] ?? 'https';
      const suffix = wildcard[2];
      // Exact scheme + host ending in ".<suffix>" (host includes the port,
      // so a wildcard entry only matches origins on the default port).
      if (url.protocol === `${scheme}:` && url.host.endsWith(`.${suffix}`)) {
        return true;
      }
    } else if (normalized === entry) {
      return true;
    }
  }
  return false;
}

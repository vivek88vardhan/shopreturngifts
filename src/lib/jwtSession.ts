/**
 * Client-side JWT expiry check (Cognito ID tokens include `exp`).
 * Not a substitute for server validation — used to avoid showing admin UI on expired sessions.
 */
export function isJwtExpired(token: string | null | undefined, skewMs = 60_000): boolean {
  if (!token || typeof token !== 'string') return true;
  const parts = token.split('.');
  if (parts.length < 2) return false;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now() + skewMs;
  } catch {
    return true;
  }
}

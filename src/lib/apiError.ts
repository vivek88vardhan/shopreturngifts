/** Extract a user-visible message from a failed API/mutation error. */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: unknown }).message);
    if (msg && msg !== '[object Object]') return msg;
  }
  return fallback;
}

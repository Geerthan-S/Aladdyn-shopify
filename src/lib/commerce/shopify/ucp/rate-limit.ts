export function parseRetryAfter(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - Date.now());
}

export function retryDelay(attempt: number, retryAfter: string | null) {
  const specified = parseRetryAfter(retryAfter);
  if (specified !== null) return Math.min(specified, 30_000);
  const base = Math.min(500 * 2 ** attempt, 8_000);
  return base + Math.floor(Math.random() * Math.max(1, base / 3));
}

export async function waitForRetry(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

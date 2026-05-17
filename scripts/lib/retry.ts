/**
 * Retry helper with exponential backoff for transient Sanity API failures.
 *
 * Sanity's edge occasionally returns 502/504 ("invalid response from upstream
 * server") or transient network errors. We retry those automatically.
 */

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label: string;
  log?: (msg: string) => void;
}

const TRANSIENT_HINTS = [
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "socket hang up",
  "upstream server",
  "Gateway",
  "fetch failed",
  "ENOTFOUND",
];

function isTransient(err: unknown): boolean {
  const msg =
    err instanceof Error ? `${err.message} ${(err as any).code ?? ""}` : String(err);
  const status =
    err && typeof err === "object" && "statusCode" in (err as any)
      ? (err as any).statusCode
      : err && typeof err === "object" && "status" in (err as any)
        ? (err as any).status
        : undefined;
  if (typeof status === "number" && status >= 500 && status < 600) return true;
  if (typeof status === "number" && status === 429) return true;
  return TRANSIENT_HINTS.some((h) => msg.includes(h));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const retries = opts.retries ?? 4;
  const base = opts.baseDelayMs ?? 1000;
  const max = opts.maxDelayMs ?? 15_000;
  const log = opts.log ?? (() => {});

  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isTransient(err)) throw err;
      const delay = Math.min(max, base * Math.pow(2, attempt));
      const jitter = Math.floor(Math.random() * 250);
      const msg = err instanceof Error ? err.message : String(err);
      log(
        `  ! ${opts.label} failed (attempt ${attempt + 1}/${retries + 1}): ${msg.slice(0, 120)} — retrying in ${delay + jitter}ms`,
      );
      await sleep(delay + jitter);
      attempt++;
    }
  }
  throw lastErr;
}

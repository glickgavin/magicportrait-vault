import "server-only";
import { getSetting } from "@/lib/settings";

/**
 * Times one outside call and logs `[perf] <label> <ms>ms` when it takes longer than
 * `vault.slow_call_log_ms`. Only the step's name and the time: never who, never what.
 */
export async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await work();
  } finally {
    void logIfSlow(label, Date.now() - started);
  }
}

async function logIfSlow(label: string, ms: number) {
  try {
    const limit = await getSetting("vault.slow_call_log_ms");
    if (limit > 0 && ms >= limit) console.warn(`[perf] ${label} ${ms}ms`);
  } catch {
    /* logging must never break a request */
  }
}

/** A GraphQL operation's name, for a perf label ("query ShopCart(...)" → "ShopCart"). */
export function opName(query: string): string {
  return /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "anonymous";
}

/**
 * Runs work after the response has been sent (Next's `after`), so the person doesn't wait for it.
 * Outside a request (scripts, tests) it simply runs now.
 */
export async function afterResponse(work: () => Promise<unknown>): Promise<void> {
  const run = () =>
    work().catch((e: unknown) => {
      console.error(`[after] ${(e as Error).message}`);
    });
  try {
    const { after } = await import("next/server");
    after(run);
  } catch {
    await run();
  }
}

/** Runs `fn` over `items` with at most `limit` at a time, keeping the order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

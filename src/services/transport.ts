// Probe readiness before sending writes. A sleeping host can take a minute to
// wake; retrying the probe is safe, replaying a report or registration is not.
export function createTransport(base: string, options: {
  fetcher?: typeof fetch;
  clock?: () => number;
  pause?: (ms: number) => Promise<void>;
} = {}) {
  const fetcher = options.fetcher ?? fetch;
  const clock = options.clock ?? Date.now;
  const pause = options.pause ?? ((ms) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let readyUntil = 0;
  let warming: Promise<void> | undefined;
  async function ready() {
    if (clock() < readyUntil) return;
    if (!warming) warming = (async () => {
      const deadline = clock() + 75000;
      while (clock() < deadline) {
        try {
          const response = await fetcher(base + '/health', {
            signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - clock()))),
          });
          if (response.ok && (await response.json()).status === 'ok') {
            readyUntil = clock() + 60000;
            return;
          }
          if (response.status === 429) throw new Error('rate-limited');
        } catch { /* Retry only the read-only readiness probe. */ }
        if (clock() < deadline) await pause(Math.min(2000, deadline - clock()));
      }
      throw new Error('Could not connect to the parking server. Please try again.');
    })().finally(() => { warming = undefined; });
    await warming;
  }
  return async function request<T>(path: string, init?: RequestInit): Promise<T> {
    await ready();
    let response: Response;
    try {
      response = await fetcher(base + path, {
        ...init,
        signal: AbortSignal.timeout(15000),
        headers: {
          ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
        },
      });
    } catch {
      readyUntil = 0;
      throw new Error('Connection interrupted. Refresh to check whether your change was saved before trying again.');
    }
    if (!response.ok) {
      if (response.status >= 500) readyUntil = 0;
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? 'Could not connect. Please try again.');
    }
    return response.json() as Promise<T>;
  };
}

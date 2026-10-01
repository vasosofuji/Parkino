type CredentialStorage = {
  get: () => Promise<string | null>;
  set: (token: string) => Promise<void>;
  remove: () => Promise<void>;
};
const changed = () => new Error("Your sign-in changed. Please try again.");

// One owner for credential writes. Network requests never hold the storage queue,
// and old requests cannot overwrite or erase a more recent sign-in.
export function createSessionManager(
  storage: CredentialStorage,
  create: () => Promise<{ token: string }>,
) {
  let generation = 0;
  let cached: string | undefined;
  let pending: Promise<string> | undefined;
  let writes = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const result = writes.then(work, work);
    writes = result.then(() => {}, () => {});
    return result;
  }
  async function current() {
    const version = generation;
    const token = await serial(() => storage.get());
    if (version !== generation) throw changed();
    return token;
  }
  function get(): Promise<string> {
    if (cached) return Promise.resolve(cached);
    if (pending) return pending;
    const version = generation;
    const work = (async () => {
      const saved = await current();
      if (version !== generation) throw changed();
      if (saved) { cached = saved; return saved; }
      const created = await create();
      if (version !== generation) throw changed();
      await serial(async () => {
        if (version !== generation) throw changed();
        await storage.set(created.token);
        if (version !== generation) throw changed();
        cached = created.token;
      });
      return created.token;
    })();
    pending = work;
    void work.finally(() => { if (pending === work) pending = undefined; }).catch(() => {});
    return work;
  }
  async function replace(token: string, expectedGeneration = generation) {
    if (expectedGeneration !== generation) throw changed();
    const version = ++generation;
    cached = undefined;
    pending = undefined;
    await serial(async () => {
      if (version !== generation) throw changed();
      await storage.set(token);
      if (version !== generation) throw changed();
      cached = token;
    });
  }
  async function invalidate(token: string) {
    const version = generation;
    return serial(async () => {
      if (version !== generation) return false;
      const saved = await storage.get();
      if (version !== generation || saved !== token) return false;
      generation++;
      cached = undefined;
      pending = undefined;
      await storage.remove();
      return true;
    });
  }
  return { get, current, replace, invalidate, generation: () => generation };
}

/** Coalesce ordinary polls; a completed mutation can request one newer read. */
export function createRefreshCoordinator(load: () => Promise<void>, minimumInterval = 0, now = Date.now) {
  let running: Promise<void> | null = null;
  let followup = false;
  let lastFinished = -Infinity;
  return (afterWrite = false): Promise<void> => {
    if (running) {
      followup ||= afterWrite;
      return running;
    }
    if (!afterWrite && now() - lastFinished < minimumInterval) return Promise.resolve();
    running = Promise.resolve().then(async () => {
      try {
        do {
          followup = false;
          await load();
          lastFinished = now();
        } while (followup);
      } finally {
        // Release inside the pump, before its promise settles. A write arriving
        // between settlement microtasks must start a new read, not join an ended one.
        running = null;
      }
    });
    return running;
  };
}

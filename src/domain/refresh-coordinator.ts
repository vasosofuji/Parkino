/** Coalesce ordinary polls; a completed mutation can request one newer read. */
export function createRefreshCoordinator(load: () => Promise<void>) {
  let running: Promise<void> | null = null;
  let followup = false;
  return (afterWrite = false): Promise<void> => {
    if (running) {
      followup ||= afterWrite;
      return running;
    }
    running = Promise.resolve().then(async () => {
      try {
        do {
          followup = false;
          await load();
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

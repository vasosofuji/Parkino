type ForegroundStart = {
  active: () => boolean;
  allowed: () => boolean;
  running: () => Promise<boolean>;
  start: () => Promise<void>;
};

/** No timers: leaving during a permission/native transition defers to the next app activation. */
export async function startArrivalInForeground({ active, allowed, running, start }: ForegroundStart) {
  if (!allowed()) return "cancelled" as const;
  if (!active()) return "pending" as const;
  if (await running()) return "started" as const;
  if (!allowed()) return "cancelled" as const;
  if (!active()) return "pending" as const;
  try {
    await start();
    return allowed() ? "started" as const : "cancelled" as const;
  } catch (error) {
    if (!allowed()) return "cancelled" as const;
    const message = error instanceof Error ? error.message : String(error);
    // Android's native activity state can change before the JS AppState event arrives.
    if (!active() || /foreground service[\s\S]*background|background[\s\S]*foreground service/i.test(message))
      return "pending" as const;
    throw new Error("Parking reminders could not start. Check location permissions and try again.");
  }
}

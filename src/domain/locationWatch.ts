import type { Fix } from "./arrival";
export type LocationIssue = {
  code:
    | "denied"
    | "blocked"
    | "services-off"
    | "timeout"
    | "unavailable"
    | "unsupported"
    | "insecure";
  detail?: string;
};
export type LocationCallbacks = {
  onFix: (fix: Fix) => void;
  onIssue: (issue: LocationIssue) => void;
};
type NativePosition = { coords: Omit<Fix, "timestamp">; timestamp: number };
export type NativeLocationAdapter = {
  permission: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestPermission: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  servicesEnabled: () => Promise<boolean>;
  enableServices?: () => Promise<void>;
  cached: () => Promise<NativePosition | null>;
  current: () => Promise<NativePosition>;
  watch: (
    success: (fix: NativePosition) => void,
    failure: (reason: string) => void,
  ) => Promise<{ remove: () => void }>;
};
export function startNativeLocation(
  adapter: NativeLocationAdapter,
  callbacks: LocationCallbacks,
) {
  let cancelled = false,
    lastFix = 0,
    inFlight = false;
  let subscription: { remove: () => void } | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const received = (value: NativePosition) => {
    if (cancelled) return;
    lastFix = Date.now();
    callbacks.onFix({ ...value.coords, timestamp: value.timestamp });
  };
  const issue = (value: LocationIssue) => {
    if (!cancelled) callbacks.onIssue(value);
  };
  async function poll() {
    if (cancelled || inFlight || Date.now() - lastFix < 10000) return;
    inFlight = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        adapter.current().then(received),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("timeout")), 25000);
        }),
      ]);
    } catch (error) {
      issue({
        code:
          error instanceof Error && error.message === "timeout"
            ? "timeout"
            : "unavailable",
      });
    } finally {
      clearTimeout(timeout);
      inFlight = false;
    }
  }
  void (async () => {
    let permission = await adapter.permission();
    if (cancelled) return;
    if (!permission.granted && permission.canAskAgain)
      permission = await adapter.requestPermission();
    if (cancelled) return;
    if (!permission.granted) {
      issue({ code: permission.canAskAgain ? "denied" : "blocked" });
      return;
    }
    if (!(await adapter.servicesEnabled())) {
      if (cancelled) return;
      if (adapter.enableServices) {
        try {
          await adapter.enableServices();
        } catch {
          issue({ code: "services-off" });
          return;
        }
      }
      if (!(await adapter.servicesEnabled())) {
        issue({ code: "services-off" });
        return;
      }
    }
    if (cancelled) return;
    // Get an initial position independently: a stationary device may not emit watch updates.
    void adapter
      .cached()
      .then((value) => {
        if (value) received(value);
      })
      .catch(() => {});
    void poll();
    timer = setInterval(() => void poll(), 10000);
    try {
      subscription = await adapter.watch(received, (detail) =>
        issue({ code: "unavailable", detail }),
      );
      if (cancelled) subscription.remove();
    } catch {
      issue({ code: "unavailable" });
    }
  })().catch(() => issue({ code: "unavailable" }));
  return () => {
    cancelled = true;
    clearInterval(timer);
    subscription?.remove();
  };
}

export function startBrowserLocation(
  geolocation: Geolocation | undefined,
  callbacks: LocationCallbacks,
  secure = true,
) {
  if (!secure) {
    callbacks.onIssue({ code: "insecure" });
    return () => {};
  }
  if (!geolocation) {
    callbacks.onIssue({ code: "unsupported" });
    return () => {};
  }
  let stopped = false,
    lastFix = 0,
    fallbackInFlight = false,
    blocked = false;
  const success: PositionCallback = (fix) => {
    if (stopped) return;
    lastFix = Date.now();
    callbacks.onFix({
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
      accuracy: fix.coords.accuracy,
      speed: fix.coords.speed,
      timestamp: fix.timestamp,
    });
  };
  const fail: PositionErrorCallback = (error) => {
    if (stopped) return;
    if (error.code === 1) blocked = true;
    callbacks.onIssue({
      code:
        error.code === 1
          ? "blocked"
          : error.code === 3
            ? "timeout"
            : "unavailable",
      detail: error.message,
    });
  };
  const fallback = () => {
    if (stopped || blocked || fallbackInFlight) return;
    fallbackInFlight = true;
    // A network-assisted fix can succeed indoors where a high-accuracy request times out.
    geolocation.getCurrentPosition(
      (fix) => {
        fallbackInFlight = false;
        success(fix);
      },
      (error) => {
        fallbackInFlight = false;
        fail(error);
      },
      { enableHighAccuracy: false, maximumAge: 15000, timeout: 20000 },
    );
  };
  const watch = geolocation.watchPosition(
    success,
    (error) => {
      if (error.code === 1) fail(error);
      else fallback();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
  );
  const timer = setInterval(() => {
    if (Date.now() - lastFix > 10000) fallback();
  }, 10000);
  return () => {
    stopped = true;
    clearInterval(timer);
    geolocation.clearWatch(watch);
  };
}

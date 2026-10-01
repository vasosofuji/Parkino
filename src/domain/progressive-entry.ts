import type { Contribution, Geometry, ParkingPlace } from "./types";

export type EntryApi = {
  contribute: (value: Contribution) => Promise<ParkingPlace>;
  label: (id: string, code: string) => Promise<unknown>;
  price: (id: string, first: number, next: number) => Promise<unknown>;
  capacity: (id: string, total: number) => Promise<unknown>;
  report: (id: string, status: "spaces" | "full", free?: number) => Promise<unknown>;
  boundary: (id: string, geometry: Geometry) => Promise<unknown>;
};
export type EntrySnapshot = { id?: string; code: string | null; total: number | null; price: string; free?: number; boundary: string };

/** One editor owns one writer. Successful steps remain saved even if a later one fails. */
export function createProgressiveEntry(api: EntryApi, initial: {
  place?: ParkingPlace;
  contribution?: Contribution;
  onSaved?: (id: string) => void;
  snapshot?: EntrySnapshot;
}) {
  let id = initial.snapshot?.id ?? initial.place?.id;
  let creating: Promise<string> | undefined;
  let code = initial.snapshot?.code ?? initial.place?.zoneCode ?? null;
  let total = initial.snapshot?.total ?? initial.place?.capacity ?? null;
  let price = initial.snapshot?.price ?? "";
  let free = initial.snapshot?.free;
  let boundary = initial.snapshot?.boundary ?? (initial.place?.geometry ? JSON.stringify(initial.place.geometry) : "");
  let tail: Promise<unknown> = Promise.resolve();

  async function ensure(zoneCode?: string) {
    if (id) return id;
    if (!initial.contribution) throw new Error("A parking location is required.");
    if (!creating) {
      creating = api.contribute({ ...initial.contribution, zoneCode: zoneCode || initial.contribution.zoneCode }).then(place => {
        id = place.id;
        code = place.zoneCode;
        total = place.capacity;
        boundary = place.geometry ? JSON.stringify(place.geometry) : "";
        initial.onSaved?.(place.id);
        return place.id;
      }).finally(() => { creating = undefined; });
    }
    return creating;
  }
  function serial(work: () => Promise<void>) {
    // A rejected step is retryable without poisoning subsequent explicit attempts.
    const next = tail.catch(() => undefined).then(work);
    tail = next;
    return next;
  }
  return {
    id: () => id,
    snapshot: (): EntrySnapshot => ({ id, code, total, price, free, boundary }),
    label: (value: string) => serial(async () => {
      const placeId = await ensure(value);
      if (value && value !== code) { await api.label(placeId, value); code = value; }
    }),
    price: (first: number, next: number) => serial(async () => {
      const placeId = await ensure(), key = `${first}:${next}`;
      if (price !== key) { await api.price(placeId, first, next); price = key; }
    }),
    spaces: (capacity: number | null, available: number | null) => serial(async () => {
      const placeId = await ensure();
      if (capacity !== null && capacity !== total) { await api.capacity(placeId, capacity); total = capacity; }
      if (available !== null && available !== free) { await api.report(placeId, available === 0 ? "full" : "spaces", available); free = available; }
    }),
    boundary: (geometry: Geometry) => serial(async () => {
      const placeId = await ensure(), value = JSON.stringify(geometry);
      if (value !== boundary) { await api.boundary(placeId, geometry); boundary = value; }
    }),
    ensure: () => serial(async () => { await ensure(); }),
  };
}

export function priceInput(first: string, next: string): { first: number; next: number } | null {
  if (!first.trim() && !next.trim()) return null;
  if (!first.trim()) throw new Error("first-required");
  const a = Number(first.replace(",", ".")), b = next.trim() ? Number(next.replace(",", ".")) : a;
  if ([a, b].some(value => !Number.isFinite(value) || value < 0 || value > 10000)) throw new Error("price-range");
  return { first: a, next: b };
}

export function spacesInput(capacity: string, free: string, knownCapacity: number | null = null) {
  const total = capacity.trim() ? Number(capacity) : null, available = free.trim() ? Number(free) : null;
  if ([total, available].some(value => value !== null && (!Number.isInteger(value) || value < 0 || value > 100000))) throw new Error("spaces-range");
  const effectiveTotal = total ?? knownCapacity;
  if (effectiveTotal !== null && available !== null && available > effectiveTotal) throw new Error("spaces-exceed-capacity");
  return { total, available };
}

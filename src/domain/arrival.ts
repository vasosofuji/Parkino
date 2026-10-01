import { distanceMeters, parkingPrice } from "./parking";
import type { Coordinate, Geometry, ParkingPlace } from "./types";

export function insidePolygon(point: Coordinate, geometry: Geometry): boolean {
  const insideRing = (ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x, y] = ring[i],
        [px, py] = ring[j];
      if (
        y > point.latitude !== py > point.latitude &&
        point.longitude < ((px - x) * (point.latitude - y)) / (py - y) + x
      )
        inside = !inside;
    }
    return inside;
  };
  return (
    insideRing(geometry.coordinates[0]) &&
    !geometry.coordinates.slice(1).some(insideRing)
  );
}

export type Fix = Coordinate & {
  accuracy: number | null;
  speed: number | null;
  timestamp: number;
};
export const ARRIVAL_DWELL_MS = 10000;
export const ARRIVAL_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export type ArrivalSnapshot = {
  candidate: { id: string; since: number; last: number; anchor: Coordinate } | null;
  prompted: [string, number][];
};
export function containsParkingFix(fix: Coordinate, place: ParkingPlace) {
  return (
    place.access !== "restricted" &&
    (place.geometry
      ? insidePolygon(fix, place.geometry)
      : place.kind !== "zone" &&
        place.locationPrecision !== "area" &&
        distanceMeters(fix, place.coordinate) <= 25)
  );
}
export class ArrivalDetector {
  private candidate: ArrivalSnapshot["candidate"] = null;
  private prompted = new Map<string, number>();
  constructor(snapshot?: ArrivalSnapshot) {
    if (snapshot) {
      this.candidate = snapshot.candidate ? { ...snapshot.candidate, anchor: { ...snapshot.candidate.anchor } } : null;
      this.prompted = new Map(snapshot.prompted);
    }
  }
  snapshot(now = Date.now()): ArrivalSnapshot {
    return {
      candidate: this.candidate ? { ...this.candidate, anchor: { ...this.candidate.anchor } } : null,
      prompted: [...this.prompted].filter(([, at]) => now - at < ARRIVAL_COOLDOWN_MS),
    };
  }
  reset() {
    this.candidate = null;
  }
  update(
    fix: Fix,
    places: ParkingPlace[],
    now = Date.now(),
  ): ParkingPlace | null {
    if (
      !Number.isFinite(fix.latitude) ||
      !Number.isFinite(fix.longitude) ||
      !Number.isFinite(fix.timestamp) ||
      Math.abs(fix.latitude) > 90 ||
      Math.abs(fix.longitude) > 180 ||
      fix.accuracy === null ||
      !Number.isFinite(fix.accuracy) ||
      fix.accuracy < 0 ||
      fix.accuracy > 25 ||
      now - fix.timestamp > 20000 ||
      fix.timestamp > now + 5000 ||
      (fix.speed !== null && (!Number.isFinite(fix.speed) || fix.speed > 0.8))
    ) {
      this.reset();
      return null;
    }
    const place = places
      .filter((p) => containsParkingFix(fix, p) && (p.kind !== "zone" || !parkingPrice(p)))
      .sort(
        (a, b) =>
          Number(a.kind === "zone") - Number(b.kind === "zone") ||
          distanceMeters(fix, a.coordinate) - distanceMeters(fix, b.coordinate),
      )[0];
    if (
      !place ||
      now - (this.prompted.get(place.id) ?? -Infinity) < ARRIVAL_COOLDOWN_MS
    ) {
      this.reset();
      return null;
    }
    const c = this.candidate;
    if (
      !c ||
      c.id !== place.id ||
      fix.timestamp - c.last > 25000 ||
      distanceMeters(fix, c.anchor) > 15
    ) {
      this.candidate = {
        id: place.id,
        since: fix.timestamp,
        last: fix.timestamp,
        anchor: fix,
      };
      return null;
    }
    if (fix.timestamp <= c.last) return null;
    c.last = fix.timestamp;
    if (fix.timestamp - c.since < ARRIVAL_DWELL_MS) return null;
    this.prompted.set(place.id, now);
    this.reset();
    return place;
  }
}

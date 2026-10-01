import type { Fix } from "./arrival";
import type { Coordinate } from "./types";
export function nearbyOrigin(
  destination: Coordinate | null,
  fix: Fix | null,
  now = Date.now(),
): Coordinate | null {
  return (
    destination ??
    (fix && usableFix(fix, now) && fix.accuracy! <= 50 ? fix : null)
  );
}
export function canAddAtLocation(fix: Fix | null, now = Date.now()) {
  return Boolean(
    fix &&
      usableFix(fix, now) &&
      fix.accuracy! <= 25 &&
      (fix.speed === null || fix.speed <= 1.5),
  );
}
export function usableFix(fix: Fix, now = Date.now()) {
  return (
    Number.isFinite(fix.latitude) &&
    Math.abs(fix.latitude) <= 90 &&
    Number.isFinite(fix.longitude) &&
    Math.abs(fix.longitude) <= 180 &&
    fix.accuracy !== null &&
    Number.isFinite(fix.accuracy) &&
    fix.accuracy >= 0 &&
    Number.isFinite(fix.timestamp) &&
    now - fix.timestamp <= 30000 &&
    fix.timestamp <= now + 5000
  );
}
export function preferFix(previous: Fix | null, next: Fix) {
  if (!previous) return true;
  if (next.timestamp < previous.timestamp) return false;
  // Avoid a sudden coarse network estimate replacing a recent precise fix.
  return (
    next.timestamp - previous.timestamp > 20000 ||
    next.accuracy! <= Math.max(100, previous.accuracy! * 2)
  );
}

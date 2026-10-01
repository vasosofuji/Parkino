import type { Coordinate, Geometry } from "./types";
export const MAX_BOUNDARY_VERTICES = 256;
export function zoneGeometry(points: Coordinate[]): Geometry {
  const ring = points.map((p) => [p.longitude, p.latitude]);
  return { type: "Polygon", coordinates: [[...ring, ring[0]]] };
}
// Reject crossings, repeated vertices and degenerate boundaries before publishing.
export function validZone(geometry: Geometry): boolean {
  if (geometry.coordinates.length !== 1) return false;
  const ring = geometry.coordinates[0];
  if (ring.length < 4 || ring.length > MAX_BOUNDARY_VERTICES + 1) return false;
  if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1])
    return false;
  const points = ring.slice(0, -1);
  if (new Set(points.map((p) => p.join(","))).size !== points.length)
    return false;
  const cross = (a: number[], b: number[], c: number[]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const a = ring[i],
        b = ring[i + 1],
        c = ring[j],
        d = ring[j + 1];
      if (
        cross(a, b, c) * cross(a, b, d) <= 0 &&
        cross(c, d, a) * cross(c, d, b) <= 0 &&
        Math.max(a[0], b[0]) >= Math.min(c[0], d[0]) &&
        Math.max(c[0], d[0]) >= Math.min(a[0], b[0]) &&
        Math.max(a[1], b[1]) >= Math.min(c[1], d[1]) &&
        Math.max(c[1], d[1]) >= Math.min(a[1], b[1])
      )
        return false;
    }
  const area =
    Math.abs(
      points.reduce(
        (sum, p, i) => sum + p[0] * ring[i + 1][1] - ring[i + 1][0] * p[1],
        0,
      ),
    ) / 2;
  return area > 1e-9 && area < 0.005;
}

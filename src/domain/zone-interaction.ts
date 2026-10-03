import type { ParkingPlace } from "./types";

export function isPocSector(place: Pick<ParkingPlace, "kind" | "id" | "operator" | "zoneCode">): boolean {
  return place.kind === "zone" && (place.operator?.trim().toLowerCase() === "poc" || place.id.startsWith("poc:zone:") || /^POC\s/i.test(place.zoneCode ?? ""));
}

/** Sector boundaries remain useful context at street level without taking pin taps. */
export function canInteractWithZone(place: Pick<ParkingPlace, "kind" | "id" | "operator" | "zoneCode">, zoom: number, picking = false): boolean {
  return picking || !isPocSector(place) || zoom < 16;
}

/** Native overview framing uses .022 latitude degrees for the same zoom-15 view. */
export function nativeRegionZoom(latitudeDelta: number): number {
  return 15 + Math.log2(0.022 / Math.max(latitudeDelta, 0.000001));
}

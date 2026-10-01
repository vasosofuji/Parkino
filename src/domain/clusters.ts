import type { ParkingPlace } from "./types";
import { currentAvailability } from "./parking";
export function groupParking(
  places: ParkingPlace[],
  latitudeStep: number,
  longitudeStep: number,
  selectedId: string | null,
  now = Date.now(),
): ParkingPlace[][] {
  const cells = new Map<string, ParkingPlace[]>();
  for (const place of places) {
    if (place.kind === "zone") continue;
    const key =
      !latitudeStep ||
      place.id === selectedId ||
      (place.access !== "restricted" &&
        currentAvailability(place.availability, now).status === "spaces")
        ? place.id
        : `${Math.floor(place.coordinate.latitude / latitudeStep)}:${Math.floor(place.coordinate.longitude / longitudeStep)}`;
    const group = cells.get(key) ?? [];
    group.push(place);
    cells.set(key, group);
  }
  return [...cells.values()];
}

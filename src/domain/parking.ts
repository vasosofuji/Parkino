import type { Availability, Coordinate, ParkingPlace, Tariff } from "./types";
export const SKOPJE: Coordinate = { latitude: 41.9961, longitude: 21.4316 };
export const REPORT_TTL_MS = 15 * 60 * 1000;
export const OPERATOR_TTL_MS = 5 * 60 * 1000;
export const CONSENSUS_VOTES = 3;
export const SESSION_MATURITY_MS = 24 * 60 * 60 * 1000;
export const UNKNOWN_AVAILABILITY: Availability = {
  status: "unknown",
  source: "none",
  observedAt: null,
  expiresAt: null,
  reports: 0,
};
// Match the server's report lifetime, including cached/offline catalogs.
export const PRICE_REPORT_TTL_MS = 90 * 86400000;
function validRates(price: { firstHour: number; nextHour: number }) {
  return [price.firstHour, price.nextHour].every(
    value => Number.isFinite(value) && value >= 0 && value <= 10000,
  );
}
export function parkingPrice(place: ParkingPlace, now = Date.now()) {
  const report = place.communityPrice;
  const age = report ? now - Date.parse(report.observedAt) : NaN;
  if (report && validRates(report) && Number.isInteger(report.reports) &&
      report.reports > 0 && age >= 0 && age < PRICE_REPORT_TTL_MS)
    return { ...report, evidence: "community" as const };
  if (place.tariff && validRates(place.tariff)) return place.tariff;
  const sign = place.signInfo;
  if (
    sign?.currency === "MKD" &&
    sign.firstHour !== null &&
    sign.nextHour !== null
  )
    return {
      firstHour: sign.firstHour,
      nextHour: sign.nextHour,
      evidence: "sign" as const,
    };
  return null;
}
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad,
    dLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function estimateCost(
  tariff: Pick<Tariff, "firstHour" | "nextHour" | "maxStayMinutes"> | null,
  minutes: number,
): number | null {
  if (!tariff || !validRates(tariff) || !Number.isFinite(minutes) || minutes <= 0) return null;
  if (tariff.maxStayMinutes !== null && minutes > tariff.maxStayMinutes)
    return null;
  const hours = Math.ceil(minutes / 60);
  return tariff.firstHour + Math.max(0, hours - 1) * tariff.nextHour;
}
export function currentAvailability(
  value: Availability | undefined,
  now = Date.now(),
): Availability {
  if (!value?.expiresAt || Date.parse(value.expiresAt) <= now)
    return UNKNOWN_AVAILABILITY;
  return value;
}
export function rankParking(
  places: ParkingPlace[],
  destination: Coordinate,
  minutes: number,
  radius: number,
  sort: "nearest" | "cheapest",
  now = Date.now(),
) {
  return places
    .filter(p => p.kind !== "zone" && p.access !== "restricted")
    .filter(p => sort !== "cheapest" || p.access === "public")
    .map(place => {
      const price = parkingPrice(place, now);
      // Undated legacy tariffs and AI readings are not comparable evidence.
      const comparable = price?.evidence === "official" ||
        (price?.evidence === "community" && "observedAt" in price);
      const cost = comparable && price ? estimateCost({
        ...price,
        // A new price report does not cancel a published stay restriction.
        maxStayMinutes: place.tariff?.maxStayMinutes ?? null,
      }, minutes) : null;
      return {
        place,
        distance: distanceMeters(place.coordinate, destination),
        cost,
        costEvidence: cost === null ? null : price!.evidence,
      };
    })
    .filter(row => row.distance <= radius)
    .sort((a, b) => {
      if (sort === "cheapest") {
        if (a.cost === null && b.cost !== null) return 1;
        if (b.cost === null && a.cost !== null) return -1;
        if (a.cost !== null && b.cost !== null && a.cost !== b.cost)
          return a.cost - b.cost;
      }
      return a.distance - b.distance || a.place.id.localeCompare(b.place.id);
    });
}
const letters: Record<string, string> = {
  А: "A",
  В: "B",
  Б: "B",
  С: "C",
  Ц: "C",
  Д: "D",
};
export function normalizeZoneCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[АВБСЦД]/g, (c) => letters[c])
    .replace(/\s+/g, "");
}
export function searchText(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
}

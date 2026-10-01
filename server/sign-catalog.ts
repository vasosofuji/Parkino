import { insidePolygon } from "../src/domain/arrival";
import { normalizeZoneCode, UNKNOWN_AVAILABILITY } from "../src/domain/parking";
import type { Geometry, ParkingPlace, SignInfo, SignPhoto } from "../src/domain/types";

export type PhotoRow = {
  id: string;
  place_id: string;
  session_id: string | null;
  created: number;
  status: SignPhoto["status"];
  info: string | null;
  model: string | null;
  confirmed_info?: string | null;
  confirmed?: number | null;
  confirmed_by?: string | null;
};
export const PHOTO_SELECT = `SELECT p.id,p.place_id,p.session_id,p.created,p.status,p.info,p.model,
  c.info AS confirmed_info,c.confirmed,c.session_id AS confirmed_by
  FROM sign_photos p LEFT JOIN sign_confirmations c ON c.photo_id=p.id`;

export function photoView(row: PhotoRow, userId?: string, uploadedByMe = false): SignPhoto {
  return {
    id: row.id, placeId: row.place_id, createdAt: new Date(row.created).toISOString(),
    status: row.confirmed ? "ready" : row.status,
    info: row.confirmed_info ? JSON.parse(row.confirmed_info) : row.info ? JSON.parse(row.info) : null,
    model: row.model,
    confirmedAt: row.confirmed ? new Date(row.confirmed).toISOString() : null,
    confirmedByMe: Boolean(userId && row.confirmed_by === userId),
    uploadedByMe: Boolean(userId && (uploadedByMe || row.session_id === userId)),
  };
}

export function enrichSigns(
  places: ParkingPlace[],
  boundaryRows: { place_id: string; geometry: string }[],
  labels: { place_id: string; code: string }[],
  photos: PhotoRow[],
): ParkingPlace[] {
  const boundaries = new Map(boundaryRows.map(row => [row.place_id, JSON.parse(row.geometry) as Geometry]));
  const latest = new Map<string, string>();
  for (const label of labels) if (!latest.has(label.place_id)) latest.set(label.place_id, label.code);
  const counts = new Map<string, number>(), signs = new Map<string, PhotoRow>();
  for (const photo of photos) {
    counts.set(photo.place_id, (counts.get(photo.place_id) ?? 0) + 1);
    if (photo.confirmed && photo.confirmed_info && !signs.has(photo.place_id)) signs.set(photo.place_id, photo);
  }
  const enriched: ParkingPlace[] = places.map(place => {
    const photo = signs.get(place.id);
    const info: SignInfo | null = photo?.confirmed_info ? JSON.parse(photo.confirmed_info) : null;
    const geometry = boundaries.get(place.id) ?? place.geometry;
    return {
      ...place, geometry,
      ...(place.capacity === 0 && place.availability?.status === "spaces"
        ? { availability: { ...UNKNOWN_AVAILABILITY } }
        : place.capacity !== null && place.availability?.freeSpaces !== undefined && place.availability.freeSpaces > place.capacity
        ? { availability: { ...place.availability, freeSpaces: undefined } } : {}),
      ...(boundaries.has(place.id) ? { locationPrecision: undefined } : {}),
      photoCount: counts.get(place.id) ?? 0,
      signInfo: info && photo ? {
        ...info, photoId: photo.id, model: photo.model ?? "manual",
        observedAt: new Date(photo.confirmed!).toISOString(),
        confirmedAt: new Date(photo.confirmed!).toISOString(),
        sourcePlaceId: place.id, sourcePlaceName: place.name,
      } : undefined,
      zoneCode: latest.get(place.id) ?? place.zoneCode ?? (info?.zoneCode ? normalizeZoneCode(info.zoneCode) : null),
      zoneCodeEvidence: latest.has(place.id) ? "community" : place.zoneCode ? place.zoneCodeEvidence : info?.zoneCode ? "sign" : undefined,
      openingHours: place.openingHours ?? info?.chargingHours ?? null,
    };
  });
  const zones = enriched.filter(p => p.kind === "zone" && p.geometry && p.signInfo);
  return enriched.map(place => {
    if (place.signInfo || place.kind === "zone") return place;
    const candidates = zones.filter(zone => insidePolygon(place.coordinate, zone.geometry!) &&
      (!place.zoneCode || normalizeZoneCode(place.zoneCode) === normalizeZoneCode(zone.zoneCode ?? zone.signInfo!.zoneCode ?? "")) &&
      (!place.operator || !zone.operator || place.operator === zone.operator));
    // An overlapping zone with contradictory rules needs a person to resolve it.
    if (candidates.length !== 1) return place;
    const zone = candidates[0];
    // A confirmed photo can disagree with an existing/community zone label. Keep the
    // evidence visible on that zone, but never infer another parking's tariff from the conflict.
    if (zone.zoneCode && zone.signInfo!.zoneCode &&
      normalizeZoneCode(zone.zoneCode) !== normalizeZoneCode(zone.signInfo!.zoneCode)) return place;
    return { ...place, signInfo: zone.signInfo, zoneCode: place.zoneCode ?? zone.zoneCode,
      zoneCodeEvidence: place.zoneCodeEvidence ?? "sign",
      openingHours: place.openingHours ?? zone.signInfo!.chargingHours };
  });
}

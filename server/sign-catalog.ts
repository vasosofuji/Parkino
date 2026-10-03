import { insidePolygon } from "../src/domain/arrival";
import { normalizeZoneCode, UNKNOWN_AVAILABILITY } from "../src/domain/parking";
import type { Geometry, ParkingPlace, SignInfo, SignPhoto } from "../src/domain/types";
import { isVerifiedSmsPayment, smsZoneMatches, SMS_PHOTO_TTL_MS, validatedSmsCandidate, type VerifiedSmsPayment } from "../src/domain/sms-payment";
import { smsOperatorsMatch } from "./sms-payment";

export type PhotoRow = {
  id: string;
  place_id: string;
  session_id: string | null;
  created: number;
  status: SignPhoto["status"];
  info: string | null;
  model: string | null;
  hash?: string;
  sms_protocol?: string | null;
  sms_photo_hash?: string | null;
  sms_confirmed?: number | null;
  confirmed_info?: string | null;
  confirmed?: number | null;
  confirmed_by?: string | null;
};
export const PHOTO_SELECT = `SELECT p.id,p.place_id,p.session_id,p.created,p.status,p.info,p.model,p.hash,
  c.info AS confirmed_info,c.confirmed,c.session_id AS confirmed_by,
  sms.protocol AS sms_protocol,sms.photo_hash AS sms_photo_hash,sms.confirmed AS sms_confirmed
  FROM sign_photos p LEFT JOIN sign_confirmations c ON c.photo_id=p.id
  LEFT JOIN sms_confirmations sms ON sms.photo_id=p.id`;

export function smsFromPhoto(row: PhotoRow, now = Date.now()): VerifiedSmsPayment | undefined {
  if (!row.sms_confirmed || !row.sms_protocol || row.sms_photo_hash !== row.hash || !row.info || !row.model || !["ready", "review"].includes(row.status)) return;
  try {
    const candidate = validatedSmsCandidate(JSON.parse(row.info));
    if (!candidate || JSON.stringify(candidate) !== row.sms_protocol) return;
    const corrected: SignInfo | null = row.confirmed_info ? JSON.parse(row.confirmed_info) : null;
    if (corrected && (!smsZoneMatches(corrected.zoneCode, candidate.zoneCode) || !smsOperatorsMatch(corrected.operator, JSON.parse(row.info).operator))) return;
    const protocol = { ...candidate, photoId: row.id, confirmedAt: new Date(row.sms_confirmed).toISOString(), expiresAt: new Date(row.created + SMS_PHOTO_TTL_MS).toISOString() };
    return isVerifiedSmsPayment(protocol, now) ? protocol : undefined;
  } catch { return; }
}

export function photoView(row: PhotoRow, userId?: string, uploadedByMe = false): SignPhoto {
  const ai: SignInfo | null = row.info ? JSON.parse(row.info) : null;
  const edited: SignInfo | null = row.confirmed_info ? JSON.parse(row.confirmed_info) : ai;
  const rereadingLegacy = ai && !Object.prototype.hasOwnProperty.call(ai, "smsPayment") && ["queued", "processing", "waiting"].includes(row.status);
  return {
    id: row.id, placeId: row.place_id, createdAt: new Date(row.created).toISOString(),
    status: rereadingLegacy ? row.status : row.confirmed ? "ready" : row.status,
    info: edited ? { ...edited, smsPayment: validatedSmsCandidate(ai) } : null,
    smsPayment: smsFromPhoto(row),
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
    const protocols = photos.filter(row => row.place_id === place.id && smsOperatorsMatch(place.operator, row.info ? JSON.parse(row.info).operator : null)).map(row => smsFromPhoto(row)).filter((p): p is VerifiedSmsPayment => Boolean(p));
    const zoneCode = latest.get(place.id) ?? place.zoneCode ?? (info?.zoneCode ? normalizeZoneCode(info.zoneCode) : protocols[0]?.zoneCode ?? null);
    const matching = protocols.filter(p => smsZoneMatches(zoneCode, p.zoneCode));
    // Conflicting photographed protocols cannot silently choose an arbitrary recipient.
    const distinct = new Set(protocols.map(p => JSON.stringify([p.destination,p.zoneCode,p.mode,p.startTemplate,p.stopTemplate,p.allowedHours,p.maxStayMinutes])));
    const smsPayment = distinct.size === 1 && matching.length === protocols.length ? matching[0] : undefined;
    return {
      ...place, geometry, smsPayment,
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
      zoneCode,
      zoneCodeEvidence: latest.has(place.id) ? "community" : place.zoneCode ? place.zoneCodeEvidence : info?.zoneCode ? "sign" : undefined,
      paymentSchedule: place.paymentSchedule ?? (info ? { chargingHours: info.chargingHours, freeWeekends: info.freeWeekends ?? null } : undefined),
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
      paymentSchedule: place.paymentSchedule ?? { chargingHours: zone.signInfo!.chargingHours, freeWeekends: zone.signInfo!.freeWeekends ?? null } };
  });
}

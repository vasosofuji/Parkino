import { insidePolygon, type Fix } from "./arrival";
import { distanceMeters, parkingPrice } from "./parking";
import { usableFix } from "./location";
import { isVerifiedSmsPayment, smsZoneMatches } from "./sms-payment";
import { parsePayingHours } from "./payment-hours";
import type { Coordinate, ParkingPlace } from "./types";

export const PAYMENT_DWELL_MS = 15_000;
export const PAYMENT_COOLDOWN_MS = 60 * 60 * 1000;
const polygonUsable = (place: ParkingPlace) => Boolean(place.geometry?.coordinates.length && place.geometry.coordinates.every(ring => ring.length >= 4 && ring.every(point => point.length === 2 && point.every(Number.isFinite)) && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1]));
export function knownFreeTime(place: ParkingPlace, now: number) {
  const price = parkingPrice(place, now);
  if (price?.firstHour === 0 && price.nextHour === 0) return true;
  const sign = place.signInfo;
  if (!sign?.confirmedAt) return false;
  if (sign.firstHour === 0 && sign.nextHour === 0) return true;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Skopje", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(value("weekday"));
  const minute = Number(value("hour")) * 60 + Number(value("minute"));
  if ((sign.freeWeekends === "both" && day >= 5) || (sign.freeWeekends === "sunday" && day === 6)) return true;
  const periods = parsePayingHours(sign.chargingHours);
  if (!periods?.length) return false; // Missing/unreadable text needs the driver's review.
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return !periods.some(period => {
    const from = minutes(period.from), to = minutes(period.to);
    return from < to ? period.days.includes(day) && minute >= from && minute < to : (period.days.includes(day) && minute >= from) || (period.days.includes((day + 6) % 7) && minute < to);
  });
}
/** Require the entire GPS uncertainty circle inside the polygon, including its holes. */
export function safelyInsideZone(fix: Fix, place: ParkingPlace) {
  if (!polygonUsable(place) || !place.geometry || place.locationPrecision === "area" || !insidePolygon(fix, place.geometry)) return false;
  const scale = Math.cos(fix.latitude * Math.PI / 180);
  for (const ring of place.geometry.coordinates) {
    if (ring.length < 4 || ring.some(point => point.length !== 2 || point.some(value => !Number.isFinite(value)))) return false;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = { x: (ring[i][0] - fix.longitude) * 111320 * scale, y: (ring[i][1] - fix.latitude) * 111320 };
      const b = { x: (ring[i + 1][0] - fix.longitude) * 111320 * scale, y: (ring[i + 1][1] - fix.latitude) * 111320 };
      const dx = b.x - a.x, dy = b.y - a.y;
      const fraction = dx || dy ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy))) : 0;
      if (Math.hypot(a.x + fraction * dx, a.y + fraction * dy) <= (fix.accuracy ?? Infinity)) return false;
    }
  }
  return true;
}
export function eligibleSmsZone(fix: Fix | null, places: ParkingPlace[], plate: string | null, now: number) {
  if (!plate || !/^[A-Z0-9]{3,12}$/.test(plate) || !fix || !usableFix(fix, now) || now - fix.timestamp > 10_000 || fix.accuracy! > 20 || (fix.speed !== null && (!Number.isFinite(fix.speed) || fix.speed < 0 || fix.speed > 0.8))) return null;
  // An unpaid, unverified or approximate second zone still makes the location ambiguous.
  const overlapping = places.filter(place => place.kind === "zone" && polygonUsable(place) && insidePolygon(fix, place.geometry!));
  if (overlapping.length !== 1) return null;
  const zone = overlapping[0], protocol = zone.smsPayment;
  if (zone.access === "restricted" || !safelyInsideZone(fix, zone) || !protocol || !isVerifiedSmsPayment(protocol, now) || !smsZoneMatches(zone.zoneCode, protocol.zoneCode) || knownFreeTime(zone, now)) return null;
  return zone;
}
const identity = (place: ParkingPlace, plate: string) => JSON.stringify([place.id, plate, place.geometry, place.smsPayment]);
export class ZonePaymentDwell {
  private candidate: { key: string; id: string; since: number; last: number; count: number; anchor: Coordinate } | null = null;
  private cooldown = new Map<string, number>();
  reset() { this.candidate = null; }
  update(fix: Fix | null, places: ParkingPlace[], plate: string | null, foreground: boolean, now = Date.now()) {
    const place = foreground ? eligibleSmsZone(fix, places, plate, now) : null;
    if (!place || !fix || !plate) { this.reset(); return null; }
    const key = identity(place, plate), previous = this.candidate;
    if (!previous || previous.key !== key || fix.timestamp - previous.last > 6000 || fix.timestamp < previous.last || distanceMeters(fix, previous.anchor) > 8) {
      this.candidate = { key, id: place.id, since: fix.timestamp, last: fix.timestamp, count: 1, anchor: fix };
      return null;
    }
    if (fix.timestamp > previous.last) { previous.last = fix.timestamp; previous.count++; }
    return previous.count >= 3 && previous.last - previous.since >= PAYMENT_DWELL_MS ? place : null;
  }
  canPrompt(place: ParkingPlace, plate: string, now = Date.now()) { return now - (this.cooldown.get(`${place.id}:${plate}`) ?? -Infinity) >= PAYMENT_COOLDOWN_MS; }
  prompted(place: ParkingPlace, plate: string, now = Date.now()) {
    this.cooldown.set(`${place.id}:${plate}`, now);
    for (const [key, at] of this.cooldown) if (now - at >= PAYMENT_COOLDOWN_MS) this.cooldown.delete(key);
    if (this.cooldown.size > 128) this.cooldown.delete(this.cooldown.keys().next().value!);
  }
}

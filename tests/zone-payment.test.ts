import test from "node:test";
import assert from "node:assert/strict";
import { eligibleSmsZone, knownFreeTime, safelyInsideZone, ZonePaymentDwell } from "../src/domain/zone-payment";

import { paymentFix, paymentNow, paymentZone, verified } from "./fixtures/zone-payment";

test("payment needs 15 consecutive seconds, precise stationary fixes and a saved compact plate", () => {
  const detector = new ZonePaymentDwell();
  for (const offset of [0, 5000, 10000]) assert.equal(detector.update(paymentFix(offset), [paymentZone], "SK1234FF", true, paymentNow + offset), null);
  assert.equal(detector.update(paymentFix(15000), [paymentZone], "SK1234FF", true, paymentNow + 15000)?.id, "zone");
  assert.equal(detector.update(paymentFix(15000), [paymentZone], "SK1234FF", true, paymentNow + 15500)?.id, "zone");
  for (const fix of [{ ...paymentFix(), accuracy: 21 }, { ...paymentFix(), speed: 1 }, { ...paymentFix(), speed: -1 }, { ...paymentFix(), timestamp: paymentNow - 10001 }]) assert.equal(eligibleSmsZone(fix, [paymentZone], "SK1234FF", paymentNow), null);
  for (const plate of [null, "", "SK 1234 FF"]) assert.equal(eligibleSmsZone(paymentFix(), [paymentZone], plate, paymentNow), null);
});

test("unknown boundaries, uncertain edges, overlapping zones and unverified SMS never choose a payment", () => {
  assert.equal(eligibleSmsZone(paymentFix(), [{ ...paymentZone, geometry: undefined }], "SK1234FF", paymentNow), null);
  assert.equal(eligibleSmsZone(paymentFix(), [{ ...paymentZone, locationPrecision: "area" }], "SK1234FF", paymentNow), null);
  assert.equal(safelyInsideZone({ ...paymentFix(), longitude: 21.00099 }, paymentZone), false);
  assert.equal(eligibleSmsZone(paymentFix(), [paymentZone, { ...paymentZone, id: "unpaid", smsPayment: undefined }], "SK1234FF", paymentNow), null);
  for (const protocol of [undefined, { ...verified, destination: "invented" }, { ...verified, expiresAt: new Date(paymentNow).toISOString() }]) assert.equal(eligibleSmsZone(paymentFix(), [{ ...paymentZone, smsPayment: protocol }], "SK1234FF", paymentNow), null);
  assert.equal(eligibleSmsZone(paymentFix(), [{ ...paymentZone, geometry: { type: "Polygon", coordinates: [] } }], "SK1234FF", paymentNow), null);
});

test("holes and the full accuracy circle prevent wrong-zone payment", () => {
  const hole = [[20.99995, 41.99995], [21.00005, 41.99995], [21.00005, 42.00005], [20.99995, 42.00005], [20.99995, 41.99995]];
  const zone = { ...paymentZone, geometry: { type: "Polygon" as const, coordinates: [...paymentZone.geometry!.coordinates, hole] } };
  assert.equal(safelyInsideZone(paymentFix(), zone), false);
  assert.equal(safelyInsideZone({ ...paymentFix(), longitude: 21.00007 }, zone), false);
  assert.equal(safelyInsideZone({ ...paymentFix(), longitude: 21.0003 }, zone), true);
});

test("leaving, background, GPS gaps, protocol or plate changes reset dwell and stale queued payments", () => {
  const detector = new ZonePaymentDwell();
  for (const offset of [0, 5000, 10000, 15000]) detector.update(paymentFix(offset), [paymentZone], "SK1234FF", true, paymentNow + offset);
  assert.equal(detector.update({ ...paymentFix(16000), latitude: 43 }, [paymentZone], "SK1234FF", true, paymentNow + 16000), null);
  assert.equal(detector.update(paymentFix(17000), [paymentZone], "SK1234FF", true, paymentNow + 17000), null);
  assert.equal(detector.update(paymentFix(22000), [paymentZone], "SK1234FF", false, paymentNow + 22000), null);
  assert.equal(detector.update(paymentFix(23000), [paymentZone], "SK1234FF", true, paymentNow + 23000), null);
  assert.equal(detector.update(paymentFix(30000), [paymentZone], "SK1234FF", true, paymentNow + 30000), null);
  assert.equal(detector.update(paymentFix(35000), [paymentZone], "SK9999FF", true, paymentNow + 35000), null);
  assert.equal(detector.update(paymentFix(40000), [{ ...paymentZone, smsPayment: { ...verified, photoId: "new-photo" } }], "SK9999FF", true, paymentNow + 40000), null);
});

test("prompt cooldown is per zone and plate without claiming paid status", () => {
  const detector = new ZonePaymentDwell();
  assert.equal(detector.canPrompt(paymentZone, "SK1234FF", paymentNow), true);
  detector.prompted(paymentZone, "SK1234FF", paymentNow);
  assert.equal(detector.canPrompt(paymentZone, "SK1234FF", paymentNow + 50000), false);
  assert.equal(detector.canPrompt(paymentZone, "SK9999FF", paymentNow + 50000), true);
  assert.equal(detector.canPrompt(paymentZone, "SK1234FF", paymentNow + 3600000), true);
});

test("official or current community zero rates suppress an otherwise verified SMS prompt", () => {
  assert.equal(eligibleSmsZone(paymentFix(), [{ ...paymentZone, tariff: { firstHour: 0, nextHour: 0, maxStayMinutes: null, evidence: "official", source: paymentZone.source } }], "SK1234FF", paymentNow), null);
  assert.equal(eligibleSmsZone(paymentFix(), [{ ...paymentZone, communityPrice: { firstHour: 0, nextHour: 0, observedAt: new Date(paymentNow - 1000).toISOString(), reports: 1 } }], "SK1234FF", paymentNow), null);
});

test("confirmed charging schedule respects Skopje weekends, overnight intervals and unreadable hours", () => {
  const sign = { isParkingSign: true, confidence: 1, zoneCode: "D8", operator: null, currency: "MKD", firstHour: 25, nextHour: 25, maxStayMinutes: null, chargingHours: "Mon–Sat 07:00–23:00", restrictions: null, paymentInstructions: null, rawText: "", photoId: "photo", model: "model", observedAt: "", confirmedAt: "2026-10-01T00:00:00Z", freeWeekends: "sunday" as const };
  assert.equal(knownFreeTime({ ...paymentZone, signInfo: sign }, Date.parse("2026-10-04T10:00:00Z")), true);
  assert.equal(knownFreeTime({ ...paymentZone, signInfo: sign }, paymentNow), false);
  assert.equal(knownFreeTime({ ...paymentZone, signInfo: sign }, Date.parse("2026-10-05T22:00:00Z")), true);
  assert.equal(knownFreeTime({ ...paymentZone, signInfo: { ...sign, chargingHours: "Mon 22:00–02:00" } }, Date.parse("2026-10-05T23:00:00Z")), false);
  assert.equal(knownFreeTime({ ...paymentZone, signInfo: { ...sign, chargingHours: "unknown" } }, paymentNow), false);
  assert.equal(knownFreeTime({ ...paymentZone, openingHours: "closed", signInfo: { ...sign, chargingHours: null } }, paymentNow), false);
});

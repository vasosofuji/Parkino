import type { Fix } from "../../src/domain/arrival";
import type { ParkingPlace, VerifiedSmsPayment } from "../../src/domain/types";
export const paymentNow = Date.parse("2026-10-05T10:00:00Z");
export const verified: VerifiedSmsPayment = { mode: "start-stop", destination: "144144", zoneCode: "D8", plateFormat: "compact", startTemplate: "{zone} {plate}", stopTemplate: "S", allowedHours: null, maxStayMinutes: null, confidence: 1, evidence: { destinationText: "144 - 144", startExample: "D8 SK1234FF", samplePlate: "SK1234FF", sampleHours: null, stopExample: "S", stopInstructionText: "STOP send S to 144144", durationText: null }, photoId: "photo", confirmedAt: new Date(paymentNow - 1000).toISOString(), expiresAt: new Date(paymentNow + 86400000).toISOString() };
export const paymentZone: ParkingPlace = { id: "zone", name: "Zone D8", kind: "zone", coordinate: { latitude: 42, longitude: 21 }, geometry: { type: "Polygon", coordinates: [[[20.999, 41.999], [21.001, 41.999], [21.001, 42.001], [20.999, 42.001], [20.999, 41.999]]] }, zoneCode: "D8", operator: "City", access: "public", tariff: null, capacity: null, openingHours: null, verification: "community", source: { label: "Contributor", url: "", retrievedAt: "" }, smsPayment: verified };
export const paymentFix = (offset = 0): Fix => ({ latitude: 42, longitude: 21, accuracy: 5, speed: 0, timestamp: paymentNow + offset });


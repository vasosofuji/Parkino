import type { SignInfo } from "./types";
import { normalizeZoneCode } from "./parking";

export type SmsPaymentCandidate = {
  mode: "start-stop" | "fixed-hours";
  destination: string;
  zoneCode: string;
  plateFormat: "compact";
  startTemplate: string;
  stopTemplate: string | null;
  allowedHours: number[] | null;
  maxStayMinutes: number | null;
  confidence: number;
  evidence: {
    destinationText: string;
    startExample: string;
    samplePlate: string;
    sampleHours: number | null;
    stopExample: string | null;
    stopInstructionText: string | null;
    durationText: string | null;
  };
};
export type VerifiedSmsPayment = SmsPaymentCandidate & {
  photoId: string;
  confirmedAt: string;
  expiresAt: string;
};
export const SMS_PHOTO_TTL_MS = 90 * 86400000;
const text = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();
export function smsZoneMatches(label: string | null | undefined, token: string | null | undefined) {
  if (!label || !token) return false;
  const normalized = normalizeZoneCode(label), printed = normalizeZoneCode(token);
  return normalized === printed || (/^POC\s*\d+$/i.test(label.trim()) && normalized.slice(3) === printed);
}
const hoursWord = /hours?|час(?:а|ови)?|orë|ore/i;

/** Only literal, independently legible photo evidence can become a payment candidate. */
export function validatedSmsCandidate(info: SignInfo | null | undefined): SmsPaymentCandidate | null {
  const p = info?.smsPayment;
  if (!info?.isParkingSign || !Number.isFinite(info.confidence) || info.confidence < .95 || !p || !Number.isFinite(p.confidence) || p.confidence < .98 || p.confidence > 1 ||
      !["start-stop", "fixed-hours"].includes(p.mode) || p.plateFormat !== "compact" ||
      !/^\d{3,8}$/.test(p.destination) || !/^[A-Z0-9]{1,12}$/.test(p.zoneCode) ||
      !info.zoneCode || !smsZoneMatches(info.zoneCode, p.zoneCode)) return null;
  const e = p.evidence;
  if (!e || !/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{3,12}$/.test(e.samplePlate)) return null;
  const raw = text(info.rawText);
  const visible = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && raw.includes(text(value));
  if (!visible(e.destinationText) || e.destinationText.replace(/[\s-]/g, "") !== p.destination || !visible(e.startExample)) return null;
  const printedNumbers = raw.match(/\b\d(?:[\d -]*\d)?\b/g)?.map(n => n.replace(/[ -]/g, "")) ?? [];
  if (!printedNumbers.includes(p.destination)) return null;
  const template = (value: unknown) => typeof value === "string" && value.length <= 80 &&
    /^[A-Za-z0-9 {}-]+$/.test(value) && !/[{}]/.test(value.replace(/\{(?:plate|zone|hours)\}/g, ""));
  const expand = (value: string) => value.replaceAll("{zone}", p.zoneCode).replaceAll("{plate}", e.samplePlate).replaceAll("{hours}", String(e.sampleHours));
  if (!template(p.startTemplate) || p.startTemplate.split("{plate}").length !== 2 || p.startTemplate.split("{zone}").length !== 2 ||
      text(expand(p.startTemplate)) !== text(e.startExample)) return null;
  if (p.maxStayMinutes !== null && (!Number.isInteger(p.maxStayMinutes) || p.maxStayMinutes < 1 || p.maxStayMinutes > 1440 || !visible(e.durationText))) return null;
  if (info.maxStayMinutes !== null && info.maxStayMinutes !== p.maxStayMinutes) return null;
  if (p.maxStayMinutes !== null) {
    if (/unlimited|неогранич|pa kufiz/i.test(e.durationText!)) return null;
    const limit = new RegExp(`\\b${p.maxStayMinutes}\\s*(?:min|мин)`);
    const hourlyLimit = new RegExp(`\\b${String(p.maxStayMinutes / 60).replace(".", "\\.")}\\s*(?:hours?|час|orë|ore)`, "i");
    if (!limit.test(e.durationText!) && !hourlyLimit.test(e.durationText!)) return null;
  }
  if (p.mode === "start-stop") {
    if (p.allowedHours !== null || e.sampleHours !== null || p.startTemplate.includes("{hours}") ||
        !template(p.stopTemplate) || p.stopTemplate!.includes("{hours}") || !visible(e.stopExample) ||
        text(expand(p.stopTemplate!)) !== text(e.stopExample) || !visible(e.stopInstructionText) ||
        !/stop|стоп|крај|fund|ndal/i.test(e.stopInstructionText) || !text(e.stopInstructionText).includes(text(e.stopExample))) return null;
    const stopNumbers = e.stopInstructionText.match(/\b\d(?:[\d -]*\d)?\b/g)?.map(n => n.replace(/[ -]/g, "")) ?? [];
    if (!stopNumbers.length || stopNumbers.some(n => n !== p.destination)) return null;
  } else {
    if (p.stopTemplate !== null || p.startTemplate.split("{hours}").length !== 2 ||
        !Array.isArray(p.allowedHours) || p.allowedHours.length === 0 || p.allowedHours.length > 24 ||
        !p.allowedHours.every(h => Number.isInteger(h) && h >= 1 && h <= 24) || new Set(p.allowedHours).size !== p.allowedHours.length ||
        !p.allowedHours.includes(e.sampleHours!) || !visible(e.durationText) || !hoursWord.test(e.durationText)) return null;
    const stated = new Set((e.durationText.match(/\b\d{1,2}\b/g) ?? []).map(Number));
    for (const range of e.durationText.matchAll(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/g)) {
      const from = Number(range[1]), to = Number(range[2]);
      if (from >= 1 && to <= 24 && to >= from) for (let h = from; h <= to; h++) stated.add(h);
    }
    if (!p.allowedHours.every(h => stated.has(h)) || (p.maxStayMinutes !== null && p.allowedHours.some(h => h * 60 > p.maxStayMinutes!))) return null;
  }
  return p;
}

/** Fresh server validation is still required before opening a composer. */
export function isVerifiedSmsPayment(value: VerifiedSmsPayment | null | undefined, now = Date.now()): value is VerifiedSmsPayment {
  if (!value || !value.photoId || !Number.isFinite(Date.parse(value.confirmedAt)) || !Number.isFinite(Date.parse(value.expiresAt))) return false;
  // This checks structure for cached data; only the server can check the actual photo provenance.
  if (!validatedSmsCandidate({ isParkingSign: true, confidence: 1, zoneCode: value.zoneCode,
    smsPayment: value, rawText: Object.values(value.evidence ?? {}).filter(v => typeof v === "string").join("\n"),
    operator: null, currency: null, firstHour: null, nextHour: null, maxStayMinutes: null,
    chargingHours: null, paymentInstructions: null, restrictions: null })) return false;
  return Date.parse(value.confirmedAt) <= now && Date.parse(value.expiresAt) > now && Date.parse(value.expiresAt) - Date.parse(value.confirmedAt) <= SMS_PHOTO_TTL_MS;
}

import { createHash } from "node:crypto";
import { SMS_PHOTO_TTL_MS, smsZoneMatches, validatedSmsCandidate } from "../src/domain/sms-payment";
import type { PhotoRow } from "./sign-catalog";

export function smsOperatorsMatch(placeOperator: string | null | undefined, photoOperator: string | null | undefined) {
  const operator = (value: string | null | undefined) => /\bpoc\b|поц|центар|centar/i.test(value ?? "") ? "poc" : /gradski|градски/i.test(value ?? "") ? "gradski" : null;
  const a = operator(placeOperator), b = operator(photoOperator);
  return !a || !b || a === b;
}

export function photographedSmsCandidate(row: PhotoRow, image: { bytes: Uint8Array; hash: string }, code: string | null, now = Date.now(), placeOperator?: string | null) {
  const reject = () => { throw Object.assign(new Error("SMS payment needs a recent clear photo with complete matching payment instructions."), { statusCode: 409 }); };
  if (!row.info || !row.model || !["ready", "review"].includes(row.status) || row.created > now || row.created + SMS_PHOTO_TTL_MS <= now ||
      image.bytes.length < 32 || createHash("sha256").update(image.bytes).digest("hex") !== image.hash || image.hash !== row.hash) return reject();
  const reading = JSON.parse(row.info), candidate = validatedSmsCandidate(reading);
  if (!candidate || !smsOperatorsMatch(placeOperator, reading.operator) || (code && !smsZoneMatches(code, candidate.zoneCode))) return reject();
  if (row.confirmed_info) {
    const edited = JSON.parse(row.confirmed_info);
    if (!smsZoneMatches(edited.zoneCode, candidate.zoneCode) || !smsOperatorsMatch(edited.operator, reading.operator)) return reject();
  }
  return candidate;
}

export function needsSmsReread(row: Pick<PhotoRow, "info" | "status" | "created" | "sms_confirmed">, now = Date.now()) {
  if (!row.info || row.sms_confirmed || !["ready", "review"].includes(row.status) || row.created + SMS_PHOTO_TTL_MS <= now) return false;
  try { return !Object.prototype.hasOwnProperty.call(JSON.parse(row.info), "smsPayment"); } catch { return false; }
}

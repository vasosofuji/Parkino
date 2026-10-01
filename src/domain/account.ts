export const TERMS_VERSION = "2026-10-01";
export type Profile = {
  id: string;
  username: string;
  termsVersion: string;
  acceptedAt: string;
};
export function cleanUsername(value: string) {
  return value.normalize("NFKC").trim();
}
export function usernameKey(value: string) {
  return cleanUsername(value).toLowerCase();
}
export function validUsername(value: string) {
  return /^[\p{L}\p{N}_]{3,20}$/u.test(cleanUsername(value));
}

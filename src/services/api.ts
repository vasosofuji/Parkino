import { credentials } from "./credentials";
import { TERMS_VERSION, type Profile, type Rewards } from "../domain/account";
import type { CosmeticsUpdate } from "../domain/cosmetics";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { createTransport } from "./transport";
import { createSessionManager } from "./session";
import { apiEndpoint } from "./apiEndpoint";
import type {
  Availability,
  PaymentSchedule,
  Geometry,
  Catalog,
  Proposal,
  Destination,
  Contribution,
  ParkingPlace,
  PhotoUpload,
  SignPhoto,
  SignInfo,
  VerifiedSmsPayment,
} from "../domain/types";
const developmentHost =
  Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
// React Native aliases `window` to its global object; it has no browser location.
const webHost = Platform.OS === "web" && typeof window !== "undefined"
  ? window.location?.hostname ?? "localhost"
  : "localhost";
const API = apiEndpoint({
  configured: process.env.EXPO_PUBLIC_API_URL,
  development: process.env.NODE_ENV !== "production",
  host: Platform.OS === "web" ? webHost : developmentHost,
  usbTest: Constants.expoConfig?.extra?.usbTest === true,
});
const transport = createTransport(API);
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (process.env.EXPO_PUBLIC_OFFLINE_PREVIEW === "1") {
    throw new Error(
      "This APK is a catalog preview. Live reports need a connected parking API.",
    );
  }
  return transport<T>(path, init);
}
const sessions = createSessionManager(credentials, () => request<{ token: string }>("/v1/sessions", { method: "POST" }));
async function authenticated<T>(
  path: string,
  body?: unknown,
  method = "POST",
  boundToken?: string,
): Promise<T> {
  const token = boundToken ?? await sessions.get();
  try {
    return await request<T>(path, {
      method,
      headers: { Authorization: "Bearer " + token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "A valid session is required."
    ) {
      await sessions.invalidate(token);
    }
    throw error;
  }
}
export const api = {
  progressiveWriter: async () => {
    const version = sessions.generation(), token = await sessions.get();
    function bound<T>(path: string, body: unknown, method = "POST") {
      if (version !== sessions.generation()) return Promise.reject(new Error("Your sign-in changed. Reopen this entry to continue."));
      return authenticated<T>(path, body, method, token);
    }
    const path = (id: string, suffix: string) => `/v1/places/${encodeURIComponent(id)}/${suffix}`;
    return {
      contribute: (value: Contribution) => bound<ParkingPlace>("/v1/contributions", value),
      label: (id: string, zoneCode: string) => bound(path(id, "labels"), { zoneCode }),
      price: (id: string, firstHour: number, nextHour: number) => bound(path(id, "prices"), { firstHour, nextHour }),
      paymentSchedule: (id: string, value: PaymentSchedule) => bound(path(id, "payment-schedule"), value, "PUT"),
      capacity: (id: string, capacity: number) => bound(path(id, "capacity"), { capacity }, "PUT"),
      report: (id: string, status: "spaces" | "full", freeSpaces?: number) => bound(path(id, "reports"), { status, freeSpaces }),
      boundary: (id: string, geometry: Geometry) => bound(path(id, "boundary"), geometry, "PUT"),
    };
  },
  guest: (accepted: boolean) => authenticated<Profile>("/v1/auth/guest", { accepted, termsVersion: TERMS_VERSION }),
  rewards: () => authenticated<Rewards>("/v1/rewards", undefined, "GET"),
  cosmetics: (update: CosmeticsUpdate) => authenticated<Profile>("/v1/profile/cosmetics", update, "PUT"),
  profile: async () => {
    const token = await sessions.current();
    if (!token) return null;
    return authenticated<Profile | null>("/v1/profile", undefined, "GET");
  },
  usernameAvailable: (username: string) => request<{ available: boolean }>(`/v1/usernames/availability?username=${encodeURIComponent(username)}`),
  register: (username: string, accepted: boolean, password?: string) => authenticated<Profile>("/v1/profile", { username, accepted, password, termsVersion: TERMS_VERSION }),
  login: async (username: string, password: string, accepted: boolean) => {
    const version = sessions.generation();
    const result = await request<{token:string;profile:Profile}>("/v1/auth/login", {method:"POST", body:JSON.stringify({username,password,...(accepted ? {accepted:true,termsVersion:TERMS_VERSION} : {})})});
    await sessions.replace(result.token, version);
    return result.profile;
  },
  secureAccount: async (password: string) => {
    const version = sessions.generation();
    const result = await authenticated<{token:string;profile:Profile}>("/v1/auth/password", {password});
    await sessions.replace(result.token, version);
    return result.profile;
  },
  logout: async () => {
    const token = await sessions.get();
    await authenticated("/v1/auth/logout", undefined, "POST", token);
    await sessions.invalidate(token);
  },
  boundary: (id: string, geometry: Geometry) =>
    authenticated(`/v1/places/${encodeURIComponent(id)}/boundary`, geometry, "PUT"),
  capacity: (id: string, capacity: number) => authenticated(`/v1/places/${encodeURIComponent(id)}/capacity`, {capacity}, "PUT"),
  contribute: (value: Contribution) =>
    authenticated<ParkingPlace>("/v1/contributions", value),
  label: (id: string, zoneCode: string) =>
    authenticated(`/v1/places/${encodeURIComponent(id)}/labels`, { zoneCode }),
  signs: (id: string) =>
    authenticated<SignPhoto[]>(`/v1/places/${encodeURIComponent(id)}/signs`, undefined, "GET"),
  confirmSign: (id: string, info: SignInfo) =>
    authenticated<SignPhoto>(`/v1/signs/${encodeURIComponent(id)}/confirm`, info),
  confirmSmsSign: (id: string) => authenticated<SignPhoto>(`/v1/signs/${encodeURIComponent(id)}/confirm-sms`, {}),
  smsPayment: (id: string) => authenticated<{ place: ParkingPlace; protocol: VerifiedSmsPayment | null }>(`/v1/places/${encodeURIComponent(id)}/sms-payment`, undefined, "GET"),
  uploadSign: (id: string, value: PhotoUpload) =>
    authenticated<SignPhoto>(
      `/v1/places/${encodeURIComponent(id)}/signs`,
      value,
    ),
  imageUrl: (id: string) => `${API}/v1/signs/${encodeURIComponent(id)}/image`,
  catalog: () => request<Catalog>("/v1/catalog"),
  search: (query: string) =>
    request<Destination[]>(`/v1/search?q=${encodeURIComponent(query)}`),
  proposals: () => request<Proposal[]>("/v1/proposals"),
  price: (id: string, firstHour: number, nextHour: number) =>
    authenticated(`/v1/places/${encodeURIComponent(id)}/prices`, {
      firstHour,
      nextHour,
    }),
  confirm: (id: string, present: boolean) =>
    authenticated(`/v1/places/${encodeURIComponent(id)}/confirmations`, {
      present,
    }),
  report: (id: string, status: "spaces" | "full", freeSpaces?: number) =>
    authenticated<Availability>(
      `/v1/places/${encodeURIComponent(id)}/reports`,
      { status, freeSpaces },
    ),
  propose: (
    value: Pick<Proposal, "name" | "coordinate" | "kind" | "zoneCode" | "note">,
  ) => authenticated<Proposal>("/v1/proposals", value),
  vote: (id: string) =>
    authenticated<Proposal>(`/v1/proposals/${encodeURIComponent(id)}/votes`),
  deleteSession: async () => {
    const token = await sessions.get();
    await authenticated("/v1/sessions/me", undefined, "DELETE", token);
    await sessions.invalidate(token);
  },
};

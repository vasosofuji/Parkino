import { credentials } from "./credentials";
import { TERMS_VERSION, type Profile } from "../domain/account";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { createTransport } from "./transport";
import type {
  Availability,
  Geometry,
  Catalog,
  Proposal,
  Destination,
  Contribution,
  ParkingPlace,
  PhotoUpload,
  SignPhoto,
} from "../domain/types";
const developmentHost =
  Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
const webHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
const API =
  process.env.EXPO_PUBLIC_API_URL ??
  `http://${Platform.OS === "web" ? webHost : developmentHost}:3001`;
const transport = createTransport(API);
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (process.env.EXPO_PUBLIC_OFFLINE_PREVIEW === "1") {
    throw new Error(
      "This APK is a catalog preview. Live reports need a connected parking API.",
    );
  }
  return transport<T>(path, init);
}
let sessionPromise: Promise<string> | undefined;
async function sessionToken() {
  if (!sessionPromise)
    sessionPromise = (async () => {
      const saved = await credentials.get();
      if (saved) return saved;
      const session = await request<{ token: string }>("/v1/sessions", {
        method: "POST",
      });
      await credentials.set(session.token);
      return session.token;
    })().catch((error) => {
      sessionPromise = undefined;
      throw error;
    });
  return sessionPromise;
}
async function authenticated<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const token = await sessionToken();
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
      await credentials.remove();
      sessionPromise = undefined;
    }
    throw error;
  }
}
export const api = {
  profile: async () => {
    const token = await credentials.get();
    if (!token) return null;
    return authenticated<Profile | null>("/v1/profile", undefined, "GET");
  },
  usernameAvailable: (username: string) => request<{ available: boolean }>(`/v1/usernames/availability?username=${encodeURIComponent(username)}`),
  register: (username: string, accepted: boolean) => authenticated<Profile>("/v1/profile", { username, accepted, termsVersion: TERMS_VERSION }),
  boundary: (id: string, geometry: Geometry) =>
    authenticated(`/v1/places/${encodeURIComponent(id)}/boundary`, geometry, "PUT"),
  contribute: (value: Contribution) =>
    authenticated<ParkingPlace>("/v1/contributions", value),
  label: (id: string, zoneCode: string) =>
    authenticated(`/v1/places/${encodeURIComponent(id)}/labels`, { zoneCode }),
  signs: (id: string) =>
    request<SignPhoto[]>(`/v1/places/${encodeURIComponent(id)}/signs`),
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
  report: (id: string, status: "spaces" | "full") =>
    authenticated<Availability>(
      `/v1/places/${encodeURIComponent(id)}/reports`,
      { status },
    ),
  propose: (
    value: Pick<Proposal, "name" | "coordinate" | "kind" | "zoneCode" | "note">,
  ) => authenticated<Proposal>("/v1/proposals", value),
  vote: (id: string) =>
    authenticated<Proposal>(`/v1/proposals/${encodeURIComponent(id)}/votes`),
  deleteSession: async () => {
    await authenticated("/v1/sessions/me", undefined, "DELETE");
    await credentials.remove();
    sessionPromise = undefined;
  },
};

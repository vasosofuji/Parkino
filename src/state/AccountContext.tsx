import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../services/api";
import { credentials } from "../services/credentials";
import { disableBackgroundArrival } from "../services/backgroundArrival";
import type { Profile } from "../domain/account";
const CACHE = "parkskopje-profile";
type Account = {
  profile: Profile | null;
  ready: boolean;
  register: (username: string, accepted: boolean, password: string) => Promise<void>;
  guest: (accepted: boolean) => Promise<void>;
  login: (username: string, password: string, accepted: boolean) => Promise<void>;
  secure: (password: string) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  clear: () => Promise<void>;
};
const Context = createContext<Account | null>(null);
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const generation = useRef(0);
  const save = useCallback(async (next: Profile | null) => {
    setProfile(next);
    if (next) await AsyncStorage.setItem(CACHE, JSON.stringify(next));
    else await AsyncStorage.removeItem(CACHE);
  }, []);
  const refresh = useCallback(async () => {
    const version = generation.current;
    try {
      const next = await api.profile();
      if (version === generation.current) {
        if (!next) await disableBackgroundArrival();
        if (version === generation.current) await save(next);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "A valid session is required." && version === generation.current) {
        try { await disableBackgroundArrival(); }
        finally { if (version === generation.current) await save(null); }
      }
      throw error;
    }
  }, [save]);
  useEffect(() => {
    let alive = true;
    const version = generation.current;
    void (async () => {
      try {
        if (await credentials.get()) {
          const cached = await AsyncStorage.getItem(CACHE);
          if (cached && alive && generation.current === version) {
            const value = JSON.parse(cached) as Profile;
            setProfile({ ...value, secured: value.secured ?? false, points: value.points ?? 0 });
            setReady(true);
          }
          await refresh();
        } else await disableBackgroundArrival();
      } catch {
        // Keep the last known profile available when offline.
      } finally {
        if (alive) setReady(true);
      }
    })();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh().catch(() => {});
    });
    return () => { alive = false; listener.remove(); };
  }, [refresh]);
  const register = useCallback(async (username: string, accepted: boolean, password: string) => {
    const version = ++generation.current;
    const next = await api.register(username, accepted, password);
    if (version !== generation.current) return;
    generation.current++;
    await save(next);
  }, [save]);
  const guest = useCallback(async (accepted: boolean) => {
    const version = ++generation.current;
    const next = await api.guest(accepted);
    if (version !== generation.current) return;
    generation.current++;
    await save(next);
  }, [save]);
  const login = useCallback(async (username: string, password: string, accepted: boolean) => {
    const version = ++generation.current;
    const next = await api.login(username, password, accepted);
    if (version !== generation.current) return;
    generation.current++;
    await save(next);
  }, [save]);
  const secure = useCallback(async (password: string) => {
    const version = ++generation.current;
    const next = await api.secureAccount(password);
    if (version !== generation.current) return;
    generation.current++;
    await save(next);
  }, [save]);
  const clear = useCallback(async () => {
    const version = ++generation.current;
    try { await disableBackgroundArrival(); }
    finally { if (version === generation.current) await save(null); }
  }, [save]);
  const logout = useCallback(async () => {
    try { await api.logout(); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "A valid session is required.") throw error;
    }
    await clear();
  }, [clear]);
  return <Context.Provider value={{ profile, ready, register, guest, login, secure, refresh, logout, clear }}>{children}</Context.Provider>;
}
export function useAccount() {
  const value = useContext(Context);
  if (!value) throw new Error("Account provider missing");
  return value;
}

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../services/api";
import { credentials } from "../services/credentials";
import type { Profile } from "../domain/account";
const CACHE = "parkskopje-profile";
type Account = {
  profile: Profile | null;
  ready: boolean;
  register: (username: string, accepted: boolean) => Promise<void>;
  clear: () => Promise<void>;
};
const Context = createContext<Account | null>(null);
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        if (await credentials.get()) {
          const cached = await AsyncStorage.getItem(CACHE);
          if (cached && alive) {
            setProfile(JSON.parse(cached));
            setReady(true);
          }
          const next = await api.profile();
          if (alive) setProfile(next);
          if (next) await AsyncStorage.setItem(CACHE, JSON.stringify(next));
          else await AsyncStorage.removeItem(CACHE);
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "A valid session is required."
        ) {
          if (alive) setProfile(null);
          await AsyncStorage.removeItem(CACHE);
        }
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  const register = useCallback(async (username: string, accepted: boolean) => {
    const next = await api.register(username, accepted);
    await AsyncStorage.setItem(CACHE, JSON.stringify(next));
    setProfile(next);
  }, []);
  const clear = useCallback(async () => {
    await AsyncStorage.removeItem(CACHE);
    setProfile(null);
  }, []);
  return (
    <Context.Provider value={{ profile, ready, register, clear }}>
      {children}
    </Context.Provider>
  );
}
export function useAccount() {
  const value = useContext(Context);
  if (!value) throw new Error("Account provider missing");
  return value;
}

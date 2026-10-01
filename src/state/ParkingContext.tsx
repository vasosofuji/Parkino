import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import seed from "../../data/catalog.json";
import type { Catalog, Proposal } from "../domain/types";
import { api } from "../services/api";
type Language = "mk" | "en";
type State = {
  catalog: Catalog;
  proposals: Proposal[];
  connected: boolean;
  language: Language;
  setLanguage: (lang: Language) => void;
  refresh: () => Promise<void>;
  t: (en: string, mk: string) => string;
  now: number;
};
const Context = createContext<State | null>(null);
export function ParkingProvider({ children }: { children: React.ReactNode }) {
  const [catalog, setCatalog] = useState(seed as Catalog),
    [proposals, setProposals] = useState<Proposal[]>([]);
  const [connected, setConnected] = useState(false),
    [language, updateLanguage] = useState<Language>("mk"),
    [now, setNow] = useState(() => Date.now());
  const busy = useRef<Promise<void> | null>(null);
  const refreshAgain = useRef(false);
  const refresh = useCallback((): Promise<void> => {
    // A write during a poll needs another read; callers must await that read.
    refreshAgain.current = true;
    if (busy.current) return busy.current;
    const work = async () => {
      do {
        refreshAgain.current = false;
        try {
      const [next, community] = await Promise.all([
        api.catalog(),
        api.proposals(),
      ]);
      setCatalog(next);
      setProposals(community);
      setConnected(true);
      setNow(Date.now());
      await AsyncStorage.setItem(
        "parkskopje-cache",
        JSON.stringify({ catalog: next, proposals: community }),
      );
        } catch {
      setConnected(false);
      setNow(Date.now());
        }
      } while (refreshAgain.current);
    };
    busy.current = work().finally(() => { busy.current = null; });
    return busy.current;
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [cached, locale] = await Promise.all([
          AsyncStorage.getItem("parkskopje-cache"),
          AsyncStorage.getItem("parkskopje-language"),
        ]);
        if (!active) return;
        if (cached) {
          const value = JSON.parse(cached);
          if (
            value.catalog?.places &&
            value.catalog?.zones &&
            value.catalog.generatedAt >= seed.generatedAt
          ) {
            setCatalog(value.catalog);
            setProposals(value.proposals ?? []);
          }
        }
        if (locale === "en" || locale === "mk") updateLanguage(locale);
      } catch {
        /* The bundled source catalog remains available. */
      }
      if (active) await refresh();
    })();
    const interval = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 30000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [refresh]);
  const setLanguage = useCallback((lang: Language) => {
    updateLanguage(lang);
    void AsyncStorage.setItem("parkskopje-language", lang);
  }, []);
  const translate = useCallback(
    (en: string, mk: string) => (language === "mk" ? mk : en),
    [language],
  );
  const value = useMemo<State>(
    () => ({
      catalog,
      proposals,
      connected,
      language,
      setLanguage,
      refresh,
      now,
      t: translate,
    }),
    [
      catalog,
      proposals,
      connected,
      language,
      setLanguage,
      refresh,
      now,
      translate,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useParking() {
  const state = useContext(Context);
  if (!state) throw new Error("Parking provider is missing");
  return state;
}

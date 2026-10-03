import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import seed from "../../data/catalog.json";
import type { Catalog, Proposal } from "../domain/types";
import { api } from "../services/api";
import { confirmedSignCatalog } from "../domain/parking";
import { createRefreshCoordinator } from "../domain/refresh-coordinator";
import { decodeCatalogCache, encodeCatalogCache } from "../domain/catalog-cache";
import { isLanguage, translate as translateText, type Language } from "../domain/language";
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
  const [requestRefresh] = useState(() => createRefreshCoordinator(async () => {
    try {
      const [next, community] = await Promise.all([
        api.catalog(),
        api.proposals(),
      ]);
      setCatalog(confirmedSignCatalog(next));
      setProposals(community);
      setConnected(true);
      setNow(Date.now());
      const cached = encodeCatalogCache(next, community);
      // Storage quota failures must not turn a successful network refresh offline.
      if (cached) await AsyncStorage.setItem("parkskopje-cache", cached).catch(() => {});
    } catch {
      setConnected(false);
      setNow(Date.now());
    }
  }, 25_000));
  // Mutation callers need a read newer than an already-running catalog request.
  const refresh = useCallback(() => requestRefresh(true), [requestRefresh]);
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
          const value = decodeCatalogCache(cached, seed.generatedAt);
          if (value) {
            setCatalog(confirmedSignCatalog(value.catalog));
            setProposals(value.proposals ?? []);
          }
        }
        if (isLanguage(locale)) updateLanguage(locale);
      } catch {
        /* The bundled source catalog remains available. */
      }
      if (active && AppState.currentState === "active") await requestRefresh();
    })();
    const interval = setInterval(() => {
      if (AppState.currentState !== "active") return;
      setNow(Date.now());
      void requestRefresh();
    }, 30000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") { setNow(Date.now()); void requestRefresh(); }
    });
    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [requestRefresh]);
  const setLanguage = useCallback((lang: Language) => {
    updateLanguage(lang);
    void AsyncStorage.setItem("parkskopje-language", lang).catch(() => {});
  }, []);
  const translate = useCallback(
    (en: string, mk: string) => translateText(language, en, mk),
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

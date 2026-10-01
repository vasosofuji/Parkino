import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
export const lightColors = {
  ink: "#392C25",
  muted: "#796B5D",
  green: "#962E2B",
  mint: "#EDE2D0",
  paper: "#FAF3E5",
  line: "#DCD0BC",
  red: "#A42F2B",
  success: "#28704F",
  amber: "#8B611D",
  input: "#FFF9EF",
};
export type ThemeColors = typeof lightColors;
const darkColors: ThemeColors = {
  ink: "#F6EAD5",
  muted: "#C0AC95",
  green: "#B9463D",
  mint: "#443328",
  paper: "#281F1B",
  line: "#5A4638",
  red: "#F29585",
  success: "#89C5A0",
  amber: "#E9BA6B",
  input: "#352820",
};
type ThemeMode = "system" | "light" | "dark";
const Context = createContext({
  colors: lightColors,
  dark: false,
  mode: "system" as ThemeMode,
  setMode: (_mode: ThemeMode) => {},
});
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, updateMode] = useState<ThemeMode>("system");
  useEffect(() => {
    void AsyncStorage.getItem("parkskopje-theme")
      .then((value) => {
        if (value === "light" || value === "dark" || value === "system")
          updateMode(value);
      })
      .catch(() => {});
  }, []);
  const dark = mode === "dark" || (mode === "system" && system === "dark");
  const value = useMemo(
    () => ({
      colors: dark ? darkColors : lightColors,
      dark,
      mode,
      setMode: (next: ThemeMode) => {
        updateMode(next);
        void AsyncStorage.setItem("parkskopje-theme", next).catch(() => {});
      },
    }),
    [dark, mode],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useTheme = () => useContext(Context);

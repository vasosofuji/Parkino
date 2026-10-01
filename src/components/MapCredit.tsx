import React from "react";
import { Platform, StyleSheet, Text } from "react-native";
import Constants from "expo-constants";
import { openURL } from "expo-linking";
import { useTheme } from "../state/ThemeContext";

// Kept above the drawer, instead of reserving a strip underneath it.
export default function MapCredit() {
  const { colors } = useTheme();
  if (Platform.OS !== "web" && !(Platform.OS === "android" && !Constants.expoConfig?.extra?.androidNativeMapsEnabled)) return null;
  return (
    <Text
      accessibilityRole="link"
      onPress={() => void openURL("https://www.openstreetmap.org/copyright")}
      style={[s.credit, { color: colors.muted, backgroundColor: colors.paper }]}
    >© OpenStreetMap</Text>
  );
}
const s = StyleSheet.create({
  credit: { position: "absolute", bottom: 2, right: 6, zIndex: 1200, fontSize: 10, lineHeight: 14, paddingHorizontal: 3, borderRadius: 3 },
});

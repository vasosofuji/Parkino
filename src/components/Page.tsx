import { useTheme, type ThemeColors } from "../state/ThemeContext";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { IconButton } from "./ui";
import { useParking } from "../state/ParkingContext";
export default function Page({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const { t } = useParking();
  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <IconButton
          name="arrow-left"
          label={t("Back", "Назад")}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        />
        <Text accessibilityRole="header" style={s.title}>
          {title}
        </Text>
      </View>
      {children}
    </SafeAreaView>
  );
}
const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.paper },
    header: {
      padding: 20,
      flexDirection: "row",
      gap: 14,
      alignItems: "center",
      borderBottomWidth: 1,
      borderColor: colors.line,
    },
    title: { color: colors.ink, fontSize: 22, fontWeight: "800", flex: 1 },
  });

import React from "react";
import { Text, View } from "react-native";
import { useParking } from "../state/ParkingContext";
import { useTheme } from "../state/ThemeContext";
import { Button } from "./ui";
export default function LanguagePicker() {
  const { t, language, setLanguage } = useParking(),
    { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted }}>
        {t("Language", "Јазик")}
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["en", "mk"] as const).map((value) => (
          <Button
            key={value}
            style={{ flex: 1 }}
            icon={language === value ? "check" : undefined}
            title={value === "en" ? "English" : "Македонски"}
            variant={language === value ? "primary" : "secondary"}
            onPress={() => setLanguage(value)}
          />
        ))}
      </View>
    </View>
  );
}

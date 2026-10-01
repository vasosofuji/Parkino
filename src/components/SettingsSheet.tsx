import React from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../state/ThemeContext";
import { useParking } from "../state/ParkingContext";
import { useAccount } from "../state/AccountContext";
import { Button, Sheet } from "./ui";
import LanguagePicker from "./LanguagePicker";
export default function SettingsSheet({
  visible,
  onClose,
  locationStatus,
  onRefreshLocation,
  onPermissions,
}: {
  visible: boolean;
  onClose: () => void;
  locationStatus: string;
  onRefreshLocation: () => void;
  onPermissions: () => void;
}) {
  const { colors, mode, setMode } = useTheme(),
    { t } = useParking(),
    { profile } = useAccount();
  const heading = {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600" as const,
  };
  return (
    <Sheet
      visible={visible}
      title={t("Settings", "Поставки")}
      onClose={onClose}
    >
      <Text style={heading}>{t("Appearance", "Изглед")}</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {(["light", "dark", "system"] as const).map((value) => (
          <Button
            key={value}
            style={{ flex: 1 }}
            title={
              value === "light"
                ? t("Light", "Светло")
                : value === "dark"
                  ? t("Dark", "Темно")
                  : t("System", "Систем")
            }
            icon={mode === value ? "check" : undefined}
            variant={mode === value ? "primary" : "secondary"}
            onPress={() => setMode(value)}
          />
        ))}
      </View>
      <LanguagePicker />
      <Text style={[heading, { marginTop: 4 }]}>
        {t("Location", "Локација")}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {locationStatus}
      </Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Button
          style={{ flex: 1 }}
          icon="refresh-cw"
          title={t("Refresh GPS", "Обнови GPS")}
          variant="secondary"
          onPress={onRefreshLocation}
        />
        <Button
          style={{ flex: 1 }}
          title={t("Permissions", "Дозволи")}
          variant="secondary"
          onPress={onPermissions}
        />
      </View>
      <Text style={[heading, { marginTop: 4 }]}>
        {t("Account & map", "Сметка и мапа")}
        {profile ? " · @" + profile.username : ""}
      </Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Button
          style={{ flex: 1 }}
          title={t("Zones & sources", "Зони и извори")}
          variant="secondary"
          onPress={() => {
            onClose();
            router.push("/coverage");
          }}
        />
        <Button
          style={{ flex: 1 }}
          title={t("Privacy", "Приватност")}
          variant="secondary"
          onPress={() => {
            onClose();
            router.push("/privacy");
          }}
        />
      </View>
    </Sheet>
  );
}

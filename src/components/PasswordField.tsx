import React, { useState } from "react";
import { TextInput, View } from "react-native";
import { useTheme } from "../state/ThemeContext";
import { useParking } from "../state/ParkingContext";
import { IconButton } from "./ui";
export default function PasswordField({ value, onChange, creating = false, disabled = false }: {
  value: string; onChange: (value: string) => void; creating?: boolean; disabled?: boolean;
}) {
  const { colors } = useTheme(), { t } = useParking();
  const [visible, setVisible] = useState(false);
  return <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.input, borderRadius: 12 }}>
    <TextInput
      accessibilityLabel={t("Password", "Лозинка")}
      value={value}
      onChangeText={onChange}
      editable={!disabled}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={creating ? "new-password" : "current-password"}
      textContentType={creating ? "newPassword" : "password"}
      maxLength={128}
      placeholder={t("Password", "Лозинка")}
      placeholderTextColor={colors.muted}
      style={{ flex: 1, minHeight: 52, padding: 14, fontSize: 17, color: colors.ink }}
    />
    <IconButton name={visible ? "eye-off" : "eye"} label={visible ? t("Hide password", "Скриј лозинка") : t("Show password", "Прикажи лозинка")} onPress={() => setVisible(!visible)} />
  </View>;
}

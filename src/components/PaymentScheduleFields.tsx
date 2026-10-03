import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { PaymentSchedule } from "../domain/types";
import { useParking } from "../state/ParkingContext";
import { useTheme } from "../state/ThemeContext";
import { Icon } from "./ui";
export function weekendLabel(value: PaymentSchedule["freeWeekends"], t: (en: string, mk: string) => string) {
  return value === "both" ? t("Free on Saturdays and Sundays", "Бесплатно во сабота и недела") : value === "sunday" ? t("Free on Sundays only", "Бесплатно само во недела") : value === "neither" ? t("Neither day is free", "Се плаќа и во сабота и во недела") : t("Not sure", "Не знам");
}
export default function PaymentScheduleFields({ value, onChange, disabled = false }: { value: PaymentSchedule; onChange: (value: PaymentSchedule) => void; disabled?: boolean }) {
  const { t } = useParking(), { colors } = useTheme();
  return <View style={{ gap: 12 }}>
    <Text style={{ color: colors.ink, fontWeight: "600" }}>{t("Paying hours", "Часови на наплата")}</Text>
    <TextInput accessibilityLabel={t("Paying hours", "Часови на наплата")} value={value.chargingHours ?? ""} onChangeText={chargingHours => onChange({ ...value, chargingHours: chargingHours || null })} editable={!disabled} multiline maxLength={500}
      placeholder={t("e.g. Mon–Fri 07:00–23:00; Sat 07:00–15:00", "пр. пон–пет 07:00–23:00; саб 07:00–15:00")} placeholderTextColor={colors.muted}
      style={{ minHeight: 64, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, color: colors.ink, backgroundColor: colors.input, textAlignVertical: "top" }} />
    <Text style={{ color: colors.ink, fontWeight: "600" }}>{t("Free weekends", "Бесплатни викенди")}</Text>
    {(["both", "sunday", "neither", null] as const).map(option => <Pressable key={option ?? "unknown"} accessibilityRole="radio" accessibilityState={{ checked: value.freeWeekends === option, disabled }} disabled={disabled} onPress={() => onChange({ ...value, freeWeekends: option })}
      style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: value.freeWeekends === option ? colors.accentText : colors.line, backgroundColor: value.freeWeekends === option ? colors.mint : colors.paper, borderRadius: 12, padding: 12 }}>
      <Icon name={value.freeWeekends === option ? "check-circle" : "circle"} size={18} color={colors.accentText} /><Text style={{ flex: 1, color: colors.ink }}>{weekendLabel(option, t)}</Text>
    </Pressable>)}
  </View>;
}

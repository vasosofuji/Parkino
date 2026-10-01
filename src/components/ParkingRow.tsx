import { useTheme, type ThemeColors } from "../state/ThemeContext";
import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ParkingPlace } from "../domain/types";
import { currentAvailability } from "../domain/parking";
import { Icon } from "./ui";
import { useParking } from "../state/ParkingContext";
export default function ParkingRow({
  place,
  distance,
  cost,
  costEvidence,
  selected,
  onPress,
}: {
  place: ParkingPlace;
  distance: number;
  cost: number | null;
  costEvidence: "official" | "community" | "sign" | null;
  selected: boolean;
  onPress: (place: ParkingPlace) => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const { t, language, now } = useParking();
  const available = currentAvailability(place.availability, now);
  const status = {
    spaces: t("Spaces reported", "Пријавени слободни места"),
    full: t("Full reported", "Пријавено полн"),
    mixed: t("Conflicting reports", "Различни пријави"),
    unknown: t("No recent report", "Нема свежа пријава"),
  }[available.status];
  const handlePress = useCallback(() => onPress(place), [onPress, place]);
  const displayCost = cost;
  const name = language === "en" ? (place.nameEn ?? place.name) : place.name;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${Math.round(distance)} ${t("metres straight-line", "метри воздушно")}, ${cost === 0 ? t("free parking", "бесплатен паркинг") : cost === null ? t("price unknown", "непозната цена") : `${cost} ${t("MKD per first hour", "денари за прв час")}`}, ${status}`}
      onPress={handlePress}
      style={[s.row, selected ? s.selected : null]}
    >
      <View style={s.symbol}>
        <Icon
          name={
            place.kind === "garage" || place.kind === "underground"
              ? "layers"
              : "map-pin"
          }
          size={20}
        />
      </View>
      <View style={s.main}>
        <Text numberOfLines={1} style={s.name}>
          {place.zoneCode ? `${place.zoneCode} · ` : ""}
          {name}
        </Text>
        <Text numberOfLines={1} style={s.meta}>
          {Math.round(distance)} {t("m", "м")} ·{" "}
          {place.kind === "garage"
            ? t("Garage", "Катна гаража")
            : place.kind === "underground"
              ? t("Underground", "Подземна")
              : t("Parking", "Паркинг")}
        </Text>
        <View style={s.status}>
          <View
            style={[
              s.dot,
              {
                backgroundColor:
                  available.status === "spaces"
                    ? colors.success
                    : available.status === "full"
                      ? colors.red
                      : "#869892",
              },
            ]}
          />
          <Text numberOfLines={1} style={s.statusText}>{status}</Text>
        </View>
      </View>
      <View style={s.price}>
        <Text numberOfLines={1} style={[s.amount, displayCost === 0 && s.freeAmount]}>{displayCost === null ? "—" : displayCost === 0 ? t("Free", "Бесплатно") : displayCost}</Text>
        {displayCost !== 0 ? <Text style={s.currency}>
          {displayCost === null
            ? t("unknown", "непознато")
            : t("MKD / first hr", "ден. / прв ч.")}
        </Text> : null}
        {displayCost !== null && costEvidence !== "official" ? (
          <Text style={s.currency}>{t("Reported", "Пријавено")}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      padding: 8,
      gap: 8,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      backgroundColor: colors.paper,
    },
    selected: { backgroundColor: colors.mint },
    symbol: {
      width: 32,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.mint,
      alignItems: "center",
      justifyContent: "center",
    },
    main: { flex: 1, minWidth: 0, gap: 3 },
    name: { fontSize: 14, fontWeight: "700", color: colors.ink },
    meta: { fontSize: 12, color: colors.muted },
    status: { flexDirection: "row", gap: 5, alignItems: "center" },
    dot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { color: colors.muted, fontSize: 11, flexShrink: 1 },
    price: { width: 76, alignItems: "flex-end", gap: 2 },
    amount: { fontSize: 18, fontWeight: "700", color: colors.ink },
    freeAmount: { fontSize: 14 },
    currency: { fontSize: 10, color: colors.muted },
  });

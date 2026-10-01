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
      accessibilityLabel={`${name}, ${cost ?? t("price unknown", "непозната цена")}`}
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
        <Text numberOfLines={2} style={s.name}>
          {place.zoneCode ? `${place.zoneCode} · ` : ""}
          {name}
        </Text>
        <Text style={s.meta}>
          {Math.round(distance)} {t("m straight-line", "м воздушно")} ·{" "}
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
          <Text style={s.statusText}>{status}</Text>
        </View>
      </View>
      <View style={s.price}>
        <Text style={s.amount}>{displayCost === null ? "—" : displayCost}</Text>
        <Text style={s.currency}>
          {displayCost === null
            ? t("unknown", "непознато")
            : costEvidence !== "official"
              ? t("MKD / first hr · reported", "ден. / прв ч. · пријава")
              : t("MKD / first hr", "ден. / прв ч.")}
        </Text>
      </View>
    </Pressable>
  );
}
const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      padding: 16,
      paddingVertical: 12,
      gap: 12,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      backgroundColor: colors.paper,
    },
    selected: { backgroundColor: colors.mint },
    symbol: {
      width: 42,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.mint,
      alignItems: "center",
      justifyContent: "center",
    },
    main: { flex: 1, gap: 5 },
    name: { fontSize: 15, fontWeight: "700", color: colors.ink },
    meta: { fontSize: 12, color: colors.muted },
    status: { flexDirection: "row", gap: 5, alignItems: "center" },
    dot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { color: colors.muted, fontSize: 11 },
    price: { alignItems: "flex-end", gap: 4 },
    amount: { fontSize: 22, fontWeight: "800", color: colors.ink },
    currency: { fontSize: 10, color: colors.muted },
  });

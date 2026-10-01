import React, { useState } from "react";
import { Linking, Text, View, useWindowDimensions } from "react-native";
import { Button, IconButton } from "./ui";
import { useTheme } from "../state/ThemeContext";
import { useParking } from "../state/ParkingContext";
import { currentAvailability, parkingPrice } from "../domain/parking";
import type { ParkingPlace } from "../domain/types";
export default function ParkingPreview({
  place,
  point,
  mapHeight,
  onUpdate,
  onClose,
}: {
  place: ParkingPlace;
  point: { x: number; y: number };
  mapHeight: number;
  onUpdate: () => void;
  onClose: () => void;
}) {
  const { t, language, now } = useParking(),
    { colors } = useTheme(),
    { width } = useWindowDimensions();
  const [height, setHeight] = useState(170),
    [error, setError] = useState("");
  const cardWidth = Math.min(290, width - 24),
    price = parkingPrice(place),
    status = currentAvailability(place.availability, now);
  const left = Math.max(
    12,
    Math.min(width - cardWidth - 12, point.x - cardWidth / 2),
  );
  if (point.x < 0 || point.x > width || point.y < 0 || point.y > mapHeight)
    return null;
  return (
    <View
      accessibilityLabel={t("Parking information", "Информации за паркингот")}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={{
        position: "absolute",
        zIndex: 1050,
        width: cardWidth,
        left,
        top: Math.max(
          128,
          Math.min(mapHeight - height - 45, point.y - height - 18),
        ),
        borderRadius: 16,
        padding: 12,
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderWidth: 1,
        gap: 8,
        boxShadow: "0 4px 18px #10292130",
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: -10,
          left: Math.max(16, Math.min(cardWidth - 34, point.x - left - 10)),
          width: 0,
          height: 0,
          borderLeftWidth: 10,
          borderRightWidth: 10,
          borderTopWidth: 10,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: colors.paper,
        }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text
          numberOfLines={2}
          style={{
            flex: 1,
            color: colors.ink,
            fontSize: 15,
            fontWeight: "700",
          }}
        >
          {place.zoneCode ? place.zoneCode + " · " : ""}
          {language === "en" ? (place.nameEn ?? place.name) : place.name}
        </Text>
        <IconButton
          name="x"
          label={t("Close parking info", "Затвори информации")}
          onPress={onClose}
        />
      </View>
      <Text style={{ color: colors.ink, fontSize: 14 }}>
        {place.kind === "zone" ? t("Tariff zone", "Тарифна зона") : t("Parking", "Паркинг")} · {price
          ? price.firstHour === 0 && price.nextHour === 0
            ? t("Free parking", "Бесплатен паркинг")
            : price.firstHour + t(" MKD / first hour", " ден. / прв час")
          : t("Price unknown", "Непозната цена")}
      </Text>
      {place.kind !== "zone" ? (
        <Text
          style={{
            color:
              status.status === "spaces"
                ? colors.success
                : status.status === "full"
                  ? colors.red
                  : colors.muted,
            fontSize: 12,
            fontWeight: "600",
          }}
        >
          {status.status === "spaces"
            ? t("✓ Spaces recently reported", "✓ Пријавени слободни места")
            : status.status === "full"
              ? t("Full — recently reported", "Полн — неодамнешна пријава")
              : t(
                  "No recent availability report",
                  "Нема неодамнешна пријава за места",
                )}
        </Text>
      ) : place.locationPrecision === "area" ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {t("Approximate zone location", "Приближна локација на зоната")}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Button
          style={{ flex: 1 }}
          title={t("Update info", "Промени инфо")}
          variant="secondary"
          onPress={onUpdate}
        />
        {place.kind !== "zone" ? (
          <Button
            icon="navigation"
            title={t("Go", "Оди")}
            disabled={place.access === "restricted"}
            onPress={() => {
              void Linking.openURL(
                `https://www.google.com/maps/dir/?api=1&destination=${place.coordinate.latitude},${place.coordinate.longitude}&travelmode=driving`,
              ).catch(() =>
                setError(
                  t("Could not open navigation", "Навигацијата не се отвора"),
                ),
              );
            }}
          />
        ) : null}
      </View>
      {error ? (
        <Text style={{ color: colors.red, fontSize: 12 }}>{error}</Text>
      ) : null}
    </View>
  );
}

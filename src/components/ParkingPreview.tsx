import React, { useState } from "react";
import { Animated, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Button, IconButton } from "./ui";
import { useTheme } from "../state/ThemeContext";
import { useParking } from "../state/ParkingContext";
import { currentAvailability, parkingPrice } from "../domain/parking";
import type { ParkingPlace } from "../domain/types";
import DigitalParkingSign from "./DigitalParkingSign";
import { parkingMarker } from "../domain/marker-appearance";
import { parkingPreviewLayout } from "../domain/preview-layout";
import { openParkingDirections } from "../services/navigation";
import { useParkingPopupMotion } from "../hooks/useParkingPopupMotion";
export default function ParkingPreview({
  place,
  point,
  mapHeight,
  drawerHeight,
  onUpdate,
  onClose,
}: {
  place: ParkingPlace;
  point: { x: number; y: number } | null;
  mapHeight: number;
  drawerHeight: number;
  onUpdate: () => void;
  onClose: () => void;
}) {
  const { t, language, now } = useParking(),
    { colors } = useTheme(),
    { width } = useWindowDimensions();
  const [height, setHeight] = useState(0),
    [error, setError] = useState("");
  const price = parkingPrice(place, now),
    status = currentAvailability(place.availability, now);
  const marker = parkingMarker(place, 1, now);
  const layout = parkingPreviewLayout(point ?? { x: 0, y: 0 }, width, mapHeight, drawerHeight, height);
  const positioned = point !== null && height > 0 && layout.visible;
  const motion = useParkingPopupMotion(positioned);
  const visible = positioned && motion.ready;
  return (
    <Animated.View
      accessibilityLabel={t("Parking information", "Информации за паркингот")}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      pointerEvents={visible ? "auto" : "none"}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={[{
        position: "absolute",
        zIndex: 1050,
        width: layout.width,
        left: layout.left,
        top: layout.top,
        borderRadius: 16,
        padding: 12,
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderWidth: 1,
        gap: 8,
        boxShadow: "0 4px 18px #10292130",
      }, motion.style, !visible && { opacity: 0 }]}
    >
      {layout.showArrow ? <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: -10,
          left: layout.arrowLeft,
          width: 0,
          height: 0,
          borderLeftWidth: 10,
          borderRightWidth: 10,
          borderTopWidth: 10,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: colors.paper,
        }}
      /> : null}
      <ScrollView style={{ maxHeight: Math.max(40, mapHeight - drawerHeight - 56), flexGrow: 0 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ minWidth: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: marker.border, backgroundColor: marker.fill, alignItems: "center", justifyContent: "center" }}><Text style={{ color: marker.text, fontWeight: "800" }}>{marker.needsInfo ? "?" : "P"}</Text></View>
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
          {language !== "mk" ? (place.nameEn ?? place.name) : place.name}
        </Text>
        <IconButton
          name="x"
          label={t("Close parking info", "Затвори информации")}
          onPress={onClose}
        />
      </View>
      {marker.needsInfo ? <Text style={{ color: colors.muted, fontSize: 12 }}>{t("Needs review · Add a zone, price or sign", "Треба проверка · Додајте зона, цена или табла")}</Text> : null}
      <Text style={{ color: colors.ink, fontSize: 14 }}>
        {place.kind === "zone" ? t("Tariff zone", "Тарифна зона") : t("Parking", "Паркинг")} · {price
          ? price.firstHour === 0 && price.nextHour === 0
            ? t("Free parking", "Бесплатен паркинг")
            : price.firstHour + t(" MKD / first hour", " ден. / прв час")
          : t("Price unknown", "Непозната цена")}
      </Text>
      {place.signInfo ? <DigitalParkingSign info={place.signInfo} compact /> : null}
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
            ? status.freeSpaces !== undefined ? `${status.freeSpaces} ${t("free recently", "неодамна слободни")}${place.capacity !== null ? ` / ${place.capacity}` : ""}` : t("✓ Spaces recently reported", "✓ Пријавени слободни места")
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
          title={status.status === "full" ? t("Find space nearby", "Најди места блиску") : t("Details & update", "Детали и промени")}
          variant="secondary"
          onPress={onUpdate}
        />
        {place.kind !== "zone" ? (
          <Button
            icon="navigation"
            title={t("Go", "Оди")}
            disabled={place.access === "restricted"}
            onPress={() => {
              setError("");
              void openParkingDirections(place.coordinate).catch(() =>
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
      </ScrollView>
    </Animated.View>
  );
}

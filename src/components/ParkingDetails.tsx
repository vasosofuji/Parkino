import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Icon, Note, Sheet } from "./ui";
import SignPhotos from "./SignPhotos";
import DigitalParkingSign from "./DigitalParkingSign";
import ManualParkingWizard from "./ManualParkingWizard";
import { currentAvailability, nearestAvailableParking, parkingPrice } from "../domain/parking";
import type { Geometry, ParkingPlace } from "../domain/types";
import { useParking } from "../state/ParkingContext";
import { useTheme, type ThemeColors } from "../state/ThemeContext";

export default function ParkingDetails({ place, visible, onClose, onEditBoundary, onSelectAlternative, boundaryGeometry }: {
  place?: ParkingPlace;
  visible: boolean;
  minutes: number;
  onClose: () => void;
  onEditBoundary?: (place: ParkingPlace, geometry?: Geometry) => void;
  onSelectAlternative?: (place: ParkingPlace) => void;
  initialEditing?: boolean;
  boundaryGeometry?: Geometry;
}) {
  const { colors } = useTheme(), s = styles(colors), { catalog, language, t, now } = useParking();
  const [mode, setMode] = useState<"manual" | "photo" | null>(null), [more, setMore] = useState(false);
  const price = place ? parkingPrice(place) : null;
  const availability = currentAvailability(place?.availability, now);
  const alternatives = place && availability.status === "full" ? nearestAvailableParking(catalog.places, place, 1500, now).slice(0, 3) : [];
  const choice = (value: "manual" | "photo", title: string, description: string, icon: "camera" | "edit-2") => <Pressable accessibilityRole="button" style={s.choice} onPress={() => setMode(value)}>
    <Icon name={icon} color={colors.accentText} /><View style={s.flex}><Text style={s.title}>{title}</Text><Note>{description}</Note></View><Icon name="chevron-right" size={18} />
  </Pressable>;
  return <Sheet visible={visible && Boolean(place)} title={place ? `${place.zoneCode ? place.zoneCode + " · " : ""}${language === "en" ? place.nameEn ?? place.name : place.name}` : ""} onClose={onClose}>
    {place ? mode === "manual" ? <ManualParkingWizard place={place} coordinate={place.coordinate} kind={place.kind} geometry={boundaryGeometry ?? place.geometry} onDrawBoundary={onEditBoundary ? value => onEditBoundary(place, value) : undefined} onDone={onClose} onBack={() => setMode(null)} /> : mode === "photo" ? <SignPhotos placeId={place.id} visible={visible} /> : <>
      {choice("photo", t("Photograph a sign", "Фотографирај табла"), t("Take a photo or choose one from your gallery", "Сликајте или изберете слика од галеријата"), "camera")}
      {choice("manual", t("Enter manually", "Внеси рачно"), t("Simple or detailed, one step at a time", "Брзо или детално, чекор по чекор"), "edit-2")}
      {alternatives.length && onSelectAlternative ? <View style={s.list}><Text style={s.title}>{t("Nearby parking with space", "Блиски паркинзи со места")}</Text>{alternatives.map(({ place: alternative, distance }) => <Button key={alternative.id} variant="secondary" icon="map-pin" title={`${language === "en" ? alternative.nameEn ?? alternative.name : alternative.name} · ${Math.round(distance)} m${alternative.availability?.freeSpaces !== undefined ? ` · ${alternative.availability.freeSpaces} ${t("free", "слободни")}` : ""}`} onPress={() => onSelectAlternative(alternative)} />)}</View> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(value => !value)} style={s.disclosure}><Text style={s.label}>{t("Current parking details", "Тековни детали за паркингот")}</Text><Icon name={more ? "chevron-up" : "chevron-down"} size={18} /></Pressable>
      {more ? <>
        <Text style={s.price}>{price ? price.firstHour === 0 && price.nextHour === 0 ? t("Free parking", "Бесплатен паркинг") : `${price.firstHour} ${t("MKD / first hour", "ден. / прв час")}` : t("Price unknown", "Непозната цена")}</Text>
        {place.signInfo ? <DigitalParkingSign info={place.signInfo} sourceName={place.signInfo.sourcePlaceId !== place.id ? place.signInfo.sourcePlaceName : undefined} /> : null}
        {price && price.nextHour !== price.firstHour ? <Note>{price.nextHour} {t("MKD / following hour", "ден. / следен час")}</Note> : null}
        {place.capacity !== null ? <Note>{place.capacity} {t("total spaces", "вкупно места")}</Note> : null}
        {availability.freeSpaces !== undefined ? <Note>{availability.freeSpaces} {t("free recently", "неодамна слободни")}</Note> : null}
        {place.openingHours ? <Note>{place.openingHours}</Note> : null}
        {place.access === "restricted" || place.access === "customers" ? <Note>{place.access === "restricted" ? t("Restricted access", "Ограничен пристап") : t("Customer parking", "Паркинг за клиенти")}</Note> : null}
      </> : null}
    </> : null}
  </Sheet>;
}
const styles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1, gap: 3 }, list: { gap: 10 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "700" }, label: { color: colors.ink, fontSize: 14, fontWeight: "600" }, price: { fontSize: 24, fontWeight: "700", color: colors.ink },
  choice: { minHeight: 78, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  disclosure: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
});

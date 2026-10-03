import { weekendLabel } from "./PaymentScheduleFields";
import React, { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Icon, Note, Sheet, RevealSection } from "./ui";
import SignPhotos from "./SignPhotos";
import SignReviewSheet from "./SignReviewSheet";
import DigitalParkingSign from "./DigitalParkingSign";
import ManualParkingWizard from "./ManualParkingWizard";
import { currentAvailability, nearestAvailableParking, parkingPrice } from "../domain/parking";
import { availabilityReportTime } from "../domain/report-feedback";
import type { Geometry, ParkingPlace, SignPhoto } from "../domain/types";
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
  const [mode, setMode] = useState<"manual" | "photo" | null>(null), [more, setMore] = useState(true);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [review, setReview] = useState<SignPhoto | null>(null), [reviewShown, setReviewShown] = useState(false), [returningFromReview, setReturningFromReview] = useState(false);
  const sourcePresented = useRef(false);
  function openReview(photo: SignPhoto) { setReviewShown(Platform.OS !== "ios" || !sourcePresented.current); setReturningFromReview(false); setReview(photo); }
  function closeReview() {
    if (Platform.OS === "ios") { setReturningFromReview(true); setReviewShown(false); }
    else { setReview(null); setReviewShown(false); }
  }
  const price = place ? parkingPrice(place, now) : null;
  const availability = currentAvailability(place?.availability, now);
  const reportedAt = availabilityReportTime(place?.availability, language, now);
  const alternatives = place && availability.status === "full" ? nearestAvailableParking(catalog.places, place, 1500, now).slice(0, 3) : [];
  const choice = (value: "manual" | "photo", title: string, description: string, icon: "camera" | "edit-2") => <Pressable accessibilityRole="button" accessibilityLabel={title} style={s.choice} onPress={() => setMode(value)}>
    <View pointerEvents="none" style={s.choiceContent}><Icon name={icon} color={colors.accentText} /><View style={s.flex}><Text style={s.title}>{title}</Text><Note>{description}</Note></View><Icon name="chevron-right" size={18} /></View>
  </Pressable>;
  return <><Sheet visible={visible && Boolean(place) && !review} title={mode === "photo" ? t("Parking sign photo", "Слика од паркинг табла") : place ? `${place.zoneCode ? place.zoneCode + " · " : ""}${language === "en" ? place.nameEn ?? place.name : place.name}` : ""} onClose={() => { if (!photoBusy) onClose(); }} onBack={mode ? () => setMode(null) : undefined} backDisabled={photoBusy}
    onShow={() => { sourcePresented.current = true; setMore(true); }} onDismiss={() => { sourcePresented.current = false; if (review && !returningFromReview) setReviewShown(true); }}>
    {place ? mode === "manual" ? <ManualParkingWizard place={place} coordinate={place.coordinate} kind={place.kind} geometry={place.geometry} returnedGeometry={boundaryGeometry} onDrawBoundary={onEditBoundary ? value => onEditBoundary(place, value) : undefined} onDone={onClose} onBack={() => setMode(null)} /> : mode === "photo" ? <SignPhotos placeId={place.id} visible={visible && !review} onCancel={() => setMode(null)} onBusyChange={setPhotoBusy} onReview={openReview} /> : <>
      {choice("photo", t("Photograph a sign", "Фотографирај табла"), t("Take a photo or choose one from your gallery", "Сликајте или изберете слика од галеријата"), "camera")}
      {choice("manual", t("Enter manually", "Внеси рачно"), t("Simple or detailed, one step at a time", "Брзо или детално, чекор по чекор"), "edit-2")}
      {alternatives.length && onSelectAlternative ? <View style={s.list}><Text style={s.title}>{t("Nearby parking with space", "Блиски паркинзи со места")}</Text>{alternatives.map(({ place: alternative, distance }) => <Button key={alternative.id} variant="secondary" icon="map-pin" title={`${language === "en" ? alternative.nameEn ?? alternative.name : alternative.name} · ${Math.round(distance)} m${alternative.availability?.freeSpaces !== undefined ? ` · ${alternative.availability.freeSpaces} ${t("free", "слободни")}` : ""}`} onPress={() => onSelectAlternative(alternative)} />)}</View> : null}
      <RevealSection active={more}>
      <Pressable accessibilityRole="button" aria-expanded={more} accessibilityState={{ expanded: more }} onPress={() => setMore(value => !value)} style={s.disclosure}><Text style={s.label}>{t("Current parking details", "Тековни детали за паркингот")}</Text><Icon name={more ? "chevron-up" : "chevron-down"} size={18} /></Pressable>
      {more ? <>
        <Text style={s.price}>{price ? price.firstHour === 0 && price.nextHour === 0 ? t("Free parking", "Бесплатен паркинг") : `${price.firstHour} ${t("MKD / first hour", "ден. / прв час")}` : t("Price unknown", "Непозната цена")}</Text>
        {place.signInfo ? <DigitalParkingSign info={place.signInfo} sourceName={place.signInfo.sourcePlaceId !== place.id ? place.signInfo.sourcePlaceName : undefined} /> : null}
        {price && price.nextHour !== price.firstHour ? <Note>{price.nextHour} {t("MKD / following hour", "ден. / следен час")}</Note> : null}
        {place.capacity !== null ? <Note>{place.capacity} {t("total spaces", "вкупно места")}</Note> : null}
        {availability.status === "spaces" || availability.status === "full" ? <Note>{availability.status === "spaces" ? availability.freeSpaces !== undefined ? `${availability.freeSpaces} ${t("free spaces", "слободни места")}` : t("Spaces available", "Има места") : t("Full", "Полн")}{reportedAt ? ` · ${t("Reported at", "Пријавено во")} ${reportedAt}` : ""}</Note> : null}
        {place.paymentSchedule ? <View style={{ gap: 4 }}><Note>{t("Paying hours", "Часови на наплата")}: {place.paymentSchedule.chargingHours || t("Not sure", "Не знам")}</Note>{place.paymentSchedule.freeWeekends ? <Note>{weekendLabel(place.paymentSchedule.freeWeekends, t)}</Note> : null}</View> : null}
        {place.openingHours ? <Note>{place.openingHours}</Note> : null}
        {place.access === "restricted" || place.access === "customers" ? <Note>{place.access === "restricted" ? t("Restricted access", "Ограничен пристап") : t("Customer parking", "Паркинг за клиенти")}</Note> : null}
      </> : null}
      </RevealSection>
    </> : null}
  </Sheet>{review ? <SignReviewSheet key={review.id} initialPhoto={review} visible={visible && reviewShown} onClose={closeReview} onConfirmed={closeReview} onDismiss={() => { if (returningFromReview) { setReview(null); setReturningFromReview(false); } }} /> : null}</>;
}
const styles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1, gap: 3 }, list: { gap: 10 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "700" }, label: { color: colors.ink, fontSize: 14, fontWeight: "600" }, price: { fontSize: 24, fontWeight: "700", color: colors.ink },
  choice: { minHeight: 78, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  choiceContent: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  disclosure: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
});

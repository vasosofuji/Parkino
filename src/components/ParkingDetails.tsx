import React, { useState } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Button, Note, Sheet } from "./ui";
import SignPhotos from "./SignPhotos";
import {
  currentAvailability,
  normalizeZoneCode,
  parkingPrice,
} from "../domain/parking";
import type { ParkingPlace } from "../domain/types";
import { useParking } from "../state/ParkingContext";
import { useTheme, type ThemeColors } from "../state/ThemeContext";
import { api } from "../services/api";
export default function ParkingDetails({
  place,
  visible,
  onClose,
  onEditBoundary,
  initialEditing = false,
}: {
  place?: ParkingPlace;
  visible: boolean;
  minutes: number;
  onClose: () => void;
  onEditBoundary?: (place: ParkingPlace) => void;
  initialEditing?: boolean;
}) {
  const { colors } = useTheme(),
    s = styles(colors),
    { language, t, now, connected, refresh } = useParking();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState(initialEditing),
    [more, setMore] = useState(false);
  const [first, setFirst] = useState(""),
    [next, setNext] = useState(""),
    [code, setCode] = useState(place?.zoneCode ?? "");
  async function save() {
    if (!place) return;
    const a = first.trim() ? Number(first.replace(",", ".")) : null,
      b = next.trim() ? Number(next.replace(",", ".")) : a;
    if (
      (a !== null && (!Number.isFinite(a) || a < 0 || a > 10000)) ||
      (b !== null && (!Number.isFinite(b) || b < 0 || b > 10000))
    ) {
      setMessage(
        t(
          "Enter a price from 0 to 10,000 MKD.",
          "Внесете цена од 0 до 10.000 денари.",
        ),
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (a !== null) await api.price(place.id, a, b ?? a);
      if (code.trim() && normalizeZoneCode(code) !== place.zoneCode)
        await api.label(place.id, normalizeZoneCode(code));
      await refresh();
      setEditing(false);
      setMessage(t("Changes shared", "Промените се споделени"));
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : t(
              "Could not save. Try again.",
              "Не е зачувано. Обидете се повторно.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function report(status: "spaces" | "full") {
    if (!place) return;
    setBusy(true);
    try {
      await api.report(place.id, status);
      await refresh();
      setMessage(t("Report shared", "Пријавата е споделена"));
    } catch {
      setMessage(
        t("Could not send. Try again.", "Не е испратено. Обидете се повторно."),
      );
    } finally {
      setBusy(false);
    }
  }
  const open = (url: string) =>
    void Linking.openURL(url).catch(() =>
      setMessage(t("Could not open link", "Врската не се отвора")),
    );
  const price = place ? parkingPrice(place) : null,
    availability = currentAvailability(place?.availability, now);
  return (
    <Sheet
      visible={visible && Boolean(place)}
      footer={
        editing && place ? (
          <View style={s.buttons}>
            <Button
              title={t("Cancel", "Откажи")}
              variant="secondary"
              disabled={busy}
              onPress={() => setEditing(false)}
            />
            <Button
              style={s.flex}
              title={
                busy
                  ? t("Saving…", "Се зачувува…")
                  : t("Share changes", "Сподели промени")
              }
              disabled={
                busy ||
                !connected ||
                (!first.trim() &&
                  (!code.trim() ||
                    normalizeZoneCode(code) === (place.zoneCode ?? "")))
              }
              onPress={() => void save()}
            />
          </View>
        ) : null
      }
      title={
        place
          ? `${place.zoneCode ? place.zoneCode + " · " : ""}${language === "en" ? (place.nameEn ?? place.name) : place.name}`
          : ""
      }
      onClose={onClose}
    >
      {place ? (
        <>
          {!editing ? (
            <>
              {place.operator ? (
                <Note>
                  {place.operator === "gradski"
                    ? "ЈП Градски паркинг"
                    : place.operator === "poc"
                      ? "ПОЦ · Паркинзи на Општина Центар"
                      : place.operator}
                </Note>
              ) : place.verification === "community" ? (
                <Note>{t("Community location", "Локација од заедницата")}</Note>
              ) : null}
              <Text style={s.price}>
                {price
                  ? price.firstHour === 0 && price.nextHour === 0
                    ? t("Free parking", "Бесплатен паркинг")
                    : `${price.firstHour} ${t("MKD / first hour", "ден. / прв час")}`
                  : t(
                      "Price not reported yet",
                      "Цената сè уште не е пријавена",
                    )}
              </Text>
              {price ? (
                <Note>
                  {price.evidence === "official"
                    ? t("Published tariff", "Објавена тарифа")
                    : price.evidence === "sign"
                      ? t("Read from sign · AI", "Прочитано од таблата · AI")
                      : t("Driver report", "Пријава од возач")}
                  {price.nextHour !== price.firstHour
                    ? ` · ${price.nextHour} ${t("MKD / next hour", "ден. / следен час")}`
                    : ""}
                </Note>
              ) : null}
              {place.zoneCodeEvidence ? (
                <Note>
                  {t("Zone label", "Ознака на зона")} ·{" "}
                  {place.zoneCodeEvidence === "sign"
                    ? t("Read from sign · AI", "Прочитано од таблата · AI")
                    : t("Driver report", "Пријава од возач")}
                </Note>
              ) : null}
              {place.locationPrecision === "area" ? (
                <Note>
                  {t(
                    "Approximate zone location",
                    "Приближна локација на зоната",
                  )}
                </Note>
              ) : null}
              {place.kind !== "zone" ? (
                <>
                  {availability.status !== "unknown" ? (
                    <Note>
                      {availability.status === "spaces"
                        ? t(
                            "Spaces recently reported",
                            "Неодамна пријавени слободни места",
                          )
                        : availability.status === "full"
                          ? t(
                              "Recently reported full",
                              "Неодамна пријавен полн",
                            )
                          : t(
                              "Availability reports disagree",
                              "Пријавите се разликуваат",
                            )}
                    </Note>
                  ) : null}
                  {place.locationReports?.no ? (
                    <Note>
                      {place.locationReports.no}{" "}
                      {t(
                        "reports of no parking here",
                        "пријави дека тука нема паркинг",
                      )}
                    </Note>
                  ) : null}
                  <Button
                    title={t("Navigate", "Навигација")}
                    icon="navigation"
                    disabled={place.access === "restricted"}
                    onPress={() =>
                      open(
                        `https://www.google.com/maps/dir/?api=1&destination=${place.coordinate.latitude},${place.coordinate.longitude}&travelmode=driving`,
                      )
                    }
                  />
                </>
              ) : null}
              <Pressable
                accessibilityRole="button"
                style={s.link}
                onPress={() => {
                  setEditing((v) => !v);
                  setMessage("");
                }}
              >
                <Text style={s.linkText}>
                  {editing
                    ? t("Cancel edit", "Откажи промена")
                    : t("Edit price or zone", "Промени цена или зона")}
                </Text>
              </Pressable>
            </>
          ) : null}
          {editing ? (
            <View style={s.form}>
              {onEditBoundary ? (
                <Button
                  title={place.kind === "zone" ? t("Edit tariff zone boundary", "Промени граници на тарифна зона") : place.geometry ? t("Edit parking perimeter", "Промени периметар на паркинг") : t("Set parking perimeter", "Постави периметар на паркинг")}
                  variant="secondary"
                  onPress={() => onEditBoundary(place)}
                />
              ) : null}
              <Text style={s.meta}>{t("Zone label", "Ознака на зона")}</Text>
              <TextInput
                accessibilityLabel={t("Zone label", "Ознака на зона")}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                maxLength={16}
                style={s.input}
                placeholder="B2, A0…"
                placeholderTextColor={colors.muted}
              />
              <View style={s.buttons}>
                <View style={s.flex}>
                  <Text style={s.meta}>
                    {t("MKD / first hour", "ден. / прв час")}
                  </Text>
                  <TextInput
                    accessibilityLabel={t(
                      "First hour price in MKD",
                      "Цена за прв час во денари",
                    )}
                    keyboardType="decimal-pad"
                    value={first}
                    onChangeText={setFirst}
                    style={s.input}
                    placeholder={String(price?.firstHour ?? "—")}
                    placeholderTextColor={colors.muted}
                  />
                </View>
                <View style={s.flex}>
                  <Text style={s.meta}>
                    {t("Following hour", "Следен час")}
                  </Text>
                  <TextInput
                    accessibilityLabel={t(
                      "Following hour price in MKD",
                      "Цена за следен час во денари",
                    )}
                    keyboardType="decimal-pad"
                    value={next}
                    onChangeText={setNext}
                    style={s.input}
                    placeholder={first || String(price?.nextHour ?? "—")}
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>
              <Button
                title={t("Free parking", "Бесплатен паркинг")}
                variant="secondary"
                onPress={() => {
                  setFirst("0");
                  setNext("0");
                }}
              />
              <SignPhotos placeId={place.id} />
            </View>
          ) : null}
          {message ? <Note>{message}</Note> : null}
          {!editing ? (
            <>
              <SignPhotos placeId={place.id} />
              {place.signInfo ? (
                <View style={s.form}>
                  <Text style={s.meta}>
                    {t("From the sign · AI", "Од таблата · AI")}
                  </Text>
                  {place.signInfo.chargingHours ? (
                    <Text style={s.body}>{place.signInfo.chargingHours}</Text>
                  ) : null}
                  {place.signInfo.paymentInstructions ? (
                    <Text selectable style={s.body}>
                      {place.signInfo.paymentInstructions}
                    </Text>
                  ) : null}
                  {place.signInfo.restrictions ? (
                    <Text style={s.body}>{place.signInfo.restrictions}</Text>
                  ) : null}
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                style={s.link}
                onPress={() => setMore((v) => !v)}
              >
                <Text style={s.linkText}>
                  {more
                    ? t("Less", "Помалку")
                    : t("Details & reports", "Детали и пријави")}
                </Text>
              </Pressable>
              {more ? (
                <>
                  {place.kind !== "zone" ? (
                    <View style={s.buttons}>
                      <Button
                        style={s.flex}
                        title={t("Spaces available", "Има места")}
                        variant="secondary"
                        disabled={
                          busy || !connected || place.access === "restricted"
                        }
                        onPress={() => void report("spaces")}
                      />
                      <Button
                        style={s.flex}
                        title={t("Full", "Полн")}
                        variant="secondary"
                        disabled={
                          busy || !connected || place.access === "restricted"
                        }
                        onPress={() => void report("full")}
                      />
                    </View>
                  ) : null}
                  {place.tariff ? (
                    <Note>
                      {t("Published tariff", "Објавена тарифа")}:{" "}
                      {place.tariff.firstHour} / {place.tariff.nextHour}{" "}
                      {t("MKD, first / next hour", "ден., прв / следен час")}
                      {place.tariff.maxStayMinutes
                        ? ` · ${place.tariff.maxStayMinutes} min`
                        : ""}
                    </Note>
                  ) : null}
                  {place.openingHours ? (
                    <Note>{place.openingHours}</Note>
                  ) : null}
                  {place.capacity ? (
                    <Note>
                      {place.capacity} {t("spaces", "места")}
                    </Note>
                  ) : null}
                  {place.access === "restricted" ||
                  place.access === "customers" ? (
                    <Note>
                      {place.access === "restricted"
                        ? t("Restricted access", "Ограничен пристап")
                        : t("Customer parking", "Паркинг за клиенти")}
                    </Note>
                  ) : null}
                  {place.source.url ? (
                    <Pressable
                      accessibilityRole="link"
                      style={s.link}
                      onPress={() => open(place.source.url)}
                    >
                      <Text style={s.linkText}>
                        {t("Location source", "Извор на локацијата")}
                      </Text>
                    </Pressable>
                  ) : null}
                  {place.tariff?.source.url ? (
                    <Pressable
                      accessibilityRole="link"
                      style={s.link}
                      onPress={() => open(place.tariff!.source.url)}
                    >
                      <Text style={s.linkText}>
                        {t(
                          "Published price source",
                          "Извор на објавената цена",
                        )}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
          {!connected ? (
            <Note>
              {t("Connect to share reports", "Поврзете се за пријави")}
            </Note>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    meta: { color: colors.muted, fontSize: 13, lineHeight: 20 },
    body: { color: colors.ink, fontSize: 14, lineHeight: 21 },
    price: { fontSize: 27, fontWeight: "700", color: colors.ink },
    link: { paddingVertical: 12, minHeight: 44 },
    linkText: { color: colors.green, fontSize: 14, fontWeight: "600" },
    form: { gap: 12 },
    input: {
      borderColor: colors.line,
      borderWidth: 1,
      borderRadius: 10,
      padding: 13,
      fontSize: 16,
      color: colors.ink,
      backgroundColor: colors.input,
      minHeight: 48,
    },
    buttons: { flexDirection: "row", gap: 10 },
    flex: { flex: 1, gap: 6 },
  });

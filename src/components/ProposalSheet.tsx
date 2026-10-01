import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { Button, Note, Sheet } from "./ui";
import PhotoPicker from "./PhotoPicker";
import { type ChosenPhoto } from "../services/photos";
import { normalizeZoneCode } from "../domain/parking";
import type { Coordinate, Geometry, ParkingKind } from "../domain/types";
import { useParking } from "../state/ParkingContext";
import { useTheme, type ThemeColors } from "../state/ThemeContext";
import { api } from "../services/api";
export default function ProposalSheet({
  coordinate,
  geometry,
  onClose,
  onSubmitted,
  initial,
  locationAccuracy,
}: {
  coordinate: Coordinate;
  geometry?: Geometry;
  onClose: () => void;
  onSubmitted: (id: string) => void;
  initial?: { name?: string; zoneCode?: string };
  locationAccuracy?: number;
}) {
  const { t, connected, refresh } = useParking(),
    { colors } = useTheme(),
    s = styles(colors);
  const [requestId] = useState(randomUUID),
    [savedId, setSavedId] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? ""),
    [code, setCode] = useState(initial?.zoneCode ?? ""),
    [first, setFirst] = useState(""),
    [next, setNext] = useState("");
  const [kind, setKind] = useState<ParkingKind>(geometry ? "zone" : "surface"),
    [photo, setPhoto] = useState<ChosenPhoto | null>(null);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  async function submit() {
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
    let id = savedId;
    try {
      if (!id) {
        const place = await api.contribute({
          requestId,
          name:
            name.trim() ||
            `${t("Parking zone", "Паркинг зона")} ${normalizeZoneCode(code)}`,
          coordinate,
          kind,
          geometry,
          zoneCode: code ? normalizeZoneCode(code) : null,
          firstHour: a,
          nextHour: b,
        });
        id = place.id;
        setSavedId(id);
      }
      if (photo) await api.uploadSign(id, photo);
      await refresh();
      onClose();
      onSubmitted(id);
    } catch (error) {
      setMessage(
        (id
          ? t(
              "Parking saved. Photo not uploaded. Retry or remove the photo. ",
              "Паркингот е зачуван. Обидете се повторно со сликата. ",
            )
          : "") +
          (error instanceof Error
            ? error.message
            : t("Could not save.", "Не е зачувано.")),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      visible
      footer={
        <Button
          title={
            busy
              ? t("Saving…", "Се зачувува…")
              : savedId
                ? t("Retry upload", "Повтори прикачување")
                : t("Save to map", "Зачувај на мапа")
          }
          disabled={
            busy ||
            photoBusy ||
            !connected ||
            (!savedId && name.trim().length < 3 && !(geometry && code.trim()))
          }
          onPress={() => void submit()}
        />
      }
      title={
        geometry
          ? t("Add parking zone", "Додај паркинг зона")
          : t("Add missing parking", "Додај паркинг што недостасува")
      }
      onClose={() => {
        if (!busy) {
          if (savedId) void refresh();
          onClose();
        }
      }}
    >
      {locationAccuracy !== undefined ? (
        <Note>
          {t("Current location", "Тековна локација")} · ±
          {Math.ceil(locationAccuracy)} m
        </Note>
      ) : null}
      <View style={{ gap: 4 }}>
        <Text style={s.label}>{t("Name", "Име")}</Text>
        <TextInput
          style={s.input}
          accessibilityLabel={t("Parking name", "Име на паркингот")}
          placeholderTextColor={colors.muted}
          placeholder={
            geometry
              ? t("Zone name (optional)", "Име на зона (опционално)")
              : t("Parking name", "Име на паркингот")
          }
          value={name}
          onChangeText={setName}
          maxLength={100}
          editable={!savedId && !busy}
        />
      </View>
      {!geometry ? (
        <View style={s.filters}>
          {(["surface", "garage", "street"] as const).map((value) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: kind === value }}
              disabled={Boolean(savedId) || busy}
              key={value}
              style={[
                s.filter,
                kind === value && {
                  backgroundColor: colors.mint,
                  borderColor: colors.green,
                },
              ]}
              onPress={() => setKind(value)}
            >
              <Text style={s.label}>
                {value === "garage"
                  ? t("Garage", "Гаража")
                  : value === "street"
                    ? t("Street", "Уличен")
                    : t("Outdoor", "Отворен")}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={{ gap: 4 }}>
        <Text style={s.label}>{t("Zone label", "Ознака на зона")}</Text>
        <TextInput
          accessibilityLabel={t("Zone label", "Ознака на зона")}
          style={s.input}
          placeholder="B2, A0, D42…"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          value={code}
          onChangeText={setCode}
          maxLength={16}
          editable={!savedId && !busy}
        />
      </View>
      <View style={s.filters}>
        <View style={s.flex}>
          <Text style={s.label}>{t("MKD / first hour", "ден. / прв час")}</Text>
          <TextInput
            accessibilityLabel={t("First hour price", "Цена за прв час")}
            style={s.input}
            placeholder={t("Unknown", "Непознато")}
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            value={first}
            onChangeText={setFirst}
            editable={!savedId && !busy}
          />
        </View>
        <View style={s.flex}>
          <Text style={s.label}>{t("Following hour", "Следен час")}</Text>
          <TextInput
            accessibilityLabel={t("Following hour price", "Цена за следен час")}
            style={s.input}
            placeholder={first || "—"}
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            value={next}
            onChangeText={setNext}
            editable={!savedId && !busy}
          />
        </View>
      </View>
      <Button
        title={t("Free parking", "Бесплатен паркинг")}
        variant="secondary"
        disabled={Boolean(savedId) || busy}
        onPress={() => {
          setFirst("0");
          setNext("0");
        }}
      />
      <PhotoPicker
        value={photo}
        onChange={setPhoto}
        disabled={busy}
        onBusyChange={setPhotoBusy}
      />
      {photo ? (
        <Note>
          {t(
            "Photo shared publicly; sign details read automatically.",
            "Сликата е јавна; податоците се читаат автоматски.",
          )}
        </Note>
      ) : null}
      {!connected ? (
        <Note>
          {t("Connect to save your report.", "Поврзете се за да зачувате.")}
        </Note>
      ) : null}
      {message ? <Note>{message}</Note> : null}
    </Sheet>
  );
}
const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    label: { fontSize: 13, color: colors.ink, fontWeight: "600" },
    input: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      padding: 12,
      color: colors.ink,
      backgroundColor: colors.input,
      fontSize: 16,
    },
    filters: { flexDirection: "row", gap: 8 },
    filter: {
      minHeight: 44,
      paddingHorizontal: 16,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
    },
    flex: { flex: 1, gap: 4 },
  });

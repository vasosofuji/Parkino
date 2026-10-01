import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { api } from "../services/api";
import { type ChosenPhoto } from "../services/photos";
import type { SignPhoto } from "../domain/types";
import { useParking } from "../state/ParkingContext";
import { useTheme } from "../state/ThemeContext";
import { Button, Note, Sheet } from "./ui";
import PhotoPicker from "./PhotoPicker";
import DigitalParkingSign from "./DigitalParkingSign";
export default function SignPhotos({ placeId, visible = true, onCancel, onBusyChange, onReview }: { placeId: string; visible?: boolean; onCancel?: () => void; onBusyChange?: (busy: boolean) => void; onReview: (photo: SignPhoto) => void }) {
  const { t, refresh } = useParking(),
    { colors } = useTheme();
  const [photos, setPhotos] = useState<SignPhoto[]>([]),
    [chosen, setChosen] = useState<ChosenPhoto | null>(null),
    [view, setView] = useState<SignPhoto | null>(null);
  const { height } = useWindowDimensions();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [version, setVersion] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const reviewAfterView = useRef<SignPhoto | null>(null);
  useEffect(() => { onBusyChange?.(busy || photoBusy); return () => onBusyChange?.(false); }, [busy, photoBusy, onBusyChange]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let previous = "";
    async function load() {
      try {
        const result = await api.signs(placeId);
        if (cancelled) return;
        const status = result.map((p) => p.id + p.status + p.confirmedAt).join();
        setPhotos(result);
        if (previous && previous !== status) void refresh();
        previous = status;
        const pending = result.some((p) =>
          ["queued", "processing"].includes(p.status),
        );
        timer = setTimeout(() => void load(), pending ? 3000 : 15000);
      } catch {
        if (!cancelled) {
          setMessage(t("Photos could not load.", "Сликите не се вчитани."));
          timer = setTimeout(() => void load(), 15000);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placeId, version, refresh, t]);
  async function upload() {
    if (!chosen || busy || photoBusy) return;
    setBusy(true);
    setMessage("");
    try {
      const uploaded = await api.uploadSign(placeId, chosen);
      onReview(uploaded);
      setChosen(null);
      setVersion((v) => v + 1);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  const status = (p: SignPhoto) =>
    p.confirmedAt ? t("Confirmed digital sign", "Потврдена дигитална табла") : p.status === "ready"
      ? t("Check sign details", "Проверете ја таблата")
      : p.status === "review"
        ? t(
            "Check photo · unclear details",
            "Проверете ја сликата · нејасни детали",
          )
        : p.status === "waiting"
          ? t(
              "Photo saved · reading pending",
              "Сликата е зачувана · чека читање",
            )
          : p.status === "failed"
            ? t(
                "Photo saved · could not read",
                "Сликата е зачувана · не е прочитана",
              )
            : t("Reading sign…", "Се чита таблата…");
  return (
    <View style={{ gap: 12 }}>
      <PhotoPicker value={chosen} onChange={setChosen} disabled={busy} onBusyChange={setPhotoBusy} onCancel={onCancel} />
      {chosen ? <Button title={busy ? t("Uploading…", "Се прикачува…") : t("Read sign & review", "Прочитај и провери табла")} disabled={busy || photoBusy} onPress={() => void upload()} /> : null}
      {photos.length ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          horizontal
          contentContainerStyle={{ gap: 12 }}
        >
          {photos.map((p) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                "View parking sign",
                "Погледни паркинг табла",
              )}
              key={p.id}
              onPress={() => { if (p.uploadedByMe && !p.confirmedAt) onReview(p); else setView(p); }}
              style={{ width: 112, gap: 6 }}
            >
              <Image
                source={{ uri: api.imageUrl(p.id) }}
                style={{
                  height: 80,
                  width: 112,
                  borderRadius: 10,
                  backgroundColor: colors.mint,
                }}
                resizeMode="cover"
              />
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {status(p)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {message ? <Note>{message}</Note> : null}
      <Sheet
        visible={Boolean(view) && visible}
        onDismiss={() => { if (reviewAfterView.current) { const photo = reviewAfterView.current; reviewAfterView.current = null; onReview(photo); } }}
        title={t("Parking sign", "Паркинг табла")}
        onClose={() => setView(null)}
      >
        {view ? (
          <>
            <Image
              source={{ uri: api.imageUrl(view.id) }}
              style={{ height: Math.min(280, height * 0.4), width: "100%" }}
              resizeMode="contain"
            />
            <Note>{status(view)}</Note>
            {view.info ? <DigitalParkingSign info={view.info} preview={!view.confirmedAt} /> : null}
            {view.uploadedByMe ? <Button title={t("Review or correct details", "Провери или поправи податоци")} variant="secondary" onPress={() => { if (Platform.OS === "ios") reviewAfterView.current = view; else onReview(view); setView(null); }} /> : null}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

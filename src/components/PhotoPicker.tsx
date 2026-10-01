import React, { useEffect, useRef, useState } from "react";
import { Image, Linking, Platform, View } from "react-native";
import { Button, IconButton, Note, Sheet } from "./ui";
import { chooseSignPhoto, PhotoPermissionError, type ChosenPhoto } from "../services/photos";
import { useParking } from "../state/ParkingContext";
export default function PhotoPicker({
  value,
  onChange,
  disabled = false,
  onBusyChange,
  visible = true,
}: {
  value: ChosenPhoto | null;
  onChange: (photo: ChosenPhoto | null) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  visible?: boolean;
}) {
  const { t } = useParking();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [permissionBlocked, setPermissionBlocked] = useState(false),
    [choosing, setChoosing] = useState(false);
  const pendingCamera = useRef<boolean | null>(null);
  const launching = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pendingCamera.current = null; onBusyChange?.(false); };
  }, [onBusyChange]);
  function release() {
    launching.current = false;
    if (mounted.current) { setBusy(false); onBusyChange?.(false); }
  }
  async function pick(camera: boolean) {
    setError("");
    setPermissionBlocked(false);
    try {
      const photo = await chooseSignPhoto(camera);
      if (photo && mounted.current) onChange(photo);
    } catch (e) {
      if (!mounted.current) return;
      setPermissionBlocked(e instanceof PhotoPermissionError && e.blocked);
      setError(
        e instanceof PhotoPermissionError
          ? t("Allow camera access to take a photo, or choose one from your gallery.", "Дозволете пристап до камерата или изберете слика од галеријата.")
          : e instanceof Error
          ? e.message
          : t("Could not open photo.", "Сликата не се отвора."),
      );
    } finally {
      release();
    }
  }
  function requestPick(camera: boolean) {
    if (launching.current || disabled) return;
    launching.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setChoosing(false);
    if (Platform.OS === "ios") pendingCamera.current = camera;
    else void pick(camera);
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {value ? (
          <Image
            source={{ uri: value.uri }}
            accessibilityLabel={t(
              "Selected parking sign",
              "Избрана паркинг табла",
            )}
            style={{ width: 64, height: 64, borderRadius: 10 }}
            resizeMode="cover"
          />
        ) : null}
        <Button
          style={{ flex: 1 }}
          title={
            busy
              ? t("Opening…", "Се отвора…")
              : value
                ? t("Change photo", "Смени слика")
                : t("Add sign photo", "Додај слика од табла")
          }
          icon="camera"
          variant="secondary"
          disabled={busy || disabled}
          onPress={() => setChoosing(true)}
        />
        {value && !busy && !disabled ? (
          <IconButton
            name="x"
            label={t("Remove photo", "Отстрани слика")}
            onPress={() => onChange(null)}
          />
        ) : null}
      </View>
      <Sheet visible={choosing && visible} title={t("Parking sign photo", "Слика од паркинг табла")} onClose={() => setChoosing(false)} onDismiss={() => {
        if (pendingCamera.current !== null) {
          const camera = pendingCamera.current;
          pendingCamera.current = null;
          if (visible && mounted.current) void pick(camera);
          else release();
        }
      }}>
        <Note>{t("Capture the whole sign so prices and hours are readable.", "Фотографирајте ја целата табла за цените и часовите да се читливи.")}</Note>
        <View style={{ gap: 10 }}>
          <Button
            icon="camera"
            title={t("Take photo", "Фотографирај")}
            variant="secondary"
            disabled={busy}
            onPress={() => requestPick(true)}
          />
          <Button
            icon="image"
            title={t("Open gallery", "Отвори галерија")}
            variant="secondary"
            disabled={busy}
            onPress={() => requestPick(false)}
          />
          <Button title={t("Cancel", "Откажи")} variant="secondary" onPress={() => setChoosing(false)} />
        </View>
      </Sheet>
      {error ? <Note>{error}</Note> : null}
      {permissionBlocked ? <Button title={t("Open camera settings", "Отвори поставки за камерата")} variant="secondary" onPress={() => { void Linking.openSettings().catch(() => setError(t("Open this app's permissions in your phone settings.", "Отворете ги дозволите за апликацијата во поставките на телефонот."))); }} /> : null}
    </View>
  );
}

import React, { useState } from "react";
import { ActionSheetIOS, Alert, Image, View, Platform } from "react-native";
import { Button, IconButton, Note } from "./ui";
import { chooseSignPhoto, type ChosenPhoto } from "../services/photos";
import { useParking } from "../state/ParkingContext";
export default function PhotoPicker({
  value,
  onChange,
  disabled = false,
  onBusyChange,
}: {
  value: ChosenPhoto | null;
  onChange: (photo: ChosenPhoto | null) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t } = useParking();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [choosing, setChoosing] = useState(false);
  async function pick(camera: boolean) {
    setChoosing(false);
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const photo = await chooseSignPhoto(camera);
      if (photo) onChange(photo);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("Could not open photo.", "Сликата не се отвора."),
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  function choose() {
    const camera = t("Take photo", "Фотографирај"),
      gallery = t("Open gallery", "Отвори галерија"),
      cancel = t("Cancel", "Откажи");
    if (Platform.OS === "ios")
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t("Parking sign photo", "Слика од паркинг табла"),
          options: [camera, gallery, cancel],
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index < 2) void pick(index === 0);
        },
      );
    else if (Platform.OS === "android")
      Alert.alert(
        t("Parking sign photo", "Слика од паркинг табла"),
        undefined,
        [
          { text: camera, onPress: () => void pick(true) },
          { text: gallery, onPress: () => void pick(false) },
          { text: cancel, style: "cancel" },
        ],
      );
    else setChoosing((v) => !v);
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
          onPress={choose}
        />
        {value && !busy && !disabled ? (
          <IconButton
            name="x"
            label={t("Remove photo", "Отстрани слика")}
            onPress={() => onChange(null)}
          />
        ) : null}
      </View>
      {choosing ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            style={{ flex: 1 }}
            icon="camera"
            title={t("Take photo", "Фотографирај")}
            variant="secondary"
            onPress={() => void pick(true)}
          />
          <Button
            style={{ flex: 1 }}
            icon="image"
            title={t("Open gallery", "Отвори галерија")}
            variant="secondary"
            onPress={() => void pick(false)}
          />
        </View>
      ) : null}
      {error ? <Note>{error}</Note> : null}
    </View>
  );
}

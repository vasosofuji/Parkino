import React from "react";
import { Linking, Platform } from "react-native";
import { Button, Note, Sheet } from "./ui";
import { useParking } from "../state/ParkingContext";
import type { LocationIssue } from "../domain/locationWatch";
export default function LocationHelp({
  visible,
  issue,
  onClose,
  onRetry,
  permissions = false,
}: {
  visible: boolean;
  permissions?: boolean;
  issue: LocationIssue | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { t } = useParking();
  const blocked = issue?.code === "denied" || issue?.code === "blocked";
  const message = blocked
    ? Platform.OS === "web"
      ? t(
          "Allow location for this site in your browser settings, then try again.",
          "Дозволете локација за оваа страница во поставките на прелистувачот, па обидете се повторно.",
        )
      : t(
          "Allow location while using the app and enable Precise Location in your phone’s settings.",
          "Дозволете локација додека ја користите апликацијата и вклучете прецизна локација во поставките.",
        )
    : issue?.code === "services-off"
      ? t(
          "Location Services are switched off. Turn on your phone’s Location/GPS setting, then return here.",
          "Услугите за локација се исклучени. Вклучете Локација/GPS на телефонот, па вратете се тука.",
        )
      : issue?.code === "insecure"
        ? t(
            "Browser location requires HTTPS. Open the secure app URL or use the Android/iOS app.",
            "Локацијата во прелистувач бара HTTPS. Отворете ја безбедната адреса или користете ја Android/iOS апликацијата.",
          )
        : Platform.OS === "web"
          ? t(
              "This browser could not determine your position. Enable system Location Services and site access. If its location provider is unavailable, use the Android/iOS app for native GPS.",
              "Прелистувачот не ја утврди вашата локација. Вклучете системска локација и пристап за страницата. Ако сервисот е недостапен, користете ја Android/iOS апликацијата за GPS.",
            )
          : t(
              "Waiting for a GPS signal. Move near a window or outdoors. Location will recover automatically when a signal is available.",
              "Се чека GPS сигнал. Приближете се до прозорец или излезете надвор. Локацијата ќе се обнови автоматски кога ќе има сигнал.",
            );
  return (
    <Sheet
      visible={visible}
      title={permissions ? t("Location & notifications", "Локација и известувања") : t("Your location", "Вашата локација")}
      onClose={onClose}
      onBack={permissions ? onClose : undefined}
      backLabel={permissions ? t("Back", "Назад") : undefined}
    >
      <Note>{permissions ? Platform.OS === "web"
        ? t("Allow location in your browser’s site settings.", "Дозволете локација во поставките за страницата.")
        : t("Manage location and notifications in your phone’s app settings.", "Управувајте со локацијата и известувањата во поставките на апликацијата.") : message}</Note>
      {Platform.OS !== "web" ? (
        <Button
          title={t("Open settings", "Отвори поставки")}
          variant="secondary"
          onPress={() => {
            void Linking.openSettings().catch(() => {});
          }}
        />
      ) : null}
      <Button
        title={permissions ? t("Done", "Готово") : t("Try again", "Обиди се повторно")}
        onPress={() => {
          onClose();
          onRetry();
        }}
      />
    </Sheet>
  );
}

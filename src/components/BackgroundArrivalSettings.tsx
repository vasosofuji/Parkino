import React, { useEffect, useState } from "react";
import { AppState, Linking, Platform, Text, View } from "react-native";
import { useParking } from "../state/ParkingContext";
import { useTheme } from "../state/ThemeContext";
import { Button } from "./ui";
import LoadingIndicator from "./LoadingIndicator";
import { saveArrivalCatalog } from "../services/arrivalStorage";
import {
  disableBackgroundArrival,
  enableBackgroundArrival,
  getBackgroundArrivalStatus,
  observeBackgroundArrivalSettings,
} from "../services/backgroundArrival";

export default function BackgroundArrivalSettings({ onInfo }: { onInfo: () => void }) {
  const { colors } = useTheme();
  const { t, catalog } = useParking();
  const [status, setStatus] = useState({ supported: false, enabled: false, running: false });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () => { void getBackgroundArrivalStatus().then((value) => { if (active) setStatus(value); }).catch(() => {}).finally(() => { if (active) setLoading(false); }); };
    refresh();
    const remove = observeBackgroundArrivalSettings(refresh);
    const app = AppState.addEventListener("change", (value) => { if (value === "active") refresh(); });
    return () => { active = false; remove(); app.remove(); };
  }, []);
  const toggle = async () => {
    if (busy || loading) return;
    setBusy(true);
    setError("");
    try {
      if (status.enabled) await disableBackgroundArrival();
      else {
        await saveArrivalCatalog(catalog.places);
        await enableBackgroundArrival();
      }
      setStatus(await getBackgroundArrivalStatus());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Couldn't change reminders. Please try again.", "Не успеа промената. Обидете се повторно."));
    } finally { setBusy(false); }
  };
  return <View style={{ gap: 8, marginTop: 6 }}>
    <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>{t("Parking reminders", "Потсетници за паркирање")}</Text>
    {loading ? <LoadingIndicator size="small" inline label={t("Checking…", "Се проверува…")} /> : status.supported ? <>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
        {status.enabled ? t("On · background location and notifications", "Вклучени · локација во заднина и известувања") : t("Optional · uses background location and notifications", "По избор · користи локација во заднина и известувања")}
      </Text>
      <Button icon={status.enabled ? "bell-off" : "bell"} variant="secondary" disabled={busy}
        title={busy ? t("Please wait…", "Почекајте…") : status.enabled ? t("Turn reminders off", "Исклучи потсетници") : t("Enable parking reminders", "Вклучи потсетници за паркирање")}
        onPress={() => { void toggle(); }} />
      {status.enabled && !status.running ? <Text style={{ color: colors.muted, fontSize: 12 }}>{t("Return to the map to start reminders.", "Вратете се на мапата за да почнат потсетниците.")}</Text> : null}
    </> : <Text style={{ color: colors.muted, fontSize: 12 }}>
      {Platform.OS === "web" ? t("Background reminders are available in the phone app.", "Потсетниците во заднина се достапни во мобилната апликација.") : t("Install the updated Parking build to use background reminders.", "Инсталирајте ја ажурираната Parking апликација за потсетници во заднина.")}
    </Text>}
    <Button title={t("About reminders", "За потсетниците")} icon="info" variant="secondary" onPress={onInfo} />
    {error ? <>
      <Text accessibilityRole="alert" style={{ color: colors.red, fontSize: 12 }}>{error}</Text>
      <Button title={t("Open phone settings", "Отвори поставки на телефонот")} variant="secondary" onPress={() => { void Linking.openSettings().catch(() => {}); }} />
    </> : null}
  </View>;
}

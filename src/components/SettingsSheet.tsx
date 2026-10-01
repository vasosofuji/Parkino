import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { useTheme } from "../state/ThemeContext";
import { useParking } from "../state/ParkingContext";
import { useAccount } from "../state/AccountContext";
import { Button, Icon, Sheet, type IconName } from "./ui";
import LanguagePicker from "./LanguagePicker";
import BackgroundArrivalSettings from "./BackgroundArrivalSettings";
import { setNavigationPreference, useNavigationPreference } from "../services/navigation";
import { NAVIGATION_APPS, type NavigationApp } from "../domain/navigation";

type Section = "appearance" | "language" | "navigation" | "location" | "account" | "about" | "reminders";
function SettingsRow({ title, value, icon, onPress }: { title: string; value?: string; icon: IconName; onPress: () => void }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={value ? `${title}, ${value}` : title} onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 58, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, backgroundColor: pressed ? colors.mint : colors.input })}>
    <Icon name={icon} size={20} />
    <Text style={{ flex: 1, color: colors.ink, fontSize: 16, fontWeight: "600" }}>{title}</Text>
    {value ? <Text numberOfLines={1} style={{ maxWidth: "38%", color: colors.muted, fontSize: 13 }}>{value}</Text> : null}
    <Icon name="chevron-right" size={17} color={colors.muted} />
  </Pressable>;
}
export default function SettingsSheet({ visible, onClose, locationStatus, onRefreshLocation, onPermissions }: {
  visible: boolean;
  onClose: () => void;
  locationStatus: string;
  onRefreshLocation: () => void;
  onPermissions: () => void;
}) {
  const { colors, mode, setMode } = useTheme();
  const { t, language } = useParking();
  const { profile, refresh } = useAccount();
  const [section, setSection] = useState<Section | null>(null);
  const navigationApp = useNavigationPreference();
  const [savingNavigation, setSavingNavigation] = useState(false), [navigationError, setNavigationError] = useState("");
  useEffect(() => { if (visible) void refresh().catch(() => {}); }, [visible, refresh]);
  const titles: Record<Section, string> = {
    appearance: t("Appearance", "Изглед"),
    language: t("Language", "Јазик"),
    navigation: t("Navigation app", "Апликација за навигација"),
    location: t("Location & reminders", "Локација и потсетници"),
    account: t("Account", "Сметка"),
    about: t("About", "Информации"),
    reminders: t("About reminders", "За потсетниците"),
  };
  const themeName = mode === "light" ? t("Light", "Светло") : mode === "dark" ? t("Dark", "Темно") : t("System", "Систем");
  const accountName = profile?.guest ? t("Guest", "Гостин") : profile ? `@${profile.username}` : t("Your account", "Вашата сметка");
  const navigationNames: Record<NavigationApp, string> = { default: t("Phone default", "Стандардна на телефонот"), google: "Google Maps", waze: "Waze" };
  async function chooseNavigation(value: NavigationApp) {
    if (savingNavigation) return;
    setSavingNavigation(true); setNavigationError("");
    try { await setNavigationPreference(value); }
    catch { setNavigationError(t("Could not save this preference. Try again.", "Поставката не е зачувана. Обидете се повторно.")); }
    finally { setSavingNavigation(false); }
  }
  const close = () => { setSection(null); onClose(); };
  const go = (path: Href) => { close(); router.push(path); };
  return <Sheet visible={visible} title={section ? titles[section] : t("Settings", "Поставки")} onClose={close}>
    {section ? <Button title={t("Back to settings", "Назад кон поставки")} icon="arrow-left" variant="secondary" onPress={() => setSection(null)} /> : null}
    {!section ? <View style={{ gap: 8 }}>
      <SettingsRow title={titles.appearance} value={themeName} icon="sun" onPress={() => setSection("appearance")} />
      <SettingsRow title={titles.language} value={language === "en" ? "English" : "Македонски"} icon="globe" onPress={() => setSection("language")} />
      <SettingsRow title={titles.navigation} value={navigationNames[navigationApp]} icon="navigation" onPress={() => setSection("navigation")} />
      <SettingsRow title={titles.location} icon="map-pin" onPress={() => setSection("location")} />
      <SettingsRow title={titles.account} value={accountName} icon="user" onPress={() => setSection("account")} />
      <SettingsRow title={titles.about} icon="info" onPress={() => setSection("about")} />
    </View> : null}
    {section === "appearance" ? <View style={{ gap: 10 }}>
      {(["light", "dark", "system"] as const).map((value) => <Button key={value} title={value === "light" ? t("Light", "Светло") : value === "dark" ? t("Dark", "Темно") : t("Use phone setting", "Како на телефонот")} icon={mode === value ? "check" : value === "light" ? "sun" : value === "dark" ? "moon" : "smartphone"} variant={mode === value ? "primary" : "secondary"} onPress={() => setMode(value)} />)}
    </View> : null}
    {section === "language" ? <LanguagePicker /> : null}
    {section === "navigation" ? <View style={{ gap: 10 }}>
      {NAVIGATION_APPS.map(value => <Button key={value} title={navigationNames[value]} icon={navigationApp === value ? "check" : "navigation"} variant={navigationApp === value ? "primary" : "secondary"} disabled={savingNavigation} onPress={() => void chooseNavigation(value)} />)}
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>{t("Used when you tap Go on a parking pin. If the app is unavailable, directions open in your browser.", "Се користи кога ќе притиснете Оди на паркинг. Ако апликацијата не е достапна, насоките се отвораат во прелистувачот.")}</Text>
      {navigationError ? <Text accessibilityLiveRegion="polite" style={{ color: colors.red }}>{navigationError}</Text> : null}
    </View> : null}
    {section === "location" ? <>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>{locationStatus}</Text>
      <Button icon="refresh-cw" title={t("Refresh GPS", "Обнови GPS")} variant="secondary" onPress={onRefreshLocation} />
      <Button icon="settings" title={t("Location permissions", "Дозволи за локација")} variant="secondary" onPress={onPermissions} />
      <BackgroundArrivalSettings onInfo={() => setSection("reminders")} />
    </> : null}
    {section === "account" ? <>
      <Text style={{ color: colors.ink, fontWeight: "700", fontSize: 22 }}>{accountName}</Text>
      <Button icon="user" title={t("Your account", "Вашата сметка")} variant="secondary" onPress={() => go("/account")} />
      <Button icon="shield" title={t("Privacy & data", "Приватност и податоци")} variant="secondary" onPress={() => go("/privacy")} />
    </> : null}
    {section === "about" ? <View style={{ gap: 8 }}>
      <SettingsRow title={t("Zones & sources", "Зони и извори")} icon="map" onPress={() => go("/coverage")} />
      <SettingsRow title={titles.reminders} icon="bell" onPress={() => setSection("reminders")} />
      <SettingsRow title={t("Terms of service", "Услови за користење")} icon="file-text" onPress={() => go("/terms")} />
      <SettingsRow title={t("Privacy", "Приватност")} icon="shield" onPress={() => go("/privacy")} />
    </View> : null}
    {section === "reminders" ? <View style={{ gap: 16 }}>
      <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 23 }}>{t("After you stop in a parking area, the app can ask if spaces are available. You can also add missing prices with a quick answer.", "Кога ќе застанете на паркинг, апликацијата може да праша дали има слободни места. Можете и брзо да додадете цена што недостасува.")}</Text>
      <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22 }}>{t("Optional reminders work while the app is in the background. They use location on this phone and notifications. Your GPS history is not uploaded.", "Потсетниците по избор работат и во заднина. Користат локација на овој телефон и известувања. GPS историјата не се испраќа.")}</Text>
      <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22 }}>{t("Allow location all the time and notifications when enabling them. This uses extra battery; timing depends on your phone, and force-closing can stop reminders.", "При вклучување дозволете локација „Секогаш“ и известувања. Ова троши дополнителна батерија; времето зависи од телефонот, а присилното затворање може да ги запре потсетниците.")}</Text>
      <Button title={t("Reminder settings", "Поставки за потсетници")} variant="secondary" onPress={() => setSection("location")} />
    </View> : null}
  </Sheet>;
}

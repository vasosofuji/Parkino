import React, { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { useTheme } from "../state/ThemeContext";
import { useParking } from "../state/ParkingContext";
import { useAccount } from "../state/AccountContext";
import { Icon, RevealSection, type IconName } from "./ui";
import SettingsFrame from "./SettingsFrame";
import BackgroundArrivalSettings from "./BackgroundArrivalSettings";
import { setNavigationPreference, useNavigationPreference } from "../services/navigation";
import { NAVIGATION_APPS, type NavigationApp } from "../domain/navigation";
import { LANGUAGES } from "../domain/language";
import LanguagePicker from "./LanguagePicker";
import LicensePlateEditor from "./LicensePlateEditor";
import { useLicensePlate } from "../state/LicensePlateContext";

type Section = "appearance" | "language" | "navigation" | "location" | "vehicle";
function SettingsCard({ title, children }: { title?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.input, borderRadius: 20, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}>
    {title ? <Text accessibilityRole="header" style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 5, fontSize: 13, fontWeight: "700", color: colors.muted }}>{title}</Text> : null}
    {children}
  </View>;
}
function SettingsRow({ title, value, icon, onPress, last = false, selected, disabled = false }: {
  title: string; value?: string; icon: IconName; onPress: () => void; last?: boolean; selected?: boolean; disabled?: boolean;
}) {
  const { colors } = useTheme();
  const choice = selected !== undefined;
  return <Pressable accessibilityRole={choice ? "radio" : "button"} accessibilityLabel={value ? `${title}, ${value}` : title}
    accessibilityState={choice ? { checked: selected, disabled } : { disabled }} aria-checked={choice ? selected : undefined} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 15, paddingHorizontal: 18, backgroundColor: pressed ? colors.mint : colors.input, opacity: disabled ? 0.5 : 1 })}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 24, alignItems: "center" }}><Icon name={icon} size={19} color={colors.accentText} /></View>
    <Text style={{ flex: 1, color: colors.ink, fontSize: 15, fontWeight: "500" }}>{title}</Text>
    {value ? <Text numberOfLines={1} style={{ maxWidth: "34%", color: colors.muted, fontSize: 13 }}>{value}</Text> : null}
    {choice ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 21, height: 21, borderRadius: 11, borderWidth: selected ? 2 : 1.5, borderColor: selected ? colors.accentText : colors.muted, alignItems: "center", justifyContent: "center" }}>
      {selected ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accentText }} /> : null}
    </View> : <Icon name="chevron-right" size={16} color={colors.muted} />}
    {!last ? <View pointerEvents="none" style={{ position: "absolute", left: 54, right: 18, bottom: 0, height: 1, backgroundColor: colors.line }} /> : null}
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
  const { savedPlate, ready: plateReady } = useLicensePlate();
  const [section, setSection] = useState<Section | null>(null);
  const navigationApp = useNavigationPreference();
  const [savingNavigation, setSavingNavigation] = useState(false), [navigationError, setNavigationError] = useState("");
  useEffect(() => { if (visible) void refresh().catch(() => {}); }, [visible, refresh]);
  const titles: Record<Section, string> = {
    appearance: t("Appearance", "Изглед"),
    language: t("Language", "Јазик"),
    navigation: t("Navigation app", "Апликација за навигација"),
    location: t("Location & notifications", "Локација и известувања"),
    vehicle: t("License plate", "Регистарска табличка"),
  };
  const themeName = mode === "light" ? t("Light", "Светло") : mode === "dark" ? t("Dark", "Темно") : t("System default", "Системски стандард");
  const accountName = profile?.guest ? t("Guest", "Гостин") : profile ? `@${profile.username}` : t("Your account", "Вашиот профил");
  const initial = profile && !profile.guest ? profile.username.slice(0, 1).toUpperCase() : null;
  const navigationNames: Record<NavigationApp, string> = { default: t("Phone default", "Стандардна на телефонот"), google: "Google Maps", waze: "Waze" };
  async function chooseNavigation(value: NavigationApp) {
    if (savingNavigation) return;
    setSavingNavigation(true); setNavigationError("");
    try { await setNavigationPreference(value); }
    catch { setNavigationError(t("Could not save this preference. Try again.", "Поставката не е зачувана. Обидете се повторно.")); }
    finally { setSavingNavigation(false); }
  }
  const close = () => { setSection(null); onClose(); };
  const back = () => { if (section) setSection(null); else close(); };
  // Child pages push above the persistent /settings screen in router history.
  const go = (path: Href) => { router.push(path); };
  return <SettingsFrame title={section ? titles[section] : t("Settings", "Поставки")} onClose={close} onBack={back}
    backLabel={section ? t("Back to settings", "Назад кон поставки") : t("Back to map", "Назад кон мапата")}>
    <RevealSection active={section ?? "settings"} style={{ gap: 20 }}>
    {!section ? <View style={{ gap: 18 }}>
      <SettingsCard>
        <View style={{ padding: 18, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" }}>
            {initial ? <Text allowFontScaling={false} style={{ fontSize: 23, fontWeight: "700", color: colors.accentText }}>{initial}</Text> : <Icon name="user" size={25} color={colors.accentText} />}
          </View>
          <View style={{ flex: 1, minWidth: 95, gap: 5 }}>
            <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 18, fontWeight: "700" }}>{accountName}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{profile?.points ?? 0} {t("points", "поени")}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t("Manage account", "Управувај со профилот")} onPress={() => go("/account")}
            style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.green, opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>{t("Manage", "Управувај")}</Text>
          </Pressable>
        </View>
      </SettingsCard>
      <SettingsCard title={t("General", "Општо")}>
        <SettingsRow title={titles.appearance} value={themeName} icon="sun" onPress={() => setSection("appearance")} />
        <SettingsRow title={titles.language} value={LANGUAGES.find(({ code }) => code === language)?.name} icon="globe" onPress={() => setSection("language")} />
        <SettingsRow title={titles.navigation} value={navigationNames[navigationApp]} icon="navigation" onPress={() => setSection("navigation")} />
        <SettingsRow title={titles.vehicle} value={savedPlate ?? undefined} icon="truck" disabled={!plateReady} onPress={() => setSection("vehicle")} />
        <SettingsRow title={titles.location} icon="map-pin" last onPress={() => setSection("location")} />
      </SettingsCard>
      <SettingsCard title={t("Account", "Профил")}>
        <SettingsRow title={t("Rewards & appearance", "Награди и изглед")} icon="gift" onPress={() => go("/rewards")} />
        <SettingsRow title={t("Privacy & data", "Приватност и податоци")} icon="shield" last onPress={() => go("/privacy")} />
      </SettingsCard>
      <SettingsCard title={t("Support", "Поддршка")}>
        <SettingsRow title={t("Zones & sources", "Зони и извори")} icon="map" onPress={() => go("/coverage")} />
        <SettingsRow title={t("Terms of service", "Услови за користење")} icon="file-text" last onPress={() => go("/terms")} />
      </SettingsCard>
    </View> : null}
    {section === "appearance" ? <SettingsCard>
      {(["light", "dark", "system"] as const).map((value, index) => <SettingsRow key={value} title={value === "light" ? t("Light", "Светло") : value === "dark" ? t("Dark", "Темно") : t("System default", "Системски стандард")} icon={value === "light" ? "sun" : value === "dark" ? "moon" : "smartphone"} selected={mode === value} last={index === 2} onPress={() => setMode(value)} />)}
    </SettingsCard> : null}
    {section === "language" ? <LanguagePicker /> : null}
    {section === "vehicle" ? <LicensePlateEditor key={profile?.id} onDone={() => setSection(null)} /> : null}
    {section === "navigation" ? <View style={{ gap: 16 }}>
      <SettingsCard>{NAVIGATION_APPS.map((value, index) => <SettingsRow key={value} title={navigationNames[value]} icon="navigation" selected={navigationApp === value} last={index === NAVIGATION_APPS.length - 1} disabled={savingNavigation} onPress={() => void chooseNavigation(value)} />)}</SettingsCard>
      <Text style={{ paddingHorizontal: 5, color: colors.muted, fontSize: 13, lineHeight: 20 }}>{t("Used when you tap Go on a parking pin. If the app is unavailable, directions open in your browser.", "Се користи кога ќе притиснете Оди на паркинг. Ако апликацијата не е достапна, насоките се отвораат во прелистувачот.")}</Text>
      {navigationError ? <Text accessibilityLiveRegion="polite" style={{ paddingHorizontal: 5, color: colors.red }}>{navigationError}</Text> : null}
    </View> : null}
    {section === "location" ? <View style={{ gap: 18 }}>
      <SettingsCard title={t("Location", "Локација")}>
        <Text accessibilityLiveRegion="polite" style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4, color: colors.muted, fontSize: 13, lineHeight: 20 }}>{locationStatus}</Text>
        <SettingsRow icon="refresh-cw" title={t("Refresh GPS", "Обнови GPS")} onPress={onRefreshLocation} />
        <SettingsRow icon="settings" title={t("Location permissions", "Дозволи за локација")} onPress={onPermissions} />
        <SettingsRow icon="bell" title={t("Notification permissions", "Дозволи за известувања")} value={Platform.OS === "web" ? t("Phone app", "Мобилна апликација") : undefined} disabled={Platform.OS === "web"} last onPress={onPermissions} />
      </SettingsCard>
      <SettingsCard><View style={{ padding: 18 }}><BackgroundArrivalSettings /></View></SettingsCard>
    </View> : null}
    </RevealSection>
  </SettingsFrame>;
}

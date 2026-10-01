import React, { useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import LoadingIndicator from "../components/LoadingIndicator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../components/ui";
import LanguagePicker from "../components/LanguagePicker";
import TermsConsent from "../components/TermsConsent";
import PasswordField from "../components/PasswordField";
import { useAccount } from "../state/AccountContext";
import { useTheme } from "../state/ThemeContext";
import { useParking } from "../state/ParkingContext";
import { cleanUsername, validUsername, validPassword } from "../domain/account";
import { completeOnboarding, initialOnboardingStep, PREFERENCES_SETUP_KEY, type OnboardingIntent, type OnboardingStep } from "../domain/onboarding";
import { api } from "../services/api";

export default function Welcome() {
  const { colors, mode: theme, setMode: setTheme } = useTheme();
  const { t } = useParking();
  const account = useAccount();
  const [step, setStep] = useState<OnboardingStep | null>(null);
  const [mode, setMode] = useState<"choice" | "create" | "login">("choice");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [intent, setIntent] = useState<OnboardingIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken" | "offline">("idle");
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(PREFERENCES_SETUP_KEY).then((saved) => {
      if (active) setStep(initialOnboardingStep(saved));
    }).catch(() => { if (active) setStep("language"); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    if (step !== "account" || mode !== "create" || !validUsername(username)) return;
    const timer = setTimeout(() => {
      void api.usernameAvailable(cleanUsername(username)).then((result) => {
        if (active) setAvailability(result.available ? "available" : "taken");
      }).catch(() => { if (active) setAvailability("offline"); });
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [username, mode, step]);

  function showTerms(next: OnboardingIntent) {
    Keyboard.dismiss();
    setError("");
    setIntent(next);
  }
  async function accept() {
    if (!intent || busy) return;
    setBusy(true); setError("");
    try {
      await completeOnboarding(intent, true, account);
      setPassword("");
      setIntent(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not continue. Try again.", "Не може да продолжите. Обидете се повторно."));
    } finally { setBusy(false); }
  }
  function chooseAccount(next: "create" | "login") {
    setMode(next); setError(""); setAvailability("idle"); setPassword("");
  }
  function finishPreferences() {
    void AsyncStorage.setItem(PREFERENCES_SETUP_KEY, "1").catch(() => {});
    setStep("account");
  }
  const title = step === "language" ? "Language / Јазик" : step === "theme" ? t("Choose your appearance", "Изберете изглед") : mode === "choice" ? t("Welcome to Parkino", "Добредојдовте во Parkino") : mode === "create" ? t("Create account", "Создај сметка") : t("Sign in", "Најава");
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: 24, maxWidth: 440, width: "100%", alignSelf: "center" }}>
        <View style={{ flex: 1, justifyContent: "center", gap: 24, paddingVertical: 28 }}>
          {!step ? <LoadingIndicator size="large" label="Parkino" /> : <>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{step === "language" ? "1 / 4" : step === "theme" ? "2 / 4" : "3 / 4"}</Text>
            <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 30, fontWeight: "700" }}>{title}</Text>
            {step === "language" ? <>
              <LanguagePicker />
              <Button title={t("Continue", "Продолжи")} onPress={() => setStep("theme")} />
            </> : step === "theme" ? <>
              <View style={{ gap: 10 }}>
                {(["system", "light", "dark"] as const).map((value) => <Button key={value} icon={theme === value ? "check" : value === "system" ? "smartphone" : value === "light" ? "sun" : "moon"} title={value === "system" ? t("Use phone setting", "Како на телефонот") : value === "light" ? t("Light", "Светло") : t("Dark", "Темно")} variant={theme === value ? "primary" : "secondary"} onPress={() => setTheme(value)} />)}
              </View>
              <Button title={t("Continue", "Продолжи")} onPress={finishPreferences} />
              <Button title={t("Back", "Назад")} variant="secondary" onPress={() => setStep("language")} />
            </> : mode === "choice" ? <>
              <Button title={t("Create account", "Создај сметка")} onPress={() => chooseAccount("create")} />
              <Button title={t("Sign in", "Најави се")} variant="secondary" onPress={() => chooseAccount("login")} />
              <Button title={t("Continue as guest", "Продолжи како гостин")} variant="secondary" onPress={() => showTerms({ mode: "guest" })} />
              <Button title={t("Back", "Назад")} variant="secondary" onPress={() => setStep("theme")} />
            </> : <>
              <View style={{ gap: 8 }}>
                <TextInput accessibilityLabel={t("Username", "Корисничко име")} value={username} editable={!busy} onChangeText={(value) => { setUsername(value); setAvailability(validUsername(value) ? "checking" : "idle"); setError(""); }} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" maxLength={20} placeholder={t("Username", "Корисничко име")} placeholderTextColor={colors.muted} style={{ minHeight: 52, padding: 14, fontSize: 17, borderRadius: 12, borderWidth: 1, borderColor: colors.line, color: colors.ink, backgroundColor: colors.input }} />
                {mode === "create" ? <Text accessibilityLiveRegion="polite" style={{ color: availability === "taken" ? colors.red : colors.muted, fontSize: 12 }}>{availability === "taken" ? t("Username taken", "Зафатено име") : availability === "checking" ? t("Checking…", "Се проверува…") : availability === "available" ? t("Available", "Слободно") : t("3–20 letters, numbers or underscores", "3–20 букви, бројки или долни црти")}</Text> : null}
              </View>
              <View style={{ gap: 8 }}>
                <PasswordField value={password} onChange={setPassword} creating={mode === "create"} disabled={busy} />
                {mode === "create" ? <Text style={{ color: colors.muted, fontSize: 12 }}>{t("At least 10 characters", "Најмалку 10 знаци")}</Text> : null}
              </View>
              {!intent && error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.red }}>{error}</Text> : null}
              <Button title={t("Continue", "Продолжи")} disabled={busy || !validUsername(username) || (mode === "create" ? !validPassword(password) || availability === "taken" : !password)} onPress={() => showTerms({ mode, username, password })} />
              <Button title={t("Back", "Назад")} variant="secondary" disabled={busy} onPress={() => { setMode("choice"); setPassword(""); }} />
            </>}
          </>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    {intent ? <TermsConsent busy={busy} error={error} onClose={() => { setIntent(null); setError(""); }} onAccept={() => void accept()} /> : null}
  </SafeAreaView>;
}

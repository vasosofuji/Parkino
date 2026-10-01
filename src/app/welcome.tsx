import React, { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../components/ui";
import LanguagePicker from "../components/LanguagePicker";
import TermsConsent from "../components/TermsConsent";
import { useAccount } from "../state/AccountContext";
import { useTheme } from "../state/ThemeContext";
import { useParking } from "../state/ParkingContext";
import { cleanUsername, validUsername } from "../domain/account";
import { api } from "../services/api";
export default function Welcome() {
  const { colors } = useTheme(),
    { t } = useParking(),
    { register } = useAccount();
  const [username, setUsername] = useState(""),
    [terms, setTerms] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [availability, setAvailability] = useState<
    "idle" | "checking" | "available" | "taken" | "offline"
  >("idle");
  useEffect(() => {
    let active = true;
    if (!validUsername(username)) return;
    const timer = setTimeout(() => {
      void api
        .usernameAvailable(cleanUsername(username))
        .then((result) => {
          if (active) setAvailability(result.available ? "available" : "taken");
        })
        .catch(() => {
          if (active) setAvailability("offline");
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username]);
  async function continueToTerms() {
    setBusy(true);
    setError("");
    Keyboard.dismiss();
    try {
      const result = await api.usernameAvailable(cleanUsername(username));
      if (!result.available) {
        setAvailability("taken");
        return;
      }
      setTerms(true);
    } catch {
      setError(t("Connect to continue.", "Поврзете се за да продолжите."));
    } finally {
      setBusy(false);
    }
  }
  async function accept() {
    setBusy(true);
    setError("");
    try {
      await register(cleanUsername(username), true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t(
              "Could not create account. Try again.",
              "Неуспешно создавање сметка. Обидете се повторно.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            padding: 24,
            maxWidth: 440,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <View style={{ flex: 1, justifyContent: "center", gap: 24 }}>
            <Text
              accessibilityRole="header"
              style={{ color: colors.ink, fontSize: 28, fontWeight: "700" }}
            >
              {t("Choose a username", "Изберете корисничко име")}
            </Text>
            <View style={{ gap: 8 }}>
              <TextInput
                accessibilityLabel={t("Username", "Корисничко име")}
                value={username}
                onChangeText={(value) => {
                  setUsername(value);
                  setAvailability(validUsername(value) ? "checking" : "idle");
                  setError("");
                }}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                returnKeyType="done"
                placeholder={t("Username", "Корисничко име")}
                placeholderTextColor={colors.muted}
                style={{
                  minHeight: 52,
                  padding: 14,
                  fontSize: 17,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.line,
                  color: colors.ink,
                  backgroundColor: colors.input,
                }}
              />
              <Text
                accessibilityLiveRegion="polite"
                style={{
                  color: availability === "taken" ? colors.red : colors.muted,
                  fontSize: 12,
                }}
              >
                {availability === "taken"
                  ? t("That username is taken", "Името е зафатено")
                  : availability === "checking"
                    ? t("Checking…", "Се проверува…")
                    : availability === "available"
                      ? t("Available", "Слободно")
                      : t(
                          "3–20 letters, numbers or underscores",
                          "3–20 букви, бројки или долни црти",
                        )}
              </Text>
            </View>
            {!terms && error ? (
              <Text style={{ color: colors.red }}>{error}</Text>
            ) : null}
            <Button
              title={t("Continue", "Продолжи")}
              disabled={
                busy || !validUsername(username) || availability === "taken"
              }
              onPress={() => void continueToTerms()}
            />
          </View>
          <LanguagePicker />
        </ScrollView>
      </KeyboardAvoidingView>
      {terms ? (
        <TermsConsent
          busy={busy}
          error={error}
          onClose={() => {
            setTerms(false);
            setError("");
          }}
          onAccept={() => void accept()}
        />
      ) : null}
    </SafeAreaView>
  );
}

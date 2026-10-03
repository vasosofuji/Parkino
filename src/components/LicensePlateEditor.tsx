import React, { useState } from "react";
import { Keyboard, Pressable, Text, TextInput, View } from "react-native";
import { useLicensePlate } from "../state/LicensePlateContext";
import { normalizeLicensePlate } from "../domain/license-plate";
import { useParking } from "../state/ParkingContext";
import { useTheme } from "../state/ThemeContext";
import StepActions from "./StepActions";

export default function LicensePlateEditor({ onDone, optional = false }: { onDone: () => void; optional?: boolean }) {
  const { savedPlate, savePlate, dismissPrompt } = useLicensePlate();
  const { colors } = useTheme(), { t } = useParking();
  const [input, setInput] = useState(savedPlate ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const normalized = normalizeLicensePlate(input);
  async function save() {
    if (busy) return;
    if (input !== "" && !normalized) { setError(t("Enter a valid license plate.", "Внесете важечка регистарска табличка.")); return; }
    setBusy(true); setError(""); Keyboard.dismiss();
    try { await savePlate(input); onDone(); }
    catch { setError(t("Could not save vehicle settings. Try again.", "Поставките за возилото не се зачувани. Обидете се повторно.")); }
    finally { setBusy(false); }
  }
  async function skip() {
    if (busy) return;
    setBusy(true); setError(""); Keyboard.dismiss();
    try { await dismissPrompt(); onDone(); }
    catch { setError(t("Could not save vehicle settings. Try again.", "Поставките за возилото не се зачувани. Обидете се повторно.")); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 16 }}>
    <TextInput value={input} editable={!busy} onChangeText={value => { setInput(value); setError(""); }}
      accessibilityLabel={t("License plate", "Регистарска табличка")} placeholder={t("License plate", "Регистарска табличка")}
      placeholderTextColor={colors.muted} autoCapitalize="characters" autoCorrect={false} autoComplete="off" maxLength={24}
      style={{ minHeight: 54, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: error ? colors.red : colors.line, color: colors.ink, backgroundColor: colors.input, fontSize: 20, fontWeight: "600", letterSpacing: 1 }} />
    <Text style={{ color: colors.muted, fontSize: 13 }}>{t("Stored on this device only", "Се чува само на овој уред")}</Text>
    {normalized && input !== normalized ? <Text accessibilityLiveRegion="polite" style={{ color: colors.ink, fontSize: 14 }}>{t("SMS plate", "Табличка за SMS")}: {normalized}</Text> : null}
    {error || (input !== "" && !normalized) ? <Text accessibilityLiveRegion="polite" style={{ color: colors.red }}>{error || t("Use Latin letters and numbers (3–12).", "Користете латинични букви и бројки (3–12).")}</Text> : null}
    {optional ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void skip()} style={{ minHeight: 44, alignSelf: "center", justifyContent: "center", paddingHorizontal: 16 }}><Text style={{ color: colors.muted, fontSize: 15 }}>{t("Skip", "Прескокни")}</Text></Pressable> : null}
    <StepActions onBack={optional ? () => void skip() : onDone} onContinue={() => void save()} title={optional ? t("Continue", "Продолжи") : t("Save", "Зачувај")} disabled={busy || (input !== "" && !normalized)} backDisabled={busy} />
  </View>;
}

import React, { useEffect, useState } from "react";
import { Image, Text, TextInput, View } from "react-native";
import LoadingIndicator from "./LoadingIndicator";
import type { SignInfo, SignPhoto } from "../domain/types";
import { api } from "../services/api";
import { useParking } from "../state/ParkingContext";
import { useTheme } from "../state/ThemeContext";
import { Button, Note, Sheet } from "./ui";
import DigitalParkingSign from "./DigitalParkingSign";
import PaymentScheduleFields from "./PaymentScheduleFields";
import StepActions from "./StepActions";

type Fields = { zoneCode: string; operator: string; currency: string; firstHour: string; nextHour: string; maxStayMinutes: string; chargingHours: string; paymentInstructions: string; restrictions: string; rawText: string };
const fieldsFrom = (info: SignInfo | null): Fields => ({
  zoneCode: info?.zoneCode ?? "", operator: info?.operator ?? "", currency: info?.currency ?? "MKD",
  firstHour: info?.firstHour?.toString() ?? "", nextHour: info?.nextHour?.toString() ?? "", maxStayMinutes: info?.maxStayMinutes?.toString() ?? "",
  chargingHours: info?.chargingHours ?? "", paymentInstructions: info?.paymentInstructions ?? "", restrictions: info?.restrictions ?? "", rawText: info?.rawText ?? "",
});

export default function SignReviewSheet({ initialPhoto, visible = true, onClose, onConfirmed, onDismiss }: {
  initialPhoto: SignPhoto;
  visible?: boolean;
  onClose: () => void;
  onConfirmed: (photo: SignPhoto) => void;
  onDismiss?: () => void;
}) {
  const { t, refresh } = useParking(), { colors } = useTheme();
  const [photo, setPhoto] = useState(initialPhoto);
  const [editing, setEditing] = useState(false), [fields, setFields] = useState(() => fieldsFrom(initialPhoto.info));
  const [freeWeekends, setFreeWeekends] = useState<SignInfo["freeWeekends"]>(initialPhoto.info?.freeWeekends ?? null);
  const [correctedInfo, setCorrectedInfo] = useState<SignInfo | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const photos = await api.signs(initialPhoto.placeId);
        const updated = photos.find(p => p.id === initialPhoto.id);
        if (cancelled) return;
        if (updated) {
          setPhoto(updated);
          if (!["queued", "processing", "waiting"].includes(updated.status)) return;
        }
      } catch {
        if (!cancelled) setError(t("Reading is taking longer. You can fill in the sign below.", "Читањето трае подолго. Може да ги внесете податоците подолу."));
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 3000);
    }
    if (["queued", "processing", "waiting"].includes(initialPhoto.status)) void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [initialPhoto.id, initialPhoto.placeId, initialPhoto.status, t]);
  const reading = ["queued", "processing"].includes(photo.status);
  const previewInfo = correctedInfo ?? photo.info;
  function edit() { setFreeWeekends(previewInfo?.freeWeekends ?? null); setFields(fieldsFrom(previewInfo)); setEditing(true); setError(""); }
  async function confirm() {
    let info = previewInfo;
    if (editing) {
      const number = (value: string) => value.trim() ? Number(value.replace(",", ".")) : null;
      const first = number(fields.firstHour), next = number(fields.nextHour), max = number(fields.maxStayMinutes);
      if ([first, next].some(n => n !== null && (!Number.isFinite(n) || n < 0 || n > 10000)) || (max !== null && (!Number.isInteger(max) || max < 1 || max > 10080))) {
        setError(t("Use prices from 0 to 10,000 and a whole number of minutes from 1 to 10,080.", "Внесете цени од 0 до 10.000 и цели минути од 1 до 10.080.")); return;
      }
      if ((first !== null || next !== null) && fields.currency.trim().length !== 3) { setError(t("Use a three-letter currency, for example MKD.", "Внесете валута со три букви, на пример MKD.")); return; }
      info = {
        isParkingSign: true, confidence: photo.info?.confidence ?? 1,
        zoneCode: fields.zoneCode.trim() || null, operator: fields.operator.trim() || null, currency: fields.currency.trim().toUpperCase() || null,
        firstHour: first, nextHour: next, maxStayMinutes: max,
        freeWeekends, chargingHours: fields.chargingHours.trim() || null, paymentInstructions: fields.paymentInstructions.trim() || null,
        restrictions: fields.restrictions.trim() || null, rawText: fields.rawText.trim(),
      };
      if (!info.zoneCode && info.firstHour === null && info.nextHour === null && !info.freeWeekends && !info.chargingHours && !info.paymentInstructions && !info.restrictions && info.rawText.length < 3) {
        setError(t("Add at least one detail from the sign.", "Додајте барем еден податок од таблата.")); return;
      }
      setCorrectedInfo(info);
      setEditing(false);
      setError("");
      return;
    }
    if (!info?.isParkingSign) { setError(t("Correct the details before confirming this parking sign.", "Поправете ги податоците пред да ја потврдите таблата.")); return; }
    setBusy(true); setError("");
    try { const confirmed = await api.confirmSign(photo.id, info); await refresh(); onConfirmed(confirmed); }
    catch (e) { setError(e instanceof Error ? e.message : t("Could not confirm. Try again.", "Не е потврдено. Обидете се повторно.")); }
    finally { setBusy(false); }
  }
  const field = (key: keyof Fields, label: string, numeric = false, multiline = false, maxLength = 500) => (
    <View style={{ gap: 5 }} key={key}>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }}>{label}</Text>
      <TextInput value={fields[key]} onChangeText={value => setFields(previous => ({ ...previous, [key]: value }))} accessibilityLabel={label}
        editable={!busy} keyboardType={numeric ? "decimal-pad" : "default"} multiline={multiline} maxLength={maxLength}
        placeholder={t("Not on sign / unknown", "Нема на таблата / непознато")} placeholderTextColor={colors.muted}
        style={{ minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, color: colors.ink, backgroundColor: colors.input }} />
    </View>
  );
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t("Is this sign correct?", "Дали таблата е точна?")} onClose={() => { if (!busy) onClose(); }}
      footer={editing || previewInfo ? <StepActions onBack={() => { if (editing && previewInfo) setEditing(false); else onClose(); }} backDisabled={busy} title={busy ? t("Confirming…", "Се потврдува…") : editing ? t("Preview corrected sign", "Прегледај поправена табла") : t("Yes, this is correct", "Да, точно е")} disabled={busy || (!editing && !previewInfo?.isParkingSign)} onContinue={() => void confirm()} /> : <Button title={t("Review later", "Провери подоцна")} variant="secondary" disabled={busy} onPress={onClose} />}>
      <Image source={{ uri: api.imageUrl(photo.id) }} accessibilityLabel={t("Original sign photo", "Оригинална слика од табла")} resizeMode="contain" style={{ width: "100%", height: 180, borderRadius: 10, backgroundColor: colors.mint }} />
      <Note>{t("Only the details you confirm become the public digital sign. Leave anything unclear blank.", "Само потврдените податоци стануваат јавна дигитална табла. Оставете ги нејасните полиња празни.")}</Note>
      {editing ? <>
        {field("zoneCode", t("Zone", "Зона"), false, false, 16)}
        <View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}>{field("firstHour", t("First hour", "Прв час"), true)}</View><View style={{ flex: 1 }}>{field("nextHour", t("Following hour", "Следен час"), true)}</View></View>
        <Button variant="secondary" title={t("The sign says free", "На таблата пишува бесплатно")} disabled={busy} onPress={() => setFields(previous => ({ ...previous, firstHour: "0", nextHour: "0", currency: "MKD" }))} />
        {field("currency", t("Currency", "Валута"), false, false, 3)}
        {<PaymentScheduleFields value={{ chargingHours: fields.chargingHours, freeWeekends: freeWeekends ?? null }} disabled={busy} onChange={value => { setFields(previous => ({ ...previous, chargingHours: value.chargingHours ?? "" })); setFreeWeekends(value.freeWeekends); }} />}
        {field("maxStayMinutes", t("Maximum stay (minutes)", "Максимален престој (минути)"), true)}
        {field("paymentInstructions", t("How to pay", "Начин на плаќање"), false, true, 600)}
        {field("restrictions", t("Restrictions", "Ограничувања"), false, true, 1000)}
        {field("operator", t("Operator", "Оператор"), false, false, 100)}
        {field("rawText", t("Other text on the sign", "Друг текст на таблата"), false, true, 4000)}
      </> : previewInfo ? <>
        <DigitalParkingSign info={previewInfo} preview />
        {!previewInfo.isParkingSign || (!correctedInfo && photo.status === "review") ? <Note>{t("Some details were unclear. Please compare every field with the photo.", "Некои податоци не се јасни. Проверете го секое поле со сликата.")}</Note> : null}
        <Button title={t("Correct the details", "Поправи податоци")} icon="edit-2" variant="secondary" onPress={edit} disabled={busy} />
      </> : <>
        {reading ? <LoadingIndicator active={visible} label={t("Reading the sign…", "Се чита таблата…")} /> : null}
        <Note>{reading ? t("Reading your sign… You can also enter it yourself.", "Се чита таблата… Може и сами да ги внесете податоците.") : t("The photo is saved, but automatic reading is unavailable. Enter what you can read.", "Сликата е зачувана, но автоматското читање е недостапно. Внесете што читате.")}</Note>
        <Button title={t("Enter sign details", "Внеси податоци од таблата")} variant="secondary" icon="edit-2" onPress={edit} />
      </>}
      {error ? <Note>{error}</Note> : null}
    </Sheet>
  );
}

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { Button, Icon, Note } from "./ui";
import { useParking } from "../state/ParkingContext";
import { useAccount } from "../state/AccountContext";
import { useTheme, type ThemeColors } from "../state/ThemeContext";
import { normalizeZoneCode, parkingPrice } from "../domain/parking";
import { createProgressiveEntry, priceInput, spacesInput, type EntryApi } from "../domain/progressive-entry";
import type { Coordinate, Geometry, ParkingKind, ParkingPlace } from "../domain/types";
import { availabilityIsFresh, createEntryDraftStore, entryDraftKey, readEntryDraft, type EntryDraft, type EntryOperation, type EntryStep } from "../services/entryDrafts";
import { api } from "../services/api";

type Props = {
  place?: ParkingPlace; coordinate: Coordinate; geometry?: Geometry; initialZone?: string; kind?: ParkingKind;
  initialStep?: "spaces";
  onSaved?: (id: string) => void; onDone: () => void; onDrawBoundary?: (geometry?: Geometry) => void; onBack?: () => void;
};
export default function ManualParkingWizard(props: Props) {
  const { profile } = useAccount(), { t } = useParking();
  const accountId = profile?.id ?? "signed-out";
  const target = props.place?.id ?? `${props.kind ?? "surface"}:${props.coordinate.latitude.toFixed(6)}:${props.coordinate.longitude.toFixed(6)}`;
  const draftKey = entryDraftKey(accountId, target);
  const [loaded, setLoaded] = useState<{ key: string; value: EntryDraft | null } | null>(null);
  useEffect(() => { let active = true; void readEntryDraft(draftKey).then(value => { if (active) setLoaded({ key: draftKey, value }); }); return () => { active = false; }; }, [draftKey]);
  if (!loaded || loaded.key !== draftKey) return <Note>{t("Opening entry…", "Се отвора внесот…")}</Note>;
  return <WizardBody key={draftKey} {...props} restored={loaded.value} draftKey={draftKey} accountId={accountId} />;
}
function WizardBody({ place, coordinate, geometry, initialZone, kind = "surface", initialStep, onSaved, onDone, onDrawBoundary, onBack, restored, draftKey, accountId }: Props & { restored: EntryDraft | null; draftKey: string; accountId: string }) {
  const { t, refresh } = useParking(), { colors } = useTheme(), s = styles(colors);
  const initialPrice = place ? parkingPrice(place) : null;
  const [step, setStep] = useState<EntryStep>(restored?.step ?? initialStep ?? "choose"), [detailed, setDetailed] = useState(restored?.detailed ?? Boolean(initialStep));
  const [code, setCode] = useState(restored?.code ?? initialZone ?? place?.zoneCode ?? "");
  const [first, setFirst] = useState(restored?.first ?? initialPrice?.firstHour.toString() ?? ""), [next, setNext] = useState(restored?.next ?? initialPrice?.nextHour.toString() ?? "");
  const [capacity, setCapacity] = useState(restored?.capacity ?? place?.capacity?.toString() ?? ""), [freeSpaces, setFreeSpaces] = useState(restored?.freeSpaces ?? "");
  const [freeObservedAt, setFreeObservedAt] = useState(restored?.freeObservedAt);
  const changeFreeSpaces = useCallback((value: string) => { setFreeSpaces(value); setFreeObservedAt(Date.now()); }, []);
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(Boolean(restored?.snapshot?.id)), [message, setMessage] = useState("");
  const [failed, setFailed] = useState<EntryOperation | null>(restored?.pending ?? null);
  const [currentGeometry, setCurrentGeometry] = useState(restored?.geometry ?? geometry);
  const [initialDraft] = useState<EntryDraft>(() => restored ?? { version: 1, updatedAt: Date.now(), requestId: randomUUID(), step: "choose", detailed: false, code, first, next, capacity, freeSpaces, geometry, pending: null });
  const [draftStore] = useState(() => createEntryDraftStore(accountId, draftKey, initialDraft));
  const [writer] = useState(() => {
    const client = api.progressiveWriter();
    void client.catch(() => {});
    const bound: EntryApi = {
      contribute: value => client.then(service => service.contribute(value)),
      label: (id, value) => client.then(service => service.label(id, value)),
      price: (id, a, b) => client.then(service => service.price(id, a, b)),
      capacity: (id, value) => client.then(service => service.capacity(id, value)),
      report: (id, status, count) => client.then(service => service.report(id, status, count)),
      boundary: (id, value) => client.then(service => service.boundary(id, value)),
    };
    return createProgressiveEntry(bound, {
      place, onSaved, snapshot: restored?.snapshot,
      contribution: place ? undefined : { requestId: initialDraft.requestId, name: kind === "zone" ? t("Parking zone", "Паркинг зона") : t("Parking", "Паркинг"), coordinate, kind, geometry: currentGeometry, zoneCode: initialZone ?? null, firstHour: null, nextHour: null },
    });
  });
  const previousGeometry = useRef(JSON.stringify(geometry));
  // Draft writes merge with save results, so typing in the next step cannot erase an in-flight operation.
  useEffect(() => { void draftStore.update({ step, detailed, code, first, next, capacity, freeSpaces, freeObservedAt, geometry: currentGeometry }).catch(() => {}); }, [draftStore, step, detailed, code, first, next, capacity, freeSpaces, freeObservedAt, currentGeometry]);
  async function save(operation: EntryOperation, nextStep?: EntryStep) {
    if (operation.type === "spaces" && operation.available !== null && !availabilityIsFresh(operation.observedAt)) {
      setFreeSpaces(""); setFailed(null); setStep("spaces");
      await draftStore.update({ pending: null, freeSpaces: "", step: "spaces" });
      setMessage(t("That free-space estimate is old. Enter the current count, or skip it.", "Процената за слободни места е стара. Внесете ја тековната состојба или прескокнете."));
      return;
    }
    Keyboard.dismiss(); setMessage(""); setBusy(true); setFailed(null);
    if (nextStep) setStep(nextStep);
    try {
      // Persist intent before starting the network write. Retry is explicit after reopening.
      await draftStore.update({ pending: operation, step: nextStep ?? step });
      if (operation.type === "label") await writer.label(operation.code);
      else if (operation.type === "price") await writer.price(operation.first, operation.next);
      else if (operation.type === "spaces") await writer.spaces(operation.total, operation.available);
      else if (operation.type === "boundary") await writer.boundary(operation.geometry);
      else await writer.ensure();
      await draftStore.update({ snapshot: writer.snapshot(), pending: null });
      setSaved(true); void refresh();
    } catch (error) {
      await draftStore.update({ snapshot: writer.snapshot(), pending: operation }).catch(() => {});
      setFailed(operation);
      setMessage(error instanceof Error ? error.message : t("Could not save. Try again.", "Не е зачувано. Обидете се повторно."));
    } finally { setBusy(false); }
  }
  useEffect(() => {
    const signature = JSON.stringify(geometry);
    if (geometry && signature !== previousGeometry.current) {
      previousGeometry.current = signature; setCurrentGeometry(geometry);
      void save({ type: "boundary", geometry });
    }
    // New map geometry only arrives when a completed boundary returns to the mounted wizard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry]);
  async function finish() { await draftStore.clear().catch(() => {}); onDone(); }
  function back() {
    if (busy) return;
    if (initialStep === "spaces" && step === "spaces" && !failed) { onBack?.(); return; }
    const previous: EntryStep = failed?.type === "label" ? "zone" : failed?.type === "price" ? "price" : failed?.type === "spaces" ? "spaces" : failed?.type === "boundary" ? "perimeter" : step === "price" ? "zone" : step === "spaces" ? "price" : step === "perimeter" ? kind === "zone" ? "price" : "spaces" : step === "done" ? "price" : "choose";
    setFailed(null); setMessage(""); setStep(previous);
    void draftStore.update({ pending: null, step: previous }).catch(() => {});
  }
  function advance(skip = false) {
    if (busy || failed) return;
    if (step === "zone") {
      void save({ type: "label", code: skip ? "" : normalizeZoneCode(code) }, "price");
    } else if (step === "price") {
      try {
        const value = skip ? null : priceInput(first, next);
        void save(value ? { type: "price", ...value } : { type: "ensure" }, detailed ? kind === "zone" ? "perimeter" : "spaces" : "done");
      } catch { setMessage(t("Enter a first-hour price from 0 to 10,000 MKD, or skip.", "Внесете цена за прв час од 0 до 10.000 денари или прескокнете.")); }
    } else if (step === "spaces") {
      try {
        const value = skip ? { total: null, available: null } : spacesInput(capacity, freeSpaces, place?.capacity ?? null);
        void save({ type: "spaces", ...value, observedAt: freeObservedAt }, "perimeter");
      } catch { setMessage(t("Use whole numbers. Free spaces cannot exceed the total.", "Внесете цели броеви. Слободните места не може да бидат повеќе од вкупните.")); }
    }
  }
  const field = (label: string, value: string, change: (value: string) => void, numeric = false, placeholder = t("Optional", "Опционално")) => <View style={s.field}>
    <Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={change} style={s.input} keyboardType={numeric ? "decimal-pad" : "default"} autoCapitalize={numeric ? "none" : "characters"} maxLength={numeric ? 9 : 16} placeholder={placeholder} placeholderTextColor={colors.muted} />
  </View>;
  const index = initialStep === "spaces" ? step === "spaces" ? 1 : 2 : step === "zone" ? 1 : step === "price" ? 2 : step === "spaces" ? 3 : kind === "zone" ? 3 : 4;
  return <View style={s.root}>
    {step !== "choose" ? <Button title={failed ? t("Correct this step", "Поправи го чекорот") : t("Back", "Назад")} variant="secondary" icon="arrow-left" disabled={busy} onPress={back} /> : onBack ? <Button title={t("Back", "Назад")} variant="secondary" icon="arrow-left" onPress={onBack} /> : null}
    {step === "choose" ? <>
      {([false, true] as const).map(value => <Pressable key={String(value)} accessibilityRole="button" style={s.choice} onPress={() => { setDetailed(value); setStep("zone"); }}>
        <Icon name={value ? "map" : "zap"} color={colors.accentText} /><View style={s.flex}><Text style={s.title}>{value ? t("Detailed entry", "Детален внес") : t("Simple entry", "Брз внес")}</Text><Note>{value ? t("Zone, price, spaces and perimeter", "Зона, цена, места и периметар") : t("Just the zone and price", "Само зона и цена")}</Note></View><Icon name="chevron-right" size={18} />
      </Pressable>)}
    </> : step === "done" ? <>
      <Icon name={busy ? "clock" : failed ? "alert-circle" : "check-circle"} color={colors.accentText} size={30} />
      <Text style={s.title}>{busy ? t("Saving…", "Се зачувува…") : failed ? t("One detail still needs saving", "Уште еден детал треба да се зачува") : t("Details saved", "Деталите се зачувани")}</Text>
      <Button title={t("Done", "Готово")} disabled={busy || Boolean(failed)} onPress={() => void finish()} />
    </> : <>
      <Text style={s.progress}>{t("Step", "Чекор")} {index} / {initialStep === "spaces" ? 2 : detailed ? kind === "zone" ? 3 : 4 : 2}</Text>
      {step === "zone" ? <><Text style={s.title}>{t("What is the zone label?", "Која е ознаката на зоната?")}</Text>{field(t("Zone label", "Ознака на зона"), code, setCode, false, "B2, A0…")}</> : null}
      {step === "price" ? <><Text style={s.title}>{t("How much does it cost?", "Колку чини?")}</Text><Button title={t("It's free", "Бесплатно е")} variant="secondary" disabled={busy || Boolean(failed)} onPress={() => { setFirst("0"); setNext("0"); void save({ type: "price", first: 0, next: 0 }, detailed ? kind === "zone" ? "perimeter" : "spaces" : "done"); }} /><View style={s.row}><View style={s.flex}>{field(t("MKD / first hour", "ден. / прв час"), first, setFirst, true)}</View><View style={s.flex}>{field(t("Following hour", "Следен час"), next, setNext, true, first || "—")}</View></View></> : null}
      {step === "spaces" ? <><Text style={s.title}>{t("How many parking spaces?", "Колку паркинг места има?")}</Text><Note>{t("An estimate is fine.", "Може и процена.")}</Note>{field(t("Total parking spaces", "Вкупно паркинг места"), capacity, setCapacity, true)}{field(t("Free right now", "Слободни сега"), freeSpaces, changeFreeSpaces, true)}</> : null}
      {step === "perimeter" ? <><Text style={s.title}>{t("Mark the parking perimeter", "Означете го периметарот")}</Text><Button icon="map" title={currentGeometry ? t("Edit perimeter", "Промени периметар") : t("Draw on map", "Означи на мапата")} disabled={busy || Boolean(failed) || !onDrawBoundary} variant="secondary" onPress={() => { Keyboard.dismiss(); onDrawBoundary?.(currentGeometry); }} /><Button title={t("Done", "Готово")} disabled={busy || Boolean(failed)} onPress={() => void finish()} /></> : <View style={s.row}>
        <Button style={s.flex} title={t("Skip", "Прескокни")} variant="secondary" disabled={busy || Boolean(failed)} onPress={() => advance(true)} /><Button style={s.flex} title={t("Next", "Следно")} disabled={busy || Boolean(failed)} onPress={() => advance()} />
      </View>}
    </>}
    {busy ? <Note>{t("Saving this step…", "Се зачувува чекорот…")}</Note> : saved && step !== "done" ? <Note>{t("Completed steps saved", "Завршените чекори се зачувани")}</Note> : null}
    {message ? <Note>{message}</Note> : null}
    {failed ? <><Note>{t("Retry to save this step. Earlier completed steps are kept.", "Повторете го зачувувањето. Претходно завршените чекори се задржани.")}</Note><Button title={t("Retry saving", "Повтори зачувување")} disabled={busy} onPress={() => void save(failed)} /></> : null}
  </View>;
}
const styles = (colors: ThemeColors) => StyleSheet.create({
  root: { gap: 16 }, field: { gap: 7 }, flex: { flex: 1 }, row: { flexDirection: "row", gap: 10 },
  choice: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14 },
  title: { color: colors.ink, fontSize: 18, fontWeight: "700" }, label: { color: colors.ink, fontSize: 13, fontWeight: "600" }, progress: { color: colors.muted, fontSize: 12 },
  input: { color: colors.ink, fontSize: 16, backgroundColor: colors.input, minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13 },
});

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState, Image, Text, View } from "react-native";
import type { ParkingPlace } from "../domain/types";
import { api } from "../services/api";
import { openSmsComposer } from "../services/smsComposer";
import { useLicensePlate } from "../state/LicensePlateContext";
import { useParking } from "../state/ParkingContext";
import { useTheme } from "../state/ThemeContext";
import { Button, Note, Sheet } from "./ui";
import { isVerifiedSmsPayment } from "../domain/sms-payment";
import { parkingPrice } from "../domain/parking";

export function smsMessage(template: string, zone: string, plate: string, hours: number | null) {
  return template.replaceAll("{zone}", zone).replaceAll("{plate}", plate).replaceAll("{hours}", String(hours));
}
function ZoneOutline({ place }: { place: ParkingPlace }) {
  const { colors } = useTheme();
  const ring = place.geometry?.coordinates[0] ?? [];
  if (ring.length < 4) return null;
  const xs = ring.map(point => point[0]), ys = ring.map(point => point[1]);
  const left = Math.min(...xs), top = Math.max(...ys), scale = Math.min(200 / (Math.max(...xs) - left || 1), 90 / (top - Math.min(...ys) || 1));
  return <View accessibilityLabel={place.name} style={{ width: 220, height: 110, alignSelf: "center", backgroundColor: colors.mint, borderRadius: 10 }}>
    {ring.slice(0, -1).map((point, i) => {
      const x = 10 + (point[0] - left) * scale, y = 10 + (top - point[1]) * scale;
      const dx = (ring[i + 1][0] - point[0]) * scale, dy = (point[1] - ring[i + 1][1]) * scale, width = Math.hypot(dx, dy);
      return <View key={i} style={{ position: "absolute", left: x + dx / 2 - width / 2, top: y + dy / 2 - 1, height: 2, width, backgroundColor: colors.green, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
    })}
  </View>;
}
export default function ZonePaymentSheet({ place, validate, onClose }: { place: ParkingPlace | null; validate: (id: string, places?: ParkingPlace[]) => ParkingPlace | null; onClose: () => void }) {
  const { t } = useParking(), { colors } = useTheme(), account = useLicensePlate();
  const latestAccount = useRef(account); useLayoutEffect(() => { latestAccount.current = account; });
  const close = useRef(onClose); useLayoutEffect(() => { close.current = onClose; });
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [choice, setChoice] = useState<{ signature: string; hours: number } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [checked, setChecked] = useState<{ signature: string; place: ParkingPlace } | null>(null);
  const protocol = place?.smsPayment, plate = account.savedPlate;
  const signature = protocol ? JSON.stringify(protocol) : "", accountId = account.accountId, placeId = place?.id;
  const hours = choice && choice.signature === signature ? choice.hours : null;
  const checkedPlace = checked && checked.signature === signature && checked.place.id === placeId ? checked.place : null;
  const duration = protocol?.mode === "fixed-hours" ? hours : null;
  const body = protocol && plate ? smsMessage(protocol.startTemplate, protocol.zoneCode, plate, duration) : "";
  useEffect(() => {
    let active = true;
    if (!placeId || !signature) return;
    void Promise.all([api.catalog(), api.smsPayment(placeId)]).then(([catalog, fresh]) => {
      if (!active) return;
      const places = catalog.places.map(value => value.id === placeId ? { ...fresh.place, smsPayment: fresh.protocol ?? undefined } : value);
      if (!validate(placeId, places) || JSON.stringify(fresh.protocol) !== signature) { close.current(); return; }
      setChecked({ signature, place: { ...fresh.place, smsPayment: fresh.protocol! } }); setError("");
    }).catch(() => { if (active) close.current(); });
    return () => { active = false; };
  }, [placeId, signature, validate]);
  async function open() {
    if (!checkedPlace || !place || !protocol || !plate || busy || (protocol.mode === "fixed-hours" && !protocol.allowedHours?.includes(duration!))) return;
    setBusy(true); setError("");
    try {
      // Catalog overlap and immutable photo status both have to be current at send time.
      const [catalog, fresh] = await Promise.all([api.catalog(), api.smsPayment(place.id)]);
      const places = catalog.places.map(value => value.id === place.id ? { ...fresh.place, smsPayment: fresh.protocol ?? undefined } : value);
      const valid = validate(place.id, places);
      if (!valid || JSON.stringify(fresh.protocol) !== signature) throw new Error(t("Parking details changed. Review them again.", "Податоците се сменети. Проверете ги повторно."));
      const stillValid = () => mounted.current && Boolean(validate(place.id)) && isVerifiedSmsPayment(fresh.protocol) && latestAccount.current.accountId === accountId && latestAccount.current.savedPlate === plate;
      const result = await openSmsComposer(protocol.destination, body, stillValid);
      if (result === "opened") {
        if (protocol.mode === "start-stop" && protocol.stopTemplate) await account.setPendingStop({ zoneId: place.id, zoneName: place.name, recipient: protocol.destination, stopMessage: smsMessage(protocol.stopTemplate, protocol.zoneCode, plate, null), photoId: protocol.photoId, protocolExpiresAt: protocol.expiresAt, openedAt: Date.now(), plate });
        onClose();
      } else if (result !== "cancelled") setError(t("SMS is unavailable here. Use the number and message shown.", "SMS не е достапна. Користете ги прикажаните број и порака."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("Could not open SMS. Try again.", "SMS не се отвори. Обидете се повторно.")); }
    finally { setBusy(false); }
  }
  const sign = checkedPlace?.signInfo;
  const price = checkedPlace ? parkingPrice(checkedPlace) : null;
  const chargingHours = sign?.chargingHours ?? checkedPlace?.paymentSchedule?.chargingHours;
  return <Sheet visible={Boolean(place && protocol && plate)} title={t("Pay for parking by SMS", "Платете паркинг со SMS")} onClose={onClose} footer={<Button title={busy || !checkedPlace ? t("Checking…", "Се проверува…") : t("Open SMS", "Отвори SMS")} disabled={busy || !checkedPlace || (protocol?.mode === "fixed-hours" && !protocol.allowedHours?.includes(duration!))} onPress={() => void open()} />}>
    {checkedPlace ? <>
    <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "700" }}>{checkedPlace.zoneCode} · {checkedPlace.name}</Text>
    <ZoneOutline place={checkedPlace} />
    {price ? <>
      <Text style={{ color: colors.ink }}>{t("First hour", "Прв час")}: {price.firstHour} MKD</Text>
      <Text style={{ color: colors.ink }}>{t("Following hour", "Следен час")}: {price.nextHour} MKD</Text>
    </> : <Text style={{ color: colors.ink }}>{t("Price not shown", "Нема наведена цена")}</Text>}
    {protocol?.maxStayMinutes ? <Text style={{ color: colors.ink }}>{t("Maximum stay", "Максимален престој")}: {protocol.maxStayMinutes} {t("min", "мин")}</Text> : null}
    <Text style={{ color: colors.ink }}>{t("Paying hours", "Часови за плаќање")}: {chargingHours ?? t("Not on sign / unknown", "Нема на таблата / непознато")}</Text>
    {protocol?.mode === "fixed-hours" ? <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{protocol.allowedHours?.map(value => <Button key={value} title={`${value} ${value === 1 ? t("Hour", "Час").toLocaleLowerCase() : t("hours", "часа")}`} variant={hours === value ? "primary" : "secondary"} onPress={() => setChoice({ signature, hours: value })} />)}</View> : null}
    <Text selectable style={{ color: colors.ink }}>{t("SMS number", "SMS број")}: {protocol?.destination}</Text>
    <Text selectable style={{ color: colors.ink, fontWeight: "700" }}>{protocol?.mode === "fixed-hours" && duration === null ? protocol.startTemplate : body}</Text>
    {protocol?.mode === "start-stop" && protocol.stopTemplate ? <Text selectable style={{ color: colors.ink }}>{t("When you leave, send", "Кога ќе заминете, испратете")}: {smsMessage(protocol.stopTemplate, protocol.zoneCode, plate ?? "", null)}</Text> : null}
    {protocol ? <Image source={{ uri: api.imageUrl(protocol.photoId) }} accessibilityLabel={t("Original sign photo", "Оригинална слика од табла")} resizeMode="contain" style={{ height: 180, width: "100%", backgroundColor: colors.mint, borderRadius: 10 }} /> : null}
    <Note>{t("Wait for the operator’s confirmation.", "Почекајте потврда од операторот.")}</Note>
    </> : <Note>{t("Checking…", "Се проверува…")}</Note>}
    {error ? <Note>{error}</Note> : null}
  </Sheet>;
}

export function ParkingSmsStopSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const account = useLicensePlate(), { t } = useParking(), { colors } = useTheme();
  const latest = useRef({ account, visible }); useLayoutEffect(() => { latest.current = { account, visible }; });
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const session = account.pendingStop;
  async function stop() {
    if (!session || busy) return;
    setBusy(true); setError("");
    try {
      const fresh = await api.smsPayment(session.zoneId), protocol = fresh.protocol;
      const valid = () => Boolean(mounted.current && AppState.currentState === "active" && latest.current.visible && latest.current.account.accountId === account.accountId && latest.current.account.pendingStop === session && protocol && isVerifiedSmsPayment(protocol) && protocol.photoId === session.photoId && protocol.destination === session.recipient && protocol.mode === "start-stop" && protocol.stopTemplate && smsMessage(protocol.stopTemplate, protocol.zoneCode, session.plate, null) === session.stopMessage);
      if (!valid()) throw new Error(t("Parking details changed. Review them again.", "Податоците се сменети. Проверете ги повторно."));
      const result = await openSmsComposer(session.recipient, session.stopMessage, valid);
      if (result === "opened") onClose();
      else if (result !== "cancelled") setError(t("SMS is unavailable here. Use the number and message shown.", "SMS не е достапна. Користете ги прикажаните број и порака."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("Could not open SMS. Try again.", "SMS не се отвори. Обидете се повторно.")); }
    finally { setBusy(false); }
  }
  return <Sheet visible={visible && Boolean(session)} title={t("Parking SMS", "Паркинг SMS")} onClose={onClose} footer={<Button title={t("Open stop SMS", "Отвори SMS за крај")} disabled={busy} onPress={() => void stop()} />}>
    <Text style={{ color: colors.ink, fontWeight: "700" }}>{session?.zoneName}</Text>
    <Text style={{ color: colors.ink }}>{session?.plate}</Text>
    <Text selectable style={{ color: colors.ink }}>{t("SMS number", "SMS број")}: {session?.recipient}</Text>
    <Text selectable style={{ color: colors.ink }}>{session?.stopMessage}</Text>
    <Note>{t("Wait for the operator’s confirmation.", "Почекајте потврда од операторот.")}</Note>
    <Button variant="secondary" title={t("Dismiss reminder", "Отстрани потсетник")} disabled={busy} onPress={() => {
      setBusy(true);
      void account.clearPendingStop().then(onClose).catch(() => setError(t("Could not save. Try again.", "Не е зачувано. Обидете се повторно."))).finally(() => setBusy(false));
    }} />
    {error ? <Note>{error}</Note> : null}
  </Sheet>;
}

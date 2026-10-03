import { useTheme, type ThemeColors } from "../state/ThemeContext";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import Page from "../components/Page";
import { Button, Note, Sheet } from "../components/ui";
import { useParking } from "../state/ParkingContext";
import { api } from "../services/api";
import { useAccount } from "../state/AccountContext";
export default function Privacy() {
  const account = useAccount();
  const { colors } = useTheme();
  const s = styles(colors);
  const { t, connected, refresh } = useParking();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      await api.deleteSession();
      await account.clear();
      setConfirmDelete(false);
      await refresh();
      setMessage(
        t(
          "Your account, points, reports and confirmations were deleted.",
          "Вашиот профил, поени, пријави и потврди се избришани.",
        ),
      );
    } catch {
      setMessage(
        t(
          "Could not delete. Connect and try again.",
          "Неуспешно бришење. Поврзете се и обидете се повторно.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title={t("Privacy", "Приватност")}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.content}
      >
        <Text style={s.title}>{t("Location", "Локација")}</Text>
        <Note>
          {t(
            "GPS finds nearby parking and can ask a quick question after about 10 seconds of accurate, stationary readings. Optional background reminders use location even when the app is minimized; your phone controls delivery timing, and force-closing can stop them. The latest arrival location and reminder cooldowns stay on this device and are cleared when you turn reminders off or sign out. Adding a parking place shares its coordinates; an availability report shares the parking ID. Address searches, maps and navigation use their providers’ services.",
            "GPS наоѓа блиски паркинзи и може да постави кратко прашање по околу 10 секунди прецизни, неподвижни мерења. Потсетниците во заднина се по избор и користат локација и кога апликацијата е минимизирана; телефонот го одредува времето на испорака, а присилното затворање може да ги запре. Последната локација на пристигнување и паузите меѓу потсетниците остануваат на уредот и се бришат кога ги исклучувате потсетниците или се одјавувате. Додавањето паркинг ги споделува неговите координати; пријавата го споделува идентификаторот на паркингот. Пребарувањето, мапите и навигацијата користат услуги од нивните провајдери.",
          )}
        </Note>
        <Note>
          {t(
            "Sign photos and drawn zones are public. Photos are sent to Google Gemini to read prices and sign details. Upload only the sign, without faces or registration plates.",
            "Сликите од табли и нацртаните зони се јавни. Сликите се испраќаат до Google Gemini за читање на цените и деталите. Прикачувајте само табли, без лица или регистарски таблички.",
          )}
        </Note>
        <Text style={s.subhead}>{t("What is saved", "Што се зачувува")}</Text>
        <Note>
          {t(
            "The server stores your username, a salted password hash if you set a password, hashed sign-in tokens, contribution points and history, parking reports, prices, coordinates, boundaries and confirmations. Your password is never stored as plain text. Price reports and location confirmations are displayed for 90 days. Shared parking details and confirmation counts are public. Do not include names, registration plates or other personal information in notes. Availability reports expire after 15 minutes.",
            "Серверот зачувува корисничко име, безбедно хеширана лозинка ако ја поставите, хеширани токени за најава, поени и историја на придонеси, пријави, цени, координати, граници и потврди. Лозинката не се чува како обичен текст. Цените и потврдите се прикажуваат 90 дена. Деталите за паркинзи и бројот на потврди се јавни. Не внесувајте имиња, регистарски таблички или лични податоци. Пријавите за достапност истекуваат по 15 минути.",
          )}
        </Note>
        <Text style={s.subhead}>
          {t("Delete contributor data", "Избриши кориснички податоци")}
        </Text>
        <Note>
          {t(
            "Deleting removes your username, password, all sign-in sessions, points, uploaded photos, zone-label edits, price and availability reports and confirmations. Published parking locations and boundaries remain on the shared map. To keep your account and use it later, sign out from Your account instead.",
            "Бришењето ги отстранува името, лозинката, сите сесии, поените, сликите, измените на ознаки, пријавите и потврдите. Објавените паркинзи и граници остануваат на заедничката мапа. За да го зачувате профилот за подоцна, одјавете се преку Вашиот профил.",
          )}
        </Note>
        <Button
          title={
            busy
              ? t("Deleting…", "Се брише…")
              : t("Delete my contributor data", "Избриши ги моите податоци")
          }
          variant="danger"
          disabled={busy || !connected || !account.profile}
          onPress={() => setConfirmDelete(true)}
        />
        {message ? <Note>{message}</Note> : null}
      </ScrollView>
      <Sheet visible={confirmDelete} title={t("Delete your account?", "Да се избрише профилот?")} onClose={() => { if (!busy) setConfirmDelete(false); }}>
        <Note>{t("Your username, points and private account data will be permanently removed. You cannot sign back in to this account after deletion.", "Вашето име, поени и приватни податоци трајно ќе се избришат. По бришењето нема да можете повторно да се најавите на овој профил.")}</Note>
        <Button title={busy ? t("Deleting…", "Се брише…") : t("Delete account permanently", "Трајно избриши профил")} variant="danger" disabled={busy} onPress={() => void remove()} />
        <Button title={t("Keep my account", "Задржи го профилот")} variant="secondary" disabled={busy} onPress={() => setConfirmDelete(false)} />
      </Sheet>
    </Page>
  );
}
const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      padding: 24,
      gap: 20,
      maxWidth: 720,
      width: "100%",
      alignSelf: "center",
    },
    title: { fontSize: 30, color: colors.ink, fontWeight: "800" },
    subhead: { fontSize: 19, color: colors.ink, fontWeight: "700" },
  });

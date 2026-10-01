import { useTheme, type ThemeColors } from "../state/ThemeContext";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import Page from "../components/Page";
import { Button, Note } from "../components/ui";
import { useParking } from "../state/ParkingContext";
import { api } from "../services/api";
import { useAccount } from "../state/AccountContext";
export default function Privacy() {
  const account = useAccount();
  const { colors } = useTheme();
  const s = styles(colors);
  const { t, connected, refresh } = useParking();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      await api.deleteSession();
      await account.clear();
      await refresh();
      setMessage(
        t(
          "Contributor session, reports and confirmations deleted.",
          "Корисничката сесија, пријавите и потврдите се избришани.",
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
            "GPS finds nearby parking and detects a stop of about 35 seconds while the app is open. Your location history stays on the device. Adding a parking place shares its coordinates; an availability report shares the parking ID. Address searches, maps and navigation use their providers’ services.",
            "GPS наоѓа блиски паркинзи и препознава застанување од околу 35 секунди додека апликацијата е отворена. Историјата на локации останува на уредот. Додавањето паркинг ги споделува неговите координати; пријавата за места го споделува идентификаторот на паркингот. Пребарувањето, мапите и навигацијата користат услуги од нивните провајдери.",
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
            "The server stores a hashed anonymous session token, session age, parking availability reports, driver prices, proposed parking coordinates and details, and confirmations. Price reports and location confirmations are displayed for 90 days. Proposal details and confirmation counts are public. Do not include names, registration plates or other personal information in notes. Reports are ignored after 15 minutes and cleaned up on subsequent reports.",
            "Серверот зачувува хеширан анонимен токен, старост на сесија, пријави за достапност, цени од возачи, координати и детали за нови паркинзи и потврди. Цените и потврдите за локации се прикажуваат 90 дена. Деталите за предлози и бројот на потврди се јавни. Не внесувајте имиња, регистарски таблички или лични податоци. Пријавите не важат по 15 минути и се чистат со следни пријави.",
          )}
        </Note>
        <Text style={s.subhead}>
          {t("Delete contributor data", "Избриши кориснички податоци")}
        </Text>
        <Note>
          {t(
            "This removes your username, account, uploaded photos, zone-label edits, price and availability reports and confirmations. Published parking locations and zone boundaries remain on the shared map. Your account is saved on this device; account recovery is not available in this demo.",
            "Се бришат корисничкото име, сметката, сликите, измените на ознаки, пријавите и потврдите. Објавените паркинг локации и граници на зони остануваат на заедничката мапа. Сметката е зачувана на овој уред; обновување не е достапно во демото.",
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
          onPress={() => void remove()}
        />
        {message ? <Note>{message}</Note> : null}
      </ScrollView>
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

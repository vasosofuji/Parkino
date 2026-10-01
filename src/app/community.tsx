import { useTheme, type ThemeColors } from "../state/ThemeContext";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Page from "../components/Page";
import { Button, Icon, Note } from "../components/ui";
import { useParking } from "../state/ParkingContext";
import { api } from "../services/api";
export default function Community() {
  const { colors } = useTheme();
  const s = styles(colors);
  const { catalog, proposals, t, connected, refresh } = useParking();
  const [busyId, setBusyId] = useState<string | null>(null),
    [message, setMessage] = useState("");
  async function vote(id: string) {
    setBusyId(id);
    setMessage("");
    try {
      const value = await api.vote(id);
      await refresh();
      setMessage(
        value.status === "published"
          ? t(
              "Confirmed and added to the map.",
              "Потврдено и додадено на мапата.",
            )
          : t(
              "Your confirmation is recorded.",
              "Потврдата е зачувана.",
            ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("Could not confirm.", "Неуспешна потврда."),
      );
    } finally {
      setBusyId(null);
    }
  }
  const visibleProposals = useMemo(
    () => proposals.filter((p) => p.status !== "rejected"),
    [proposals],
  );
  return (
    <Page title={t("Community", "Заедница")}>
      <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        data={visibleProposals}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.content}
        ListHeaderComponent={
          <View style={s.intro}>
            <Text style={s.headline}>
              {t(
                "A better map starts\nwith what you know.",
                "Подобра мапа почнува\nсо вашето знаење.",
              )}
            </Text>
            <Note>
              {catalog.trustInputs ? t("Your contributions appear on the map immediately.", "Вашите придонеси веднаш се прикажуваат на мапата.") : t(
                "Confirm only parking places you know. Three established contributor sessions add a location to the map. Repeated confirmations from one session count once.",
                "Потврдете само локации што ги познавате. Три воспоставени кориснички сесии додаваат локација на мапата. Повторна потврда од иста сесија се брои еднаш.",
              )}
            </Note>
            {message ? (
              <Text accessibilityLiveRegion="polite" style={s.message}>
                {message}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Icon name="users" size={40} />
            <Text style={s.emptyTitle}>
              {t(
                "No places awaiting confirmation",
                "Нема локации што чекаат потврда",
              )}
            </Text>
            <Note>
              {t(
                "Know a parking place we missed? Add its exact position from the map.",
                "Знаете паркинг што недостасува? Додајте ја точната локација од мапата.",
              )}
            </Note>
            <Button
              title={t("Back to the map", "Назад кон мапата")}
              onPress={() => router.replace("/")}
            />
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.state}>
                {item.status === "published"
                  ? t("On the map", "На мапата")
                  : t("Pending", "Во исчекување")}
              </Text>
            </View>
            <Note>
              {item.zoneCode ?? t("No sign code supplied", "Нема внесен код")} ·{" "}
              {item.coordinate.latitude.toFixed(5)},{" "}
              {item.coordinate.longitude.toFixed(5)}
            </Note>
            <Text style={s.note}>{item.note}</Text>
            <Text style={s.progress}>
              {item.eligibleVotes} / {item.requiredVotes}{" "}
              {t("eligible confirmations", "важечки потврди")} · {item.votes}{" "}
              {t("total", "вкупно")}
            </Text>
            <Button
              title={
                busyId === item.id
                  ? t("Confirming…", "Се потврдува…")
                  : t("I know this parking place", "Го познавам овој паркинг")
              }
              variant="secondary"
              icon="check"
              disabled={
                !connected || busyId !== null || item.status !== "pending"
              }
              onPress={() => void vote(item.id)}
            />
          </View>
        )}
      />
    </Page>
  );
}
const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      padding: 24,
      maxWidth: 760,
      width: "100%",
      alignSelf: "center",
      gap: 16,
    },
    intro: { gap: 16, marginBottom: 18 },
    headline: {
      color: colors.ink,
      fontSize: 32,
      lineHeight: 37,
      fontWeight: "800",
      letterSpacing: -1,
    },
    message: { color: colors.green, fontSize: 14, lineHeight: 22 },
    empty: { paddingVertical: 30, gap: 18 },
    emptyTitle: { color: colors.ink, fontSize: 20, fontWeight: "700" },
    card: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 18,
      padding: 20,
      gap: 14,
    },
    cardHeader: { flexDirection: "row", gap: 12, alignItems: "center" },
    name: { flex: 1, fontSize: 18, fontWeight: "700", color: colors.ink },
    state: { color: colors.green, fontSize: 11, fontWeight: "700" },
    note: { color: colors.ink, fontSize: 15, lineHeight: 23 },
    progress: { color: colors.green, fontWeight: "700", fontSize: 12 },
  });

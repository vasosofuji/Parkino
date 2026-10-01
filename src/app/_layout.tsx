import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ParkingProvider } from "../state/ParkingContext";
import { ThemeProvider, useTheme } from "../state/ThemeContext";
import { AccountProvider, useAccount } from "../state/AccountContext";
import { ActivityIndicator, View } from "react-native";
import { ModalBackgroundProvider } from "../components/ModalBackdrop";
import AppStyles from "../components/AppStyles";
function Navigator() {
  const { dark, colors } = useTheme();
  const { profile, ready } = useAccount();
  if (!ready)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.paper,
        }}
      >
        <ActivityIndicator color={colors.green} />
      </View>
    );
  return (
    <ParkingProvider>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        <Stack.Protected guard={Boolean(profile)}>
          <Stack.Screen name="index" />
          <Stack.Screen name="coverage" />
          <Stack.Screen name="community" />
        </Stack.Protected>
        <Stack.Protected guard={!profile}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Screen name="terms" />
        <Stack.Screen name="privacy" />
      </Stack>
    </ParkingProvider>
  );
}
export default function Layout() {
  return (
    <ThemeProvider>
      <AppStyles />
      <AccountProvider>
        <ModalBackgroundProvider><Navigator /></ModalBackgroundProvider>
      </AccountProvider>
    </ThemeProvider>
  );
}

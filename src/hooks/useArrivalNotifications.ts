import { useEffect } from "react";
import { AppState } from "react-native";
import { router, useRootNavigationState } from "expo-router";
import { listenForArrivalNotifications, resumeBackgroundArrival } from "../services/backgroundArrival";

export function useArrivalNotifications(signedIn: boolean) {
  const navigation = useRootNavigationState();
  useEffect(() => {
    if (!signedIn || !navigation?.key) return;
    const remove = listenForArrivalNotifications(() => router.navigate("/"));
    const resume = () => { void resumeBackgroundArrival().catch(() => {}); };
    resume();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") resume(); });
    return () => { remove(); subscription.remove(); };
  }, [signedIn, navigation?.key]);
}

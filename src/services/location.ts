import * as Location from "expo-location";
import { Platform } from "react-native";
import {
  startNativeLocation,
  type LocationIssue,
} from "../domain/locationWatch";
import type { Fix } from "../domain/arrival";
export async function watchLocation(
  onFix: (fix: Fix) => void,
  onIssue: (issue: LocationIssue) => void,
) {
  return startNativeLocation(
    {
      permission: Location.getForegroundPermissionsAsync,
      requestPermission: Location.requestForegroundPermissionsAsync,
      servicesEnabled: Location.hasServicesEnabledAsync,
      enableServices:
        Platform.OS === "android"
          ? Location.enableNetworkProviderAsync
          : undefined,
      cached: () =>
        Location.getLastKnownPositionAsync({
          maxAge: 15000,
          requiredAccuracy: 1000,
        }),
      current: () =>
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          mayShowUserSettingsDialog: true,
        }),
      watch: (success, failure) =>
        Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 0,
            mayShowUserSettingsDialog: true,
          },
          success,
          failure,
        ),
    },
    { onFix, onIssue },
  );
}

import React from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import GoogleParkingMap from "./GoogleParkingMap";
import OpenStreetParkingMap from "./OpenStreetParkingMap";
import type { ParkingMapProps } from "./mapTypes";
export default function ParkingMap(props: ParkingMapProps) {
  return Platform.OS === "android" &&
    !Constants.expoConfig?.extra?.androidNativeMapsEnabled ? (
    <OpenStreetParkingMap {...props} />
  ) : (
    <GoogleParkingMap {...props} />
  );
}

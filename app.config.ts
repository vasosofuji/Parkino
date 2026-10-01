import type { ConfigContext, ExpoConfig } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => {
  if (["preview", "production"].includes(process.env.EAS_BUILD_PROFILE ?? "") && process.env.EXPO_PUBLIC_OFFLINE_PREVIEW !== "1") {
    const url = new URL(process.env.EXPO_PUBLIC_API_URL ?? "http://localhost");
    if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      throw new Error("Connected APK builds require a public HTTPS EXPO_PUBLIC_API_URL.");
  }
  return ({
  ...config,
  name: "Parking",
  slug: "parkskopje",
  extra: {
    ...config.extra,
    androidNativeMapsEnabled: Boolean(process.env.GOOGLE_MAPS_ANDROID_KEY),
  },
  plugins: [
    ...(config.plugins ?? []),
    "./plugins/with-short-cmake-paths",
    "expo-secure-store",
    [
      "expo-image-picker",
      {
        photosPermission: "Choose a parking sign photo to share its prices.",
        cameraPermission: "Photograph parking signs to share their prices.",
        microphonePermission: false,
      },
    ],
    [
      "expo-build-properties",
      { android: { buildArchs: ["arm64-v8a", "armeabi-v7a"] } },
    ],
    ...(process.env.GOOGLE_MAPS_ANDROID_KEY
      ? [
          [
            "react-native-maps",
            { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_KEY },
          ] as [string, Record<string, string>],
        ]
      : []),
  ],
  });
};

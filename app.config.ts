import type { ConfigContext, ExpoConfig } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => {
  const testPackage = process.env.PARKINO_TEST_PACKAGE === "1" || process.env.PARKINO_DEVICE_TEST === "1";
  if (["preview", "production"].includes(process.env.EAS_BUILD_PROFILE ?? "") && process.env.EXPO_PUBLIC_OFFLINE_PREVIEW !== "1") {
    const url = new URL(process.env.EXPO_PUBLIC_API_URL ?? "http://localhost");
    const host = url.hostname.replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || /(^|\.)(localhost|local|internal|invalid|test)$/.test(host))
      throw new Error("Connected APK builds require a public HTTPS EXPO_PUBLIC_API_URL.");
  }
  return ({
  ...config,
  name: testPackage ? "Parking Test" : "Parking",
  slug: "parkskopje",
  ...(testPackage ? {
    android: { ...config.android, package: "mk.parkskopje.app.dev" },
    ios: { ...config.ios, bundleIdentifier: "mk.parkskopje.app.dev" },
    scheme: "parkskopje-test",
  } : {}),
  extra: {
    ...config.extra,
    androidNativeMapsEnabled: Boolean(process.env.GOOGLE_MAPS_ANDROID_KEY),
    usbTest: process.env.PARKINO_DEVICE_TEST === "1",
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
      { android: { buildArchs: ["arm64-v8a", "armeabi-v7a"], usesCleartextTraffic: process.env.PARKINO_DEVICE_TEST === "1" } },
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

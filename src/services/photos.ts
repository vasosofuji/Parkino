import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";
import type { PhotoUpload } from "../domain/types";
export type ChosenPhoto = PhotoUpload & { uri: string };
export async function chooseSignPhoto(
  camera = false,
): Promise<ChosenPhoto | null> {
  if (camera && Platform.OS !== "web") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      throw new Error("Allow camera access in Settings, or choose a photo.");
  }
  const result = await (
    camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync
  )({ mediaTypes: ["images"], quality: 1, exif: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > 1600)
    context.resize(
      asset.width >= asset.height ? { width: 1600 } : { height: 1600 },
    );
  const rendered = await context.renderAsync();
  try {
    const image = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.82,
      base64: true,
    });
    if (!image.base64 || image.base64.length > 2796200)
      throw new Error("Choose a smaller or more tightly cropped sign photo.");
    return { uri: image.uri, base64: image.base64, mimeType: "image/jpeg" };
  } finally {
    rendered.release();
    context.release();
  }
}

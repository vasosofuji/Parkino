import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
const KEY = "parkskopje-session";
export const credentials = {
  async get() {
    const saved = await SecureStore.getItemAsync(KEY);
    if (saved) return saved;
    const legacy = await AsyncStorage.getItem(KEY);
    if (legacy) {
      await SecureStore.setItemAsync(KEY, legacy);
      await AsyncStorage.removeItem(KEY);
    }
    return legacy;
  },
  set: (token: string) => SecureStore.setItemAsync(KEY, token),
  async remove() {
    await SecureStore.deleteItemAsync(KEY);
    await AsyncStorage.removeItem(KEY);
  },
};

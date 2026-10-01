import AsyncStorage from "@react-native-async-storage/async-storage";
const KEY = "parkskopje-session";
export const credentials = {
  get: () => AsyncStorage.getItem(KEY),
  set: (value: string) => AsyncStorage.setItem(KEY, value),
  remove: () => AsyncStorage.removeItem(KEY),
};

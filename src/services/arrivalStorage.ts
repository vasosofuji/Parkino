import AsyncStorage from "@react-native-async-storage/async-storage";
import { emptyReminderState, type ReminderState } from "../domain/backgroundArrival";
import type { ParkingPlace } from "../domain/types";

const STATE = "parkskopje-arrival-state-v1";
const ENABLED = "parkskopje-background-arrival-v1";
const CATALOG = "parkskopje-arrival-catalog-v1";
let queue = Promise.resolve();

/** Serialize UI and task mutations so a foreground/background transition cannot double-prompt. */
export function arrivalTransaction<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work);
  queue = result.then(() => undefined, () => undefined);
  return result;
}
export async function readArrivalState(): Promise<ReminderState> {
  try {
    const raw = await AsyncStorage.getItem(STATE);
    const value = raw ? JSON.parse(raw) as ReminderState : null;
    if (value && Array.isArray(value.detector?.prompted)) return value;
  } catch { /* A damaged cache must not prevent foreground parking use. */ }
  return emptyReminderState();
}
export const saveArrivalState = (state: ReminderState) => AsyncStorage.setItem(STATE, JSON.stringify(state));
export const backgroundArrivalEnabled = async () => (await AsyncStorage.getItem(ENABLED)) === "true";
export const saveBackgroundArrivalEnabled = (enabled: boolean) => AsyncStorage.setItem(ENABLED, String(enabled));
export const saveArrivalCatalog = (places: ParkingPlace[]) => AsyncStorage.setItem(CATALOG, JSON.stringify(places));
export async function readArrivalCatalog(): Promise<ParkingPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(CATALOG);
    const places = raw ? JSON.parse(raw) : [];
    return Array.isArray(places) ? places : [];
  } catch { return []; }
}
export const clearArrivalStorage = () => AsyncStorage.multiRemove([STATE, CATALOG]);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createEntryDraftStore as createStore, readEntryDraft as readDraft, type EntryDraft } from "../domain/entry-drafts";
export { entryDraftKey, availabilityIsFresh, type EntryDraft, type EntryStep, type EntryOperation } from "../domain/entry-drafts";
export const readEntryDraft = (key: string) => readDraft(AsyncStorage, key);
export const createEntryDraftStore = (accountId: string, key: string, initial: EntryDraft) => createStore(AsyncStorage, accountId, key, initial);

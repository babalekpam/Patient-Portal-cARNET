import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { assertStorageKey, SecureStorageEngine } from "./secureStorageCore";

const GLOBAL_KEYS = new Set(["carnet_auth_token", "carnet_session_metadata", "carnet_biometric_enabled"]);
const PHI_KEYS = [
  "scanned_documents", "family_members", "health_metrics", "symptom_history",
  "medication_reminders", "offline_pending_queue", "carnet_push_token", "carnet_allow_sharing",
];
const isPatientKey = (key: string) => PHI_KEYS.includes(key) || key.startsWith("offline_cache_");
const memory = new Map<string, string>();
const engine = new SecureStorageEngine({
  get: key => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }),
  remove: key => SecureStore.deleteItemAsync(key),
});
let queue: Promise<unknown> = Promise.resolve();
let active = false;
let epoch = 0;
const cleanups = new Set<() => void | Promise<void>>();
const clearListeners = new Set<() => void>();

export function capturePatientDataEpoch(): number {
  if (!active) throw new Error("Session ended. Sign in again.");
  return epoch;
}

export function assertPatientDataEpoch(expected: number): void {
  if (!active || expected !== epoch) throw new Error("Session ended or local data was cleared. Please try again.");
}

export function isPatientDataEpochCurrent(expected: number): boolean {
  return active && expected === epoch;
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  queue = result.catch(() => {});
  return result;
}

function checkKey(key: string) {
  assertStorageKey(key);
  if (!GLOBAL_KEYS.has(key) && !isPatientKey(key)) throw new Error("Unregistered sensitive storage key.");
}

export function registerSecureCleanup(cleanup: () => void | Promise<void>): () => void {
  cleanups.add(cleanup);
  return () => { cleanups.delete(cleanup); };
}

export function subscribeToPatientDataClear(listener: () => void): () => void {
  clearListeners.add(listener);
  return () => { clearListeners.delete(listener); };
}

export function setSecureItem(key: string, value: string): Promise<void> {
  checkKey(key);
  const started = epoch;
  return serialized(async () => {
    if (started !== epoch || (!active && isPatientKey(key))) throw new Error("Session ended. Sign in again.");
    if (Platform.OS === "web") {
      // Never persist tokens or PHI to localStorage, sessionStorage or IndexedDB.
      if (value.length > 90000) throw new Error("Local record is too large to store safely.");
      memory.set(key, value);
    } else {
      await engine.set(key, value);
    }
    if (started !== epoch) throw new Error("Session ended. Sign in again.");
  });
}

export function getSecureItem(key: string): Promise<string | null> {
  checkKey(key);
  const started = epoch;
  return serialized(async () => {
    if (started !== epoch || (!active && isPatientKey(key))) return null;
    const value = Platform.OS === "web" ? memory.get(key) ?? null : await engine.get(key);
    return started === epoch ? value : null;
  });
}

export function deleteSecureItem(key: string): Promise<void> {
  checkKey(key);
  return serialized(async () => {
    memory.delete(key);
    if (Platform.OS !== "web") await engine.remove(key);
  });
}

async function purgeLegacyStorage(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const sensitive = keys.filter(k => isPatientKey(k) || GLOBAL_KEYS.has(k));
  if (sensitive.length) await AsyncStorage.multiRemove(sensitive);
  if (Platform.OS === "web" && typeof sessionStorage !== "undefined") {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && (isPatientKey(key) || GLOBAL_KEYS.has(key))) sessionStorage.removeItem(key);
    }
  }
  if (Platform.OS !== "web") {
    const files = await import("expo-file-system/legacy");
    // Expo owns this app-private picker cache. Remove old plaintext photo copies,
    // including copies left by a crash; never follow a stored/user-supplied URI.
    if (files.cacheDirectory) {
      await files.deleteAsync(`${files.cacheDirectory}ImagePicker`, { idempotent: true });
    }
  }
}

async function purgePatientRecords(): Promise<void> {
  const failures: unknown[] = [];
  for (const key of memory.keys()) if (!GLOBAL_KEYS.has(key)) memory.delete(key);
  try {
    if (Platform.OS !== "web") {
      const keys = new Set([...PHI_KEYS, ...await engine.keys()]);
      for (const key of keys) {
        if (GLOBAL_KEYS.has(key)) continue;
        try { await engine.remove(key); } catch (error) { failures.push(error); }
      }
    }
  } catch (error) {
    failures.push(error);
  }
  try { await purgeLegacyStorage(); } catch (error) { failures.push(error); }
  // Run every cleanup even if one fails; surface failures instead of claiming erasure.
  const results = await Promise.allSettled([...cleanups].map(cleanup => Promise.resolve().then(cleanup)));
  if (failures.length || results.some(result => result.status === "rejected")) {
    throw new Error("Some local data could not be cleared. Close the app and try again.");
  }
}

export function clearPatientData(): Promise<void> {
  epoch++;
  let listenerFailed = false;
  for (const listener of clearListeners) {
    try { listener(); } catch { listenerFailed = true; }
  }
  return serialized(async () => {
    await purgePatientRecords();
    if (listenerFailed) throw new Error("Local view cleanup failed. Close the app and try again.");
  });
}

export function clearSecureSession(): Promise<void> {
  active = false;
  return clearPatientData();
}

export async function beginSecureSession(): Promise<void> {
  active = false;
  const clearing = clearPatientData();
  const started = epoch;
  await clearing;
  if (started !== epoch) throw new Error("Sign in was cancelled.");
  active = true;
}
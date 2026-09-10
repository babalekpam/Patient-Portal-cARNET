import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  assertPatientDataEpoch,
  capturePatientDataEpoch,
  getSecureItem,
  registerSecureCleanup,
  setSecureItem,
} from "@/lib/secureStorage";

const REMINDERS_KEY = "medication_reminders";

export interface MedicationReminder {
  id: string;
  prescriptionId: string;
  medicationName: string;
  dosage: string;
  instructions: string;
  times: string[];
  enabled: boolean;
  notificationIds: string[];
  takenToday: Record<string, boolean>;
}

let _notificationsModule: typeof import("expo-notifications") | null = null;
let _initialized = false;

async function getNotifications() {
  if (Platform.OS === "web") return null;
  if (_notificationsModule) return _notificationsModule;
  try {
    _notificationsModule = await import("expo-notifications");
    return _notificationsModule;
  } catch {
    return null;
  }
}

async function ensureInitialized() {
  if (_initialized) return;
  _initialized = true;
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("medication-reminders", {
        name: "Medication Reminders",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1a6fbf",
        sound: "default",
      });
    }
  } catch {}
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const expectedEpoch = capturePatientDataEpoch();
  try {
    await ensureInitialized();
    assertPatientDataEpoch(expectedEpoch);
    const Notifications = await getNotifications();
    assertPatientDataEpoch(expectedEpoch);
    if (!Notifications) return null;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    assertPatientDataEpoch(expectedEpoch);
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      assertPatientDataEpoch(expectedEpoch);
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    assertPatientDataEpoch(expectedEpoch);
    return tokenData.data;
  } catch {
    return null;
  }
}

export async function requestNotificationPermissions(expectedEpoch = capturePatientDataEpoch()): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    await ensureInitialized();
    assertPatientDataEpoch(expectedEpoch);
    const Notifications = await getNotifications();
    assertPatientDataEpoch(expectedEpoch);
    if (!Notifications) return false;
    const { status: existing } = await Notifications.getPermissionsAsync();
    assertPatientDataEpoch(expectedEpoch);
    if (existing === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync();
    assertPatientDataEpoch(expectedEpoch);
    return status === "granted";
  } catch {
    return false;
  }
}

export async function getReminders(): Promise<MedicationReminder[]> {
  const expectedEpoch = capturePatientDataEpoch();
  const raw = await getSecureItem(REMINDERS_KEY);
  await AsyncStorage.removeItem(REMINDERS_KEY).catch(() => {});
  assertPatientDataEpoch(expectedEpoch);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Invalid reminder data.");
    return parsed;
  } catch {
    throw new Error("Saved reminders could not be read securely.");
  }
}

export async function saveReminders(reminders: MedicationReminder[]): Promise<void> {
  await setSecureItem(REMINDERS_KEY, JSON.stringify(reminders));
  await AsyncStorage.removeItem(REMINDERS_KEY).catch(() => {});
}

export async function scheduleReminder(
  reminder: MedicationReminder,
  expectedEpoch = capturePatientDataEpoch(),
): Promise<string[]> {
  await ensureInitialized();
  assertPatientDataEpoch(expectedEpoch);
  const Notifications = await getNotifications();
  assertPatientDataEpoch(expectedEpoch);
  if (!Notifications) return [];
  const notificationIds: string[] = [];

  for (const time of reminder.times) {
    const [hours, minutes] = time.split(":").map(Number);

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "CARNET reminder",
          body: "Open CARNET to view your reminder.",
          data: {},
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: hours,
          minute: minutes,
        },
      });
      try {
        assertPatientDataEpoch(expectedEpoch);
      } catch (error) {
        await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
        await cancelReminder(notificationIds);
        throw error;
      }
      notificationIds.push(id);
    } catch (error) {
      await cancelReminder(notificationIds);
      throw error;
    }
  }

  return notificationIds;
}

export async function cancelReminder(notificationIds: string[]): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  for (const id of notificationIds) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {}
  }
}

export async function addReminder(
  prescriptionId: string,
  medicationName: string,
  dosage: string,
  instructions: string,
  times: string[]
): Promise<MedicationReminder> {
  const expectedEpoch = capturePatientDataEpoch();
  const hasPermission = await requestNotificationPermissions(expectedEpoch);
  assertPatientDataEpoch(expectedEpoch);
  const id = `rem_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  const reminder: MedicationReminder = {
    id,
    prescriptionId,
    medicationName,
    dosage,
    instructions,
    times,
    enabled: hasPermission,
    notificationIds: [],
    takenToday: {},
  };

  if (hasPermission) reminder.notificationIds = await scheduleReminder(reminder, expectedEpoch);

  try {
    const existing = await getReminders();
    assertPatientDataEpoch(expectedEpoch);
    existing.push(reminder);
    await saveReminders(existing);
    assertPatientDataEpoch(expectedEpoch);
  } catch (error) {
    await cancelReminder(reminder.notificationIds);
    throw error;
  }

  return reminder;
}

export async function removeReminder(reminderId: string): Promise<void> {
  const expectedEpoch = capturePatientDataEpoch();
  const reminders = await getReminders();
  assertPatientDataEpoch(expectedEpoch);
  const target = reminders.find((r) => r.id === reminderId);
  await saveReminders(reminders.filter((r) => r.id !== reminderId));
  assertPatientDataEpoch(expectedEpoch);
  if (target) await cancelReminder(target.notificationIds);
}

export async function toggleReminder(reminderId: string, enabled: boolean): Promise<void> {
  const expectedEpoch = capturePatientDataEpoch();
  const reminders = await getReminders();
  assertPatientDataEpoch(expectedEpoch);
  const idx = reminders.findIndex((r) => r.id === reminderId);
  if (idx === -1) return;

  if (!enabled) {
    const notificationIds = reminders[idx].notificationIds;
    reminders[idx].notificationIds = [];
    reminders[idx].enabled = false;
    await saveReminders(reminders);
    assertPatientDataEpoch(expectedEpoch);
    await cancelReminder(notificationIds);
    return;
  } else {
    const hasPermission = await requestNotificationPermissions(expectedEpoch);
    if (hasPermission) {
      const notificationIds = await scheduleReminder(reminders[idx], expectedEpoch);
      reminders[idx].notificationIds = notificationIds;
      reminders[idx].enabled = true;
      try {
        await saveReminders(reminders);
        assertPatientDataEpoch(expectedEpoch);
      } catch (error) {
        await cancelReminder(notificationIds);
        throw error;
      }
      return;
    } else {
      reminders[idx].enabled = false;
    }
  }
  await saveReminders(reminders);
}

export async function markTaken(reminderId: string, time: string): Promise<void> {
  const expectedEpoch = capturePatientDataEpoch();
  const reminders = await getReminders();
  assertPatientDataEpoch(expectedEpoch);
  const idx = reminders.findIndex((r) => r.id === reminderId);
  if (idx === -1) return;

  const today = new Date().toISOString().split("T")[0];
  const key = `${today}_${time}`;
  reminders[idx].takenToday[key] = true;
  await saveReminders(reminders);
  assertPatientDataEpoch(expectedEpoch);
}

export function isTakenToday(reminder: MedicationReminder, time: string): boolean {
  const today = new Date().toISOString().split("T")[0];
  return !!reminder.takenToday[`${today}_${time}`];
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
}

export function parseFrequencyToTimes(frequency?: string): string[] {
  if (!frequency) return ["08:00"];
  const f = frequency.toLowerCase();
  if (f.includes("twice") || f.includes("2x") || f.includes("bid") || f.includes("two")) {
    return ["08:00", "20:00"];
  }
  if (f.includes("three") || f.includes("3x") || f.includes("tid") || f.includes("thrice")) {
    return ["08:00", "14:00", "20:00"];
  }
  if (f.includes("four") || f.includes("4x") || f.includes("qid")) {
    return ["06:00", "12:00", "18:00", "22:00"];
  }
  if (f.includes("bedtime") || f.includes("night") || f.includes("hs")) {
    return ["21:00"];
  }
  if (f.includes("morning")) {
    return ["08:00"];
  }
  return ["08:00"];
}

registerSecureCleanup(async () => {
  try {
    const Notifications = await getNotifications();
    if (Notifications) await Notifications.cancelAllScheduledNotificationsAsync();
  } finally {
    await AsyncStorage.removeItem(REMINDERS_KEY);
  }
});

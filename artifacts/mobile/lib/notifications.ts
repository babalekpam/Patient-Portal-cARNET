import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

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

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function getReminders(): Promise<MedicationReminder[]> {
  const raw = await AsyncStorage.getItem(REMINDERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveReminders(reminders: MedicationReminder[]): Promise<void> {
  await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
}

export async function scheduleReminder(reminder: MedicationReminder): Promise<string[]> {
  const notificationIds: string[] = [];

  for (const time of reminder.times) {
    const [hours, minutes] = time.split(":").map(Number);

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Time to take ${reminder.medicationName}`,
        body: reminder.dosage
          ? `${reminder.dosage}${reminder.instructions ? " - " + reminder.instructions : ""}`
          : reminder.instructions || "Take your medication now",
        data: { reminderId: reminder.id, prescriptionId: reminder.prescriptionId },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hours,
        minute: minutes,
      },
    });
    notificationIds.push(id);
  }

  return notificationIds;
}

export async function cancelReminder(notificationIds: string[]): Promise<void> {
  for (const id of notificationIds) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }
}

export async function addReminder(
  prescriptionId: string,
  medicationName: string,
  dosage: string,
  instructions: string,
  times: string[]
): Promise<MedicationReminder> {
  const hasPermission = await requestNotificationPermissions();
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

  if (hasPermission) {
    reminder.notificationIds = await scheduleReminder(reminder);
  }

  const existing = await getReminders();
  existing.push(reminder);
  await saveReminders(existing);

  return reminder;
}

export async function removeReminder(reminderId: string): Promise<void> {
  const reminders = await getReminders();
  const target = reminders.find((r) => r.id === reminderId);
  if (target) {
    await cancelReminder(target.notificationIds);
  }
  await saveReminders(reminders.filter((r) => r.id !== reminderId));
}

export async function toggleReminder(reminderId: string, enabled: boolean): Promise<void> {
  const reminders = await getReminders();
  const idx = reminders.findIndex((r) => r.id === reminderId);
  if (idx === -1) return;

  if (!enabled) {
    await cancelReminder(reminders[idx].notificationIds);
    reminders[idx].notificationIds = [];
    reminders[idx].enabled = false;
  } else {
    const hasPermission = await requestNotificationPermissions();
    if (hasPermission) {
      reminders[idx].notificationIds = await scheduleReminder(reminders[idx]);
      reminders[idx].enabled = true;
    } else {
      reminders[idx].enabled = false;
    }
  }
  await saveReminders(reminders);
}

export async function markTaken(reminderId: string, time: string): Promise<void> {
  const reminders = await getReminders();
  const idx = reminders.findIndex((r) => r.id === reminderId);
  if (idx === -1) return;

  const today = new Date().toISOString().split("T")[0];
  const key = `${today}_${time}`;
  reminders[idx].takenToday[key] = true;
  await saveReminders(reminders);
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

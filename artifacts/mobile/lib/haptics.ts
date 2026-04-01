import { Platform } from "react-native";

let Haptics: typeof import("expo-haptics") | null = null;

async function getHaptics() {
  if (Platform.OS === "web") return null;
  if (Haptics) return Haptics;
  try {
    Haptics = await import("expo-haptics");
    return Haptics;
  } catch {
    return null;
  }
}

export async function impactLight() {
  try {
    const h = await getHaptics();
    if (h) await h.impactAsync(h.ImpactFeedbackStyle.Light);
  } catch {}
}

export async function impactMedium() {
  try {
    const h = await getHaptics();
    if (h) await h.impactAsync(h.ImpactFeedbackStyle.Medium);
  } catch {}
}

export async function impactHeavy() {
  try {
    const h = await getHaptics();
    if (h) await h.impactAsync(h.ImpactFeedbackStyle.Heavy);
  } catch {}
}

export async function notificationSuccess() {
  try {
    const h = await getHaptics();
    if (h) await h.notificationAsync(h.NotificationFeedbackType.Success);
  } catch {}
}

export async function notificationWarning() {
  try {
    const h = await getHaptics();
    if (h) await h.notificationAsync(h.NotificationFeedbackType.Warning);
  } catch {}
}

export async function notificationError() {
  try {
    const h = await getHaptics();
    if (h) await h.notificationAsync(h.NotificationFeedbackType.Error);
  } catch {}
}

export async function selectionClick() {
  try {
    const h = await getHaptics();
    if (h) await h.selectionAsync();
  } catch {}
}

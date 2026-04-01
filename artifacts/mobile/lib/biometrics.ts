import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const BIOMETRIC_ENABLED_KEY = "biometric_enabled";

let LocalAuthentication: typeof import("expo-local-authentication") | null = null;

async function getLocalAuth() {
  if (LocalAuthentication) return LocalAuthentication;
  try {
    LocalAuthentication = await import("expo-local-authentication");
    return LocalAuthentication;
  } catch {
    return null;
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const auth = await getLocalAuth();
    if (!auth) return false;
    const compatible = await auth.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await auth.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
  return stored === "true";
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? "true" : "false");
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  try {
    const auth = await getLocalAuth();
    if (!auth) return false;
    const result = await auth.authenticateAsync({
      promptMessage: "Authenticate to access CARNET",
      fallbackLabel: "Use password",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

export async function getBiometricType(): Promise<string> {
  try {
    const auth = await getLocalAuth();
    if (!auth) return "Biometrics";
    const types = await auth.supportedAuthenticationTypesAsync();
    if (types.includes(auth.AuthenticationType.FACIAL_RECOGNITION)) {
      return "Face ID";
    }
    if (types.includes(auth.AuthenticationType.FINGERPRINT)) {
      return "Fingerprint";
    }
    return "Biometrics";
  } catch {
    return "Biometrics";
  }
}

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const BIOMETRIC_ENABLED_KEY = "carnet_biometric_enabled";

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
  if (Platform.OS === "web") return false;
  return (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) === "true";
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS === "web") throw new Error("Biometric sign-in is not available on the web.");
  if (enabled) {
    const authenticated = await authenticateWithBiometrics();
    if (!authenticated) throw new Error("Authentication was cancelled or unsuccessful.");
  }
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? "true" : "false", {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
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

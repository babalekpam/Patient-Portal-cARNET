import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { AccessiblePressable as Pressable } from "@/components/AccessiblePressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { LogoWatermark } from "@/components/LogoWatermark";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { confirmAppAction, showAppAlert } from "@/lib/privacyAlerts";
import { runConfirmedAction } from "@/lib/confirmedAction";
import {
  assertPatientDataEpoch,
  capturePatientDataEpoch,
  getSecureItem,
  setSecureItem,
  subscribeToPatientDataClear,
  isPatientDataEpochCurrent,
} from "@/lib/secureStorage";

export const ALLOW_SHARING_KEY = "carnet_allow_sharing";

export default function SecurityPrivacyScreen() {
  const { colors } = useTheme();
  const { logout } = useAuth();
  const [allowSharing, setAllowSharing] = useState(false);
  const [changingSharing, setChangingSharing] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadSharing = useCallback(async () => {
    const expectedEpoch = capturePatientDataEpoch();
    try {
      const stored = await getSecureItem(ALLOW_SHARING_KEY);
      assertPatientDataEpoch(expectedEpoch);
      setAllowSharing(stored === "true");
    } catch {
      if (!isPatientDataEpochCurrent(expectedEpoch)) return;
      setAllowSharing(false);
      showAppAlert("Unable to load privacy settings", "Secure local storage is unavailable. Sharing remains off.");
    }
  }, []);

  useEffect(() => {
    loadSharing();
    return subscribeToPatientDataClear(() => setAllowSharing(false));
  }, [loadSharing]);

  const updateSharing = async (enabled: boolean) => {
    const expectedEpoch = capturePatientDataEpoch();
    setChangingSharing(true);
    try {
      await setSecureItem(ALLOW_SHARING_KEY, enabled ? "true" : "false");
      assertPatientDataEpoch(expectedEpoch);
      setAllowSharing(enabled);
    } catch {
      if (!isPatientDataEpochCurrent(expectedEpoch)) return;
      showAppAlert("Setting not changed", "CARNET could not securely save this preference. Please try again.");
    } finally {
      setChangingSharing(false);
    }
  };

  const confirmClear = async () => {
    try {
      await runConfirmedAction(
        () => confirmAppAction(
          "Clear local data and sign out?",
          "ALL current-session local patient records will be removed and you will need to sign in again. Records held by your provider and original photos in your photo library are not deleted.",
          "Clear & sign out",
          "Cancel",
          true,
        ),
        async () => {
          setClearing(true);
          await logout();
          if (Platform.OS !== "web") {
            showAppAlert("Signed out", "Current-session local patient data was cleared.");
          }
        },
      );
    } catch {
      // Auth termination closes access synchronously and exposes cleanup
      // failures on the signed-out fail-closed screen.
    } finally {
      setClearing(false);
    }
  };

  const sections = [
    {
      icon: "clock" as const,
      title: "Automatic protection",
      body: "CARNET locks after 5 minutes of inactivity and limits local patient-data access to 15 minutes. These local controls do not revoke an active server session.",
    },
    {
      icon: "database" as const,
      title: "Storage",
      body: Platform.OS === "web"
        ? "On the web, local patient data is kept in memory for this session. Signing out, session expiry, or closing the session removes current-session local records."
        : "On this device, supported sensitive values use operating-system secure storage. Signing out, session expiry, or the next sign-in removes current-session local records.",
    },
    {
      icon: "eye-off" as const,
      title: "Screen privacy",
      body: Platform.OS === "web"
        ? "Web browsers cannot reliably prevent screenshots or screen recording. Check your surroundings before viewing health information."
        : "CARNET requests screen-capture protection for sensitive views, but operating-system behavior and external cameras can limit protection.",
    },
    {
      icon: "key" as const,
      title: "Protect your account",
      body: "Use a unique account password and a device passcode. Biometrics unlock the app on this device; they do not replace your account credentials. CARNET will never ask you to send passwords or verification codes by email or text.",
    },
    {
      icon: "refresh-cw" as const,
      title: "Keep software current",
      body: "Install CARNET and operating-system updates promptly. Avoid links in unexpected messages; open CARNET directly instead.",
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title="Security & Privacy" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.primaryLight }]}>
              <Feather name="share-2" size={20} color={colors.primary} />
            </View>
            <View style={styles.text}>
              <Text style={[styles.title, { color: colors.text }]}>Allow export and sharing</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                Off by default for each patient session. Files or messages shared outside CARNET are no longer protected by CARNET.
              </Text>
            </View>
            <Switch
              value={allowSharing}
              disabled={changingSharing}
              onValueChange={updateSharing}
              accessibilityLabel="Allow export and sharing"
              accessibilityHint="Controls whether health information can be copied outside CARNET for this session"
              accessibilityRole="switch"
              accessibilityState={{ checked: allowSharing, disabled: changingSharing, busy: changingSharing }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {sections.map((section) => (
          <View key={section.title} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <View style={styles.rowTop}>
              <View style={[styles.icon, { backgroundColor: colors.primaryLight }]}>
                <Feather name={section.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.text}>
                <Text style={[styles.title, { color: colors.text }]}>{section.title}</Text>
                <Text style={[styles.body, { color: colors.textSecondary }]}>{section.body}</Text>
              </View>
            </View>
          </View>
        ))}

        <Pressable
          disabled={clearing}
          accessibilityRole="button"
          accessibilityLabel="Clear local data and sign out"
          accessibilityHint="Removes all current-session patient data cached by CARNET and requires signing in again; provider records and original photos are unaffected"
          accessibilityState={{ disabled: clearing, busy: clearing }}
          style={[styles.clearButton, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}
          onPress={confirmClear}
        >
          <Feather name="trash-2" size={18} color={colors.danger} />
          <Text style={[styles.clearText, { color: colors.danger }]}>{clearing ? "Clearing & signing out…" : "Clear local data & sign out"}</Text>
        </Pressable>
        <Text style={[styles.footnote, { color: colors.textTertiary }]}>
          This removes CARNET’s current-session local records and signs you out. It does not delete provider/server records or original photos.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  body: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  clearButton: { marginTop: 4, borderRadius: 14, borderWidth: 1, padding: 16, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  clearText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  footnote: { fontSize: 12, lineHeight: 18, textAlign: "center", fontFamily: "Inter_400Regular" },
});
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

function InfoRow({ icon, label, value, colors, danger }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; value: string; colors: any; danger?: boolean }) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.borderLight }]}>
      <View style={[styles.infoIcon, { backgroundColor: danger ? colors.dangerLight : colors.primaryLight }]}>
        <Feather name={icon} size={18} color={danger ? colors.danger : colors.primary} />
      </View>
      <View style={styles.infoContent}>
        <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: danger ? colors.danger : colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

export default function EmergencyCardScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();

  const { data: prescriptions } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => api.getPrescriptions(),
    enabled: !!profile,
  });

  const fullName = `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim() || "Patient";
  const dob = profile?.dateOfBirth || t("notAvailable");
  const bloodType = profile?.bloodType || t("notAvailable");
  const rawAllergies = profile?.allergies;
  const allergies = Array.isArray(rawAllergies) ? rawAllergies.join(", ") : (rawAllergies || t("noneReported"));
  const emergencyContact = profile?.emergencyContact || t("notAvailable");
  const emergencyPhone = profile?.emergencyPhone || "";
  const gender = profile?.gender || t("notAvailable");
  const mrn = profile?.mrn || "";

  const activeMeds = prescriptions
    ?.filter((p) => p.status?.toLowerCase() === "active")
    ?.map((p) => `${p.medicationName}${p.dosage ? ` (${p.dosage})` : ""}`)
    ?.join(", ") || t("noneReported");

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const text = `${t("emergencyCard").toUpperCase()}\n\n${t("patient")}: ${fullName}\n${t("dateOfBirth")}: ${dob}\n${t("gender")}: ${gender}\n${t("bloodType")}: ${bloodType}\n${t("allergies")}: ${allergies}\n${t("medications")}: ${activeMeds}\n${t("emergencyContact")}: ${emergencyContact}${emergencyPhone ? ` (${emergencyPhone})` : ""}`;
    await Share.share({ message: text, title: t("emergencyCard") });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#dc2626", "#b91c1c"]}
        style={[styles.header, { paddingTop: Platform.OS === "web" ? 20 : insets.top }]}
      >
        <Pressable
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
        >
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Feather name="alert-circle" size={28} color="#fff" />
          <Text style={styles.headerTitle}>{t("emergencyCard")}</Text>
        </View>
        <Pressable style={styles.shareBtn} onPress={handleShare}>
          <Feather name="share-2" size={20} color="#fff" />
        </Pressable>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.patientHeader}>
            <View style={[styles.avatar, { backgroundColor: "#dc2626" }]}>
              <Text style={styles.avatarText}>{fullName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.patientInfo}>
              <Text style={[styles.patientName, { color: colors.text }]}>{fullName}</Text>
              {mrn ? <Text style={[styles.mrnText, { color: colors.textTertiary }]}>MRN: {mrn}</Text> : null}
            </View>
          </View>

          <View style={[styles.emergencyBanner, { backgroundColor: colors.dangerLight }]}>
            <Feather name="alert-triangle" size={16} color={colors.danger} />
            <Text style={[styles.emergencyBannerText, { color: colors.danger }]}>{t("emergencyMedicalInfo")}</Text>
          </View>

          <InfoRow icon="droplet" label={t("bloodType")} value={bloodType} colors={colors} danger />
          <InfoRow icon="alert-circle" label={t("allergies")} value={allergies} colors={colors} danger />
          <InfoRow icon="package" label={t("currentMedications")} value={activeMeds} colors={colors} />
          <InfoRow icon="calendar" label={t("dateOfBirth")} value={dob} colors={colors} />
          <InfoRow icon="user" label={t("gender")} value={gender} colors={colors} />

          <View style={[styles.emergencyContactSection, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}>
            <View style={styles.contactHeader}>
              <Feather name="phone" size={20} color={colors.danger} />
              <Text style={[styles.contactTitle, { color: colors.danger }]}>{t("emergencyContact")}</Text>
            </View>
            <Text style={[styles.contactName, { color: colors.text }]}>{emergencyContact}</Text>
            {emergencyPhone ? (
              <Text style={[styles.contactPhone, { color: colors.textSecondary }]}>{emergencyPhone}</Text>
            ) : null}
          </View>
        </View>

        <Text style={[styles.disclaimer, { color: colors.textTertiary }]}>
          {t("emergencyDisclaimer")}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerCenter: { alignItems: "center", gap: 4 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  shareBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 16, padding: 16, gap: 2, borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  patientHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
  patientInfo: { flex: 1, gap: 2 },
  patientName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  mrnText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  emergencyBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, marginBottom: 8 },
  emergencyBannerText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2 },
  infoContent: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emergencyContactSection: { borderRadius: 12, padding: 14, gap: 4, marginTop: 12, borderWidth: 1 },
  contactHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  contactTitle: { fontSize: 14, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  contactName: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  contactPhone: { fontSize: 14, fontFamily: "Inter_400Regular" },
  disclaimer: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 16, lineHeight: 18 },
});

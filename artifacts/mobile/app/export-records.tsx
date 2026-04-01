import { Feather } from "@expo/vector-icons";
import { impactLight, impactMedium, impactHeavy, notificationSuccess, notificationError, selectionClick } from "@/lib/haptics";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { LogoWatermark } from "@/components/LogoWatermark";

const SECTIONS = [
  { key: "personal", icon: "user" as const, label: "personalInfo" },
  { key: "medications", icon: "package" as const, label: "medications" },
  { key: "allergies", icon: "alert-circle" as const, label: "allergies" },
  { key: "labResults", icon: "bar-chart-2" as const, label: "labResults" },
  { key: "appointments", icon: "calendar" as const, label: "appointments" },
  { key: "visitSummaries", icon: "clipboard" as const, label: "visitSummaries" },
];

export default function ExportRecordsScreen() {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [selectedSections, setSelectedSections] = useState<string[]>(SECTIONS.map((s) => s.key));
  const [isExporting, setIsExporting] = useState(false);

  const { data: prescriptions } = useQuery({ queryKey: ["prescriptions"], queryFn: () => api.getPrescriptions() });
  const { data: labs } = useQuery({ queryKey: ["labResults"], queryFn: () => api.getLabResults() });
  const { data: appointments } = useQuery({ queryKey: ["appointments"], queryFn: () => api.getAppointments() });
  const { data: visits } = useQuery({ queryKey: ["visitSummaries"], queryFn: () => api.getVisitSummaries() });

  const toggleSection = (key: string) => {
    setSelectedSections((prev) => prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]);
  };

  const generateTextReport = () => {
    const lines: string[] = [];
    const divider = "═".repeat(40);

    lines.push(divider);
    lines.push("  CARNET HEALTH SUMMARY REPORT");
    lines.push(`  Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`);
    lines.push(divider);
    lines.push("");

    if (selectedSections.includes("personal")) {
      lines.push("▸ PATIENT INFORMATION");
      lines.push(`  Name: ${profile?.firstName || ""} ${profile?.lastName || ""}`);
      lines.push(`  Date of Birth: ${profile?.dateOfBirth || "N/A"}`);
      lines.push(`  Gender: ${profile?.gender || "N/A"}`);
      lines.push(`  Blood Type: ${profile?.bloodType || "N/A"}`);
      lines.push(`  MRN: ${profile?.mrn || "N/A"}`);
      lines.push(`  Phone: ${profile?.phone || "N/A"}`);
      lines.push(`  Email: ${profile?.email || "N/A"}`);
      lines.push(`  Emergency Contact: ${profile?.emergencyContact || "N/A"}`);
      lines.push("");
    }

    if (selectedSections.includes("allergies")) {
      lines.push("▸ ALLERGIES");
      lines.push(`  ${profile?.allergies || "None reported"}`);
      lines.push("");
    }

    if (selectedSections.includes("medications") && prescriptions) {
      lines.push("▸ CURRENT MEDICATIONS");
      const active = prescriptions.filter((p) => p.status?.toLowerCase() === "active");
      if (active.length === 0) {
        lines.push("  No active medications");
      } else {
        active.forEach((p) => {
          lines.push(`  • ${p.medicationName || "Unknown"}`);
          if (p.dosage) lines.push(`    Dosage: ${p.dosage}`);
          if (p.frequency) lines.push(`    Frequency: ${p.frequency}`);
          if (p.prescribingProvider) lines.push(`    Prescribed by: ${p.prescribingProvider}`);
        });
      }
      lines.push("");
    }

    if (selectedSections.includes("labResults") && labs) {
      lines.push("▸ RECENT LAB RESULTS");
      const recent = labs.slice(0, 5);
      if (recent.length === 0) {
        lines.push("  No recent lab results");
      } else {
        recent.forEach((l) => {
          lines.push(`  • ${l.testName || "Test"} — ${l.resultDate || "N/A"}`);
          l.results?.forEach((r) => {
            lines.push(`    ${r.name}: ${r.value}${r.unit ? ` ${r.unit}` : ""}${r.referenceRange ? ` (ref: ${r.referenceRange})` : ""}${r.flag ? ` [${r.flag}]` : ""}`);
          });
        });
      }
      lines.push("");
    }

    if (selectedSections.includes("appointments") && appointments) {
      lines.push("▸ APPOINTMENTS");
      const upcoming = appointments.filter((a) => a.status?.toLowerCase() !== "cancelled").slice(0, 5);
      if (upcoming.length === 0) {
        lines.push("  No upcoming appointments");
      } else {
        upcoming.forEach((a) => {
          lines.push(`  • ${a.appointmentType?.replace(/_/g, " ") || "Visit"} — ${a.appointmentDate || "N/A"}`);
          if (a.doctorName) lines.push(`    Provider: ${a.doctorName}`);
          if (a.hospitalName) lines.push(`    Location: ${a.hospitalName}`);
        });
      }
      lines.push("");
    }

    if (selectedSections.includes("visitSummaries") && visits) {
      lines.push("▸ VISIT SUMMARIES");
      const recent = visits.slice(0, 3);
      if (recent.length === 0) {
        lines.push("  No visit summaries");
      } else {
        recent.forEach((v: any) => {
          lines.push(`  • ${v.visitType || "Visit"} — ${v.visitDate || "N/A"}`);
          if (v.diagnosis) lines.push(`    Diagnosis: ${v.diagnosis}`);
          if (v.summary) lines.push(`    Summary: ${v.summary}`);
        });
      }
      lines.push("");
    }

    lines.push(divider);
    lines.push("  This report was generated by CARNET");
    lines.push("  Powered by Argilette");
    lines.push(divider);

    return lines.join("\n");
  };

  const handleExport = async () => {
    if (selectedSections.length === 0) {
      Alert.alert(t("error"), t("selectAtLeastOneSection"));
      return;
    }

    setIsExporting(true);
    impactHeavy();

    try {
      const report = generateTextReport();

      if (Platform.OS === "web") {
        const blob = new Blob([report], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `CARNET_Health_Report_${new Date().toISOString().split("T")[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({
          message: report,
          title: "CARNET Health Report",
        });
      }
    } catch (e) {
      Alert.alert(t("error"), t("exportFailed"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title={t("exportRecords")} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.infoCard, { backgroundColor: colors.infoLight }]}>
          <Feather name="info" size={18} color={colors.info} />
          <Text style={[styles.infoText, { color: colors.info }]}>{t("exportDescription")}</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("selectSections")}</Text>

        {SECTIONS.map((section) => (
          <Pressable
            key={section.key}
            style={[styles.sectionRow, { backgroundColor: colors.surface, borderColor: selectedSections.includes(section.key) ? colors.primary : colors.borderLight }]}
            onPress={() => { impactLight(); toggleSection(section.key); }}
          >
            <View style={[styles.sectionIcon, { backgroundColor: selectedSections.includes(section.key) ? colors.primaryLight : colors.surfaceSecondary }]}>
              <Feather name={section.icon} size={18} color={selectedSections.includes(section.key) ? colors.primary : colors.textTertiary} />
            </View>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>{t(section.label as any)}</Text>
            <View style={[styles.checkbox, { backgroundColor: selectedSections.includes(section.key) ? colors.primary : "transparent", borderColor: selectedSections.includes(section.key) ? colors.primary : colors.border }]}>
              {selectedSections.includes(section.key) && <Feather name="check" size={14} color="#fff" />}
            </View>
          </Pressable>
        ))}

        <Pressable
          style={[styles.selectAllBtn]}
          onPress={() => {
            if (selectedSections.length === SECTIONS.length) setSelectedSections([]);
            else setSelectedSections(SECTIONS.map((s) => s.key));
          }}
        >
          <Text style={[styles.selectAllText, { color: colors.primary }]}>
            {selectedSections.length === SECTIONS.length ? t("deselectAll") : t("selectAll")}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.exportBtn, { backgroundColor: selectedSections.length > 0 ? colors.primary : colors.borderLight }]}
          disabled={selectedSections.length === 0 || isExporting}
          onPress={handleExport}
        >
          <Feather name="share" size={20} color={selectedSections.length > 0 ? "#fff" : colors.textTertiary} />
          <Text style={[styles.exportBtnText, { color: selectedSections.length > 0 ? "#fff" : colors.textTertiary }]}>
            {isExporting ? t("generating") : t("exportAndShare")}
          </Text>
        </Pressable>

        <Text style={[styles.disclaimer, { color: colors.textTertiary }]}>{t("exportDisclaimer")}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 40 },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12 },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 4 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  sectionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sectionLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  selectAllBtn: { alignSelf: "center", padding: 8 },
  selectAllText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  exportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 14 },
  exportBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  disclaimer: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
});

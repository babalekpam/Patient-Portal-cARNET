import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/lib/i18n";

const BODY_AREAS = [
  { key: "head", icon: "eye" as const, area: "Head & Face" },
  { key: "chest", icon: "heart" as const, area: "Chest & Heart" },
  { key: "abdomen", icon: "activity" as const, area: "Abdomen & Stomach" },
  { key: "limbs", icon: "move" as const, area: "Arms & Legs" },
  { key: "skin", icon: "sun" as const, area: "Skin" },
  { key: "general", icon: "thermometer" as const, area: "General / Whole Body" },
];

const SYMPTOMS_BY_AREA: Record<string, string[]> = {
  head: ["Headache", "Dizziness", "Blurred vision", "Ear pain", "Sore throat", "Nasal congestion", "Jaw pain"],
  chest: ["Chest pain", "Shortness of breath", "Palpitations", "Cough", "Wheezing"],
  abdomen: ["Nausea", "Vomiting", "Abdominal pain", "Diarrhea", "Constipation", "Bloating", "Heartburn"],
  limbs: ["Joint pain", "Muscle aches", "Swelling", "Numbness", "Tingling", "Weakness"],
  skin: ["Rash", "Itching", "Bruising", "Wound", "Discoloration", "Hives"],
  general: ["Fever", "Fatigue", "Chills", "Night sweats", "Weight loss", "Loss of appetite", "Insomnia"],
};

const SEVERITY_LEVELS = [
  { key: "mild", color: "#16a34a", label: "Mild", desc: "Noticeable but manageable" },
  { key: "moderate", color: "#d97706", label: "Moderate", desc: "Affecting daily activities" },
  { key: "severe", color: "#dc2626", label: "Severe", desc: "Significantly impacting life" },
];

const DURATION_OPTIONS = ["Less than a day", "1-3 days", "4-7 days", "1-2 weeks", "More than 2 weeks"];

interface TriageResult {
  level: "emergency" | "urgentCare" | "schedule" | "selfCare";
  title: string;
  description: string;
  color: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  actions: string[];
}

function getTriageResult(severity: string, symptoms: string[], duration: string): TriageResult {
  const emergencySymptoms = ["Chest pain", "Shortness of breath", "Severe headache"];
  const hasEmergency = symptoms.some((s) => emergencySymptoms.includes(s));

  if (hasEmergency && severity === "severe") {
    return {
      level: "emergency",
      title: "Seek Emergency Care",
      description: "Based on your symptoms, please seek immediate medical attention. Call 911 or go to the nearest emergency room.",
      color: "#dc2626",
      icon: "alert-octagon",
      actions: ["Call 911 immediately", "Go to nearest ER", "Do not drive yourself"],
    };
  }
  if (severity === "severe" || (severity === "moderate" && hasEmergency)) {
    return {
      level: "urgentCare",
      title: "Visit Urgent Care",
      description: "Your symptoms suggest you should see a healthcare provider soon. Consider visiting an urgent care clinic today.",
      color: "#d97706",
      icon: "alert-triangle",
      actions: ["Visit urgent care today", "Contact your primary care doctor", "Monitor symptoms closely"],
    };
  }
  if (severity === "moderate" || duration === "1-2 weeks" || duration === "More than 2 weeks") {
    return {
      level: "schedule",
      title: "Schedule an Appointment",
      description: "Your symptoms should be evaluated by a healthcare provider. Please schedule an appointment at your convenience.",
      color: "#1a6fbf",
      icon: "calendar",
      actions: ["Schedule a doctor visit", "Keep a symptom diary", "Note any changes"],
    };
  }
  return {
    level: "selfCare",
    title: "Self-Care Recommended",
    description: "Your symptoms appear mild. Try home remedies and rest. If symptoms worsen or persist beyond a few days, contact your doctor.",
    color: "#16a34a",
    icon: "check-circle",
    actions: ["Rest and stay hydrated", "Over-the-counter relief as needed", "Monitor for changes", "See a doctor if symptoms worsen"],
  };
}

export default function SymptomCheckerScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [selectedArea, setSelectedArea] = useState("");
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [severity, setSeverity] = useState("");
  const [duration, setDuration] = useState("");
  const [result, setResult] = useState<TriageResult | null>(null);

  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const toggleSymptom = (s: string) => {
    setSelectedSymptoms((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const handleComplete = async () => {
    const triageResult = getTriageResult(severity, selectedSymptoms, duration);
    setResult(triageResult);
    setStep(4);

    let history: any[] = [];
    try { history = JSON.parse((await AsyncStorage.getItem("symptom_history")) || "[]"); } catch {}
    history.unshift({
      date: new Date().toISOString(),
      area: selectedArea,
      symptoms: selectedSymptoms,
      severity,
      duration,
      triage: triageResult.level,
    });
    await AsyncStorage.setItem("symptom_history", JSON.stringify(history.slice(0, 50)));
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>{t("whereDoYouFeelSymptoms")}</Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>{t("selectBodyArea")}</Text>
            <View style={styles.gridWrap}>
              {BODY_AREAS.map((area) => (
                <Pressable
                  key={area.key}
                  style={[styles.areaCard, { backgroundColor: selectedArea === area.key ? colors.primaryLight : colors.surface, borderColor: selectedArea === area.key ? colors.primary : colors.borderLight }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedArea(area.key); }}
                >
                  <View style={[styles.areaIcon, { backgroundColor: selectedArea === area.key ? colors.primary : colors.surfaceSecondary }]}>
                    <Feather name={area.icon} size={22} color={selectedArea === area.key ? "#fff" : colors.textSecondary} />
                  </View>
                  <Text style={[styles.areaText, { color: selectedArea === area.key ? colors.primary : colors.text }]}>{area.area}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>{t("whatSymptoms")}</Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>{t("selectAllThatApply")}</Text>
            <View style={styles.chipsWrap}>
              {(SYMPTOMS_BY_AREA[selectedArea] || []).map((s) => (
                <Pressable
                  key={s}
                  style={[styles.symptomChip, { backgroundColor: selectedSymptoms.includes(s) ? colors.primary : colors.surface, borderColor: selectedSymptoms.includes(s) ? colors.primary : colors.borderLight }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleSymptom(s); }}
                >
                  <Text style={[styles.chipText, { color: selectedSymptoms.includes(s) ? "#fff" : colors.text }]}>{s}</Text>
                  {selectedSymptoms.includes(s) && <Feather name="check" size={14} color="#fff" />}
                </Pressable>
              ))}
            </View>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>{t("howSevere")}</Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>{t("rateSeverity")}</Text>
            <View style={styles.severityWrap}>
              {SEVERITY_LEVELS.map((s) => (
                <Pressable
                  key={s.key}
                  style={[styles.severityCard, { backgroundColor: severity === s.key ? s.color + "15" : colors.surface, borderColor: severity === s.key ? s.color : colors.borderLight }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSeverity(s.key); }}
                >
                  <View style={[styles.severityDot, { backgroundColor: s.color }]} />
                  <View style={styles.severityText}>
                    <Text style={[styles.severityLabel, { color: severity === s.key ? s.color : colors.text }]}>{s.label}</Text>
                    <Text style={[styles.severityDesc, { color: colors.textSecondary }]}>{s.desc}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>{t("howLong")}</Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>{t("selectDuration")}</Text>
            <View style={styles.durationWrap}>
              {DURATION_OPTIONS.map((d) => (
                <Pressable
                  key={d}
                  style={[styles.durationOption, { backgroundColor: duration === d ? colors.primaryLight : colors.surface, borderColor: duration === d ? colors.primary : colors.borderLight }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDuration(d); }}
                >
                  <Text style={[styles.durationText, { color: duration === d ? colors.primary : colors.text }]}>{d}</Text>
                  {duration === d && <Feather name="check" size={18} color={colors.primary} />}
                </Pressable>
              ))}
            </View>
          </View>
        );
      case 4:
        if (!result) return null;
        return (
          <View style={styles.stepContent}>
            <View style={[styles.resultCard, { backgroundColor: result.color + "10", borderColor: result.color }]}>
              <View style={[styles.resultIconWrap, { backgroundColor: result.color }]}>
                <Feather name={result.icon} size={32} color="#fff" />
              </View>
              <Text style={[styles.resultTitle, { color: result.color }]}>{result.title}</Text>
              <Text style={[styles.resultDesc, { color: colors.textSecondary }]}>{result.description}</Text>
              <View style={styles.actionsList}>
                {result.actions.map((a, i) => (
                  <View key={i} style={styles.actionItem}>
                    <Feather name="chevron-right" size={16} color={result.color} />
                    <Text style={[styles.actionText, { color: colors.text }]}>{a}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.summaryCard}>
              <Text style={[styles.summaryTitle, { color: colors.textTertiary }]}>{t("yourSymptoms")}</Text>
              <View style={styles.summaryChips}>
                {selectedSymptoms.map((s) => (
                  <View key={s} style={[styles.summaryChip, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={[styles.summaryChipText, { color: colors.textSecondary }]}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>

            {result.level === "schedule" && (
              <Pressable
                style={[styles.scheduleBtn, { backgroundColor: colors.primary }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/request-appointment" as any); }}
              >
                <Feather name="calendar" size={18} color="#fff" />
                <Text style={styles.scheduleBtnText}>{t("scheduleAppointmentBtn")}</Text>
              </Pressable>
            )}
          </View>
        );
    }
  };

  const canProceed = (step === 0 && selectedArea) || (step === 1 && selectedSymptoms.length > 0) || (step === 2 && severity) || (step === 3 && duration);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={[styles.header, { paddingTop: topPad }]}
      >
        <Pressable style={styles.backBtn} onPress={() => { if (step > 0 && step < 4) setStep(step - 1); else router.back(); }}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("symptomChecker")}</Text>
        <View style={styles.backBtn} />
      </LinearGradient>

      {step < 4 && (
        <View style={styles.progressRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.progressDot, { backgroundColor: i <= step ? colors.primary : colors.borderLight }]} />
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {renderStep()}
      </ScrollView>

      {step < 4 && (
        <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.borderLight }]}>
          {step < 3 ? (
            <Pressable
              style={[styles.nextBtn, { backgroundColor: canProceed ? colors.primary : colors.borderLight }]}
              disabled={!canProceed}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setStep(step + 1); }}
            >
              <Text style={[styles.nextBtnText, { color: canProceed ? "#fff" : colors.textTertiary }]}>{t("next")}</Text>
              <Feather name="arrow-right" size={18} color={canProceed ? "#fff" : colors.textTertiary} />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.nextBtn, { backgroundColor: canProceed ? colors.primary : colors.borderLight }]}
              disabled={!canProceed}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); handleComplete(); }}
            >
              <Text style={[styles.nextBtnText, { color: canProceed ? "#fff" : colors.textTertiary }]}>{t("getRecommendation")}</Text>
            </Pressable>
          )}
        </View>
      )}

      {step === 4 && (
        <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.borderLight }]}>
          <Pressable
            style={[styles.nextBtn, { backgroundColor: colors.surfaceSecondary }]}
            onPress={() => { setStep(0); setSelectedArea(""); setSelectedSymptoms([]); setSeverity(""); setDuration(""); setResult(null); }}
          >
            <Feather name="refresh-cw" size={18} color={colors.text} />
            <Text style={[styles.nextBtnText, { color: colors.text }]}>{t("startOver")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  progressRow: { flexDirection: "row", justifyContent: "center", gap: 8, paddingVertical: 12 },
  progressDot: { width: 32, height: 4, borderRadius: 2 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  stepContent: { gap: 16 },
  stepTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  stepSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  gridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  areaCard: { width: "48%", borderRadius: 14, padding: 16, gap: 10, borderWidth: 1.5, alignItems: "center" },
  areaIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  areaText: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  symptomChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  chipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  severityWrap: { gap: 10 },
  severityCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 14, borderWidth: 1.5 },
  severityDot: { width: 16, height: 16, borderRadius: 8 },
  severityText: { flex: 1, gap: 2 },
  severityLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  severityDesc: { fontSize: 13, fontFamily: "Inter_400Regular" },
  durationWrap: { gap: 8 },
  durationOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderRadius: 14, borderWidth: 1 },
  durationText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  resultCard: { borderRadius: 16, padding: 20, gap: 12, borderWidth: 1.5, alignItems: "center" },
  resultIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  resultTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  resultDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  actionsList: { width: "100%", gap: 8, marginTop: 4 },
  actionItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  summaryCard: { gap: 8 },
  summaryTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  summaryChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  summaryChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  summaryChipText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  scheduleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderRadius: 14 },
  scheduleBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  bottomBar: { padding: 16, borderTopWidth: 1 },
  nextBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderRadius: 14 },
  nextBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});

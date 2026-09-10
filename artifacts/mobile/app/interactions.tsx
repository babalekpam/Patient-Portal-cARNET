import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AnimatedCard } from "@/components/AnimatedCard";
import { ListSkeleton } from "@/components/SkeletonLoader";
import { useTheme } from "@/context/ThemeContext";
import { api, type Prescription } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { LogoWatermark } from "@/components/LogoWatermark";
import { useAccessibilityLabels } from "@/lib/accessibilityLabels";

interface Interaction {
  id: string;
  drug1: string;
  drug2: string;
  severity: "severe" | "moderate" | "mild";
  description: string;
  advice: string;
}

const KNOWN_INTERACTIONS: Array<{ drugs: [string, string]; severity: "severe" | "moderate" | "mild"; description: string; advice: string }> = [
  { drugs: ["warfarin", "aspirin"], severity: "severe", description: "Increased risk of bleeding when combined.", advice: "Avoid concurrent use unless directed by your doctor. Monitor for signs of bleeding." },
  { drugs: ["lisinopril", "potassium"], severity: "severe", description: "Risk of dangerously high potassium levels (hyperkalemia).", advice: "Regular blood monitoring is essential. Report muscle weakness or irregular heartbeat." },
  { drugs: ["metformin", "contrast dye"], severity: "severe", description: "Risk of lactic acidosis during imaging procedures.", advice: "Temporarily stop metformin before and after contrast imaging. Consult your doctor." },
  { drugs: ["simvastatin", "amlodipine"], severity: "moderate", description: "Increased risk of muscle damage (rhabdomyolysis).", advice: "Simvastatin dose should not exceed 20mg with amlodipine. Report unexplained muscle pain." },
  { drugs: ["omeprazole", "clopidogrel"], severity: "moderate", description: "Reduced effectiveness of clopidogrel for blood clot prevention.", advice: "Consider alternative acid reducer. Consult your cardiologist." },
  { drugs: ["metoprolol", "verapamil"], severity: "moderate", description: "Excessive slowing of heart rate and low blood pressure.", advice: "Heart rate and blood pressure should be monitored closely." },
  { drugs: ["sertraline", "tramadol"], severity: "moderate", description: "Increased risk of serotonin syndrome and seizures.", advice: "Watch for agitation, confusion, rapid heartbeat, or tremor." },
  { drugs: ["ibuprofen", "aspirin"], severity: "mild", description: "May reduce the cardioprotective effect of aspirin.", advice: "Take aspirin at least 30 minutes before ibuprofen if both needed." },
  { drugs: ["levothyroxine", "calcium"], severity: "mild", description: "Calcium can reduce absorption of thyroid medication.", advice: "Separate doses by at least 4 hours." },
  { drugs: ["metformin", "alcohol"], severity: "mild", description: "Increased risk of low blood sugar and lactic acidosis.", advice: "Limit alcohol consumption. Never drink on an empty stomach." },
];

function findInteractions(prescriptions: Prescription[]): Interaction[] {
  const activeMeds = prescriptions
    .filter((p) => p.status?.toLowerCase() === "active")
    .map((p) => p.medicationName?.toLowerCase() || "");

  const found: Interaction[] = [];
  let idCounter = 0;

  for (const interaction of KNOWN_INTERACTIONS) {
    const [d1, d2] = interaction.drugs;
    const match1 = activeMeds.find((m) => m.includes(d1));
    const match2 = activeMeds.find((m) => m.includes(d2));
    if (match1 && match2) {
      found.push({
        id: (++idCounter).toString(),
        drug1: prescriptions.find((p) => p.medicationName?.toLowerCase().includes(d1))?.medicationName || d1,
        drug2: prescriptions.find((p) => p.medicationName?.toLowerCase().includes(d2))?.medicationName || d2,
        severity: interaction.severity,
        description: interaction.description,
        advice: interaction.advice,
      });
    }
  }

  return found;
}

function InteractionCard({ item, index, colors }: { item: Interaction; index: number; colors: any }) {
  const cfg = {
    severe: { color: colors.danger, bg: colors.dangerLight, icon: "alert-octagon" as const, label: "Severe" },
    moderate: { color: colors.warning, bg: colors.warningLight, icon: "alert-triangle" as const, label: "Moderate" },
    mild: { color: colors.success, bg: colors.successLight, icon: "info" as const, label: "Mild" },
  }[item.severity];
  return (
    <AnimatedCard index={Math.min(index, 8)}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight, borderLeftColor: cfg.color, borderLeftWidth: 4 }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.severityBadge, { backgroundColor: cfg.bg }]}>
            <Feather name={cfg.icon} size={14} color={cfg.color} />
            <Text style={[styles.severityText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        <View style={styles.drugPair}>
          <View style={[styles.drugPill, { backgroundColor: colors.surfaceSecondary }]}>
            <Feather name="package" size={14} color={colors.primary} />
            <Text style={[styles.drugName, { color: colors.text }]}>{item.drug1}</Text>
          </View>
          <Feather name="zap" size={16} color={cfg.color} />
          <View style={[styles.drugPill, { backgroundColor: colors.surfaceSecondary }]}>
            <Feather name="package" size={14} color={colors.primary} />
            <Text style={[styles.drugName, { color: colors.text }]}>{item.drug2}</Text>
          </View>
        </View>
        <Text style={[styles.description, { color: colors.textSecondary }]}>{item.description}</Text>
        <View style={[styles.adviceBox, { backgroundColor: cfg.bg }]}>
          <Feather name="shield" size={14} color={cfg.color} />
          <Text style={[styles.adviceText, { color: cfg.color }]}>{item.advice}</Text>
        </View>
      </View>
    </AnimatedCard>
  );
}

export default function InteractionsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const a11y = useAccessibilityLabels();
  const { data: prescriptions, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => api.getPrescriptions(),
  });

  const interactions = prescriptions ? findInteractions(prescriptions) : [];
  const severeCount = interactions.filter((i) => i.severity === "severe").length;
  const moderateCount = interactions.filter((i) => i.severity === "moderate").length;
  const severeStyle = { color: colors.danger, backgroundColor: colors.dangerLight };
  const moderateStyle = { color: colors.warning, backgroundColor: colors.warningLight };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("interactionChecker")} />
        <View accessibilityRole="progressbar" accessibilityLabel={a11y.loading} aria-busy={true}><ListSkeleton /></View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title={t("interactionChecker")} subtitle={interactions.length > 0 ? `${interactions.length} ${t("interactionsFound")}` : undefined} />

      {interactions.length > 0 && (
        <View style={styles.summaryRow}>
          {severeCount > 0 && (
            <View style={[styles.summaryPill, { backgroundColor: severeStyle.backgroundColor }]}>
              <Feather name="alert-octagon" size={14} color={severeStyle.color} />
              <Text style={[styles.summaryText, { color: severeStyle.color }]}>{severeCount} {t("severe")}</Text>
            </View>
          )}
          {moderateCount > 0 && (
            <View style={[styles.summaryPill, { backgroundColor: moderateStyle.backgroundColor }]}>
              <Feather name="alert-triangle" size={14} color={moderateStyle.color} />
              <Text style={[styles.summaryText, { color: moderateStyle.color }]}>{moderateCount} {t("moderate")}</Text>
            </View>
          )}
        </View>
      )}

      <FlatList
        data={interactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => <InteractionCard item={item} index={index} colors={colors} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl accessibilityLabel={a11y.refresh} refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.successLight }]}>
              <Feather name="check-circle" size={40} color={colors.success} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("noInteractions")}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("noInteractionsText")}</Text>
          </View>
        }
        ListFooterComponent={
          <Text style={[styles.disclaimer, { color: colors.textTertiary }]}>{t("interactionDisclaimer")}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summaryRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  summaryPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  summaryText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  listContent: { padding: 16, gap: 12 },
  card: { borderRadius: 14, padding: 14, gap: 10, borderWidth: 1 },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  severityBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  severityText: { fontSize: 12, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  drugPair: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  drugPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, flex: 1 },
  drugName: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  adviceBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 10 },
  adviceText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32 },
  disclaimer: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 16, lineHeight: 18, paddingHorizontal: 16 },
});

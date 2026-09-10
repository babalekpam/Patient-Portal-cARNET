import { Feather } from "@expo/vector-icons";
import { impactLight, impactMedium, impactHeavy, notificationSuccess, notificationError, selectionClick } from "@/lib/haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Pressable } from "@/components/AccessiblePressable";
import { Modal } from "@/components/AccessibleModal";
import { useAccessibilityLabels } from "@/lib/accessibilityLabels";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AnimatedCard } from "@/components/AnimatedCard";
import { useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/lib/i18n";
import { LogoWatermark } from "@/components/LogoWatermark";
import { assertPatientDataEpoch, capturePatientDataEpoch, getSecureItem, isPatientDataEpochCurrent, setSecureItem, subscribeToPatientDataClear } from "@/lib/secureStorage";
import { showAppAlert } from "@/lib/privacyAlerts";

const METRICS_KEY = "health_metrics";

interface MetricEntry {
  id: string;
  type: string;
  value: number;
  unit: string;
  date: string;
}

interface MetricConfig {
  key: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  unit: string;
  label: string;
  normalRange?: string;
}

const METRIC_CONFIGS: MetricConfig[] = [
  { key: "steps", icon: "trending-up", unit: "steps", label: "Steps", normalRange: "8,000-10,000/day" },
  { key: "heartRate", icon: "heart", unit: "bpm", label: "Heart Rate", normalRange: "60-100 bpm" },
  { key: "bloodPressureSys", icon: "activity", unit: "mmHg", label: "Blood Pressure (Sys)", normalRange: "90-120 mmHg" },
  { key: "bloodPressureDia", icon: "activity", unit: "mmHg", label: "Blood Pressure (Dia)", normalRange: "60-80 mmHg" },
  { key: "weight", icon: "user", unit: "kg", label: "Weight" },
  { key: "sleep", icon: "moon", unit: "hrs", label: "Sleep", normalRange: "7-9 hours" },
  { key: "temperature", icon: "thermometer", unit: "°F", label: "Temperature", normalRange: "97.8-99.1°F" },
  { key: "oxygen", icon: "wind", unit: "%", label: "Blood Oxygen", normalRange: "95-100%" },
];

function MetricCard({ config, entries, colors, onAdd }: { config: MetricConfig; entries: MetricEntry[]; colors: any; onAdd: () => void }) {
  const { t } = useI18n();
  const latest = entries[0];
  const prev = entries[1];
  const trend = latest && prev ? latest.value - prev.value : 0;

  return (
    <Pressable
      style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
      onPress={onAdd}
      accessibilityRole="button"
      accessibilityLabel={`${config.label}. ${latest ? `${latest.value} ${config.unit}` : "No data"}${trend ? `, trend ${trend > 0 ? "up" : "down"} ${Math.abs(trend).toFixed(1)}` : ""}${config.normalRange ? `. Normal range ${config.normalRange}` : ""}${entries.length > 1 ? `. Recent values: ${entries.slice(0, 7).reverse().map((entry) => `${entry.value} ${config.unit} on ${new Date(entry.date).toLocaleDateString()}`).join(", ")}` : ""}`}
    >
      <View style={styles.metricHeader}>
        <View style={[styles.metricIcon, { backgroundColor: colors.primaryLight }]}>
          <Feather name={config.icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.metricInfo}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{config.label}</Text>
          {latest ? (
            <View style={styles.valueRow}>
              <Text style={[styles.metricValue, { color: colors.text }]}>{latest.value}</Text>
              <Text style={[styles.metricUnit, { color: colors.textTertiary }]}>{config.unit}</Text>
              {trend !== 0 && (
                <View style={[styles.trendBadge, { backgroundColor: trend > 0 ? colors.successLight : colors.dangerLight }]}>
                  <Feather name={trend > 0 ? "trending-up" : "trending-down"} size={12} color={trend > 0 ? colors.success : colors.danger} />
                  <Text style={[styles.trendText, { color: trend > 0 ? colors.success : colors.danger }]}>{Math.abs(trend).toFixed(1)}</Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={[styles.noData, { color: colors.textTertiary }]}>No data</Text>
          )}
        </View>
        <Pressable style={[styles.addIcon, { backgroundColor: colors.primaryLight }]} onPress={onAdd} accessibilityRole="button" accessibilityLabel={`${t("add")} ${config.label}`}>
          <Feather name="plus" size={18} color={colors.primary} />
        </Pressable>
      </View>
      {config.normalRange && (
        <Text style={[styles.rangeText, { color: colors.textTertiary }]}>Normal: {config.normalRange}</Text>
      )}
      {entries.length > 1 && (
        <View style={styles.miniChart} accessible={false}>
          {entries.slice(0, 7).reverse().map((e, i) => {
            const max = Math.max(...entries.slice(0, 7).map((x) => x.value));
            const min = Math.min(...entries.slice(0, 7).map((x) => x.value));
            const range = max - min || 1;
            const height = 8 + ((e.value - min) / range) * 32;
            return (
              <View key={e.id} style={[styles.bar, { height, backgroundColor: colors.primary, borderRadius: 3, width: 8 }]} />
            );
          })}
        </View>
      )}
    </Pressable>
  );
}

export default function HealthMetricsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const a11y = useAccessibilityLabels();
  const [allEntries, setAllEntries] = useState<MetricEntry[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingMetric, setAddingMetric] = useState<MetricConfig | null>(null);
  const [inputValue, setInputValue] = useState("");

  const load = useCallback(async () => {
    const expectedEpoch = capturePatientDataEpoch();
    try {
      const stored = await getSecureItem(METRICS_KEY);
      await AsyncStorage.removeItem(METRICS_KEY).catch(() => {});
      assertPatientDataEpoch(expectedEpoch);
      if (stored) setAllEntries(JSON.parse(stored));
    } catch {
      if (!isPatientDataEpochCurrent(expectedEpoch)) return;
      setAllEntries([]);
      showAppAlert(t("error"), "CARNET could not load measurements from secure storage.");
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeToPatientDataClear(() => {
    setAllEntries([]);
    setShowAddModal(false);
    setAddingMetric(null);
    setInputValue("");
  }), []);

  const saveEntries = async (entries: MetricEntry[], expectedEpoch: number) => {
    await setSecureItem(METRICS_KEY, JSON.stringify(entries));
    await AsyncStorage.removeItem(METRICS_KEY).catch(() => {});
    assertPatientDataEpoch(expectedEpoch);
    setAllEntries(entries);
  };

  const openAdd = (config: MetricConfig) => {
    setAddingMetric(config);
    setInputValue("");
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!addingMetric || !inputValue) return;
    impactMedium();
    const expectedEpoch = capturePatientDataEpoch();
    const value = Number(inputValue);
    if (!Number.isFinite(value)) {
      showAppAlert(t("error"), "Enter a valid number.");
      return;
    }
    const entry: MetricEntry = {
      id: Date.now().toString(),
      type: addingMetric.key,
      value,
      unit: addingMetric.unit,
      date: new Date().toISOString(),
    };
    try {
      await saveEntries([entry, ...allEntries], expectedEpoch);
      setShowAddModal(false);
    } catch {
      if (!isPatientDataEpochCurrent(expectedEpoch)) return;
      notificationError();
      showAppAlert(t("error"), "This measurement could not be saved securely. No changes were made.");
    }
  };

  const getEntries = (type: string) => allEntries.filter((e) => e.type === type).slice(0, 30);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title={t("healthMetrics")} subtitle={t("trackYourHealth")} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.syncCard, { backgroundColor: colors.infoLight }]}>
          <Feather name="smartphone" size={20} color={colors.info} />
          <View style={styles.syncInfo}>
            <Text style={[styles.syncTitle, { color: colors.info }]}>{t("manualTracking")}</Text>
            <Text style={[styles.syncText, { color: colors.info }]}>{t("manualTrackingText")}</Text>
          </View>
        </View>

        <View style={styles.metricsGrid}>
          {METRIC_CONFIGS.map((config, index) => (
            <AnimatedCard key={config.key} index={Math.min(index, 6)}>
              <MetricCard config={config} entries={getEntries(config.key)} colors={colors} onAdd={() => openAdd(config)} />
            </AnimatedCard>
          ))}
        </View>
      </ScrollView>

      <Modal visible={showAddModal} animationType="slide" transparent accessibilityLabel={addingMetric ? `${t("add")} ${addingMetric.label}` : t("healthMetrics")} onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {addingMetric ? `${t("add")} ${addingMetric.label}` : ""}
              </Text>
              <Pressable onPress={() => setShowAddModal(false)} accessibilityRole="button" accessibilityLabel={a11y.closeDialog}>
                <Feather name="x" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            {addingMetric && (
              <>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.valueInput, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.controlBorder }]}
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                    value={inputValue}
                    onChangeText={setInputValue}
                    keyboardType="decimal-pad"
                    autoFocus
                    accessibilityLabel={addingMetric.label}
                  />
                  <Text style={[styles.unitLabel, { color: colors.textSecondary }]}>{addingMetric.unit}</Text>
                </View>

                {addingMetric.normalRange && (
                  <Text style={[styles.rangeHint, { color: colors.textTertiary }]}>Normal range: {addingMetric.normalRange}</Text>
                )}

                <Pressable
                  style={[styles.saveBtn, { backgroundColor: inputValue ? colors.primary : colors.borderLight }]}
                  disabled={!inputValue}
                  onPress={handleSave}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !inputValue }}
                >
                  <Text style={[styles.saveBtnText, { color: inputValue ? colors.onPrimary : colors.textTertiary }]}>{t("saveChanges")}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },
  syncCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 12 },
  syncInfo: { flex: 1, gap: 2 },
  syncTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  syncText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  metricsGrid: { gap: 10 },
  metricCard: { borderRadius: 14, padding: 14, gap: 8, borderWidth: 1 },
  metricHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  metricIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  metricInfo: { flex: 1, gap: 2 },
  metricLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  metricValue: { fontSize: 24, fontFamily: "Inter_700Bold" },
  metricUnit: { fontSize: 14, fontFamily: "Inter_400Regular" },
  trendBadge: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 4 },
  trendText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  noData: { fontSize: 14, fontFamily: "Inter_400Regular" },
  addIcon: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rangeText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  miniChart: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 40, marginTop: 4 },
  bar: {},
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  valueInput: { flex: 1, borderRadius: 12, padding: 16, fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center", borderWidth: 1 },
  unitLabel: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  rangeHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  saveBtn: { padding: 16, borderRadius: 14, alignItems: "center" },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});

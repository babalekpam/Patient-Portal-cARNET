import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { impactLight, impactMedium, impactHeavy, notificationSuccess, notificationError, selectionClick } from "@/lib/haptics";
import React, { useState, useCallback, useEffect } from "react";
import {
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { AnimatedCard } from "@/components/AnimatedCard";
import { useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/lib/i18n";
import { api, type Prescription } from "@/lib/api";
import {
  type MedicationReminder,
  getReminders,
  addReminder,
  removeReminder,
  toggleReminder,
  markTaken,
  isTakenToday,
  formatTime,
  parseFrequencyToTimes,
  requestNotificationPermissions,
} from "@/lib/notifications";
import { LogoWatermark } from "@/components/LogoWatermark";
import {
  assertPatientDataEpoch,
  capturePatientDataEpoch,
  isPatientDataEpochCurrent,
  subscribeToPatientDataClear,
} from "@/lib/secureStorage";
import { showAppAlert } from "@/lib/privacyAlerts";
import { Pressable } from "@/components/AccessiblePressable";
import { Modal } from "@/components/AccessibleModal";
import { useAccessibilityLabels } from "@/lib/accessibilityLabels";

const TIME_OPTIONS = [
  "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
  "22:00", "22:30", "23:00",
];

function TimePickerModal({
  visible,
  onClose,
  onSelect,
  selectedTimes,
  colors,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (times: string[]) => void;
  selectedTimes: string[];
  colors: any;
  t: (key: any) => string;
}) {
  const [selected, setSelected] = useState<string[]>(selectedTimes);
  const insets = useSafeAreaInsets();
  const a11y = useAccessibilityLabels();

  useEffect(() => {
    if (visible) setSelected(selectedTimes);
  }, [visible, selectedTimes]);

  const toggle = (time: string) => {
    setSelected((prev) =>
      prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time].sort()
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent accessibilityLabel={t("selectReminderTimes")} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalHeader}>
            <Text accessibilityRole="header" style={[styles.modalTitle, { color: colors.text }]}>{t("selectReminderTimes")}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={a11y.closeDialog}>
              <Feather name="x" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
            {t("tapTimesToSelect")}
          </Text>
          <ScrollView style={styles.timeGrid} contentContainerStyle={styles.timeGridContent}>
            {TIME_OPTIONS.map((time) => {
              const isSelected = selected.includes(time);
              return (
                <Pressable
                  key={time}
                  onPress={() => {
                    impactLight();
                    toggle(time);
                  }}
                  style={[
                    styles.timeChip,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityLabel={formatTime(time)}
                  accessibilityState={{ checked: isSelected }}
                >
                  <Text style={[styles.timeChipText, { color: isSelected ? colors.onPrimary : colors.text }]}>
                    {formatTime(time)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            style={[styles.confirmBtn, { backgroundColor: colors.primary, opacity: selected.length === 0 ? 0.5 : 1 }]}
            onPress={() => {
              if (selected.length > 0) {
                onSelect(selected);
                onClose();
              }
            }}
            disabled={selected.length === 0}
            accessibilityRole="button"
            accessibilityLabel={t("setReminders")}
            accessibilityState={{ disabled: selected.length === 0 }}
          >
            <Text style={[styles.confirmBtnText, { color: colors.onPrimary }]}>
              {t("setReminders")} ({selected.length})
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SetupReminderModal({
  visible,
  prescription,
  onClose,
  onSave,
  colors,
  t,
}: {
  visible: boolean;
  prescription: Prescription | null;
  onClose: () => void;
  onSave: (times: string[]) => void;
  colors: any;
  t: (key: any) => string;
}) {
  const suggestedTimes = parseFrequencyToTimes(prescription?.frequency);
  const [times, setTimes] = useState<string[]>(suggestedTimes);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const insets = useSafeAreaInsets();
  const a11y = useAccessibilityLabels();

  useEffect(() => {
    if (visible && prescription) {
      setTimes(parseFrequencyToTimes(prescription.frequency));
    } else if (!visible) {
      setTimes([]);
      setShowTimePicker(false);
    }
  }, [visible, prescription]);

  if (!prescription) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent accessibilityLabel={t("setupReminder")} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalHeader}>
            <Text accessibilityRole="header" style={[styles.modalTitle, { color: colors.text }]}>{t("setupReminder")}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={a11y.closeDialog}>
              <Feather name="x" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={[styles.medInfoBox, { backgroundColor: colors.primaryLight }]}>
            <Feather name="package" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.medInfoName, { color: colors.text }]}>{prescription.medicationName}</Text>
              {prescription.dosage ? (
                <Text style={[styles.medInfoDetail, { color: colors.textSecondary }]}>{prescription.dosage}</Text>
              ) : null}
              {prescription.frequency ? (
                <Text style={[styles.medInfoDetail, { color: colors.textSecondary }]}>{prescription.frequency}</Text>
              ) : null}
            </View>
          </View>

          {prescription.instructions ? (
            <View style={[styles.instructionBox, { backgroundColor: colors.infoLight }]}>
              <Feather name="info" size={14} color={colors.info} />
              <Text style={[styles.instructionText, { color: colors.info }]}>{prescription.instructions}</Text>
            </View>
          ) : null}

          <Text style={[styles.sectionLabel, { color: colors.text }]}>{t("reminderTimes")}</Text>
          <View style={styles.timesRow}>
            {times.map((time) => (
              <View key={time} style={[styles.timeTag, { backgroundColor: colors.successLight }]}>
                <Feather name="clock" size={14} color={colors.success} />
                <Text style={[styles.timeTagText, { color: colors.success }]}>{formatTime(time)}</Text>
                <Pressable
                  onPress={() => {
                    if (times.length > 1) setTimes(times.filter((t) => t !== time));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("remove")} ${formatTime(time)}`}
                  accessibilityState={{ disabled: times.length <= 1 }}
                  disabled={times.length <= 1}
                >
                  <Feather name="x" size={14} color={colors.success} />
                </Pressable>
              </View>
            ))}
            <Pressable
              style={[styles.addTimeBtn, { borderColor: colors.controlBorder }]}
              onPress={() => setShowTimePicker(true)}
              accessibilityRole="button"
              accessibilityLabel={t("editTimes")}
            >
              <Feather name="plus" size={16} color={colors.primary} />
              <Text style={[styles.addTimeBtnText, { color: colors.primary }]}>{t("editTimes")}</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
            onPress={() => onSave(times)}
            accessibilityRole="button"
            accessibilityLabel={t("enableReminder")}
          >
                  <Feather name="bell" size={18} color={colors.onPrimary} />
            <Text style={[styles.confirmBtnText, { color: colors.onPrimary }]}>{t("enableReminder")}</Text>
          </Pressable>
        </View>
      </View>

      <TimePickerModal
        visible={showTimePicker}
        onClose={() => setShowTimePicker(false)}
        onSelect={setTimes}
        selectedTimes={times}
        colors={colors}
        t={t}
      />
    </Modal>
  );
}

function ReminderCard({
  reminder,
  index,
  colors,
  t,
  onToggle,
  onDelete,
  onMarkTaken,
}: {
  reminder: MedicationReminder;
  index: number;
  colors: any;
  t: (key: any) => string;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onMarkTaken: (id: string, time: string) => void;
}) {
  const allTaken = reminder.times.every((time) => isTakenToday(reminder, time));
  const takenCount = reminder.times.filter((time) => isTakenToday(reminder, time)).length;

  return (
    <AnimatedCard index={index}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, allTaken && { backgroundColor: colors.successLight }]}>
            <Feather
              name={allTaken ? "check-circle" : "bell"}
              size={20}
              color={allTaken ? colors.success : colors.primary}
            />
          </View>
          <View style={styles.cardHeaderContent}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{reminder.medicationName}</Text>
            {reminder.dosage ? (
              <Text style={[styles.cardDosage, { color: colors.textSecondary }]}>{reminder.dosage}</Text>
            ) : null}
          </View>
          <Switch
            value={reminder.enabled}
            onValueChange={(val) => onToggle(reminder.id, val)}
            trackColor={{ false: colors.border, true: colors.primaryLight }}
            thumbColor={reminder.enabled ? colors.primary : colors.textTertiary}
            accessibilityLabel={reminder.medicationName}
            accessibilityState={{ checked: reminder.enabled }}
          />
        </View>

        {reminder.instructions ? (
          <View style={[styles.instructionBox, { backgroundColor: colors.infoLight }]}>
            <Feather name="info" size={13} color={colors.info} />
            <Text style={[styles.instructionText, { color: colors.info }]}>{reminder.instructions}</Text>
          </View>
        ) : null}

        <View style={styles.progressRow}>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
            {t("todayProgress")}
          </Text>
          <Text style={[styles.progressCount, { color: allTaken ? colors.success : colors.primary }]}>
            {takenCount}/{reminder.times.length}
          </Text>
        </View>

        <View style={styles.timesSection}>
          {reminder.times.map((time) => {
            const taken = isTakenToday(reminder, time);
            return (
              <View key={time} style={styles.timeRow}>
                <View style={styles.timeInfo}>
                  <Feather name="clock" size={14} color={colors.textTertiary} />
                  <Text style={[styles.timeText, { color: colors.text }, taken && styles.takenText]}>
                    {formatTime(time)}
                  </Text>
                </View>
                {taken ? (
                  <View style={[styles.takenBadge, { backgroundColor: colors.successLight }]}>
                    <Feather name="check" size={14} color={colors.success} />
                    <Text style={[styles.takenBadgeText, { color: colors.success }]}>{t("taken")}</Text>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.takeBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      onMarkTaken(reminder.id, time);
                    }}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("markTaken")}, ${formatTime(time)}`}
                  >
                    <Text style={[styles.takeBtnText, { color: colors.onPrimary }]}>{t("markTaken")}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        <Pressable
          style={[styles.deleteRow]}
          onPress={() => {
            impactMedium();
            if (Platform.OS === "web") {
              onDelete(reminder.id);
            } else {
              Alert.alert(
                t("removeReminder"),
                t("removeReminderConfirm"),
                [
                  { text: t("cancel"), style: "cancel" },
                  { text: t("remove"), style: "destructive", onPress: () => onDelete(reminder.id) },
                ]
              );
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={t("removeReminder")}
        >
          <Feather name="trash-2" size={14} color={colors.danger} />
          <Text style={[styles.deleteText, { color: colors.danger }]}>{t("removeReminder")}</Text>
        </Pressable>
      </View>
    </AnimatedCard>
  );
}

function PrescriptionPickerItem({
  prescription,
  existingReminderIds,
  colors,
  t,
  onSelect,
}: {
  prescription: Prescription;
  existingReminderIds: Set<string>;
  colors: any;
  t: (key: any) => string;
  onSelect: (p: Prescription) => void;
}) {
  const hasReminder = prescription.id ? existingReminderIds.has(prescription.id) : false;
  return (
    <Pressable
      style={[styles.prescriptionItem, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
      onPress={() => {
        if (!hasReminder) {
          impactLight();
          onSelect(prescription);
        }
      }}
      disabled={hasReminder}
      accessibilityRole="button"
      accessibilityLabel={prescription.medicationName || "Medication"}
      accessibilityState={{ disabled: hasReminder }}
    >
      <View style={styles.prescriptionInfo}>
        <Text style={[styles.prescriptionName, { color: hasReminder ? colors.textTertiary : colors.text }]}>
          {prescription.medicationName || "Medication"}
        </Text>
        {prescription.dosage ? (
          <Text style={[styles.prescriptionDetail, { color: colors.textSecondary }]}>{prescription.dosage}</Text>
        ) : null}
        {prescription.frequency ? (
          <Text style={[styles.prescriptionDetail, { color: colors.textSecondary }]}>{prescription.frequency}</Text>
        ) : null}
      </View>
      {hasReminder ? (
        <View style={[styles.alreadySetBadge, { backgroundColor: colors.successLight }]}>
          <Feather name="check" size={14} color={colors.success} />
          <Text style={[styles.alreadySetText, { color: colors.success }]}>{t("reminderSet")}</Text>
        </View>
      ) : (
        <Feather name="plus-circle" size={22} color={colors.primary} />
      )}
    </Pressable>
  );
}

export default function RemindersScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const a11y = useAccessibilityLabels();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [reminders, setReminders] = useState<MedicationReminder[]>([]);
  const [setupModal, setSetupModal] = useState<Prescription | null>(null);
  const [showPrescriptions, setShowPrescriptions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: prescriptions, isLoading: prescLoading } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => api.getPrescriptions(),
  });

  const loadReminders = useCallback(async (expectedEpoch = capturePatientDataEpoch()) => {
    const loaded = await getReminders();
    assertPatientDataEpoch(expectedEpoch);
    setReminders(loaded);
  }, []);

  useEffect(() => {
    const expectedEpoch = capturePatientDataEpoch();
    loadReminders(expectedEpoch).catch(() => {
      if (isPatientDataEpochCurrent(expectedEpoch)) {
        showAppAlert(t("error"), "CARNET could not load reminders from secure storage.");
      }
    });
  }, [loadReminders, t]);

  useEffect(() => subscribeToPatientDataClear(() => {
    setReminders([]);
    setSetupModal(null);
    setShowPrescriptions(false);
    setRefreshing(false);
    try {
      const cancellation = queryClient.cancelQueries();
      queryClient.clear();
      void cancellation.finally(() => queryClient.clear()).catch(() => {});
    } catch {
      try { queryClient.clear(); } catch {}
    }
  }), [queryClient]);

  const handleRefresh = async () => {
    const expectedEpoch = capturePatientDataEpoch();
    setRefreshing(true);
    try {
      await Promise.all([
        loadReminders(expectedEpoch),
        queryClient.invalidateQueries({ queryKey: ["prescriptions"] }),
      ]);
      assertPatientDataEpoch(expectedEpoch);
    } catch {
      if (isPatientDataEpochCurrent(expectedEpoch)) {
        showAppAlert(t("error"), "CARNET could not refresh reminders.");
      }
    } finally {
      if (isPatientDataEpochCurrent(expectedEpoch)) setRefreshing(false);
    }
  };

  const existingReminderIds = new Set(reminders.map((r) => r.prescriptionId));

  const handleAddReminder = async (times: string[]) => {
    if (!setupModal) return;
    const expectedEpoch = capturePatientDataEpoch();
    const prescription = setupModal;
    try {
      await addReminder(
        prescription.id || `presc_${Date.now()}`,
        prescription.medicationName || "Medication",
        prescription.dosage || "",
        prescription.instructions || "",
        times
      );
      assertPatientDataEpoch(expectedEpoch);
      await loadReminders(expectedEpoch);
      assertPatientDataEpoch(expectedEpoch);
      setSetupModal(null);
      setShowPrescriptions(false);
      notificationSuccess();
    } catch {
      if (isPatientDataEpochCurrent(expectedEpoch)) {
        notificationError();
        showAppAlert(t("error"), "The reminder could not be saved. Please try again.");
      }
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    const expectedEpoch = capturePatientDataEpoch();
    try {
      await toggleReminder(id, enabled);
      assertPatientDataEpoch(expectedEpoch);
      await loadReminders(expectedEpoch);
    } catch {
      if (isPatientDataEpochCurrent(expectedEpoch)) {
        notificationError();
        showAppAlert(t("error"), "The reminder setting could not be changed.");
      }
    }
  };

  const handleDelete = async (id: string) => {
    const expectedEpoch = capturePatientDataEpoch();
    try {
      await removeReminder(id);
      assertPatientDataEpoch(expectedEpoch);
      await loadReminders(expectedEpoch);
    } catch {
      if (isPatientDataEpochCurrent(expectedEpoch)) {
        notificationError();
        showAppAlert(t("error"), "The reminder could not be removed.");
      }
    }
  };

  const handleMarkTaken = async (id: string, time: string) => {
    const expectedEpoch = capturePatientDataEpoch();
    try {
      await markTaken(id, time);
      assertPatientDataEpoch(expectedEpoch);
      await loadReminders(expectedEpoch);
      notificationSuccess();
    } catch {
      if (isPatientDataEpochCurrent(expectedEpoch)) {
        notificationError();
        showAppAlert(t("error"), "Adherence could not be saved. No change was made.");
      }
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const renderHeader = () => (
    <>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerGradient, { paddingTop: topPad + 16 }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.whiteText }]}>{t("medicationReminders")}</Text>
            <Text style={[styles.headerSubtitle, { color: colors.onPrimaryMuted }]}>
              {reminders.length > 0
                ? t("activeReminders", { count: String(reminders.length) })
                : t("noRemindersYet")}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
            onPress={() => {
              impactLight();
              setShowPrescriptions(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t("addMedicationReminder")}
          >
            <Feather name="plus" size={22} color={colors.whiteText} />
          </Pressable>
        </View>
      </LinearGradient>
    </>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primaryLight }]}>
        <Feather name="bell" size={36} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("noRemindersTitle")}</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("noRemindersText")}</Text>
      <Pressable
        style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
        onPress={() => setShowPrescriptions(true)}
        accessibilityRole="button"
        accessibilityLabel={t("addMedicationReminder")}
      >
        <Feather name="plus" size={18} color={colors.onPrimary} />
        <Text style={[styles.emptyBtnText, { color: colors.onPrimary }]}>{t("addMedicationReminder")}</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <FlatList
        data={reminders}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ReminderCard
            reminder={item}
            index={index}
            colors={colors}
            t={t}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onMarkTaken={handleMarkTaken}
          />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      />

      <Modal
        visible={showPrescriptions}
        animationType="slide"
        transparent
        accessibilityLabel={t("selectMedication")}
        onRequestClose={() => setShowPrescriptions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text accessibilityRole="header" style={[styles.modalTitle, { color: colors.text }]}>{t("selectMedication")}</Text>
              <Pressable onPress={() => setShowPrescriptions(false)} accessibilityRole="button" accessibilityLabel={a11y.closeDialog}>
                <Feather name="x" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              {t("selectMedicationDesc")}
            </Text>
            {prescLoading ? (
              <View
                style={styles.loadingState}
                accessibilityLabel={a11y.loading}
                accessibilityState={{ busy: true }}
                aria-busy
              >
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t("loadingMedications")}</Text>
              </View>
            ) : !prescriptions || prescriptions.length === 0 ? (
              <View style={styles.loadingState}>
                <Feather name="package" size={32} color={colors.textTertiary} />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t("noPrescriptionsFound")}</Text>
              </View>
            ) : (
              <ScrollView style={styles.prescriptionList}>
                {prescriptions.map((p, i) => (
                  <PrescriptionPickerItem
                    key={p.id || i}
                    prescription={p}
                    existingReminderIds={existingReminderIds}
                    colors={colors}
                    t={t}
                    onSelect={(presc) => setSetupModal(presc)}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <SetupReminderModal
        visible={!!setupModal}
        prescription={setupModal}
        onClose={() => setSetupModal(null)}
        onSave={handleAddReminder}
        colors={colors}
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerGradient: { paddingHorizontal: 20, paddingBottom: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  headerSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4 },
  addBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
  listContent: { gap: 12 },
  card: {
    marginHorizontal: 16, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: "#e8f2fd",
    alignItems: "center", justifyContent: "center",
  },
  cardHeaderContent: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  cardDosage: { fontSize: 13, fontFamily: "Inter_400Regular" },
  instructionBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 10 },
  instructionText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  progressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  progressCount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  timesSection: { gap: 8 },
  timeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  timeInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  timeText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  takenText: { textDecorationLine: "line-through", opacity: 0.6 },
  takenBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  takenBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  takeBtn: { paddingHorizontal: 14, paddingVertical: 6, minHeight: 44, borderRadius: 8, justifyContent: "center" },
  takeBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  deleteRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 4, minHeight: 44 },
  deleteText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  emptyState: { alignItems: "center", paddingTop: 40, paddingHorizontal: 32, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  emptyBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 16 },
  prescriptionList: { maxHeight: 400 },
  prescriptionItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  prescriptionInfo: { flex: 1, gap: 2 },
  prescriptionName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  prescriptionDetail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  alreadySetBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  alreadySetText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  loadingState: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  medInfoBox: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, marginBottom: 8 },
  medInfoName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  medInfoDetail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 8, marginBottom: 8 },
  timesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeTag: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  timeTagText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  addTimeBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, borderRadius: 10, borderWidth: 1, borderStyle: "dashed" },
  addTimeBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 16 },
  confirmBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  timeGrid: { maxHeight: 300 },
  timeGridContent: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeChip: { paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: "center", borderRadius: 10, borderWidth: 1 },
  timeChipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});

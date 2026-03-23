import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { LogoWatermark } from "@/components/LogoWatermark";

const APPOINTMENT_TYPE_KEYS = [
  { key: "generalCheckup", value: "general_checkup" },
  { key: "followUpVisit", value: "follow_up" },
  { key: "consultation", value: "consultation" },
  { key: "preventiveCare", value: "preventive_care" },
  { key: "urgentCare", value: "urgent_care" },
  { key: "specialistReferral", value: "specialist_referral" },
  { key: "labWork", value: "lab_work" },
  { key: "vaccination", value: "vaccination" },
  { key: "other", value: "other" },
] as const;

const TIME_PREFERENCE_KEYS = [
  { key: "morning", value: "morning" },
  { key: "afternoon", value: "afternoon" },
  { key: "evening", value: "evening" },
  { key: "noPreference", value: "any" },
] as const;

function OptionPicker({
  label,
  icon,
  options,
  selected,
  onSelect,
  colors,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  options: { label: string; value: string }[];
  selected: string;
  onSelect: (v: string) => void;
  colors: any;
}) {
  return (
    <View style={styles.fieldGroup}>
      <View style={styles.fieldLabelRow}>
        <Feather name={icon} size={16} color={colors.primary} />
        <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      </View>
      <View style={styles.optionsGrid}>
        {options.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[
                styles.optionChip,
                {
                  backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary,
                  borderColor: isSelected ? colors.primary : colors.borderLight,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(opt.value);
              }}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: isSelected ? "#fff" : colors.text },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DateSelector({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: any;
}) {
  const today = new Date();
  const dates: Date[] = [];
  for (let i = 1; i <= 21; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() !== 0) {
      dates.push(d);
    }
  }

  return (
    <View style={styles.fieldGroup}>
      <View style={styles.fieldLabelRow}>
        <Feather name="calendar" size={16} color={colors.primary} />
        <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
        {dates.map((d) => {
          const key = d.toISOString().split("T")[0];
          const isSelected = value === key;
          return (
            <Pressable
              key={key}
              style={[
                styles.dateChip,
                {
                  backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary,
                  borderColor: isSelected ? colors.primary : colors.borderLight,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChange(key);
              }}
            >
              <Text style={[styles.dateChipMonth, { color: isSelected ? "rgba(255,255,255,0.8)" : colors.textTertiary }]}>
                {d.toLocaleDateString("en-US", { month: "short" })}
              </Text>
              <Text style={[styles.dateChipDay, { color: isSelected ? "#fff" : colors.text }]}>
                {d.getDate()}
              </Text>
              <Text style={[styles.dateChipWeekday, { color: isSelected ? "rgba(255,255,255,0.8)" : colors.textTertiary }]}>
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function RequestAppointmentScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();

  const APPOINTMENT_TYPES = APPOINTMENT_TYPE_KEYS.map((a) => ({ label: t(a.key as any), value: a.value }));
  const TIME_PREFERENCES = TIME_PREFERENCE_KEYS.map((a) => ({ label: t(a.key as any), value: a.value }));
  const [appointmentType, setAppointmentType] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("any");
  const [reason, setReason] = useState("");
  const [doctorPreference, setDoctorPreference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = appointmentType && preferredDate && reason.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api.requestAppointment({
        appointmentType,
        preferredDate,
        preferredTime: preferredTime !== "any" ? preferredTime : undefined,
        reason: reason.trim(),
        doctorPreference: doctorPreference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(true);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        t("requestFailed"),
        err.message || t("couldNotSubmit")
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("requestAppointment")} />
        <View style={styles.successContainer}>
          <View style={[styles.successIcon, { backgroundColor: colors.primaryLight }]}>
            <Feather name="check-circle" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.successTitle, { color: colors.text }]}>{t("requestSubmitted")}</Text>
          <Text style={[styles.successText, { color: colors.textSecondary }]}>
            {t("requestSubmittedText")}
          </Text>
          <View style={styles.successActions}>
            <Pressable
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                setSubmitted(false);
                setAppointmentType("");
                setPreferredDate("");
                setPreferredTime("any");
                setReason("");
                setDoctorPreference("");
                setNotes("");
              }}
            >
              <Feather name="plus" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>{t("requestAnother")}</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={() => router.back()}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>{t("backToHome")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title={t("requestAppointment")} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.infoCard, { backgroundColor: colors.primaryLight, borderColor: colors.borderLight }]}>
            <Feather name="info" size={18} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.primary }]}>
              {t("appointmentInfo")}
            </Text>
          </View>

          <OptionPicker
            label={t("appointmentType")}
            icon="clipboard"
            options={APPOINTMENT_TYPES}
            selected={appointmentType}
            onSelect={setAppointmentType}
            colors={colors}
          />

          <DateSelector
            label={t("preferredDate")}
            value={preferredDate}
            onChange={setPreferredDate}
            colors={colors}
          />

          <OptionPicker
            label={t("preferredTime")}
            icon="clock"
            options={TIME_PREFERENCES}
            selected={preferredTime}
            onSelect={setPreferredTime}
            colors={colors}
          />

          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <Feather name="edit-3" size={16} color={colors.primary} />
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{t("reasonForVisit")}</Text>
            </View>
            <TextInput
              style={[styles.textInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.borderLight }]}
              value={reason}
              onChangeText={setReason}
              placeholder={t("describeReason")}
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <Feather name="user" size={16} color={colors.primary} />
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{t("doctorPreference")}</Text>
            </View>
            <TextInput
              style={[styles.textInputSingle, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.borderLight }]}
              value={doctorPreference}
              onChangeText={setDoctorPreference}
              placeholder={t("preferredDoctorName")}
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <Feather name="message-circle" size={16} color={colors.primary} />
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{t("additionalNotes")}</Text>
            </View>
            <TextInput
              style={[styles.textInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.borderLight }]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t("additionalInfo")}
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              { backgroundColor: canSubmit ? colors.primary : colors.border },
              pressed && canSubmit && { opacity: 0.85 },
              submitting && { opacity: 0.6 },
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="send" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>{t("submitRequest")}</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, gap: 20, paddingBottom: 40 },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  fieldGroup: { gap: 10 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  fieldLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  optionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  optionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  dateScroll: { gap: 8, paddingVertical: 4 },
  dateChip: {
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 60,
    borderWidth: 1,
    gap: 2,
  },
  dateChipMonth: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase" },
  dateChipDay: { fontSize: 22, fontFamily: "Inter_700Bold" },
  dateChipWeekday: { fontSize: 11, fontFamily: "Inter_400Regular" },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 80,
  },
  textInputSingle: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
    shadowColor: "#1a6fbf",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  secondaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  successText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  successActions: { width: "100%", gap: 12, marginTop: 12 },
});

import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { impactLight, impactMedium, impactHeavy, notificationSuccess, notificationError, selectionClick } from "@/lib/haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { Avatar } from "@/components/Avatar";
import { ProfileSkeleton } from "@/components/SkeletonLoader";
import { AnimatedCard } from "@/components/AnimatedCard";
import { api, type ProfileUpdateData } from "@/lib/api";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled,
  getBiometricType,
} from "@/lib/biometrics";
import { useI18n, LANGUAGES } from "@/lib/i18n";
import { LogoWatermark } from "@/components/LogoWatermark";

const READ_ONLY_FIELDS = ["mrn", "bloodType", "allergies", "insurancePolicyNumber"];

function InfoRow({ icon, label, value, colors }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; value?: string; colors: any }) {
  if (!value) return null;
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.borderLight }]}>
      <View style={[styles.infoIconWrap, { backgroundColor: colors.primaryLight }]}>
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <View style={styles.infoContent}>
        <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function EditField({
  icon,
  label,
  value,
  onChange,
  readOnly,
  colors,
  keyboardType,
  placeholder,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  colors: any;
  keyboardType?: "default" | "email-address" | "phone-pad";
  placeholder?: string;
}) {
  const { t } = useI18n();
  return (
    <View style={[styles.editFieldWrap, { borderBottomColor: colors.borderLight }]}>
      <View style={[styles.infoIconWrap, { backgroundColor: readOnly ? colors.surfaceSecondary : colors.primaryLight }]}>
        <Feather name={icon} size={16} color={readOnly ? colors.textTertiary : colors.primary} />
      </View>
      <View style={styles.editFieldContent}>
        <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>
          {label}
          {readOnly ? ` (${t("readOnly")})` : ""}
        </Text>
        {readOnly ? (
          <Text style={[styles.infoValue, { color: colors.textTertiary }]}>{value || "—"}</Text>
        ) : (
          <TextInput
            style={[styles.editInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder || label}
            placeholderTextColor={colors.textTertiary}
            keyboardType={keyboardType || "default"}
            autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
          />
        )}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { profile, isLoading, logout, refreshProfile } = useAuth();
  const { colors, mode, setMode } = useTheme();
  const { t, language, setLanguage } = useI18n();
  const [refreshing, setRefreshing] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioType, setBioType] = useState("Biometrics");

  const [editData, setEditData] = useState<ProfileUpdateData>({});

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    (async () => {
      const avail = await isBiometricAvailable();
      setBioAvailable(avail);
      if (avail) {
        const enabled = await isBiometricEnabled();
        setBioEnabled(enabled);
        const type = await getBiometricType();
        setBioType(type);
      }
    })();
  }, []);

  useEffect(() => {
    if (profile && editing) {
      setEditData({
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        phone: profile.phone || "",
        email: profile.email || "",
        address: profile.address || "",
        gender: profile.gender || "",
        dateOfBirth: profile.dateOfBirth || "",
        emergencyContact: profile.emergencyContact || "",
        emergencyPhone: profile.emergencyPhone || "",
      });
    }
  }, [editing, profile]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    impactMedium();
    await logout();
    router.replace("/login");
  };

  const cycleTheme = () => {
    impactLight();
    const next = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    setMode(next);
  };

  const toggleBiometric = async (val: boolean) => {
    impactLight();
    await setBiometricEnabled(val);
    setBioEnabled(val);
  };

  const startEditing = () => {
    impactLight();
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditData({});
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.updateProfile(editData);
      notificationSuccess();
      await refreshProfile();
      setEditing(false);
    } catch (err: any) {
      notificationError();
      Alert.alert(t("updateFailed"), err.message || t("couldNotSave"));
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof ProfileUpdateData, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const themeLabel = mode === "system" ? t("system") : mode === "light" ? t("light") : t("dark");
  const themeIcon = mode === "dark" ? "moon" : mode === "light" ? "sun" : "smartphone";

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || t("patient");

  if (isLoading && !profile) {
    return (
      <View style={[styles.containerBase, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <ProfileSkeleton />
      </View>
    );
  }

  const editButton = (
    <Pressable
      style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
      onPress={editing ? cancelEditing : startEditing}
      testID="button-edit-profile"
      accessibilityLabel={editing ? t("cancel") : t("editProfile")}
      hitSlop={12}
    >
      <Feather name={editing ? "x" : "edit-2"} size={18} color="#fff" />
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <LogoWatermark />
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : 20 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: topPad + 20 }]}
        >
          <View style={styles.heroTopRow}>
            <View style={{ width: 36 }} />
            <Avatar firstName={profile?.firstName} lastName={profile?.lastName} size={88} style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
            {editButton}
          </View>
          <Text style={styles.nameWhite}>{fullName}</Text>
          {profile?.email ? <Text style={styles.emailWhite}>{profile.email}</Text> : null}
          {profile?.mrn ? (
            <View style={styles.mrnBadge}>
              <Feather name="hash" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={styles.mrnText}>{t("mrnPrefix")}{profile.mrn}</Text>
            </View>
          ) : null}
        </LinearGradient>

        {editing ? (
          <AnimatedCard index={0}>
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t("editProfile")}</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                <EditField icon="user" label={t("firstName")} value={editData.firstName || ""} onChange={(v) => updateField("firstName", v)} colors={colors} />
                <EditField icon="user" label={t("lastName")} value={editData.lastName || ""} onChange={(v) => updateField("lastName", v)} colors={colors} />
                <EditField icon="mail" label={t("email")} value={editData.email || ""} onChange={(v) => updateField("email", v)} colors={colors} keyboardType="email-address" />
                <EditField icon="phone" label={t("phone")} value={editData.phone || ""} onChange={(v) => updateField("phone", v)} colors={colors} keyboardType="phone-pad" />
                <EditField icon="map-pin" label={t("address")} value={editData.address || ""} onChange={(v) => updateField("address", v)} colors={colors} />
                <EditField icon="user" label={t("gender")} value={editData.gender || ""} onChange={(v) => updateField("gender", v)} colors={colors} />
                <EditField icon="calendar" label={t("dateOfBirth")} value={editData.dateOfBirth || ""} onChange={(v) => updateField("dateOfBirth", v)} colors={colors} />
                <EditField icon="phone" label={t("emergencyContact")} value={editData.emergencyContact || ""} onChange={(v) => updateField("emergencyContact", v)} colors={colors} />
                <EditField icon="phone-call" label={t("emergencyPhone")} value={editData.emergencyPhone || ""} onChange={(v) => updateField("emergencyPhone", v)} colors={colors} keyboardType="phone-pad" />
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight, marginTop: 12 }]}>
                <EditField icon="hash" label={t("medicalRecord")} value={profile?.mrn || ""} onChange={() => {}} readOnly colors={colors} />
                <EditField icon="droplet" label={t("bloodType")} value={profile?.bloodType || ""} onChange={() => {}} readOnly colors={colors} />
              </View>

              <View style={styles.editActions}>
                <Pressable
                  style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.8 }]}
                  onPress={cancelEditing}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>{t("cancel")}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }, saving && { opacity: 0.6 }]}
                  onPress={saveProfile}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="check" size={16} color="#fff" />
                      <Text style={styles.saveBtnText}>{t("saveChanges")}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </AnimatedCard>
        ) : (
          <>
            <AnimatedCard index={0}>
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t("personalInfo")}</Text>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                  <InfoRow icon="calendar" label={t("dateOfBirth")} value={profile?.dateOfBirth} colors={colors} />
                  <InfoRow icon="user" label={t("gender")} value={profile?.gender} colors={colors} />
                  <InfoRow icon="droplet" label={t("bloodType")} value={profile?.bloodType} colors={colors} />
                  <InfoRow icon="phone" label={t("phone")} value={profile?.phone} colors={colors} />
                  <InfoRow icon="mail" label={t("email")} value={profile?.email} colors={colors} />
                  <InfoRow icon="map-pin" label={t("address")} value={profile?.address} colors={colors} />
                  {profile?.mrn ? <InfoRow icon="hash" label={t("medicalRecord")} value={profile.mrn} colors={colors} /> : null}
                  {profile?.emergencyContact ? <InfoRow icon="phone-call" label={t("emergencyContact")} value={`${profile.emergencyContact}${profile.emergencyPhone ? ` (${profile.emergencyPhone})` : ""}`} colors={colors} /> : null}
                </View>
              </View>
            </AnimatedCard>

            {profile?.allergies && profile.allergies.length > 0 ? (
              <AnimatedCard index={1}>
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t("allergies")}</Text>
                  <View style={[styles.card, styles.allergyCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                    <View style={styles.allergyHeader}>
                      <Feather name="alert-triangle" size={18} color={colors.danger} />
                      <Text style={[styles.allergyTitleText, { color: colors.danger }]}>{t("knownAllergies")}</Text>
                    </View>
                    {profile.allergies.map((allergy, i) => (
                      <View key={i} style={styles.allergyItem}>
                        <View style={[styles.allergyDot, { backgroundColor: colors.danger }]} />
                        <Text style={[styles.allergyText, { color: colors.text }]} testID="text-allergies">{allergy}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </AnimatedCard>
            ) : null}

            <AnimatedCard index={2}>
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t("preferences")}</Text>
                <View style={styles.prefGroup}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.prefRow,
                      { backgroundColor: colors.surface, borderColor: colors.borderLight },
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={cycleTheme}
                  >
                    <View style={[styles.prefIconWrap, { backgroundColor: colors.primaryLight }]}>
                      <Feather name={themeIcon as any} size={18} color={colors.primary} />
                    </View>
                    <View style={styles.prefContent}>
                      <Text style={[styles.prefLabel, { color: colors.text }]}>{t("appearance")}</Text>
                      <Text style={[styles.prefValue, { color: colors.textSecondary }]}>{themeLabel}</Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                  </Pressable>

                  <View style={[styles.prefRow, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                    <View style={[styles.prefIconWrap, { backgroundColor: colors.primaryLight }]}>
                      <Feather name="smartphone" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.prefContent}>
                      <Text style={[styles.prefLabel, { color: colors.text }]}>{bioType}</Text>
                      <Text style={[styles.prefValue, { color: colors.textSecondary }]}>
                        {bioAvailable ? t("quickSignIn", { type: bioType.toLowerCase() }) : t("biometricsNotAvailable")}
                      </Text>
                    </View>
                    <Switch
                      value={bioEnabled}
                      onValueChange={toggleBiometric}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#fff"
                      disabled={!bioAvailable}
                    />
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.prefRow,
                      { backgroundColor: colors.surface, borderColor: colors.borderLight },
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => {
                      impactLight();
                      setShowLangPicker(!showLangPicker);
                    }}
                  >
                    <View style={[styles.prefIconWrap, { backgroundColor: colors.primaryLight }]}>
                      <Feather name="globe" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.prefContent}>
                      <Text style={[styles.prefLabel, { color: colors.text }]}>{t("language")}</Text>
                      <Text style={[styles.prefValue, { color: colors.textSecondary }]}>
                        {LANGUAGES.find((l) => l.code === language)?.nativeLabel || "English"}
                      </Text>
                    </View>
                    <Feather name={showLangPicker ? "chevron-up" : "chevron-down"} size={18} color={colors.textTertiary} />
                  </Pressable>

                  {showLangPicker ? (
                    <View style={[styles.langPickerWrap, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                      {LANGUAGES.map((lang) => {
                        const isActive = lang.code === language;
                        return (
                          <Pressable
                            key={lang.code}
                            style={({ pressed }) => [
                              styles.langOption,
                              { borderBottomColor: colors.borderLight },
                              isActive && { backgroundColor: colors.primaryLight },
                              pressed && { opacity: 0.7 },
                            ]}
                            onPress={() => {
                              impactLight();
                              setLanguage(lang.code);
                              setShowLangPicker(false);
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.langName, { color: colors.text }]}>{lang.nativeLabel}</Text>
                              <Text style={[styles.langNameSub, { color: colors.textTertiary }]}>{lang.label}</Text>
                            </View>
                            {isActive ? <Feather name="check" size={18} color={colors.primary} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              </View>
            </AnimatedCard>

            <AnimatedCard index={3}>
              <View style={styles.section}>
                <Pressable
                  style={({ pressed }) => [styles.logoutBtnFull, { backgroundColor: colors.dangerLight }, pressed && { opacity: 0.8 }]}
                  onPress={handleLogout}
                >
                  <Feather name="log-out" size={18} color={colors.danger} />
                  <Text style={[styles.logoutText, { color: colors.danger }]}>{t("signOut")}</Text>
                </Pressable>
              </View>
            </AnimatedCard>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  containerBase: {
    flex: 1,
  },
  hero: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 36,
    gap: 10,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 4,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  nameWhite: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginTop: 6,
  },
  emailWhite: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
  },
  mrnBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  mrnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 1,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  editFieldWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  editFieldContent: {
    flex: 1,
    gap: 4,
  },
  editInput: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  saveBtn: {
    flex: 2,
    flexDirection: "row",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#1a6fbf",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  allergyCard: {
    padding: 16,
    gap: 10,
  },
  allergyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  allergyTitleText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  allergyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  allergyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  allergyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  prefGroup: {
    gap: 10,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
  },
  prefIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  prefContent: {
    flex: 1,
  },
  prefLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  prefValue: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  logoutBtnFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  logoutText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  langPickerWrap: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  langOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  langName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  langNameSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
});

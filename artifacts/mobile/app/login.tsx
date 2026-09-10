import { Feather } from "@expo/vector-icons";
import { impactLight, impactMedium, impactHeavy, notificationSuccess, notificationError, selectionClick } from "@/lib/haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NavimedLogo from "@/components/NavimedLogo";
import { useAuth } from "@/context/AuthContext";
import { useEHR } from "@/context/EHRContext";
import { useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import type { EHRProviderConfig } from "@/lib/ehr/types";
import { LogoWatermark } from "@/components/LogoWatermark";
import { Pressable } from "@/components/AccessiblePressable";
import { useAccessibilityLabels } from "@/lib/accessibilityLabels";

function ProviderCard({
  provider,
  isSelected,
  onPress,
  colors,
}: {
  provider: EHRProviderConfig;
  isSelected: boolean;
  onPress: () => void;
  colors: any;
}) {
  const iconName: any = provider.icon || "server";
  const typeLabel =
    provider.type === "fhir"
      ? `FHIR ${provider.fhirVersion || "R4"}`
      : provider.type === "navimedi"
        ? "CARNET"
        : "Custom";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.providerCard,
        {
          backgroundColor: isSelected ? colors.primaryLight : colors.surfaceSecondary,
          borderColor: isSelected ? colors.primary : colors.borderLight,
        },
        pressed && { opacity: 0.8 },
      ]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={`${provider.name}, ${typeLabel}`}
    >
      <View style={[styles.providerIcon, { backgroundColor: isSelected ? colors.primary : colors.border }]}>
        <Feather name={iconName} size={18} color={isSelected ? colors.onPrimary : colors.textSecondary} />
      </View>
      <View style={styles.providerInfo}>
        <Text style={[styles.providerName, { color: colors.text }]}>{provider.name}</Text>
        {provider.description ? (
          <Text style={[styles.providerDesc, { color: colors.textTertiary }]} numberOfLines={1}>
            {provider.description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.typeBadge, { backgroundColor: isSelected ? colors.primary : colors.border }]}>
        <Text style={[styles.typeText, { color: isSelected ? colors.onPrimary : colors.textSecondary }]}>{typeLabel}</Text>
      </View>
      {isSelected ? <Feather name="check-circle" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

export default function LoginScreen() {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const { login, sessionEndReason } = useAuth();
  const { providers, activeProvider, selectProvider, addCustomFHIREndpoint, search } = useEHR();
  const { t } = useI18n();
  const a11y = useAccessibilityLabels();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const tenantRef = useRef<TextInput>(null);

  const [resetSending, setResetSending] = useState(false);
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [providerSearch, setProviderSearch] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  const filteredProviders = providerSearch ? search(providerSearch) : providers;

  const handleSelectProvider = async (provider: EHRProviderConfig) => {
    impactLight();
    await selectProvider(provider);
    setShowProviderPicker(false);
    setProviderSearch("");
  };

  const handleAddCustom = async () => {
    if (!customName.trim() || !customUrl.trim()) {
      Alert.alert(t("error"), t("ehrCustomRequired"));
      return;
    }
    if (!customUrl.startsWith("http")) {
      Alert.alert(t("error"), t("ehrInvalidUrl"));
      return;
    }
    impactLight();
    const provider = addCustomFHIREndpoint(customName.trim(), customUrl.trim());
    await selectProvider(provider);
    setShowCustomForm(false);
    setShowProviderPicker(false);
    setCustomName("");
    setCustomUrl("");
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError(t("enterEmailFirst"));
      return;
    }
    setResetSending(true);
    setError("");
    try {
      await api.forgotPassword(email);
      notificationSuccess();
      Alert.alert(t("resetLinkSent"), t("resetLinkSentText"), [{ text: "OK" }]);
    } catch (err: any) {
      notificationError();
      setError(err.message || t("resetFailed"));
    } finally {
      setResetSending(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError(t("enterCredentials"));
      return;
    }
    setLoading(true);
    setError("");
    impactLight();
    try {
      await login({ email, password, tenantId });
      router.replace("/(tabs)");
    } catch (err: any) {
      notificationError();
      setError(err.message || t("loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <LogoWatermark />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        accessibilityLabel={a11y.mainContent}
      >
        <View style={styles.header}>
          <NavimedLogo size={100} />
        </View>

        <View style={[styles.card, { backgroundColor: C.surface }]}>
          <Text accessibilityRole="header" style={[styles.cardTitle, { color: C.text }]}>{t("signIn")}</Text>
          <Text style={[styles.cardSubtitle, { color: C.textSecondary }]}>{t("accessRecords")}</Text>

          <View style={styles.form}>
            <Pressable
              style={({ pressed }) => [
                styles.providerSelector,
                {
                  backgroundColor: C.surfaceSecondary,
                  borderColor: showProviderPicker ? C.focusRing : C.controlBorder,
                },
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => {
                impactLight();
                setShowProviderPicker(!showProviderPicker);
              }}
              accessibilityRole="button"
              accessibilityLabel={activeProvider ? activeProvider.name : t("selectProvider")}
              accessibilityState={{ expanded: showProviderPicker }}
            >
              <View style={[styles.providerSelectorIcon, { backgroundColor: activeProvider ? C.primaryLight : C.border }]}>
                <Feather
                  name={(activeProvider?.icon as any) || "globe"}
                  size={18}
                  color={activeProvider ? C.primary : C.textTertiary}
                />
              </View>
              <View style={styles.providerSelectorContent}>
                <Text style={[styles.providerSelectorLabel, { color: C.textTertiary }]}>
                  {t("ehrSystem")}
                </Text>
                <Text style={[styles.providerSelectorValue, { color: activeProvider ? C.text : C.textTertiary }]}>
                  {activeProvider ? activeProvider.name : t("selectProvider")}
                </Text>
              </View>
              <Feather name={showProviderPicker ? "chevron-up" : "chevron-down"} size={18} color={C.textTertiary} />
            </Pressable>

            {showProviderPicker ? (
              <View style={[styles.providerPickerWrap, { backgroundColor: C.surface, borderColor: C.borderLight }]}>
                <View style={[styles.searchRow, { borderBottomColor: C.borderLight }]}>
                  <Feather name="search" size={16} color={C.textTertiary} />
                  <TextInput
                    style={[styles.searchInput, { color: C.text }]}
                    value={providerSearch}
                    onChangeText={setProviderSearch}
                    placeholder={t("searchProviders")}
                    placeholderTextColor={C.textTertiary}
                    autoCapitalize="none"
                    accessibilityLabel={t("searchProviders")}
                  />
                </View>
                {filteredProviders.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    isSelected={activeProvider?.id === provider.id}
                    onPress={() => handleSelectProvider(provider)}
                    colors={C}
                  />
                ))}

                <Pressable
                  style={({ pressed }) => [
                    styles.customEndpointBtn,
                    { borderColor: C.controlBorder },
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => {
                    impactLight();
                    setShowCustomForm(!showCustomForm);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showCustomForm }}
                >
                  <Feather name="plus-circle" size={16} color={C.primary} />
                  <Text style={[styles.customEndpointText, { color: C.primary }]}>{t("addCustomEndpoint")}</Text>
                </Pressable>

                {showCustomForm ? (
                  <View style={[styles.customFormWrap, { backgroundColor: C.surfaceSecondary, borderColor: C.borderLight }]}>
                    <Text style={[styles.customFormTitle, { color: C.text }]}>{t("customFhirEndpoint")}</Text>
                    <TextInput
                      style={[styles.customInput, { color: C.text, borderColor: C.controlBorder, backgroundColor: C.surface }]}
                      value={customName}
                      onChangeText={setCustomName}
                      placeholder={t("providerName")}
                      placeholderTextColor={C.textTertiary}
                      accessibilityLabel={t("providerName")}
                    />
                    <TextInput
                      style={[styles.customInput, { color: C.text, borderColor: C.controlBorder, backgroundColor: C.surface }]}
                      value={customUrl}
                      onChangeText={setCustomUrl}
                      placeholder="https://fhir.example.com/r4"
                      placeholderTextColor={C.textTertiary}
                      autoCapitalize="none"
                      keyboardType="url"
                      accessibilityLabel={t("customFhirEndpoint")}
                    />
                    <Pressable
                      style={({ pressed }) => [
                        styles.addProviderBtn,
                        { backgroundColor: C.primary },
                        pressed && { opacity: 0.85 },
                      ]}
                      onPress={handleAddCustom}
                      accessibilityRole="button"
                      accessibilityLabel={t("addAndConnect")}
                    >
                      <Feather name="plus" size={16} color={C.onPrimary} />
                      <Text style={[styles.addProviderBtnText, { color: C.onPrimary }]}>{t("addAndConnect")}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: C.textSecondary }]}>{t("email")}</Text>
              <View style={[styles.inputWrapper, { backgroundColor: C.surfaceSecondary, borderColor: C.controlBorder }]}>
                <Feather name="mail" size={18} color={C.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: C.text }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  placeholderTextColor={C.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  testID="input-email"
                  accessibilityLabel={t("email")}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: C.textSecondary }]}>{t("password")}</Text>
              <View style={[styles.inputWrapper, { backgroundColor: C.surfaceSecondary, borderColor: C.controlBorder }]}>
                <Feather name="lock" size={18} color={C.textTertiary} style={styles.inputIcon} />
                <TextInput
                  ref={passwordRef}
                  style={[styles.input, { flex: 1, color: C.text }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={C.textTertiary}
                  secureTextEntry={!showPassword}
                  returnKeyType="next"
                  onSubmitEditing={() => tenantRef.current?.focus()}
                  testID="input-password"
                  accessibilityLabel={t("password")}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton} accessibilityRole="button" accessibilityLabel={showPassword ? a11y.hidePassword : a11y.showPassword} accessibilityState={{ selected: showPassword }}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={C.textTertiary} />
                </Pressable>
              </View>
            </View>

            <Pressable onPress={handleForgotPassword} disabled={resetSending} accessibilityRole="button" accessibilityLabel={t("forgotPassword")} accessibilityState={{ disabled: resetSending, busy: resetSending }}>
              <Text style={[styles.forgotLink, { color: C.primary }]}>
                {resetSending ? `${t("sending")}...` : t("forgotPassword")}
              </Text>
            </Pressable>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: C.textSecondary }]}>{t("hospitalOptional")}</Text>
              <View style={[styles.inputWrapper, { backgroundColor: C.surfaceSecondary, borderColor: C.controlBorder }]}>
                <Feather name="home" size={18} color={C.textTertiary} style={styles.inputIcon} />
                <TextInput
                  ref={tenantRef}
                  style={[styles.input, { color: C.text }]}
                  value={tenantId}
                  onChangeText={setTenantId}
                  placeholder={t("yourHospitalName")}
                  placeholderTextColor={C.textTertiary}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  testID="input-tenant"
                  accessibilityLabel={t("hospitalOptional")}
                />
              </View>
            </View>

            {error || sessionEndReason ? (
              <View style={[styles.errorBox, { backgroundColor: C.dangerLight }]}>
                <Feather name="alert-circle" size={16} color={C.danger} accessible={false} />
                <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" aria-live="assertive" style={[styles.errorText, { color: C.danger }]}>
                  {error || (sessionEndReason === "inactive"
                    ? "You were signed out after 5 minutes without activity. Please sign in again."
                    : sessionEndReason === "expired"
                      ? "Your session has ended. Please sign in again."
                      : sessionEndReason === "provider_changed"
                        ? "Your provider changed. Sign in with credentials for the selected provider."
                        : "Your session could not be verified. Please sign in again.")}
                </Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.loginBtn, { backgroundColor: C.primary, shadowColor: C.primary }, pressed && { opacity: 0.85 }, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
              testID="button-login"
              accessibilityRole="button"
              accessibilityLabel={t("signIn")}
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator color={C.onPrimary} size="small" />
              ) : (
                <Text style={[styles.loginBtnText, { color: C.onPrimary }]}>{t("signIn")}</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.footer}>
          <Feather name="shield" size={14} color={C.textTertiary} />
          <Text style={[styles.footerText, { color: C.textTertiary }]}>{t("dataEncrypted")}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 24,
  },
  form: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    paddingVertical: 14,
  },
  eyeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  forgotLink: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  loginBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 54,
  },
  loginBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  providerSelector: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  providerSelectorIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  providerSelectorContent: {
    flex: 1,
  },
  providerSelectorLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  providerSelectorValue: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  providerPickerWrap: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 4,
  },
  providerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  providerIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  providerDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  customEndpointBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 12,
    borderTopWidth: 1,
    minHeight: 44,
  },
  customEndpointText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  customFormWrap: {
    margin: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  customFormTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  customInput: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addProviderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 12,
    minHeight: 44,
  },
  addProviderBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});

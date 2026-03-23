import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NavimedLogo from "@/components/NavimedLogo";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/lib/api";

export default function LoginScreen() {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState("abel@argilette.com");
  const [password, setPassword] = useState("Serrega1208@!!");
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const tenantRef = useRef<TextInput>(null);

  const [resetSending, setResetSending] = useState(false);

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }
    setResetSending(true);
    setError("");
    try {
      await api.forgotPassword(email);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Reset Link Sent",
        "If an account with that email exists, a password reset link has been sent. Please check your inbox.",
        [{ text: "OK" }]
      );
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err.message || "Failed to send reset link.");
    } finally {
      setResetSending(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await login({ email, password, tenantId });
      router.replace("/(tabs)");
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <NavimedLogo size={100} />
        </View>

        <View style={[styles.card, { backgroundColor: C.surface }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Sign In</Text>
          <Text style={[styles.cardSubtitle, { color: C.textSecondary }]}>Access your medical records securely</Text>

          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: C.textSecondary }]}>Email Address</Text>
              <View style={[styles.inputWrapper, { backgroundColor: C.surfaceSecondary, borderColor: C.border }]}>
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
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: C.textSecondary }]}>Password</Text>
              <View style={[styles.inputWrapper, { backgroundColor: C.surfaceSecondary, borderColor: C.border }]}>
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
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={C.textTertiary} />
                </Pressable>
              </View>
            </View>

            <Pressable onPress={handleForgotPassword} disabled={resetSending}>
              <Text style={[styles.forgotLink, { color: C.primary }]}>{resetSending ? "Sending..." : "Forgot Password?"}</Text>
            </Pressable>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: C.textSecondary }]}>Hospital / Clinic (optional)</Text>
              <View style={[styles.inputWrapper, { backgroundColor: C.surfaceSecondary, borderColor: C.border }]}>
                <Feather name="home" size={18} color={C.textTertiary} style={styles.inputIcon} />
                <TextInput
                  ref={tenantRef}
                  style={[styles.input, { color: C.text }]}
                  value={tenantId}
                  onChangeText={setTenantId}
                  placeholder="Your hospital name"
                  placeholderTextColor={C.textTertiary}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  testID="input-tenant"
                />
              </View>
            </View>

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: C.dangerLight }]}>
                <Feather name="alert-circle" size={16} color={C.danger} />
                <Text style={[styles.errorText, { color: C.danger }]}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.loginBtn, { backgroundColor: C.primary, shadowColor: C.primary }, pressed && { opacity: 0.85 }, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
              testID="button-login"
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.loginBtnText}>Sign In</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.footer}>
          <Feather name="shield" size={14} color={C.textTertiary} />
          <Text style={[styles.footerText, { color: C.textTertiary }]}>Your data is encrypted and secure</Text>
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
    padding: 4,
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
    color: "#fff",
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
});

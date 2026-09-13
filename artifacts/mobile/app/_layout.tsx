import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AccessibilityRoot } from "@/components/AccessibilityRoot";
import { Pressable } from "@/components/AccessiblePressable";
import { SessionSecurity } from "@/components/SessionSecurity";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { EHRProvider, useEHR } from "@/context/EHRContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { I18nContext, useI18nProvider } from "@/lib/i18n";

const FONT_TIMEOUT_MS = 10_000;

// Prevent the native splash from disappearing before the font result (or its
// fallback timeout) is known. This must run at module load, not after a first
// render has already happened.
void SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function BrandedBootScreen({
  error,
  onRetry,
  retryLabel = "Retry secure startup",
}: {
  error?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
        backgroundColor: "#F4FBFC",
      }}
      accessibilityLiveRegion="polite"
    >
      <Text accessibilityRole="header" style={{ color: "#0B6DBD", fontSize: 38, fontWeight: "800", letterSpacing: 2 }}>
        CARNET
      </Text>
      <Text style={{ color: "#2C7A8A", fontSize: 14, fontWeight: "600", letterSpacing: 2, marginTop: 4 }}>
        by NaviMED
      </Text>
      {error ? (
        <>
          <Text accessibilityRole="alert" style={{ color: "#8A1C1C", fontSize: 15, lineHeight: 22, marginTop: 28, maxWidth: 360, textAlign: "center" }}>
            {error}
          </Text>
          {onRetry ? (
            <Pressable
              testID="button-retry-startup"
              accessibilityRole="button"
              accessibilityLabel={retryLabel}
              onPress={onRetry}
              style={{ backgroundColor: "#0B6DBD", borderRadius: 12, marginTop: 22, minHeight: 48, paddingHorizontal: 22, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>{retryLabel}</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <ActivityIndicator accessibilityLabel="Loading" color="#0B6DBD" size="small" style={{ marginTop: 28 }} />
          <Text style={{ color: "#49636B", fontSize: 14, marginTop: 12 }}>Preparing a secure session…</Text>
        </>
      )}
    </View>
  );
}

function RootLayoutNav() {
  const {
    isAuthenticated,
    isBootstrapping,
    logout,
    sessionError,
    startupError,
    retryStartup,
  } = useAuth();
  const { adapter, error: ehrError } = useEHR();
  const pathname = usePathname();
  const startupFailure = startupError || (isBootstrapping ? ehrError : null);
  const showStartupOverlay = isBootstrapping || Boolean(startupFailure);
  const showBlockingOverlay = Boolean(sessionError || showStartupOverlay);

  useEffect(() => {
    if (isBootstrapping || sessionError) return;
    // Only redirect into protected content after a verified session. In
    // particular, never replace /login after a failed sign-in: the mounted
    // form owns the error message and remains available for another attempt.
    if (isAuthenticated && (pathname === "/" || pathname === "/login")) {
      try {
        router.replace("/(tabs)");
      } catch {}
    }
  }, [isAuthenticated, isBootstrapping, pathname, sessionError]);

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={showBlockingOverlay}
        importantForAccessibility={showBlockingOverlay ? "no-hide-descendants" : "auto"}
        aria-hidden={showBlockingOverlay}
      >
        <SessionSecurity
          authenticated={isAuthenticated}
          sessionKey={adapter?.sessionKey ?? null}
          onLogout={() => { void logout().catch(() => {}); }}
        >
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={!isAuthenticated}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
            </Stack.Protected>
            <Stack.Protected guard={isAuthenticated}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="appointments" options={{ headerShown: false }} />
              <Stack.Screen name="prescriptions" options={{ headerShown: false }} />
              <Stack.Screen name="lab-results" options={{ headerShown: false }} />
              <Stack.Screen name="messages" options={{ headerShown: false }} />
              <Stack.Screen name="bills" options={{ headerShown: false }} />
              <Stack.Screen name="visit-summaries" options={{ headerShown: false }} />
              <Stack.Screen name="request-appointment" options={{ headerShown: false }} />
              <Stack.Screen name="emergency-card" options={{ headerShown: false }} />
              <Stack.Screen name="health-timeline" options={{ headerShown: false }} />
              <Stack.Screen name="symptom-checker" options={{ headerShown: false }} />
              <Stack.Screen name="documents" options={{ headerShown: false }} />
              <Stack.Screen name="family" options={{ headerShown: false }} />
              <Stack.Screen name="interactions" options={{ headerShown: false }} />
              <Stack.Screen name="export-records" options={{ headerShown: false }} />
              <Stack.Screen name="health-metrics" options={{ headerShown: false }} />
              <Stack.Screen name="telehealth" options={{ headerShown: false }} />
              <Stack.Screen name="security-privacy" options={{ headerShown: false }} />
            </Stack.Protected>
          </Stack>
        </SessionSecurity>
      </View>
      {sessionError ? (
        <View style={{ ...StyleSheet.absoluteFillObject }}>
          <BrandedBootScreen
            error={sessionError}
            retryLabel="Retry secure cleanup"
            onRetry={() => { void logout().catch(() => {}); }}
          />
        </View>
      ) : showStartupOverlay ? (
        <View style={{ ...StyleSheet.absoluteFillObject }}>
          <BrandedBootScreen
            error={startupFailure}
            onRetry={() => { void retryStartup().catch(() => {}); }}
          />
        </View>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [fontTimedOut, setFontTimedOut] = useState(false);

  const i18n = useI18nProvider();

  useEffect(() => {
    const timer = setTimeout(() => setFontTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError || fontTimedOut) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError, fontTimedOut]);

  if (!fontsLoaded && !fontError && !fontTimedOut) {
    return <BrandedBootScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <I18nContext.Provider value={i18n}>
            <ThemeProvider>
              <QueryClientProvider client={queryClient}>
                <EHRProvider>
                  <AuthProvider>
                    <AccessibilityRoot>
                      <RootLayoutNav />
                    </AccessibilityRoot>
                  </AuthProvider>
                </EHRProvider>
              </QueryClientProvider>
            </ThemeProvider>
          </I18nContext.Provider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AccessibilityRoot } from "@/components/AccessibilityRoot";
import { Pressable } from "@/components/AccessiblePressable";
import { SessionSecurity } from "@/components/SessionSecurity";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { EHRProvider, useEHR } from "@/context/EHRContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { I18nContext, useI18nProvider } from "@/lib/i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function RootLayoutNav() {
  const { isAuthenticated, isLoading, logout, sessionError } = useAuth();
  const { adapter } = useEHR();
  const { colors } = useTheme();

  useEffect(() => {
    if (!isLoading) {
      try {
        if (isAuthenticated) {
          router.replace("/(tabs)");
        } else {
          router.replace("/");
        }
      } catch {}
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) return null;
  if (sessionError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background }}>
        <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 16, textAlign: "center" }}>{sessionError}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => { void logout().catch(() => {}); }}
          style={{ backgroundColor: colors.danger, borderRadius: 8, marginTop: 20, padding: 12 }}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>Retry secure cleanup</Text>
        </Pressable>
      </View>
    );
  }

  return (
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
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const i18n = useI18nProvider();

  useEffect(() => {
    SplashScreen.preventAutoHideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

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

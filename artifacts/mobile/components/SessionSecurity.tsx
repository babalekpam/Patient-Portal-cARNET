import * as ScreenCapture from "expo-screen-capture";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import { AccessiblePressable as Pressable } from "@/components/AccessiblePressable";
import { AccessibilityVisibilityProvider } from "@/lib/AccessibilityVisibilityContext";
import { assertSession, recordSessionActivity } from "@/lib/session";

export function SessionSecurity({
  authenticated,
  sessionKey,
  onLogout,
  children,
}: {
  authenticated: boolean;
  sessionKey: string | null;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [concealed, setConcealed] = useState(
    authenticated && Platform.OS !== "web" && AppState.currentState !== "active",
  );
  const [captureBlocked, setCaptureBlocked] = useState(true);
  const [captureAttempt, setCaptureAttempt] = useState(0);
  const protectedContentRef = useRef<View>(null);
  const viewingBlocked = authenticated && Platform.OS !== "web" && captureBlocked;
  const privacyConcealed = authenticated && concealed;
  const isVisible = !privacyConcealed && !viewingBlocked;

  useLayoutEffect(() => {
    if (Platform.OS !== "web" || typeof HTMLElement === "undefined") return;
    const protectedContent: unknown = protectedContentRef.current;
    if (protectedContent instanceof HTMLElement) {
      protectedContent.inert = !isVisible;
    }
  }, [isVisible]);

  useEffect(() => {
    if (!authenticated || Platform.OS === "web") return;
    let mounted = true;
    setCaptureBlocked(true);
    ScreenCapture.preventScreenCaptureAsync("authenticated-session")
      .then(() => { if (mounted) setCaptureBlocked(false); })
      .catch(() => { if (mounted) setCaptureBlocked(true); });
    return () => {
      mounted = false;
    };
  }, [authenticated, captureAttempt]);

  useEffect(() => {
    if (!authenticated || Platform.OS === "web") return;
    return () => {
      ScreenCapture.allowScreenCaptureAsync("authenticated-session").catch(() => {});
    };
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) {
      setConcealed(false);
      return;
    }
    if (Platform.OS !== "web") setConcealed(AppState.currentState !== "active");
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        try {
          assertSession(sessionKey);
          recordSessionActivity();
          setConcealed(false);
        } catch {
          setConcealed(true);
        }
      } else if (Platform.OS !== "web") {
        setConcealed(true);
      }
    });
    return () => subscription.remove();
  }, [authenticated, sessionKey]);

  useEffect(() => {
    if (!authenticated || Platform.OS !== "web" || typeof document === "undefined") return;
    // Browsers cannot prevent OS/browser screenshots. These events only enforce inactivity.
    const events = ["pointerdown", "touchstart", "mousemove"] as const;
    const activity = () => recordSessionActivity();
    events.forEach((event) => document.addEventListener(event, activity, { passive: true }));
    document.addEventListener("keydown", activity, true);
    return () => {
      events.forEach((event) => document.removeEventListener(event, activity));
      document.removeEventListener("keydown", activity, true);
    };
  }, [authenticated]);

  return (
    <AccessibilityVisibilityProvider value={isVisible}>
      <View style={styles.root} onTouchStart={authenticated ? () => recordSessionActivity() : undefined}>
        <View
          ref={protectedContentRef}
          style={styles.protectedContent}
          aria-hidden={!isVisible}
          accessibilityElementsHidden={!isVisible}
          importantForAccessibility={isVisible ? "auto" : "no-hide-descendants"}
        >
          {children}
        </View>
        {authenticated && Platform.OS === "web" ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Browser security cannot prevent screenshots. Protect your device and close this session when finished.
            </Text>
          </View>
        ) : null}
        {viewingBlocked ? (
          <View style={styles.captureFailure}>
            <Text style={styles.failureText}>
              Protected viewing is unavailable because screen capture could not be disabled.
            </Text>
            <Pressable style={styles.button} onPress={() => setCaptureAttempt((value) => value + 1)}>
              <Text style={styles.buttonText}>Retry protection</Text>
            </Pressable>
            <Pressable style={styles.logoutButton} onPress={onLogout}>
              <Text style={styles.logoutText}>Sign out</Text>
            </Pressable>
          </View>
        ) : null}
        {privacyConcealed ? <View style={styles.curtain} /> : null}
      </View>
    </AccessibilityVisibilityProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  protectedContent: { flex: 1 },
  curtain: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
    zIndex: 99999,
  },
  notice: { backgroundColor: "#fff4cc", paddingHorizontal: 12, paddingVertical: 6 },
  noticeText: { color: "#5c4600", fontSize: 12, textAlign: "center" },
  captureFailure: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "#ffffff",
    justifyContent: "center",
    padding: 24,
    zIndex: 99998,
  },
  failureText: { color: "#7f1d1d", fontSize: 16, textAlign: "center" },
  button: { backgroundColor: "#7f1d1d", borderRadius: 8, marginTop: 20, padding: 12 },
  buttonText: { color: "#fff", fontWeight: "600" },
  logoutButton: { marginTop: 10, padding: 12 },
  logoutText: { color: "#7f1d1d", fontWeight: "600" },
});
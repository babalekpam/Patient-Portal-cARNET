import React, { useCallback, useEffect, useRef } from "react";
import { Modal as RNModal, ModalProps, Platform, View, StyleSheet } from "react-native";
import { useAccessibilityVisibility } from "@/lib/AccessibilityVisibilityContext";

type AccessibleModalProps = Omit<ModalProps, "onRequestClose"> & {
  /** Identifies the dialog without exposing its contents in global announcements. */
  accessibilityLabel: string;
  onRequestClose: NonNullable<ModalProps["onRequestClose"]>;
};

/**
 * RN Web's outer ModalContent owns the dialog role, Escape keyup handling,
 * focus activation/trapping and focus restoration.
 */
export function AccessibleModal({
  accessibilityLabel,
  visible,
  children,
  onRequestClose,
  onDismiss,
  ...props
}: AccessibleModalProps) {
  const isContentVisible = useAccessibilityVisibility();
  const effectiveVisible = visible !== false && isContentVisible;
  const wasVisibleRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const restoreFrameRef = useRef<number | null>(null);

  // Capture during the transition render, before RNW's modal effects move focus.
  if (
    Platform.OS === "web" &&
    typeof document !== "undefined" &&
    effectiveVisible &&
    !wasVisibleRef.current
  ) {
    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }
  wasVisibleRef.current = effectiveVisible;

  const restoreFocusIfNeeded = useCallback(() => {
    if (Platform.OS !== "web") return;
    if (restoreFrameRef.current != null) {
      window.cancelAnimationFrame(restoreFrameRef.current);
    }
    restoreFrameRef.current = window.requestAnimationFrame(() => {
      restoreFrameRef.current = null;
      const active = document.activeElement;
      const focusWasLost = active == null ||
        active === document.body ||
        active === document.documentElement ||
        !document.contains(active);
      const opener = openerRef.current;
      if (
        focusWasLost &&
        opener?.isConnected &&
        !opener.hasAttribute("disabled") &&
        opener.getAttribute("aria-disabled") !== "true"
      ) {
        opener.focus({ preventScroll: true });
      }
      openerRef.current = null;
    });
  }, []);

  useEffect(() => () => {
    if (Platform.OS === "web" && restoreFrameRef.current != null) {
      window.cancelAnimationFrame(restoreFrameRef.current);
      restoreFrameRef.current = null;
    }
    // RNW's ModalFocusTrap cleanup normally restores focus on unmount.
    // Only intervene synchronously if focus is already lost.
    const active = Platform.OS === "web" ? document.activeElement : null;
    const opener = openerRef.current;
    if (
      Platform.OS === "web" &&
      (active == null || active === document.body || active === document.documentElement) &&
      opener?.isConnected &&
      !opener.hasAttribute("disabled") &&
      opener.getAttribute("aria-disabled") !== "true"
    ) {
      opener.focus({ preventScroll: true });
    }
  }, []);

  const handleDismiss = useCallback(() => {
    onDismiss?.();
    // Runs after ModalAnimation removes the trap, giving RNW restoration first.
    restoreFocusIfNeeded();
  }, [onDismiss, restoreFocusIfNeeded]);

  return (
    <RNModal
      {...props}
      visible={effectiveVisible}
      onRequestClose={onRequestClose}
      onDismiss={handleDismiss}
      accessibilityLabel={accessibilityLabel}
      accessibilityViewIsModal
    >
      <View
        accessible={false}
        aria-hidden={!isContentVisible}
        accessibilityElementsHidden={!isContentVisible}
        importantForAccessibility={isContentVisible ? "auto" : "no-hide-descendants"}
        style={styles.dialog}
      >
        {/* iOS can retain a dismissed modal during its animation. Redact now,
            rather than waiting for the native window to finish dismissing. */}
        {isContentVisible ? children : null}
      </View>
    </RNModal>
  );
}

export const Modal = AccessibleModal;

const styles = StyleSheet.create({
  dialog: {
    flex: 1,
  },
});
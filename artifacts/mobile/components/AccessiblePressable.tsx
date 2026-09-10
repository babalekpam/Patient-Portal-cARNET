import React, { forwardRef, useCallback, useEffect, useRef } from "react";
import { Platform, Pressable as RNPressable, PressableProps, StyleSheet } from "react-native";
import {
  getWebAccessibilityState,
  shouldHandleSpaceActivation,
} from "@/lib/pressableAccessibility";

/**
 * The common interactive control.  RN Web already maps Enter and Space to
 * onPress, so this deliberately does not add keyboard handlers (which would
 * invoke actions twice).
 */
export const AccessiblePressable = forwardRef<React.ElementRef<typeof RNPressable>, PressableProps>(
  ({ accessibilityRole, accessible, focusable, disabled, style, ...props }, forwardedRef) => {
    const elementRef = useRef<React.ElementRef<typeof RNPressable> | null>(null);
    const spaceArmed = useRef(false);
    const role = accessibilityRole ?? (accessible === false ? undefined : "button");
    const effectiveDisabled = disabled ?? props.accessibilityState?.disabled ?? false;

    const setRef = useCallback((node: React.ElementRef<typeof RNPressable> | null) => {
      elementRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    }, [forwardedRef]);

    useEffect(() => {
      if (Platform.OS !== "web" || accessible === false) return;
      const element = elementRef.current as unknown as HTMLElement | null;
      if (!element) return;
      const onKeyDown = (event: KeyboardEvent) => {
        if ((event.key === " " || event.key === "Spacebar") &&
            shouldHandleSpaceActivation(role, effectiveDisabled, false)) {
          event.preventDefault();
          if (!event.repeat) spaceArmed.current = true;
        }
      };
      const onKeyUp = (event: KeyboardEvent) => {
        if ((event.key === " " || event.key === "Spacebar") && spaceArmed.current) {
          event.preventDefault();
          spaceArmed.current = false;
          props.onPress?.(event as unknown as Parameters<NonNullable<PressableProps["onPress"]>>[0]);
        }
      };
      const onBlur = () => { spaceArmed.current = false; };
      element.addEventListener("keydown", onKeyDown);
      element.addEventListener("keyup", onKeyUp);
      element.addEventListener("blur", onBlur);
      return () => {
        element.removeEventListener("keydown", onKeyDown);
        element.removeEventListener("keyup", onKeyUp);
        element.removeEventListener("blur", onBlur);
      };
    }, [accessible, effectiveDisabled, props.onPress, role]);

    const webState = Platform.OS === "web"
      ? getWebAccessibilityState({ ...props.accessibilityState, disabled: effectiveDisabled })
      : {};

    return (
      <RNPressable
        ref={setRef}
        {...props}
        {...(webState as any)}
        accessible={accessible}
        focusable={focusable ?? (accessible !== false)}
        disabled={effectiveDisabled}
        accessibilityRole={role}
        accessibilityState={{
          ...props.accessibilityState,
          disabled: effectiveDisabled,
        }}
        style={(state) => [
          accessible === false ? undefined : styles.minimumTarget,
          typeof style === "function" ? style(state) : style,
        ]}
      />
    );
  }
);

AccessiblePressable.displayName = "AccessiblePressable";

/** Alias used by screens as a drop-in replacement for React Native Pressable. */
export const Pressable = AccessiblePressable;

const styles = StyleSheet.create({
  minimumTarget: {
    minWidth: 44,
    minHeight: 44,
  },
});
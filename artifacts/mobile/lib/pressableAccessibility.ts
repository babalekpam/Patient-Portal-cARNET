import type { AccessibilityRole, AccessibilityState } from "react-native";

const SPACE_ACTIVATION_ROLES: ReadonlySet<AccessibilityRole> = new Set([
  "checkbox",
  "menuitem",
  "radio",
  "switch",
  "tab",
]);

export function shouldHandleSpaceActivation(
  role: AccessibilityRole | undefined,
  disabled: boolean,
  repeat: boolean
): boolean {
  return !disabled && !repeat && role != null && SPACE_ACTIVATION_ROLES.has(role);
}

export function getWebAccessibilityState(state: AccessibilityState | undefined) {
  if (!state) return {};
  return {
    "aria-busy": state.busy,
    "aria-checked": state.checked,
    "aria-disabled": state.disabled,
    "aria-expanded": state.expanded,
    "aria-selected": state.selected,
  };
}
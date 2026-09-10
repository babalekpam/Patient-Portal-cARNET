import { createContext, useContext } from "react";

const AccessibilityVisibilityContext = createContext(true);

export const AccessibilityVisibilityProvider =
  AccessibilityVisibilityContext.Provider;

export function useAccessibilityVisibility(): boolean {
  return useContext(AccessibilityVisibilityContext);
}
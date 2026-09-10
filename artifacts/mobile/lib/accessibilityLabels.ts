import { useI18n } from "./i18n";
import { accessibilityCopy, type AccessibilityLabels } from "./accessibilityCopy";

export function useAccessibilityLabels(): AccessibilityLabels {
  return accessibilityCopy[useI18n().language];
}
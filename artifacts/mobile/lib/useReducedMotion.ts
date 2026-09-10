import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Remain still until the OS preference is known; never flash an entrance first. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      changed = true;
      if (mounted) setReduced(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted && !changed) setReduced(value);
    }).catch(() => {
      // Keeping motion off is the accessible safe state when OS detection fails.
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
/**
 * Features that are still under production-readiness review must remain
 * available to development workspaces, but be unavailable in a release
 * binary. The native Expo `__DEV__` constant is compile-time replaced, so a
 * release build cannot be enabled by device storage or an arbitrary flag.
 */
export function isProductionBuild(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    (typeof __DEV__ !== "undefined" && __DEV__ === false)
  );
}

export function restrictedProductionFeaturesEnabled(): boolean {
  return !isProductionBuild();
}

export const PRODUCTION_FEATURE_UNAVAILABLE_MESSAGE =
  "This feature is unavailable in the production release candidate.";

export function assertRestrictedProductionFeatureEnabled(
  feature: "laboratory-messages" | "insurance-history",
): void {
  if (!restrictedProductionFeaturesEnabled()) {
    throw new Error(
      `${feature === "laboratory-messages" ? "Laboratory messaging" : "Insurance history"} is disabled in production.`,
    );
  }
}
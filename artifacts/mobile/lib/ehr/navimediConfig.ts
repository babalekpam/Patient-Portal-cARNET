import { Platform } from "react-native";

export const NAVIMEDI_API_BASE_URL = "https://www.navimedi.org/api";
export const NAVIMEDI_EXPECTED_ISSUER_HEADER = "X-CARNET-Expected-Issuer";

const API_PATH = "/api";

function isDevelopmentBuild(): boolean {
  return (
    !isProductionBuild() &&
    (process.env.NODE_ENV === "development" ||
      (typeof __DEV__ !== "undefined" && __DEV__ === true))
  );
}

function isProductionBuild(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    (typeof __DEV__ !== "undefined" && __DEV__ === false)
  );
}

function normalizeApiBaseUrl(
  value: string,
): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      "The NaviMED API override must be a valid HTTPS URL ending in /api.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/+$/, "") !== API_PATH
  ) {
    throw new Error(
      "The NaviMED API override must be a valid HTTPS URL ending in /api.",
    );
  }
  return `${url.origin}${API_PATH}`;
}

function normalizeRelayUpstream(value: string): string {
  const normalized = normalizeApiBaseUrl(value);
  const hostname = new URL(normalized).hostname;
  if (
    normalized !== NAVIMEDI_API_BASE_URL &&
    !hostname.endsWith(".picard.replit.dev")
  ) {
    throw new Error(
      "The NaviMED relay override is not an allowlisted development upstream.",
    );
  }
  return normalized;
}

/**
 * The native client keeps the production endpoint as its default. A temporary
 * backend is accepted only in a development build and only through the
 * explicitly named public Expo variable. Production builds keep the fixed
 * production endpoint if the development override was accidentally supplied.
 */
export function getNavimediNativeApiBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_CARNET_NAVIMEDI_NATIVE_API_BASE_URL?.trim();
  if (!override) return NAVIMEDI_API_BASE_URL;
  if (!isDevelopmentBuild()) {
    // Workspace development variables can be present in a release build
    // environment. Ignore them rather than allowing a startup crash or
    // shipping traffic to a temporary upstream.
    return NAVIMEDI_API_BASE_URL;
  }
  return normalizeApiBaseUrl(override);
}

/**
 * The web client never chooses where the relay sends a request. This value is
 * only an expected issuer identity, and it is constrained to the development
 * relay hostname policy used by the server-side relay configuration.
 */
export function getNavimediWebRelayUpstreamBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_CARNET_NAVIMEDI_RELAY_UPSTREAM_URL?.trim();
  if (!override) return NAVIMEDI_API_BASE_URL;
  if (!isDevelopmentBuild()) {
    // See the native override above: an accidentally exported development
    // variable must never redirect release traffic or prevent startup.
    return NAVIMEDI_API_BASE_URL;
  }
  return normalizeRelayUpstream(override);
}

export function resolveNavimediSessionBaseUrl(configuredBaseUrl: string): string {
  if (Platform.OS === "web") return getNavimediWebRelayUpstreamBaseUrl();
  return resolveNavimediNativeBaseUrl(configuredBaseUrl);
}

export function isNavimediNativeApiOverrideActive(): boolean {
  return (
    Platform.OS !== "web" &&
    getNavimediNativeApiBaseUrl() !== NAVIMEDI_API_BASE_URL
  );
}

export function resolveNavimediNativeBaseUrl(
  configuredBaseUrl: string,
): string {
  if (Platform.OS === "web" || configuredBaseUrl !== NAVIMEDI_API_BASE_URL) {
    return configuredBaseUrl;
  }
  return getNavimediNativeApiBaseUrl();
}
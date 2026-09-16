import { Platform } from "react-native";

export const NAVIMEDI_API_BASE_URL = "https://www.navimedi.org/api";
export const NAVIMEDI_NATIVE_API_ENV_KEY =
  "EXPO_PUBLIC_CARNET_NAVIMEDI_NATIVE_API_BASE_URL";
export const NAVIMEDI_RELAY_UPSTREAM_ENV_KEY =
  "EXPO_PUBLIC_CARNET_NAVIMEDI_RELAY_UPSTREAM_URL";
export const NAVIMEDI_EXPECTED_ISSUER_HEADER = "X-CARNET-Expected-Issuer";
export const TEMPORARY_HANDOFF_RELAY_UPSTREAM =
  "https://942dd837-7012-47ef-8574-574ac5ab89f8-00-2gel21gszwmqv.picard.replit.dev/api";

const API_PATH = "/api";
const ALLOWED_RELAY_UPSTREAMS = new Set([
  NAVIMEDI_API_BASE_URL,
  TEMPORARY_HANDOFF_RELAY_UPSTREAM,
]);

function isDevelopmentBuild(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    (typeof __DEV__ !== "undefined" && __DEV__ === true)
  );
}

function normalizeApiBaseUrl(
  value: string,
  errorKey = NAVIMEDI_NATIVE_API_ENV_KEY,
): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      `${errorKey} must be a valid HTTPS URL ending in /api.`,
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
      `${errorKey} must be a valid HTTPS URL ending in /api.`,
    );
  }
  return `${url.origin}${API_PATH}`;
}

function normalizeRelayUpstream(value: string): string {
  const normalized = normalizeApiBaseUrl(value, NAVIMEDI_RELAY_UPSTREAM_ENV_KEY);
  if (!ALLOWED_RELAY_UPSTREAMS.has(normalized)) {
    throw new Error(
      `${NAVIMEDI_RELAY_UPSTREAM_ENV_KEY} is not an allowlisted NaviMED upstream.`,
    );
  }
  return normalized;
}

/**
 * The native client keeps the production endpoint as its default. A temporary
 * backend is accepted only in a development build and only through the
 * explicitly named public Expo variable. Production builds fail closed if the
 * development override was accidentally supplied.
 */
export function getNavimediNativeApiBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_CARNET_NAVIMEDI_NATIVE_API_BASE_URL?.trim();
  if (!override) return NAVIMEDI_API_BASE_URL;
  if (!isDevelopmentBuild()) {
    throw new Error(
      `${NAVIMEDI_NATIVE_API_ENV_KEY} is development-only and cannot be used in a production build.`,
    );
  }
  return normalizeApiBaseUrl(override);
}

/**
 * The web client never chooses where the relay sends a request. This value is
 * only an expected issuer identity, and it is constrained to the same fixed
 * upstream allowlist as the server-side relay policy.
 */
export function getNavimediWebRelayUpstreamBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_CARNET_NAVIMEDI_RELAY_UPSTREAM_URL?.trim();
  if (!override) return NAVIMEDI_API_BASE_URL;
  if (!isDevelopmentBuild()) {
    throw new Error(
      `${NAVIMEDI_RELAY_UPSTREAM_ENV_KEY} is development-only and cannot be used in a production build.`,
    );
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
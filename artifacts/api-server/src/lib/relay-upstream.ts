import {
  NAVIMEDI_API_PREFIX,
  NAVIMEDI_ORIGIN,
} from "./relay-policy";

export const RELAY_UPSTREAM_ENV_KEY = "CARNET_NAVIMEDI_RELAY_UPSTREAM_URL";
export const RELAY_EXPECTED_ISSUER_HEADER = "X-CARNET-Expected-Issuer";
export const TEMPORARY_HANDOFF_RELAY_UPSTREAM =
  "https://942dd837-7012-47ef-8574-574ac5ab89f8-00-2gel21gszwmqv.picard.replit.dev/api";
export const NAVIMEDI_RELAY_UPSTREAM =
  `${NAVIMEDI_ORIGIN}${NAVIMEDI_API_PREFIX}`;

const ALLOWED_RELAY_UPSTREAMS = new Set([
  NAVIMEDI_RELAY_UPSTREAM,
  TEMPORARY_HANDOFF_RELAY_UPSTREAM,
]);

function normalizeRelayUpstream(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      `${RELAY_UPSTREAM_ENV_KEY} must be one of the fixed HTTPS /api upstreams.`,
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/+$/, "") !== NAVIMEDI_API_PREFIX
  ) {
    throw new Error(
      `${RELAY_UPSTREAM_ENV_KEY} must be one of the fixed HTTPS /api upstreams.`,
    );
  }
  return `${url.origin}${NAVIMEDI_API_PREFIX}`;
}

/**
 * Keep the production upstream fixed by default. A temporary test upstream is
 * accepted only in development and only when it is explicitly allowlisted.
 * This function accepts an environment object to make the security boundary
 * directly unit-testable without changing process state.
 */
export function resolveRelayUpstreamBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env[RELAY_UPSTREAM_ENV_KEY]?.trim();
  if (!override) return NAVIMEDI_RELAY_UPSTREAM;
  if (env.NODE_ENV !== "development") {
    throw new Error(
      `${RELAY_UPSTREAM_ENV_KEY} is development-only and cannot be used outside development.`,
    );
  }
  const normalized = normalizeRelayUpstream(override);
  if (!ALLOWED_RELAY_UPSTREAMS.has(normalized)) {
    throw new Error(
      `${RELAY_UPSTREAM_ENV_KEY} is not an allowlisted NaviMED upstream.`,
    );
  }
  return normalized;
}

export function getRelayUpstreamBaseUrl(): string {
  return resolveRelayUpstreamBaseUrl();
}
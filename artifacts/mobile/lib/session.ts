import { deleteSecureItem, getSecureItem, setSecureItem } from "@/lib/secureStorage";
import {
  cappedExpiry,
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
  sessionValidity,
  isStaleGeneration,
  type SessionRecord,
} from "@/lib/sessionCore";
export { SESSION_IDLE_MS, SESSION_MAX_MS } from "@/lib/sessionCore";
const SESSION_KEY = "carnet_session_metadata";

export type SessionEndReason =
  | "expired"
  | "inactive"
  | "unauthorized"
  | "provider_changed"
  | "invalid"
  | "logout";

export interface SessionMetadata extends SessionRecord {}

export class StaleSessionRequestError extends Error {
  constructor() {
    super("This request belongs to an ended session.");
    this.name = "StaleSessionRequestError";
  }
}

let current: SessionMetadata | null = null;
let generation = 0;
let endNotified = false;
let lastActivityPersistence = 0;
const endListeners = new Set<(reason: SessionEndReason) => void>();

function validMetadata(value: unknown): value is SessionMetadata {
  if (!value || typeof value !== "object") return false;
  const m = value as SessionMetadata;
  return sessionValidity(m, m.sessionKey, m.issuedAt) === "valid";
}

export function getServerExpiry(response: unknown, now = Date.now()): number | null {
  if (!response || typeof response !== "object") return null;
  const value = response as Record<string, unknown>;
  const hasLifetime = "expires_in" in value || "expiresIn" in value;
  const seconds = value.expires_in ?? value.expiresIn;
  if (hasLifetime) {
    return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
      ? now + seconds * 1000
      : now;
  }
  const hasAbsolute = "expires_at" in value || "expiresAt" in value;
  const absolute = value.expires_at ?? value.expiresAt;
  if (typeof absolute === "number" && Number.isFinite(absolute)) {
    return absolute < 10_000_000_000 ? absolute * 1000 : absolute;
  }
  if (typeof absolute === "string") {
    const parsed = Date.parse(absolute);
    return Number.isFinite(parsed) ? parsed : now;
  }
  if (hasAbsolute) return now;
  return null;
}

export async function createSession(
  sessionKey: string | null,
  serverExpiry?: number | null,
  now = Date.now(),
): Promise<SessionMetadata> {
  const startedGeneration = generation;
  const expiry = cappedExpiry(now, serverExpiry);
  const metadata: SessionMetadata = {
    version: 2,
    issuedAt: now,
    expiresAt: expiry,
    lastActivityAt: now,
    sessionKey,
  };
  await setSecureItem(SESSION_KEY, JSON.stringify(metadata));
  if (generation !== startedGeneration) {
    throw new StaleSessionRequestError();
  }
  current = metadata;
  endNotified = false;
  lastActivityPersistence = now;
  generation += 1;
  return metadata;
}

export async function restoreSession(
  expectedSessionKey: string | null,
  now = Date.now(),
): Promise<SessionMetadata | null> {
  const startedGeneration = generation;
  const encoded = await getSecureItem(SESSION_KEY);
  if (generation !== startedGeneration) throw new StaleSessionRequestError();
  if (!encoded) return null;
  try {
    const metadata: unknown = JSON.parse(encoded);
    if (
      !validMetadata(metadata) ||
      sessionValidity(metadata, expectedSessionKey, now) !== "valid"
    ) {
      await clearSessionMetadata();
      return null;
    }
    current = metadata;
    endNotified = false;
    lastActivityPersistence = now;
    generation += 1;
    return metadata;
  } catch {
    await clearSessionMetadata();
    return null;
  }
}

export async function clearSessionMetadata(): Promise<void> {
  current = null;
  generation += 1;
  await deleteSecureItem(SESSION_KEY);
}

/**
 * Ends the in-memory session synchronously without touching secure storage.
 * Logout uses this before remote revocation so late requests become stale
 * immediately, while a replacement session can safely write its own metadata
 * before the old session's best-effort cleanup runs.
 */
export function invalidateSessionBoundary(): void {
  current = null;
  generation += 1;
}

export function sessionGeneration(): number {
  return generation;
}

export function assertSession(sessionKey: string | null, expectedGeneration?: number): number {
  if (expectedGeneration !== undefined && isStaleGeneration(expectedGeneration, generation)) {
    // A response from an older session must not affect the current session.
    throw new StaleSessionRequestError();
  }
  const now = Date.now();
  const reason =
    !current || current.sessionKey !== sessionKey
      ? "invalid"
      : now >= current.expiresAt
        ? "expired"
        : now - current.lastActivityAt >= SESSION_IDLE_MS
          ? "inactive"
          : null;
  if (reason) {
    notifySessionEnd(reason);
    throw new Error("Session expired. Please log in again.");
  }
  return generation;
}

export function recordSessionActivity(now = Date.now()): void {
  if (!current || now <= current.lastActivityAt) return;
  if (now >= current.expiresAt || now - current.lastActivityAt >= SESSION_IDLE_MS) {
    notifySessionEnd(now >= current.expiresAt ? "expired" : "inactive");
    return;
  }
  current = { ...current, lastActivityAt: now };
  // Avoid storage churn from high-frequency pointer events.
  if (now - lastActivityPersistence >= 15_000) {
    lastActivityPersistence = now;
    setSecureItem(SESSION_KEY, JSON.stringify(current)).catch(() => {});
  }
}

export function notifySessionEnd(reason: SessionEndReason): void {
  current = null;
  generation += 1;
  if (endNotified) return;
  endNotified = true;
  for (const listener of [...endListeners]) listener(reason);
}

export function subscribeToSessionEnd(listener: (reason: SessionEndReason) => void): () => void {
  endListeners.add(listener);
  return () => endListeners.delete(listener);
}

export function hasCurrentSession(): boolean {
  return current !== null;
}
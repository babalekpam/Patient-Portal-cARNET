export const SESSION_MAX_MS = 15 * 60 * 1000;
export const SESSION_IDLE_MS = 5 * 60 * 1000;

export interface SessionRecord {
  version: 2;
  issuedAt: number;
  expiresAt: number;
  lastActivityAt: number;
  sessionKey: string | null;
}

export type SessionValidity = "valid" | "invalid" | "expired" | "inactive";

export function isStaleGeneration(requestGeneration: number, currentGeneration: number): boolean {
  return requestGeneration !== currentGeneration;
}

export function cappedExpiry(now: number, serverExpiry?: number | null): number {
  if (serverExpiry !== undefined && serverExpiry !== null && Number.isFinite(serverExpiry)) {
    return Math.min(now + SESSION_MAX_MS, Math.max(now, serverExpiry));
  }
  return now + SESSION_MAX_MS;
}

export function sessionValidity(
  record: SessionRecord,
  sessionKey: string | null,
  now: number,
): SessionValidity {
  if (
    record.version !== 2 ||
    !Number.isFinite(record.issuedAt) ||
    !Number.isFinite(record.expiresAt) ||
    !Number.isFinite(record.lastActivityAt) ||
    (record.sessionKey !== null && typeof record.sessionKey !== "string") ||
    record.sessionKey !== sessionKey ||
    record.issuedAt > record.lastActivityAt ||
    record.lastActivityAt > record.expiresAt ||
    record.expiresAt > record.issuedAt + SESSION_MAX_MS
  ) return "invalid";
  if (now >= record.expiresAt) return "expired";
  if (now - record.lastActivityAt >= SESSION_IDLE_MS) return "inactive";
  return "valid";
}
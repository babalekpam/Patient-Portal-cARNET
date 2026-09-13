import { withTimeout } from "@/lib/async";

export type OptionalPushSyncResult = "unavailable" | "stored" | "storage-failed";

/**
 * Push registration is an optional enhancement. Permission prompts and native
 * notification APIs must never terminate an otherwise valid patient session.
 * Secure token read/write failures are kept distinct so the auth layer can
 * fail closed for those failures only.
 */
export async function syncOptionalPushToken(
  register: () => Promise<string | null>,
  read: () => Promise<string | null>,
  write: (token: string) => Promise<void>,
  registrationTimeoutMs: number,
  storageTimeoutMs: number,
): Promise<OptionalPushSyncResult> {
  let token: string | null;
  try {
    token = await withTimeout(register(), registrationTimeoutMs, "Optional notification registration");
  } catch {
    return "unavailable";
  }
  if (!token) return "unavailable";

  try {
    const previous = await withTimeout(read(), storageTimeoutMs, "Optional notification token loading");
    if (previous !== token) {
      await withTimeout(write(token), storageTimeoutMs, "Optional notification token storage");
    }
    return "stored";
  } catch {
    return "storage-failed";
  }
}
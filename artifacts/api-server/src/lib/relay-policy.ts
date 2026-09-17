export const NAVIMEDI_ORIGIN = "https://www.navimedi.org";
export const NAVIMEDI_API_PREFIX = "/api";
export const NAVIMEDI_RELAY_PREFIX = "/api/navimedi";
export const MAX_RELAY_BODY_BYTES = 64 * 1024;
export const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;
export const UPSTREAM_TIMEOUT_MS = 10_000;

export type RelayRoute = {
  category: string;
  protected: boolean;
  validateBody: (value: unknown) => boolean;
};

const noBody = (value: unknown): boolean => value === undefined;
const emptyBody = (value: unknown): boolean =>
  value === undefined ||
  (isRecord(value) && Object.keys(value).length === 0);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function stringField(
  value: Record<string, unknown>,
  key: string,
  max: number,
  required = false,
): boolean {
  const field = value[key];
  if (field === undefined) return !required;
  return typeof field === "string" && field.length > 0 && field.length <= max;
}

function numberField(
  value: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): boolean {
  const field = value[key];
  return (
    field === undefined ||
    (typeof field === "number" &&
      Number.isFinite(field) &&
      field >= min &&
      field <= max)
  );
}

function patientLoginBody(value: unknown): boolean {
  if (!isRecord(value) || !hasOnly(value, ["email", "password", "tenantId", "mfaCode"])) return false;
  return (
    stringField(value, "email", 320, true) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email as string) &&
    stringField(value, "password", 1024, true) &&
    stringField(value, "tenantId", 128) &&
    stringField(value, "mfaCode", 128)
  );
}

function forgotPasswordBody(value: unknown): boolean {
  if (!isRecord(value) || !hasOnly(value, ["email"])) return false;
  return (
    stringField(value, "email", 320, true) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email as string)
  );
}

function profileBody(value: unknown): boolean {
  const keys = [
    "firstName", "lastName", "phone", "email", "address", "gender",
    "dateOfBirth", "emergencyContact", "emergencyPhone",
  ] as const;
  if (!isRecord(value) || !hasOnly(value, keys) || Object.keys(value).length === 0) return false;
  return keys.every((key) => stringField(value, key, key === "address" ? 500 : 320));
}

function appointmentBody(value: unknown): boolean {
  const keys = [
    "providerId", "appointmentDate", "type", "duration", "notes", "chiefComplaint",
  ] as const;
  if (!isRecord(value) || !hasOnly(value, keys)) return false;
  return (
    stringField(value, "providerId", 128, true) &&
    stringField(value, "appointmentDate", 64, true) &&
    stringField(value, "type", 100) &&
    numberField(value, "duration", 1, 1_440) &&
    stringField(value, "notes", 4_000) &&
    stringField(value, "chiefComplaint", 2_000)
  );
}

function appointmentRequestBody(value: unknown): boolean {
  const keys = [
    "appointmentType", "preferredDate", "preferredTime", "reason",
    "doctorPreference", "notes",
  ] as const;
  if (!isRecord(value) || !hasOnly(value, keys)) return false;
  return (
    stringField(value, "appointmentType", 100, true) &&
    stringField(value, "preferredDate", 64, true) &&
    stringField(value, "preferredTime", 64) &&
    stringField(value, "reason", 2_000, true) &&
    stringField(value, "doctorPreference", 320) &&
    stringField(value, "notes", 4_000)
  );
}

function messageBody(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnly(value, ["type", "priority", "originalContent", "recipientId"]) ||
    !stringField(value, "type", 64, true) ||
    !stringField(value, "priority", 64, true) ||
    !stringField(value, "recipientId", 128)
  ) return false;
  const content = value.originalContent;
  return (
    isRecord(content) &&
    hasOnly(content, ["subject", "message"]) &&
    stringField(content, "subject", 500, true) &&
    stringField(content, "message", 10_000, true)
  );
}

function laboratoryReplyBody(value: unknown): boolean {
  if (!isRecord(value) || !hasOnly(value, ["content"])) return false;
  const content = value.content;
  if (typeof content !== "string") return false;
  const normalized = content.trim();
  return normalized.length > 0 && normalized.length <= 10_000;
}

const LABORATORY_MESSAGE_ID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const staticRoutes = new Map<string, RelayRoute>([
  ["GET /csrf-token", { category: "csrf", protected: true, validateBody: noBody }],
  ["POST /auth/patient-login", { category: "patient_login", protected: false, validateBody: patientLoginBody }],
  ["POST /auth/patient-logout", { category: "patient_logout", protected: true, validateBody: noBody }],
  ["POST /auth/forgot-password", { category: "forgot_password", protected: false, validateBody: forgotPasswordBody }],
  ["GET /patient/profile", { category: "profile_read", protected: true, validateBody: noBody }],
  ["PATCH /patient/profile", { category: "profile_update", protected: true, validateBody: profileBody }],
  ["GET /patient/appointments", { category: "appointments_read", protected: true, validateBody: noBody }],
  ["POST /patient/appointments", { category: "appointment_create", protected: true, validateBody: appointmentBody }],
  ["POST /patient/appointment-requests", { category: "appointment_request", protected: true, validateBody: appointmentRequestBody }],
  ["GET /patient/prescriptions", { category: "prescriptions_read", protected: true, validateBody: noBody }],
  ["GET /patient/lab-results", { category: "labs_read", protected: true, validateBody: noBody }],
  ["GET /patient/laboratory-messages", { category: "laboratory_messages_read", protected: true, validateBody: noBody }],
  ["GET /medical-communications", { category: "messages_read", protected: true, validateBody: noBody }],
  ["POST /medical-communications", { category: "message_create", protected: true, validateBody: messageBody }],
  ["GET /patient/visit-summaries", { category: "visits_read", protected: true, validateBody: noBody }],
  ["GET /patient/bills", { category: "bills_read", protected: true, validateBody: noBody }],
  ["GET /patient/insurance-history", { category: "insurance_history_read", protected: true, validateBody: noBody }],
  ["GET /patient/telehealth/appointments", { category: "telehealth_read", protected: true, validateBody: noBody }],
]);

function restrictedRelayRouteOutsideDevelopment(route: RelayRoute): boolean {
  return (
    process.env.NODE_ENV !== "development" &&
    (route.category === "laboratory_messages_read" ||
      route.category === "laboratory_message_reply" ||
      route.category === "laboratory_message_read" ||
      route.category === "insurance_history_read")
  );
}

export function parseRelayPath(originalUrl: string): string | null {
  const prefix = NAVIMEDI_RELAY_PREFIX;
  if (!originalUrl.startsWith(prefix)) return null;
  const suffix = originalUrl.slice(prefix.length);
  if (!suffix.startsWith("/") || suffix.includes("#")) return null;
  const queryIndex = suffix.indexOf("?");
  const path = queryIndex === -1 ? suffix : suffix.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : suffix.slice(queryIndex + 1);
  if (
    !path.startsWith("/") ||
    path.includes("%") ||
    path.includes("\\") ||
    path.includes("//") ||
    (queryIndex !== -1 && (!query || query.length > 256))
  ) return null;
  const segments = path.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  if (queryIndex === -1) return path;

  // Pagination is the only query-bearing relay operation. Keep this allowlist
  // intentionally narrow so credentials, patient selectors, and arbitrary
  // upstream query features cannot be smuggled through the relay.
  if (path !== "/patient/insurance-history") return null;
  const params = new URLSearchParams(query);
  const keys = [...params.keys()];
  if (keys.some((key) => !["filingType", "limit", "offset"].includes(key))) return null;
  if (new Set(keys).size !== keys.length) return null;
  const filingType = params.get("filingType");
  if (filingType !== null && !["medical_treatment", "medication"].includes(filingType)) return null;
  for (const key of ["limit", "offset"]) {
    const value = params.get(key);
    if (value === null) continue;
    if (!/^(?:0|[1-9]\d{0,8})$/.test(value)) return null;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || (key === "limit" && (number < 1 || number > 100))) {
      return null;
    }
  }
  return `${path}?${query}`;
}

export function matchRelayRoute(method: string, path: string): RelayRoute | null {
  const routePath = path.split("?", 1)[0];
  const route = staticRoutes.get(`${method.toUpperCase()} ${routePath}`);
  if (route) return restrictedRelayRouteOutsideDevelopment(route) ? null : route;
  const normalizedMethod = method.toUpperCase();
  const laboratoryMessage = new RegExp(
    "^\\/patient\\/laboratory-messages\\/" + LABORATORY_MESSAGE_ID + "\\/(reply|read)$",
    "i",
  ).exec(path);
  if (normalizedMethod === "POST" && laboratoryMessage) {
    const operation = laboratoryMessage[1].toLowerCase();
    const route: RelayRoute = {
      category:
        operation === "reply"
          ? "laboratory_message_reply"
          : "laboratory_message_read",
      protected: true,
      validateBody: operation === "reply" ? laboratoryReplyBody : noBody,
    };
    return restrictedRelayRouteOutsideDevelopment(route) ? null : route;
  }
  if (
    (normalizedMethod === "GET" || normalizedMethod === "POST") &&
    /^\/patient\/telehealth\/sessions\/[A-Za-z0-9_-]{1,128}$/.test(path)
  ) {
    return {
      category: normalizedMethod === "GET" ? "telehealth_session_read" : "telehealth_session_create",
      protected: true,
      validateBody: normalizedMethod === "GET" ? noBody : emptyBody,
    };
  }
  return null;
}

export function isBearerHeader(value: string | undefined): boolean {
  return value !== undefined && /^Bearer [A-Za-z0-9._~+/-]{16,4096}$/.test(value);
}

export function isSafeJson(value: unknown): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const item = pending.pop()!;
    nodes += 1;
    if (nodes > 50_000 || item.depth > 20) return false;
    if (Array.isArray(item.value)) {
      for (const child of item.value) pending.push({ value: child, depth: item.depth + 1 });
    } else if (isRecord(item.value)) {
      for (const child of Object.values(item.value)) {
        pending.push({ value: child, depth: item.depth + 1 });
      }
    } else if (
      item.value !== null &&
      typeof item.value !== "string" &&
      typeof item.value !== "boolean" &&
      !(typeof item.value === "number" && Number.isFinite(item.value))
    ) return false;
  }
  return true;
}
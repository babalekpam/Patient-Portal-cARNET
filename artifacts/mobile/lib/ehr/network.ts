export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
// Patient lists, lab reports and visit histories can legitimately exceed the
// login/profile response size. Keep a generous cap for general JSON while
// using the stricter cap below for authentication and profile payloads.
export const MAX_RESPONSE_BODY_BYTES = 1024 * 1024;
export const MAX_AUTH_PROFILE_BODY_BYTES = 64 * 1024;
export const MAX_ERROR_MESSAGE_CHARS = 512;
export const MAX_CSRF_TOKEN_CHARS = 4096;
export const MAX_AUTH_TOKEN_CHARS = 8192;
const MAX_ID_CHARS = 256;
const MAX_NAME_CHARS = 320;

export interface PatientLoginUser {
  id: string;
  tenantId: string;
  role: "patient";
  firstName: string;
  lastName: string;
  email: string;
}

export interface PatientLoginTenant {
  id: string;
  name: string;
  type: string;
}

export interface PatientLoginPatient {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface PatientLoginResponse {
  success: true;
  token: string;
  user: PatientLoginUser;
  tenant: PatientLoginTenant;
  patient: PatientLoginPatient;
  expires_in?: number;
  expiresIn?: number;
  expires_at?: number | string;
  expiresAt?: number | string;
}

export type FetchTransport = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface BoundedResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly body: unknown;
  readonly bodyError?: Error;
}

export interface RequestJsonOptions {
  fetchImpl?: FetchTransport;
  timeoutMs?: number;
  maxBodyBytes?: number;
}

/**
 * Only accept server-provided error text when it is a bounded string.  Error
 * responses from the upstream service have used both `message` and `error`;
 * keeping the extraction here prevents each client from accidentally exposing
 * an unbounded or non-string value in a user-facing error.
 */
export function getServerErrorMessage(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const candidate of [record.message, record.error]) {
    if (typeof candidate !== "string") continue;
    const message = candidate.trim();
    if (message) return message.slice(0, MAX_ERROR_MESSAGE_CHARS);
  }
  return "";
}

export function requireCsrfToken(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Server did not return a valid CSRF token. Please try again.");
  }
  const candidate = (value as Record<string, unknown>).csrfToken;
  if (typeof candidate !== "string") {
    throw new Error("Server did not return a valid CSRF token. Please try again.");
  }
  const token = candidate.trim();
  if (!token || token.length > MAX_CSRF_TOKEN_CHARS) {
    throw new Error("Server did not return a valid CSRF token. Please try again.");
  }
  return token;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredBoundedString(
  record: Record<string, unknown>,
  key: string,
  max: number,
): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error("The server returned an invalid patient authentication response. Please try again.");
  }
  return value;
}

function requiredObject(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = record[key];
  if (!isRecord(value)) {
    throw new Error("The server returned an invalid patient authentication response. Please try again.");
  }
  return value;
}

// Demographic fields are not authentication evidence. Normalize absent values
// without relaxing identity, role, token, or tenant checks.
function optionalDemographicString(
  record: Record<string, unknown>,
  key: string,
  max: number,
): string {
  const value = record[key];
  if (value === null || value === undefined) return "";
  if (typeof value !== "string" || value.length > max) {
    throw new Error("The server returned an invalid patient authentication response. Please try again.");
  }
  return value;
}

/**
 * NaviMED patient login is intentionally stricter than the generic token
 * validator used by FHIR adapters. A cookie or a token-only response must
 * never establish a patient session.
 */
export function requirePatientLoginResponse(value: unknown): PatientLoginResponse {
  if (!isRecord(value) || value.success !== true) {
    throw new Error("The server returned an invalid patient authentication response. Please try again.");
  }

  const token = requiredBoundedString(value, "token", MAX_AUTH_TOKEN_CHARS).trim();
  const userRecord = requiredObject(value, "user");
  const user: PatientLoginUser = {
    id: requiredBoundedString(userRecord, "id", MAX_ID_CHARS),
    tenantId: requiredBoundedString(userRecord, "tenantId", MAX_ID_CHARS),
    role: requiredBoundedString(userRecord, "role", 32) as PatientLoginUser["role"],
    firstName: optionalDemographicString(userRecord, "firstName", MAX_NAME_CHARS),
    lastName: optionalDemographicString(userRecord, "lastName", MAX_NAME_CHARS),
    email: optionalDemographicString(userRecord, "email", 320),
  };
  if (user.role !== "patient") {
    throw new Error("The server returned an invalid patient authentication response. Please try again.");
  }

  const tenantRecord = requiredObject(value, "tenant");
  const tenant: PatientLoginTenant = {
    id: requiredBoundedString(tenantRecord, "id", MAX_ID_CHARS),
    name: requiredBoundedString(tenantRecord, "name", MAX_NAME_CHARS),
    type: requiredBoundedString(tenantRecord, "type", MAX_NAME_CHARS),
  };
  const patientRecord = requiredObject(value, "patient");
  const patient: PatientLoginPatient = {
    id: requiredBoundedString(patientRecord, "id", MAX_ID_CHARS),
    tenantId: requiredBoundedString(patientRecord, "tenantId", MAX_ID_CHARS),
    firstName: optionalDemographicString(patientRecord, "firstName", MAX_NAME_CHARS),
    lastName: optionalDemographicString(patientRecord, "lastName", MAX_NAME_CHARS),
    email: optionalDemographicString(patientRecord, "email", 320),
  };
  if (user.tenantId !== patient.tenantId || tenant.id !== patient.tenantId) {
    throw new Error("The server returned an invalid patient authentication response. Please try again.");
  }

  return {
    success: true,
    token,
    user,
    tenant,
    patient,
    ...(typeof value.expires_in === "number" ? { expires_in: value.expires_in } : {}),
    ...(typeof value.expiresIn === "number" ? { expiresIn: value.expiresIn } : {}),
    ...(typeof value.expires_at === "number" || typeof value.expires_at === "string"
      ? { expires_at: value.expires_at }
      : {}),
    ...(typeof value.expiresAt === "number" || typeof value.expiresAt === "string"
      ? { expiresAt: value.expiresAt }
      : {}),
  };
}

function profileIdentity(
  profile: Record<string, unknown>,
): { patientId: string; tenantId: string } {
  const identityError = (): never => {
    throw new Error("The server returned an invalid patient profile. Please try again.");
  };
  const readIdentity = (
    value: unknown,
    values: string[],
  ): void => {
    if (typeof value !== "string" || !value.trim() || value.length > MAX_ID_CHARS) {
      identityError();
    }
    if (typeof value === "string") values.push(value);
  };
  const patientIds: string[] = [];
  const tenantIds: string[] = [];
  if ("id" in profile) readIdentity(profile.id, patientIds);
  if ("patientId" in profile) readIdentity(profile.patientId, patientIds);

  if ("patient" in profile) {
    const nestedPatient = profile.patient;
    if (!isRecord(nestedPatient)) {
      identityError();
    }
    const patientRecord = nestedPatient as Record<string, unknown>;
    if ("id" in patientRecord) readIdentity(patientRecord.id, patientIds);
    if ("tenantId" in patientRecord) readIdentity(patientRecord.tenantId, tenantIds);
  }

  if ("tenantId" in profile) readIdentity(profile.tenantId, tenantIds);
  if ("tenant" in profile) {
    const nestedTenant = profile.tenant;
    if (!isRecord(nestedTenant)) {
      identityError();
    }
    const tenantRecord = nestedTenant as Record<string, unknown>;
    if ("id" in tenantRecord) readIdentity(tenantRecord.id, tenantIds);
  }

  const patientId = patientIds[0];
  const tenantId = tenantIds[0];
  if (
    !patientId ||
    !tenantId ||
    patientIds.some((candidate) => candidate !== patientId) ||
    tenantIds.some((candidate) => candidate !== tenantId)
  ) {
    identityError();
  }
  return { patientId, tenantId };
}

/**
 * Compare a fresh profile response with the identity returned by patient
 * login. This deliberately does not accept cached or display-only profile
 * fields as proof of patient ownership.
 */
export function requireMatchingPatientProfile(
  profile: unknown,
  login: PatientLoginResponse,
): Record<string, unknown> {
  if (!isRecord(profile)) {
    throw new Error("The server returned an invalid patient profile. Please try again.");
  }
  const identity = profileIdentity(profile);
  if (
    identity.patientId !== login.patient.id ||
    identity.tenantId !== login.patient.tenantId ||
    login.user.tenantId !== login.patient.tenantId
  ) {
    throw new Error("The signed-in patient profile does not match this account.");
  }
  return profile;
}

export class RequestTimeoutError extends Error {
  constructor() {
    super("The request timed out. Please try again.");
    this.name = "RequestTimeoutError";
  }
}

export class RequestCancelledError extends Error {
  constructor() {
    super("The request was cancelled.");
    this.name = "RequestCancelledError";
  }
}

export class NetworkRequestError extends Error {
  constructor() {
    super("Unable to connect to the server. Please check your internet connection and try again.");
    this.name = "NetworkRequestError";
  }
}

class ResponseBodyLimitError extends Error {
  constructor() {
    super("The server response was too large.");
    this.name = "ResponseBodyLimitError";
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "CanceledError")
  );
}

function byteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).byteLength;
  }
  try {
    return encodeURIComponent(value).replace(/%[0-9A-F]{2}/g, "x").length;
  } catch {
    // This is only a conservative fallback for runtimes without TextEncoder.
    return value.length * 3;
  }
}

interface StreamingTextDecoder {
  decode(input?: Uint8Array, options?: { stream?: boolean }): string;
}

/**
 * Older React Native runtimes may not provide TextDecoder. Decode UTF-8
 * incrementally rather than treating each byte as a character, since a
 * multibyte code point can be split across native stream chunks.
 */
class Utf8TextDecoderFallback implements StreamingTextDecoder {
  private pending: number[] = [];

  decode(input = new Uint8Array(), options?: { stream?: boolean }): string {
    const bytes = [...this.pending, ...input];
    this.pending = [];
    const stream = options?.stream === true;
    let text = "";

    for (let index = 0; index < bytes.length;) {
      const first = bytes[index];
      let length = 0;
      let codePoint = 0;
      if (first <= 0x7f) {
        length = 1;
        codePoint = first;
      } else if (first >= 0xc2 && first <= 0xdf) {
        length = 2;
        codePoint = first & 0x1f;
      } else if (first >= 0xe0 && first <= 0xef) {
        length = 3;
        codePoint = first & 0x0f;
      } else if (first >= 0xf0 && first <= 0xf4) {
        length = 4;
        codePoint = first & 0x07;
      } else {
        text += "\ufffd";
        index += 1;
        continue;
      }

      if (index + length > bytes.length) {
        if (stream) {
          this.pending = bytes.slice(index);
          break;
        }
        text += "\ufffd";
        index += 1;
        continue;
      }

      let valid = true;
      for (let offset = 1; offset < length; offset += 1) {
        const continuation = bytes[index + offset];
        if ((continuation & 0xc0) !== 0x80) {
          valid = false;
          break;
        }
        codePoint = (codePoint << 6) | (continuation & 0x3f);
      }
      const second = bytes[index + 1];
      if (
        (length === 3 && first === 0xe0 && second < 0xa0) ||
        (length === 3 && first === 0xed && second > 0x9f) ||
        (length === 4 && first === 0xf0 && second < 0x90) ||
        (length === 4 && first === 0xf4 && second > 0x8f) ||
        codePoint > 0x10ffff
      ) {
        valid = false;
      }

      if (!valid) {
        text += "\ufffd";
        index += 1;
        continue;
      }
      text += String.fromCodePoint(codePoint);
      index += length;
    }
    return text;
  }
}

function decodeChunk(value: Uint8Array, decoder: StreamingTextDecoder): string {
  return decoder.decode(value, { stream: true });
}

function responseUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function bodyLimitForRequest(input: RequestInfo | URL): number {
  try {
    const pathname = new URL(responseUrl(input)).pathname.replace(/\/+$/, "");
    if (
      /\/auth\/(?:login|patient-login)$/.test(pathname) ||
      /\/patient\/profile$/.test(pathname)
    ) {
      return MAX_AUTH_PROFILE_BODY_BYTES;
    }
  } catch {
    // The transport will report malformed URLs; use the general bound here.
  }
  return MAX_RESPONSE_BODY_BYTES;
}

async function readResponseText(response: Response, maxBodyBytes: number): Promise<string> {
  const contentLength = response.headers?.get?.("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBodyBytes) {
      throw new ResponseBodyLimitError();
    }
  }

  const reader = response.body?.getReader?.();
  if (reader) {
    const decoder: StreamingTextDecoder = typeof TextDecoder !== "undefined"
      ? new TextDecoder()
      : new Utf8TextDecoderFallback();
    let totalBytes = 0;
    let text = "";
    while (true) {
      const result = await reader.read();
      if (result.done) {
        text += decoder.decode();
        return text;
      }
      const chunk = result.value instanceof Uint8Array
        ? result.value
        : new Uint8Array(result.value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBodyBytes) {
        await reader.cancel().catch(() => {});
        throw new ResponseBodyLimitError();
      }
      text += decodeChunk(chunk, decoder);
    }
  }

  if (typeof response.text === "function") {
    // React Native responses can omit body/getReader(), leaving text() as the
    // only transport API. When Content-Length is absent, this native method
    // may buffer the complete body before returning; the cap below is
    // therefore post-read validation, not an allocation bound.
    const text = await response.text();
    if (byteLength(text) > maxBodyBytes) throw new ResponseBodyLimitError();
    return text;
  }

  // A few test/native transports expose only json(). Keep the byte bound for
  // those responses as well, although Response.text() is preferred in native.
  if (typeof response.json === "function") {
    const value = await response.json();
    const encoded = JSON.stringify(value);
    if (encoded && byteLength(encoded) > maxBodyBytes) {
      throw new ResponseBodyLimitError();
    }
    return encoded ?? "";
  }

  return "";
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Unknown network failure.");
}

function jsonBodyError(error: unknown): Error {
  const cause = asError(error);
  return cause instanceof ResponseBodyLimitError
    ? cause
    : new Error("The server returned an invalid response.");
}

function isJsonParseError(error: unknown): boolean {
  return error instanceof SyntaxError;
}

/**
 * Fetch a JSON response with one deadline covering both network headers and
 * body consumption. Streaming bodies are read in bounded chunks so a broken
 * endpoint cannot make the app retain an unbounded response. React Native
 * fallbacks exposing only text() are checked after native buffering when no
 * Content-Length is available; their cap is validation, not an allocation
 * bound.
 *
 * Non-JSON error bodies are represented by bodyError instead of replacing the
 * HTTP status. This lets callers preserve important distinctions such as 401
 * versus a transport failure.
 */
export async function requestJson(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: RequestJsonOptions = {},
): Promise<BoundedResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxBodyBytes = options.maxBodyBytes ?? bodyLimitForRequest(input);
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const callerSignal = init.signal;
  let cancelledByCaller = callerSignal?.aborted ?? false;
  let rejectCallerCancellation!: (error: RequestCancelledError) => void;
  const callerCancellation = new Promise<never>((_, reject) => {
    rejectCallerCancellation = reject;
  });
  const abortFromCaller = () => {
    cancelledByCaller = true;
    controller.abort();
    rejectCallerCancellation(new RequestCancelledError());
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      throw new RequestCancelledError();
    }
    callerSignal.addEventListener("abort", abortFromCaller, { once: true });
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new RequestTimeoutError());
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(input, { ...init, signal: controller.signal })),
      timeoutPromise,
      callerCancellation,
    ]).catch((error: unknown) => {
      if (timedOut) throw new RequestTimeoutError();
      if (cancelledByCaller || isAbortError(error)) throw new RequestCancelledError();
      throw new NetworkRequestError();
    });

    let body = "";
    let bodyError: Error | undefined;
    try {
      body = await Promise.race([
        readResponseText(response, maxBodyBytes),
        timeoutPromise,
        callerCancellation,
      ]);
    } catch (error) {
      if (timedOut) throw new RequestTimeoutError();
      if (cancelledByCaller || isAbortError(error)) throw new RequestCancelledError();
      if (error instanceof ResponseBodyLimitError || isJsonParseError(error)) {
        bodyError = jsonBodyError(error);
      } else {
        throw new NetworkRequestError();
      }
    }

    if (!body.trim()) {
      return { status: response.status, ok: response.ok, body: undefined, bodyError };
    }

    try {
      return {
        status: response.status,
        ok: response.ok,
        body: JSON.parse(body) as unknown,
        bodyError,
      };
    } catch (error) {
      return {
        status: response.status,
        ok: response.ok,
        body: undefined,
        bodyError: jsonBodyError(error),
      };
    }
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export function requireAuthenticationToken(value: unknown): string {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value as Record<string, unknown>).token !== "string" ||
    !(value as Record<string, string>).token.trim() ||
    (value as Record<string, string>).token.length > MAX_AUTH_TOKEN_CHARS
  ) {
    throw new Error("Server did not return a valid authentication token. Please try again.");
  }
  return (value as Record<string, string>).token.trim();
}

/**
 * Capture a bounded bearer from a successful response before generation or
 * strict contract validation can reject the request. Callers use this only
 * for isolated revocation and never as proof of a valid patient session.
 */
export function captureAuthenticationToken(value: unknown): string | null {
  try {
    return requireAuthenticationToken(value);
  } catch {
    return null;
  }
}

export function requireJsonObject<T>(value: unknown, message: string): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as T;
}
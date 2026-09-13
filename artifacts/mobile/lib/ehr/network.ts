export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
// Patient lists, lab reports and visit histories can legitimately exceed the
// login/profile response size. Keep a generous cap for general JSON while
// using the stricter cap below for authentication and profile payloads.
export const MAX_RESPONSE_BODY_BYTES = 1024 * 1024;
export const MAX_AUTH_PROFILE_BODY_BYTES = 64 * 1024;

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
    !(value as Record<string, string>).token.trim()
  ) {
    throw new Error("Server did not return a valid authentication token. Please try again.");
  }
  return (value as Record<string, string>).token;
}

export function requireJsonObject<T>(value: unknown, message: string): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as T;
}
import { randomUUID } from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  isBearerHeader,
  isSafeJson,
  matchRelayRoute,
  MAX_RELAY_BODY_BYTES,
  MAX_UPSTREAM_BYTES,
  NAVIMEDI_API_PREFIX,
  NAVIMEDI_ORIGIN,
  parseRelayPath,
  UPSTREAM_TIMEOUT_MS,
} from "./lib/relay-policy";
import { isAllowedOrigin, relayLimits, securityHeaders } from "./middlewares/security";

const app: Express = express();
app.disable("x-powered-by");
app.set("trust proxy", false);

const PREAUTH_CSRF_PATH = "/csrf-token";
const PREAUTH_CSRF_COOKIE = "navimed_csrf_seed";
const CSRF_ERROR_CODES = new Set([
  "CSRF_TOKEN_MISSING",
  "CSRF_TOKEN_INVALID",
  "CSRF_SESSION_INVALID",
]);

type JsonReadResult =
  | { kind: "ok"; data: unknown }
  | { kind: "invalid" }
  | { kind: "too_large" };

async function readUpstreamJson(
  upstream: globalThis.Response,
  controller: AbortController,
): Promise<JsonReadResult> {
  const declaredLength = Number(upstream.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPSTREAM_BYTES) {
    controller.abort();
    return { kind: "too_large" };
  }
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;.*)?$/i.test(contentType)) {
    controller.abort();
    return { kind: "invalid" };
  }

  const reader = upstream.body?.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_UPSTREAM_BYTES) {
        controller.abort();
        return { kind: "too_large" };
      }
      chunks.push(value);
    }
  }
  const text = Buffer.concat(chunks).toString("utf8");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    controller.abort();
    return { kind: "invalid" };
  }
  if (!isSafeJson(data)) {
    controller.abort();
    return { kind: "invalid" };
  }
  return { kind: "ok", data };
}

function extractPreauthCsrfToken(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const token = (value as Record<string, unknown>).csrfToken;
  return typeof token === "string" && token.length >= 16 && token.length <= 4096
    ? token
    : null;
}

function extractPreauthCsrfCookie(headers: Headers): string | null {
  const headersWithSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = typeof headersWithSetCookie.getSetCookie === "function"
    ? headersWithSetCookie.getSetCookie()
    : [headers.get("set-cookie") ?? ""];
  if (setCookies.length === 0) {
    setCookies.push(headers.get("set-cookie") ?? "");
  }
  for (const setCookie of setCookies) {
    const match = new RegExp(
      `(?:^|,\\s*)${PREAUTH_CSRF_COOKIE}=([^;,\\s]+)`,
    ).exec(setCookie);
    const value = match?.[1];
    if (value && value.length <= 4096) {
      return `${PREAUTH_CSRF_COOKIE}=${value}`;
    }
  }
  return null;
}

function sendUpstreamError(
  res: Response,
  upstream: globalThis.Response,
  data: unknown,
): void {
  const record = typeof data === "object" && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const code = typeof record.code === "string" && CSRF_ERROR_CODES.has(record.code)
    ? record.code
    : undefined;
  const message = upstream.status === 401
    ? "Authentication was not accepted."
    : upstream.status === 403
      ? "This request was not authorized."
      : upstream.status === 404
        ? "The requested operation is not available."
        : upstream.status === 429
          ? "Too many requests. Please try again shortly."
          : "The healthcare service could not process the request.";
  res.status(upstream.status).json({ message, ...(code ? { code } : {}) });
}

app.use((req, res, next) => {
  const correlationId = randomUUID();
  res.locals.correlationId = correlationId;
  res.setHeader("X-Correlation-ID", correlationId);
  res.once("finish", () => {
    logger.info({
      category: res.locals.relayCategory ?? "api",
      status: res.statusCode,
      correlationId,
    }, "request completed");
  });
  next();
});
app.use(securityHeaders);
app.use(cors((req, callback) => {
  const origin = req.headers.origin;
  const allowed = !origin || isAllowedOrigin(origin, req.headers.host);
  callback(null, {
    origin: allowed,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-CSRF-Token"],
    exposedHeaders: ["X-Correlation-ID", "X-RateLimit-Scope", "Retry-After"],
    credentials: false,
    maxAge: 600,
    preflightContinue: true,
  });
}));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin, req.headers.host)) {
    res.status(403).json({ message: "This origin is not allowed." });
    return;
  }
  next();
});

app.get("/api/delete-account", (_req: Request, res: Response) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delete Account - CARNET Patient Portal</title>
<style>body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:20px;color:#333;background:#f5f5f5}
h1{color:#0A2540}a{color:#1a6fbf}.card{background:#fff;padding:30px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}</style>
</head><body><div class="card"><h1>Delete Your Account</h1>
<p>To request deletion of your CARNET - Patient Portal account and all associated data, please send an email to:</p>
<p><strong><a href="mailto:support@argilette.com">support@argilette.com</a></strong></p>
<p>Include your registered email address in the request. Your account and all associated health data will be permanently deleted within 30 days.</p>
<p>Once deleted, this action cannot be undone.</p>
<p style="margin-top:30px;color:#666;font-size:14px">&copy; 2026 Argilette LLC</p></div></body></html>`);
});

const jsonBody = express.raw({
  type: "application/json",
  limit: MAX_RELAY_BODY_BYTES,
});

app.use("/api/navimedi", relayLimits, (req, res, next) => {
  if (req.method === "OPTIONS") {
    const path = parseRelayPath(req.originalUrl);
    const requestedMethod = req.headers["access-control-request-method"];
    const route = path && typeof requestedMethod === "string"
      ? matchRelayRoute(requestedMethod, path)
      : null;
    res.locals.relayCategory = route?.category ?? "relay_rejected";
    if (!route) {
      res.status(404).json({ message: "This API operation is not available." });
      return;
    }
    res.sendStatus(204);
    return;
  }
  const hasBody = Number(req.headers["content-length"] ?? "0") > 0 ||
    req.headers["transfer-encoding"] !== undefined;
  const contentType = req.headers["content-type"];
  if (hasBody && (!contentType || !/^application\/json(?:\s*;.*)?$/i.test(contentType))) {
    res.status(415).json({ message: "Only JSON request bodies are supported." });
    return;
  }
  jsonBody(req, res, next);
}, async (req: Request, res: Response) => {
  const path = parseRelayPath(req.originalUrl);
  const route = path ? matchRelayRoute(req.method, path) : null;
  res.locals.relayCategory = route?.category ?? "relay_rejected";
  if (!path || !route) {
    res.status(404).json({ message: "This API operation is not available." });
    return;
  }

  const authorization = req.headers.authorization;
  // This is presence/shape enforcement only. Navimedi remains responsible for
  // authenticating the token and authorizing patient/resource ownership.
  if (route.protected && !isBearerHeader(authorization)) {
    res.status(401).json({ message: "Please log in to continue." });
    return;
  }
  const mutatingProtected = route.protected && ["POST", "PATCH"].includes(req.method);
  const csrf = req.headers["x-csrf-token"];
  if (mutatingProtected && (typeof csrf !== "string" || csrf.length < 16 || csrf.length > 4096)) {
    res.status(403).json({ message: "A valid request token is required." });
    return;
  }

  let body: unknown;
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      res.status(400).json({ message: "The request contains invalid JSON." });
      return;
    }
  }
  if (!route.validateBody(body) || (body !== undefined && !isSafeJson(body))) {
    res.status(400).json({ message: "Please check the submitted fields." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const cancel = () => controller.abort();
  req.once("aborted", cancel);
  res.once("close", cancel);
  try {
    const headers = new Headers({ Accept: "application/json" });
    if (route.protected && authorization) headers.set("Authorization", authorization);
    if (route.protected && typeof csrf === "string") headers.set("X-CSRF-Token", csrf);
    if (body !== undefined) headers.set("Content-Type", "application/json");

    const requiresPreauthCsrf =
      route.category === "login" || route.category === "patient_login";
    if (requiresPreauthCsrf) {
      const csrfResponse = await fetch(
        `${NAVIMEDI_ORIGIN}${NAVIMEDI_API_PREFIX}${PREAUTH_CSRF_PATH}`,
        {
          method: "GET",
          headers: new Headers({
            Accept: "application/json",
            "Cache-Control": "no-store",
          }),
          redirect: "manual",
          signal: controller.signal,
        },
      );
      if (csrfResponse.status >= 300 && csrfResponse.status < 400) {
        controller.abort();
        res.status(502).json({ message: "The healthcare service returned an invalid response." });
        return;
      }
      if (csrfResponse.status === 204) {
        controller.abort();
        res.status(502).json({ message: "The healthcare service returned an invalid response." });
        return;
      }
      const csrfBody = await readUpstreamJson(csrfResponse, controller);
      if (csrfBody.kind !== "ok") {
        res.status(502).json({
          message: csrfBody.kind === "too_large"
            ? "The healthcare service response was too large."
            : "The healthcare service returned an invalid response.",
        });
        return;
      }
      if (!csrfResponse.ok) {
        sendUpstreamError(res, csrfResponse, csrfBody.data);
        return;
      }
      const preauthCsrfToken = extractPreauthCsrfToken(csrfBody.data);
      const preauthCsrfCookie = extractPreauthCsrfCookie(csrfResponse.headers);
      if (!preauthCsrfToken || !preauthCsrfCookie) {
        controller.abort();
        res.status(502).json({ message: "The healthcare service returned an invalid response." });
        return;
      }
      headers.set("X-CSRF-Token", preauthCsrfToken);
      // Only the matching pre-auth seed is sent to the fixed upstream. Never
      // forward a client Cookie header or expose Set-Cookie to the client.
      headers.set("Cookie", preauthCsrfCookie);
    }

    const upstream = await fetch(`${NAVIMEDI_ORIGIN}${NAVIMEDI_API_PREFIX}${path}`, {
      method: req.method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: controller.signal,
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      controller.abort();
      res.status(502).json({ message: "The healthcare service returned an invalid response." });
      return;
    }
    if (upstream.status === 204) {
      res.sendStatus(204);
      return;
    }
    const responseBody = await readUpstreamJson(upstream, controller);
    if (responseBody.kind !== "ok") {
      res.status(502).json({
        message: responseBody.kind === "too_large"
          ? "The healthcare service response was too large."
          : "The healthcare service returned an invalid response.",
      });
      return;
    }
    const data = responseBody.data;
    if (!upstream.ok) {
      sendUpstreamError(res, upstream, data);
      return;
    }
    res.status(upstream.status).json(data);
  } catch {
    if (!res.headersSent) {
      res.status(502).json({ message: "The healthcare service is temporarily unavailable." });
    }
  } finally {
    clearTimeout(timeout);
    req.off("aborted", cancel);
    res.off("close", cancel);
  }
});

app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use("/api", router);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.locals.relayCategory = "request_error";
  if (!res.headersSent) {
    const status = typeof error === "object" && error !== null &&
      "status" in error && error.status === 413 ? 413 : 400;
    res.status(status).json({
      message: status === 413 ? "The request is too large." : "The request could not be processed.",
    });
  }
});

export default app;
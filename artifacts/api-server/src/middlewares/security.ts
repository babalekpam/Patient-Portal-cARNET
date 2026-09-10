import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function canonicalHttpsOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" ||
        url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function buildAllowedOrigins(
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  const trusted = (env.TRUSTED_CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => canonicalHttpsOrigin(origin.trim()))
    .filter((origin): origin is string => origin !== null);

  // Expo web and the API use different Replit development hostnames. In
  // development only, accept the one exact hostname supplied by Replit. In
  // production, operators must use TRUSTED_CORS_ORIGINS instead.
  const expoDomain = env.NODE_ENV !== "production"
    ? (env.REPLIT_EXPO_DEV_DOMAIN ?? "").trim()
    : "";
  if (
    expoDomain &&
    !/[\\/@*?#\s]/.test(expoDomain) &&
    canonicalHttpsOrigin(`https://${expoDomain}`) === `https://${expoDomain}`
  ) {
    trusted.push(`https://${expoDomain}`);
  }
  return [...new Set(trusted)];
}

const configuredOrigins = buildAllowedOrigins(process.env);

export function isAllowedOrigin(origin: string, host: string | undefined): boolean {
  const canonical = canonicalHttpsOrigin(origin);
  if (!canonical) return false;
  const sameHost = host ? canonicalHttpsOrigin(`https://${host}`) : null;
  return [sameHost, ...configuredOrigins].some(
    (allowed) => allowed !== null && secureEqual(canonical, allowed),
  );
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set({
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  next();
}

type Entry = { count: number; resetAt: number };

class BoundedWindowLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxEntries: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.entries.delete(key);
      if (this.entries.size >= this.maxEntries) {
        const oldest = this.entries.keys().next().value as string | undefined;
        if (oldest) this.entries.delete(oldest);
      }
      this.entries.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}

const ipLimiter = new BoundedWindowLimiter(120, 60_000, 5_000);
const authLimiter = new BoundedWindowLimiter(180, 60_000, 5_000);
const loginLimiter = new BoundedWindowLimiter(12, 60_000, 5_000);
let activeRelays = 0;
const MAX_ACTIVE_RELAYS = 32;

export function relayLimits(req: Request, res: Response, next: NextFunction): void {
  const ip = req.socket.remoteAddress ?? "unknown";
  const authorization = req.headers.authorization;
  const authKey = authorization
    ? createHash("sha256").update(authorization).digest("base64url")
    : "anonymous";
  const login = req.path === "/auth/login" || req.path === "/auth/patient-login" ||
    req.path === "/auth/forgot-password";
  const accepted =
    ipLimiter.take(`ip:${ip}`) &&
    authLimiter.take(`auth:${authKey}`) &&
    (!login || loginLimiter.take(`login:${ip}`));
  res.setHeader("X-RateLimit-Scope", "instance");
  if (!accepted) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ message: "Too many requests. Please try again shortly." });
    return;
  }
  if (activeRelays >= MAX_ACTIVE_RELAYS) {
    res.setHeader("Retry-After", "1");
    res.status(503).json({ message: "The service is busy. Please try again shortly." });
    return;
  }
  activeRelays += 1;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      activeRelays -= 1;
    }
  };
  res.once("finish", release);
  res.once("close", release);
  next();
}
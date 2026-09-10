import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import app from "./app";
import { logger } from "./lib/logger";
import { MAX_UPSTREAM_BYTES } from "./lib/relay-policy";

type FetchCall = { input: string; init?: RequestInit };

async function withServer(
  handler: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const port = (server.address() as AddressInfo).port;
  try {
    await handler(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("relay HTTP enforcement and forwarding", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const originalInfo = logger.info;
  const calls: FetchCall[] = [];
  const logged: unknown[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1:")) {
      return originalFetch(input, init);
    }
    calls.push({ input: url, init });
    if (url.endsWith("/auth/login")) {
      return jsonResponse({ token: "upstream-token", user: {}, tenant: {} });
    }
    if (url.endsWith("/patient/profile")) {
      return jsonResponse({ firstName: "A", lastName: "Patient" });
    }
    throw new Error("unexpected mock URL");
  }) as typeof fetch;
  logger.info = ((...args: unknown[]) => {
    logged.push(args);
    return logger;
  }) as typeof logger.info;

  try {
    await withServer(async (baseUrl) => {
      let response = await fetch(`${baseUrl}/api/download-mobile`);
      assert.equal(response.status, 404);

      response = await fetch(`${baseUrl}/api/navimedi/patient/profile`);
      assert.equal(response.status, 401);

      response = await fetch(`${baseUrl}/api/navimedi/patient/profile`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${"a".repeat(24)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone: "555-0100" }),
      });
      assert.equal(response.status, 403);

      response = await fetch(`${baseUrl}/api/navimedi/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not-json",
      });
      assert.equal(response.status, 415);

      response = await fetch(`${baseUrl}/api/navimedi/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{broken",
      });
      assert.equal(response.status, 400);

      response = await fetch(`${baseUrl}/api/navimedi/capabilities`);
      assert.equal(response.status, 404);

      response = await fetch(`${baseUrl}/api/navimedi/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "patient@example.com",
          password: "never-log-this-password",
        }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json() as { token: string }).token, "upstream-token");

      response = await fetch(`${baseUrl}/api/navimedi/patient/profile`, {
        headers: { Authorization: `Bearer ${"b".repeat(24)}` },
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json() as { firstName: string }).firstName, "A");
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].input, "https://www.navimedi.org/api/auth/login");
    assert.equal(calls[0].init?.redirect, "manual");
    assert.equal(calls[1].input, "https://www.navimedi.org/api/patient/profile");
    assert.equal(new Headers(calls[1].init?.headers).get("authorization"), `Bearer ${"b".repeat(24)}`);
    const serializedLogs = JSON.stringify(logged);
    assert.equal(serializedLogs.includes("patient@example.com"), false);
    assert.equal(serializedLogs.includes("never-log-this-password"), false);
    assert.equal(serializedLogs.includes("/patient/profile"), false);
    assert.equal(serializedLogs.includes("Bearer"), false);
  } finally {
    globalThis.fetch = originalFetch;
    logger.info = originalInfo;
  }
});

test("relay rejects redirects and oversized upstream responses", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  try {
    let mode: "redirect" | "large" = "redirect";
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith("http://127.0.0.1:")) {
        return originalFetch(input, init);
      }
      if (mode === "redirect") {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://evil.test" },
        });
      }
      return new Response(JSON.stringify({ data: "x" }), {
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(MAX_UPSTREAM_BYTES + 1),
        },
      });
    }) as typeof fetch;

    await withServer(async (baseUrl) => {
      const login = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "patient@example.com", password: "password-value" }),
      };
      let response = await fetch(`${baseUrl}/api/navimedi/auth/login`, login);
      assert.equal(response.status, 502);
      mode = "large";
      response = await fetch(`${baseUrl}/api/navimedi/auth/login`, login);
      assert.equal(response.status, 502);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
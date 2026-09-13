import assert from "node:assert/strict";
import test from "node:test";
import { NavimediAdapter } from "../lib/ehr/adapters/navimedi";
import type { FetchTransport } from "../lib/ehr/network";

const TEST_BASE_URL = "https://navimedi.example.test/api";
const testSession = globalThis as typeof globalThis & {
  __navimediSessionGeneration?: number;
};

function resetSessionGeneration(): void {
  testSession.__navimediSessionGeneration = 1;
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function path(input: RequestInfo | URL): string {
  return new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url).pathname;
}

function header(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

test.beforeEach(resetSessionGeneration);

test("runs a mocked NaviMED login then profile request with the bearer token", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchImpl: FetchTransport = async (input, init) => {
    calls.push({ input, init });
    if (path(input).endsWith("/auth/login")) {
      return response(200, { token: "unit-test-token", user: { id: "patient-test" } });
    }
    if (path(input).endsWith("/patient/profile")) {
      assert.equal(header(init, "Authorization"), "Bearer unit-test-token");
      return response(200, { firstName: "Unit", lastName: "Test", mrn: "MRN-TEST" });
    }
    throw new Error(`Unexpected test route: ${String(input)}`);
  };

  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);
  const login = await adapter.login({
    email: "unit-test@example.invalid",
    password: "not-a-real-password",
  });
  adapter.setLoginContext(login);

  const profile = await adapter.getProfile();
  assert.deepEqual(profile, { firstName: "Unit", lastName: "Test", mrn: "MRN-TEST" });
  assert.deepEqual(calls.map(({ input }) => path(input)), [
    "/api/auth/login",
    "/api/patient/profile",
  ]);
});

test("surfaces NaviMED login 401 as an authentication error", async () => {
  const fetchImpl: FetchTransport = async () =>
    response(401, { message: "Invalid credentials." });
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);

  await assert.rejects(
    adapter.login({
      email: "unit-test@example.invalid",
      password: "not-a-real-password",
    }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "Invalid credentials.",
  );
});

test("rejects a successful login response that has no token", async () => {
  const fetchImpl: FetchTransport = async () => response(200, { user: { id: "patient-test" } });
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);

  await assert.rejects(
    adapter.login({
      email: "unit-test@example.invalid",
      password: "not-a-real-password",
    }),
    (error: unknown) =>
      error instanceof Error &&
      /valid authentication token/i.test(error.message),
  );
});

test("re-fetches CSRF and retries a rejected NaviMED profile update once", async () => {
  const csrfHeaders: Array<string | null> = [];
  let csrfFetches = 0;
  const fetchImpl: FetchTransport = async (input, init) => {
    const requestPath = path(input);
    if (requestPath.endsWith("/csrf-token")) {
      csrfFetches += 1;
      return response(200, { csrfToken: csrfFetches === 1 ? "csrf-a" : "csrf-b" });
    }
    if (requestPath.endsWith("/patient/profile")) {
      csrfHeaders.push(header(init, "X-CSRF-Token"));
      if (header(init, "X-CSRF-Token") === "csrf-a") {
        return response(403, { code: "CSRF_TOKEN_INVALID" });
      }
      return response(200, { firstName: "Updated", lastName: "Test" });
    }
    throw new Error(`Unexpected test route: ${requestPath}`);
  };

  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);
  adapter.setToken("unit-test-token");
  const profile = await adapter.updateProfile({ firstName: "Updated" });

  assert.deepEqual(profile, { firstName: "Updated", lastName: "Test" });
  assert.equal(csrfFetches, 2);
  assert.deepEqual(csrfHeaders, ["csrf-a", "csrf-b"]);
});

test("rejects a profile response that arrives after the session generation changes", async () => {
  let releaseProfile!: (value: Response) => void;
  const profileResponse = new Promise<Response>((resolve) => {
    releaseProfile = resolve;
  });
  const fetchImpl: FetchTransport = async () => profileResponse;
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);
  adapter.setToken("unit-test-token");

  const request = adapter.getProfile();
  await Promise.resolve();
  testSession.__navimediSessionGeneration = 2;
  releaseProfile(response(200, { firstName: "Stale", lastName: "Patient" }));

  await assert.rejects(
    request,
    (error: unknown) =>
      error instanceof Error &&
      error.name === "StaleSessionRequestError",
  );
});
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

const patientLogin = {
  success: true,
  token: "unit-test-token",
  user: {
    id: "user-test",
    tenantId: "tenant-test",
    role: "patient",
    firstName: "Unit",
    lastName: "Test",
    email: "unit-test@example.invalid",
  },
  tenant: { id: "tenant-test", name: "Test Tenant", type: "clinic" },
  patient: {
    id: "patient-test",
    tenantId: "tenant-test",
    firstName: "Unit",
    lastName: "Test",
    email: "unit-test@example.invalid",
  },
};

test.beforeEach(resetSessionGeneration);

test("runs a mocked NaviMED login then profile request with the bearer token", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchImpl: FetchTransport = async (input, init) => {
    calls.push({ input, init });
    if (path(input).endsWith("/csrf-token")) {
      assert.equal(init?.credentials, "include");
      return response(200, { csrfToken: "preauth-csrf-token" });
    }
    if (path(input).endsWith("/auth/patient-login")) {
      assert.equal(init?.credentials, "include");
      assert.equal(header(init, "X-CSRF-Token"), "preauth-csrf-token");
      return response(200, patientLogin);
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
    "/api/csrf-token",
      "/api/auth/patient-login",
    "/api/patient/profile",
  ]);
});

test("surfaces NaviMED login 401 as an authentication error", async () => {
  const fetchImpl: FetchTransport = async (input) =>
    path(input).endsWith("/csrf-token")
      ? response(200, { csrfToken: "preauth-csrf-token" })
      : response(401, { message: "Invalid credentials." });
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
  const fetchImpl: FetchTransport = async (input) =>
    path(input).endsWith("/csrf-token")
      ? response(200, { csrfToken: "preauth-csrf-token" })
      : response(200, { user: { id: "patient-test" } });
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);

  await assert.rejects(
    adapter.login({
      email: "unit-test@example.invalid",
      password: "not-a-real-password",
    }),
    (error: unknown) =>
      error instanceof Error &&
      /valid authentication token|patient authentication response/i.test(error.message),
  );
});

test("fails closed when the native pre-auth CSRF response has no token", async () => {
  let loginAttempts = 0;
  const fetchImpl: FetchTransport = async (input) => {
    if (path(input).endsWith("/csrf-token")) return response(200, {});
    loginAttempts += 1;
    return response(200, { token: "must-not-be-used" });
  };
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);

  await assert.rejects(
    adapter.login({
      email: "unit-test@example.invalid",
      password: "not-a-real-password",
    }),
    /valid CSRF token/i,
  );
  assert.equal(loginAttempts, 0);
});

test("re-fetches native pre-auth CSRF and retries login once for an explicit CSRF error", async () => {
  let csrfFetches = 0;
  let loginAttempts = 0;
  const csrfHeaders: string[] = [];
  const fetchImpl: FetchTransport = async (input, init) => {
    const requestPath = path(input);
    if (requestPath.endsWith("/csrf-token")) {
      csrfFetches += 1;
      return response(200, { csrfToken: `preauth-csrf-${csrfFetches}` });
    }
    if (requestPath.endsWith("/auth/patient-login")) {
      loginAttempts += 1;
      csrfHeaders.push(header(init, "X-CSRF-Token") ?? "");
      return loginAttempts === 1
        ? response(403, { code: "CSRF_SESSION_INVALID" })
        : response(200, patientLogin);
    }
    throw new Error(`Unexpected test route: ${requestPath}`);
  };
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);

  const login = await adapter.login({
    email: "unit-test@example.invalid",
    password: "not-a-real-password",
  });

  assert.equal(login.token, "unit-test-token");
  assert.equal(csrfFetches, 2);
  assert.equal(loginAttempts, 2);
  assert.deepEqual(csrfHeaders, ["preauth-csrf-1", "preauth-csrf-2"]);
});

test("does not retry native login for an ordinary 403", async () => {
  let csrfFetches = 0;
  let loginAttempts = 0;
  const fetchImpl: FetchTransport = async (input) => {
    if (path(input).endsWith("/csrf-token")) {
      csrfFetches += 1;
      return response(200, { csrfToken: "preauth-csrf-token" });
    }
    loginAttempts += 1;
    return response(403, { error: "Access denied." });
  };
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);

  await assert.rejects(
    adapter.login({
      email: "unit-test@example.invalid",
      password: "not-a-real-password",
    }),
    (error: unknown) => error instanceof Error && error.message === "Access denied.",
  );
  assert.equal(csrfFetches, 1);
  assert.equal(loginAttempts, 1);
});

test("uses the patient-login endpoint without probing the generic login route", async () => {
  const calls: string[] = [];
  const fetchImpl: FetchTransport = async (input, init) => {
    const requestPath = path(input);
    calls.push(requestPath);
    if (requestPath.endsWith("/csrf-token")) {
      assert.equal(init?.credentials, "include");
      return response(200, { csrfToken: "preauth-csrf-token" });
    }
    assert.equal(requestPath.endsWith("/auth/patient-login"), true);
    assert.equal(init?.credentials, "include");
    assert.equal(header(init, "X-CSRF-Token"), "preauth-csrf-token");
    return response(200, patientLogin);
  };
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);

  const login = await adapter.login({
    email: "unit-test@example.invalid",
    password: "not-a-real-password",
  });

  assert.equal(login.token, "unit-test-token");
  assert.deepEqual(calls, [
    "/api/csrf-token",
    "/api/auth/patient-login",
  ]);
});

test("verifies a fresh profile before a NaviMED token can be accepted", async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fetchImpl: FetchTransport = async (input, init) => {
    calls.push({ path: path(input), init });
    if (path(input).endsWith("/csrf-token")) return response(200, { csrfToken: "preauth-csrf-token" });
    if (path(input).endsWith("/auth/patient-login")) return response(200, patientLogin);
    if (path(input).endsWith("/patient/profile")) {
      assert.equal(header(init, "Authorization"), "Bearer unit-test-token");
      return response(200, {
        id: "patient-test",
        tenantId: "tenant-test",
        firstName: "Unit",
        lastName: "Test",
      });
    }
    throw new Error(`Unexpected route ${path(input)}`);
  };
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);
  const login = await adapter.login({
    email: "unit-test@example.invalid",
    password: "password-without-trimming ",
    tenantId: "tenant-test",
    mfaCode: " 123456 ",
  });
  const profile = await adapter.verifyLoginProfile(login);
  assert.equal(profile.id, "patient-test");
  assert.deepEqual(calls.map((call) => call.path), [
    "/api/csrf-token",
    "/api/auth/patient-login",
    "/api/patient/profile",
  ]);
  const body = JSON.parse(String(calls[1].init?.body));
  assert.equal(body.password, "password-without-trimming ");
  assert.equal(body.mfaCode, "123456");
});

test("trims non-password login fields and omits blank optional fields", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fetchImpl: FetchTransport = async (input, init) => {
    if (path(input).endsWith("/csrf-token")) return response(200, { csrfToken: "preauth-csrf-token" });
    assert.equal(path(input).endsWith("/auth/patient-login"), true);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return response(200, patientLogin);
  };
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);
  await adapter.login({
    email: " patient@example.test ",
    password: " exact password ",
    tenantId: "   ",
    mfaCode: " 123456 ",
  });
  assert.deepEqual(requestBody, {
    email: "patient@example.test",
    password: " exact password ",
    mfaCode: "123456",
  });
});

test("revokes a token when strict login contract validation fails", async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fetchImpl: FetchTransport = async (input, init) => {
    calls.push({ path: path(input), init });
    if (path(input).endsWith("/csrf-token")) return response(200, { csrfToken: "csrf-a" });
    if (path(input).endsWith("/auth/patient-login")) {
      return response(200, {
        ...patientLogin,
        user: { ...patientLogin.user, role: "staff" },
      });
    }
    if (path(input).endsWith("/auth/patient-logout")) return response(200, { success: true });
    throw new Error(`Unexpected route ${path(input)}`);
  };
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);
  await assert.rejects(
    adapter.login({
      email: "unit-test@example.invalid",
      password: "password",
    }),
    /patient authentication response/i,
  );
  assert.deepEqual(calls.map((call) => call.path), [
    "/api/csrf-token",
    "/api/auth/patient-login",
    "/api/csrf-token",
    "/api/auth/patient-logout",
  ]);
  assert.equal(header(calls[3].init, "Authorization"), "Bearer unit-test-token");
});

test("revokes a captured token with the same bearer when profile verification fails", async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fetchImpl: FetchTransport = async (input, init) => {
    calls.push({ path: path(input), init });
    if (path(input).endsWith("/csrf-token")) return response(200, { csrfToken: "session-csrf" });
    if (path(input).endsWith("/auth/patient-logout")) return response(200, { success: true });
    if (path(input).endsWith("/patient/profile")) {
      return response(200, { id: "different-patient", tenantId: "tenant-test" });
    }
    if (path(input).endsWith("/auth/patient-login")) return response(200, patientLogin);
    throw new Error(`Unexpected route ${path(input)}`);
  };
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);
  const login = await adapter.login({
    email: "unit-test@example.invalid",
    password: "password",
  });
  await assert.rejects(adapter.verifyLoginProfile(login), /does not match/i);
  await adapter.revokeToken(login.token);
  assert.equal(header(calls[3].init, "Authorization"), "Bearer unit-test-token");
  assert.equal(header(calls[4].init, "Authorization"), "Bearer unit-test-token");
  assert.equal(header(calls[4].init, "X-CSRF-Token"), "session-csrf");
  assert.deepEqual(calls.map((call) => call.path), [
    "/api/csrf-token",
    "/api/auth/patient-login",
    "/api/patient/profile",
    "/api/csrf-token",
    "/api/auth/patient-logout",
  ]);
});

test("a stale logout completion cannot revoke a replacement token", async () => {
  let releaseCsrf!: (value: Response) => void;
  const csrfResponse = new Promise<Response>((resolve) => { releaseCsrf = resolve; });
  const logoutBearers: string[] = [];
  const fetchImpl: FetchTransport = async (input, init) => {
    if (path(input).endsWith("/csrf-token")) return csrfResponse;
    if (path(input).endsWith("/auth/patient-logout")) {
      logoutBearers.push(header(init, "Authorization") ?? "");
      return response(200, { success: true });
    }
    throw new Error(`Unexpected route ${path(input)}`);
  };
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);
  adapter.setToken("token-a");
  const logout = adapter.logout();
  await Promise.resolve();
  adapter.setToken("token-b");
  testSession.__navimediSessionGeneration = 2;
  releaseCsrf(response(200, { csrfToken: "csrf-a" }));
  await logout;
  assert.deepEqual(logoutBearers, ["Bearer token-a"]);
  adapter.clearToken();
});

test("captures and revokes a token when generation changes after POST dispatch", async () => {
  let releaseLogin!: (value: Response) => void;
  let postDispatched = false;
  const loginResponse = new Promise<Response>((resolve) => { releaseLogin = resolve; });
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fetchImpl: FetchTransport = async (input, init) => {
    calls.push({ path: path(input), init });
    if (path(input).endsWith("/csrf-token")) return response(200, { csrfToken: "csrf-a" });
    if (path(input).endsWith("/auth/patient-login")) {
      postDispatched = true;
      return loginResponse;
    }
    if (path(input).endsWith("/auth/patient-logout")) return response(200, { success: true });
    throw new Error(`Unexpected route ${path(input)}`);
  };
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);
  const login = adapter.login({
    email: "unit-test@example.invalid",
    password: "password",
  });
  while (!postDispatched) await Promise.resolve();
  testSession.__navimediSessionGeneration = 2;
  releaseLogin(response(200, patientLogin));
  await assert.rejects(
    login,
    (error: unknown) => error instanceof Error && error.name === "StaleSessionRequestError",
  );
  assert.deepEqual(calls.map((call) => call.path), [
    "/api/csrf-token",
    "/api/auth/patient-login",
    "/api/csrf-token",
    "/api/auth/patient-logout",
  ]);
  assert.equal(header(calls[3].init, "Authorization"), "Bearer unit-test-token");
});

test("bounds server error text from the error field", async () => {
  const adapter = new NavimediAdapter(
    "navimedi-test",
    TEST_BASE_URL,
    async (input) =>
      path(input).endsWith("/csrf-token")
        ? response(200, { csrfToken: "preauth-csrf-token" })
        : response(403, { error: "x".repeat(2_000) }),
  );

  await assert.rejects(
    adapter.login({
      email: "unit-test@example.invalid",
      password: "not-a-real-password",
    }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.length === 512 &&
      /^x+$/.test(error.message),
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

test("rejects a native login response after the session generation changes", async () => {
  let releaseCsrf!: (value: Response) => void;
  const csrfResponse = new Promise<Response>((resolve) => {
    releaseCsrf = resolve;
  });
  const fetchImpl: FetchTransport = async (input) =>
    path(input).endsWith("/csrf-token")
      ? csrfResponse
      : response(200, { token: "stale-token" });
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);
  const request = adapter.login({
    email: "unit-test@example.invalid",
    password: "not-a-real-password",
  });

  await Promise.resolve();
  testSession.__navimediSessionGeneration = 2;
  releaseCsrf(response(200, { csrfToken: "stale-csrf-token" }));

  await assert.rejects(
    request,
    (error: unknown) =>
      error instanceof Error &&
      error.name === "StaleSessionRequestError",
  );
});
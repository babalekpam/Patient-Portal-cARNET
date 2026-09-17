import assert from "node:assert/strict";
import test from "node:test";
import { Platform } from "react-native";
import { NavimediAdapter } from "../lib/ehr/adapters/navimedi";
import type { FetchTransport } from "../lib/ehr/network";

const TEST_BASE_URL = "https://navimedi.example.test/api";
const TEMPORARY_RELAY_UPSTREAM =
  "https://942dd837-7012-47ef-8574-574ac5ab89f8-00-2gel21gszwmqv.picard.replit.dev/api";
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

function url(input: RequestInfo | URL): URL {
  return new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
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

test("binds a web adapter session to the effective relay issuer and restores production identity", () => {
  const originalPlatform = Platform.OS;
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = mutableEnv.NODE_ENV;
  const originalRelayOverride = mutableEnv.EXPO_PUBLIC_CARNET_NAVIMEDI_RELAY_UPSTREAM_URL;
  try {
    (Platform as unknown as { OS: string }).OS = "web";
    mutableEnv.NODE_ENV = "development";
    mutableEnv.EXPO_PUBLIC_CARNET_NAVIMEDI_RELAY_UPSTREAM_URL =
      TEMPORARY_RELAY_UPSTREAM;
    const temporary = new NavimediAdapter("navimedi-test", TEST_BASE_URL);
    assert.equal(
      temporary.sessionKey,
      `navimedi-test|${TEMPORARY_RELAY_UPSTREAM}`,
    );

    delete mutableEnv.EXPO_PUBLIC_CARNET_NAVIMEDI_RELAY_UPSTREAM_URL;
    const production = new NavimediAdapter("navimedi-test", TEST_BASE_URL);
    assert.equal(
      production.sessionKey,
      "navimedi-test|https://www.navimedi.org/api",
    );
    assert.notEqual(temporary.sessionKey, production.sessionKey);
  } finally {
    (Platform as unknown as { OS: string }).OS = originalPlatform;
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
    if (originalRelayOverride === undefined) {
      delete mutableEnv.EXPO_PUBLIC_CARNET_NAVIMEDI_RELAY_UPSTREAM_URL;
    } else {
      mutableEnv.EXPO_PUBLIC_CARNET_NAVIMEDI_RELAY_UPSTREAM_URL = originalRelayOverride;
    }
  }
});

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

test("fetches strict patient insurance history pages with the existing bearer", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchImpl: FetchTransport = async (input, init) => {
    calls.push({ input, init });
    return response(200, {
      items: [{
        filingId: "11111111-1111-4111-8111-111111111111",
        filingType: "medical_treatment",
        date: "2026-09-13T14:00:00.000Z",
        status: "approved",
        currency: "USD",
        amounts: { billed: "240.00", approved: "180.00", paid: "0.00" },
      }],
      pagination: { limit: 20, offset: 0, hasMore: true, nextOffset: 20 },
    });
  };
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);
  adapter.setToken("unit-test-token");

  const page = await adapter.getInsuranceHistory({
    filingType: "medical_treatment",
    limit: 20,
    offset: 0,
  });

  assert.equal(page.items[0].amounts.paid, "0.00");
  assert.equal(url(calls[0].input).pathname, "/api/patient/insurance-history");
  assert.equal(url(calls[0].input).search, "?limit=20&offset=0&filingType=medical_treatment");
  assert.equal(header(calls[0].init, "Authorization"), "Bearer unit-test-token");
  assert.equal(header(calls[0].init, "Cookie"), null);
});

test("keeps medical-treatment and medication pagination requests independent", async () => {
  const requests: string[] = [];
  const fetchImpl: FetchTransport = async (input) => {
    const request = url(input);
    requests.push(request.search);
    const medication = request.searchParams.get("filingType") === "medication";
    const offset = Number(request.searchParams.get("offset"));
    return response(200, {
      items: [{
        filingId: `${medication ? "2" : "1"}-${offset}`,
        filingType: medication ? "medication" : "medical_treatment",
        date: "2026-09-13T14:00:00.000Z",
        status: "draft",
        currency: "USD",
        amounts: { billed: null, approved: null, paid: null },
      }],
      pagination: { limit: 20, offset, hasMore: false, nextOffset: null },
    });
  };
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);
  adapter.setToken("unit-test-token");

  await adapter.getInsuranceHistory({ filingType: "medical_treatment", offset: 20 });
  await adapter.getInsuranceHistory({ filingType: "medication", offset: 40 });

  assert.deepEqual(requests, [
    "?limit=20&offset=20&filingType=medical_treatment",
    "?limit=20&offset=40&filingType=medication",
  ]);
});

test("rejects insurance history responses that use a staff category or collapse null and zero", async () => {
  const adapter = new NavimediAdapter(
    "navimedi-test",
    TEST_BASE_URL,
    async () => response(200, {
      items: [{
        filingId: "staff-route",
        filingType: "staff",
        date: "2026-09-13T14:00:00.000Z",
        status: "approved",
        currency: "USD",
        amounts: { billed: 0, approved: "0.00", paid: null },
      }],
      pagination: { limit: 20, offset: 0, hasMore: false, nextOffset: null },
    }),
  );
  adapter.setToken("unit-test-token");
  await assert.rejects(
    adapter.getInsuranceHistory(),
    /invalid insurance history response/i,
  );
});

test("does not accept a late insurance-history page after an account switch", async () => {
  let release!: (value: Response) => void;
  const delayed = new Promise<Response>((resolve) => { release = resolve; });
  const adapter = new NavimediAdapter(
    "navimedi-test",
    TEST_BASE_URL,
    async () => delayed,
  );
  adapter.setToken("patient-a-token");
  const request = adapter.getInsuranceHistory({ filingType: "medication" });
  await Promise.resolve();
  testSession.__navimediSessionGeneration = 2;
  release(response(200, {
    items: [],
    pagination: { limit: 20, offset: 0, hasMore: false, nextOffset: null },
  }));
  await assert.rejects(
    request,
    (error: unknown) =>
      error instanceof Error &&
      error.name === "StaleSessionRequestError",
  );
  adapter.clearToken();
});

test("supports laboratory message reads, explicit replies, and explicit read actions", async () => {
  const messageId = "550e8400-e29b-41d4-a716-446655440000";
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  let csrfFetches = 0;
  const fetchImpl: FetchTransport = async (input, init) => {
    const requestPath = path(input);
    calls.push({ path: requestPath, init });
    if (requestPath.endsWith("/csrf-token")) {
      csrfFetches += 1;
      return response(200, { csrfToken: `laboratory-csrf-${csrfFetches}` });
    }
    if (requestPath.endsWith("/patient/laboratory-messages")) {
      return response(200, [{
        id: messageId,
        labOrderId: "order-test",
        direction: "laboratory_to_patient",
        content: "Your result is ready.",
        readByPatientAt: null,
      }]);
    }
    if (requestPath.endsWith(`/patient/laboratory-messages/${messageId}/reply`)) {
      assert.equal(JSON.parse(String(init?.body)).content, "Thank you.");
      assert.equal(header(init, "X-CSRF-Token"), "laboratory-csrf-1");
      return response(200, { id: "660e8400-e29b-41d4-a716-446655440000", content: "Thank you." });
    }
    if (requestPath.endsWith(`/patient/laboratory-messages/${messageId}/read`)) {
      assert.equal(header(init, "X-CSRF-Token"), "laboratory-csrf-1");
      return response(200, { id: messageId, readByPatientAt: "2026-01-01T00:00:00.000Z" });
    }
    throw new Error(`Unexpected laboratory route: ${requestPath}`);
  };
  const adapter = new NavimediAdapter("navimedi-test", TEST_BASE_URL, fetchImpl);
  adapter.setToken("unit-test-token");

  const messages = await adapter.getLaboratoryMessages();
  assert.equal(messages[0].id, messageId);
  await adapter.replyToLaboratoryMessage(messageId, " Thank you. ");
  await adapter.markLaboratoryMessageRead(messageId);
  assert.deepEqual(calls.map((call) => call.path), [
    "/api/patient/laboratory-messages",
    "/api/csrf-token",
    `/api/patient/laboratory-messages/${messageId}/reply`,
    `/api/patient/laboratory-messages/${messageId}/read`,
  ]);
});

test("production blocks every restricted adapter operation before transport", async () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = mutableEnv.NODE_ENV;
  let requests = 0;
  const adapter = new NavimediAdapter(
    "navimedi-test",
    TEST_BASE_URL,
    async () => {
      requests += 1;
      throw new Error("restricted adapter transport must not run");
    },
  );
  mutableEnv.NODE_ENV = "production";
  try {
    await assert.rejects(adapter.getLaboratoryMessages(), /disabled in production/i);
    await assert.rejects(
      adapter.replyToLaboratoryMessage(
        "550e8400-e29b-41d4-a716-446655440000",
        "reply",
      ),
      /disabled in production/i,
    );
    await assert.rejects(
      adapter.markLaboratoryMessageRead("550e8400-e29b-41d4-a716-446655440000"),
      /disabled in production/i,
    );
    await assert.rejects(adapter.getInsuranceHistory(), /disabled in production/i);
    assert.equal(requests, 0);
  } finally {
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
  }
});

test("rejects laboratory message selectors and blank replies before network access", async () => {
  let requests = 0;
  const adapter = new NavimediAdapter(
    "navimedi-test",
    TEST_BASE_URL,
    async () => {
      requests += 1;
      return response(200, {});
    },
  );
  adapter.setToken("unit-test-token");
  await assert.rejects(adapter.markLaboratoryMessageRead("message-1"), /valid laboratory message ID/i);
  await assert.rejects(
    adapter.replyToLaboratoryMessage("550e8400-e29b-41d4-a716-446655440000", "  "),
    /content must be between/i,
  );
  assert.equal(requests, 0);
});
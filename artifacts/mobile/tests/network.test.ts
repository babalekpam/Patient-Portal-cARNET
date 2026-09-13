import assert from "node:assert/strict";
import test from "node:test";
import {
  type FetchTransport,
  MAX_AUTH_PROFILE_BODY_BYTES,
  MAX_RESPONSE_BODY_BYTES,
  NetworkRequestError,
  RequestCancelledError,
  RequestTimeoutError,
  requestJson,
  requireAuthenticationToken,
  requireJsonObject,
} from "../lib/ehr/network";

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("aborts a fetch that never produces response headers", async () => {
  let sawAbort = false;
  const fetchImpl: FetchTransport = async (_input, init) => {
    init?.signal?.addEventListener("abort", () => { sawAbort = true; }, { once: true });
    return await new Promise<Response>(() => {});
  };

  await assert.rejects(
    requestJson("https://ehr.example.test/auth/login", {}, { fetchImpl, timeoutMs: 5 }),
    (error: unknown) => error instanceof RequestTimeoutError,
  );
  assert.equal(sawAbort, true);
});

test("times out an RN-like response whose text body stalls after headers", async () => {
  let sawAbort = false;
  let startedTextRead = false;
  const stalledResponse = {
    status: 200,
    ok: true,
    body: undefined,
    text: () => {
      startedTextRead = true;
      return new Promise<string>(() => {});
    },
  } as unknown as Response;
  const fetchImpl: FetchTransport = async (_input, init) => {
    init?.signal?.addEventListener("abort", () => { sawAbort = true; }, { once: true });
    return stalledResponse;
  };

  await assert.rejects(
    requestJson("https://ehr.example.test/patient/profile", {}, { fetchImpl, timeoutMs: 5 }),
    (error: unknown) => error instanceof RequestTimeoutError,
  );
  assert.equal(sawAbort, true);
  assert.equal(startedTextRead, true);
});

test("keeps HTTP status while marking oversized or malformed JSON bodies", async () => {
  const largeRecord = await requestJson(
    "https://ehr.example.test/patient/appointments",
    {},
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ records: "x".repeat(128 * 1024) }), { status: 200 }),
    },
  );
  assert.equal((largeRecord.body as { records: string }).records.length, 128 * 1024);

  let oversizedTextRead = false;
  const oversizedProfile = await requestJson(
    "https://ehr.example.test/patient/profile",
    {},
    {
      fetchImpl: async () =>
        ({
          status: 200,
          ok: true,
          body: undefined,
          text: async () => {
            oversizedTextRead = true;
            return "x".repeat(MAX_AUTH_PROFILE_BODY_BYTES + 1);
          },
        }) as unknown as Response,
    },
  );
  assert.equal(oversizedTextRead, true);
  assert.match(oversizedProfile.bodyError?.message ?? "", /invalid response|too large/i);

  const oversized = await requestJson(
    "https://ehr.example.test/patient/appointments",
    {},
    {
      fetchImpl: async () =>
        ({
          status: 401,
          ok: false,
          body: null,
          text: async () => "x".repeat(MAX_RESPONSE_BODY_BYTES + 1),
        }) as unknown as Response,
    },
  );
  assert.equal(oversized.status, 401);
  assert.equal(oversized.body, undefined);
  assert.match(oversized.bodyError?.message ?? "", /invalid response|too large/i);

  const malformed = await requestJson(
    "https://ehr.example.test/auth/login",
    {},
    { fetchImpl: async () => new Response("{not-json", { status: 200 }) },
  );
  assert.equal(malformed.status, 200);
  assert.equal(malformed.body, undefined);
  assert.match(malformed.bodyError?.message ?? "", /invalid response/i);
});

test("decodes a native UTF-8 response body", async () => {
  const result = await requestJson(
    "https://ehr.example.test/patient/appointments",
    {},
    {
      fetchImpl: async () => {
        const nativeResponse = new Response(
          JSON.stringify({ message: "Zażółć gęślą jaźń 🩺" }),
          { status: 200 },
        );
        assert.ok(nativeResponse.body);
        return nativeResponse;
      },
    },
  );
  assert.deepEqual(result.body, { message: "Zażółć gęślą jaźń 🩺" });
});

test("decodes split UTF-8 chunks when TextDecoder is unavailable", async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "TextDecoder");
  Object.defineProperty(globalThis, "TextDecoder", {
    configurable: true,
    enumerable: originalDescriptor?.enumerable ?? true,
    writable: true,
    value: undefined,
  });
  try {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ message: "Zażółć gęślą jaźń 🩺" }),
    );
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + 1));
        offset += 1;
      },
    });
    const result = await requestJson(
      "https://ehr.example.test/patient/appointments",
      {},
      { fetchImpl: async () => new Response(stream, { status: 200 }) },
    );
    assert.deepEqual(result.body, { message: "Zażółć gęślą jaźń 🩺" });
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "TextDecoder", originalDescriptor);
    } else {
      delete (globalThis as { TextDecoder?: unknown }).TextDecoder;
    }
  }
});

test("distinguishes an HTTP 401 from a transport failure", async () => {
  const unauthorized = await requestJson(
    "https://ehr.example.test/auth/login",
    {},
    { fetchImpl: async () => jsonResponse(401, { message: "Invalid credentials." }) },
  );
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(unauthorized.body, { message: "Invalid credentials." });

  await assert.rejects(
    requestJson(
      "https://ehr.example.test/auth/login",
      {},
      {
        fetchImpl: async () => {
          throw new TypeError("socket unavailable");
        },
      },
    ),
    (error: unknown) =>
      error instanceof NetworkRequestError &&
      /Unable to connect/.test(error.message),
  );
});

test("validates authentication tokens and profile objects without exposing response data", async () => {
  const login = await requestJson(
    "https://ehr.example.test/auth/login",
    {},
    { fetchImpl: async () => jsonResponse(200, { token: "unit-test-token", user: {} }) },
  );
  assert.equal(requireAuthenticationToken(login.body), "unit-test-token");
  assert.throws(
    () => requireAuthenticationToken({ user: {} }),
    /valid authentication token/i,
  );

  const profile = await requestJson(
    "https://ehr.example.test/patient/profile",
    {},
    { fetchImpl: async () => jsonResponse(200, { firstName: "Unit", lastName: "Test" }) },
  );
  assert.deepEqual(
    requireJsonObject<{ firstName: string }>(profile.body, "Invalid profile."),
    { firstName: "Unit", lastName: "Test" },
  );
  assert.throws(() => requireJsonObject(null, "Invalid profile."), /Invalid profile/);
});

test("cancels a request through its caller signal", async () => {
  const controller = new AbortController();
  let sawAbort = false;
  const fetchImpl: FetchTransport = async (_input, init) => {
    init?.signal?.addEventListener("abort", () => { sawAbort = true; }, { once: true });
    return await new Promise<Response>(() => {});
  };
  const request = requestJson(
    "https://ehr.example.test/patient/profile",
    { signal: controller.signal },
    { fetchImpl, timeoutMs: 1000 },
  );
  await Promise.resolve();
  controller.abort();

  await assert.rejects(
    request,
    (error: unknown) => error instanceof RequestCancelledError,
  );
  assert.equal(sawAbort, true);
});
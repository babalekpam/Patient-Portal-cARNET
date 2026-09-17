import assert from "node:assert/strict";
import test from "node:test";
import { api } from "../lib/api";

const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = mutableEnv.NODE_ENV;

test.afterEach(() => {
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = originalNodeEnv;
});

test("production blocks every restricted API fallback operation before fetch", async () => {
  mutableEnv.NODE_ENV = "production";
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error("restricted API transport must not run");
  };
  try {
    await assert.rejects(api.getLaboratoryMessages(), /disabled in production/i);
    await assert.rejects(
      api.replyToLaboratoryMessage(
        "550e8400-e29b-41d4-a716-446655440000",
        "reply",
      ),
      /disabled in production/i,
    );
    await assert.rejects(
      api.markLaboratoryMessageRead("550e8400-e29b-41d4-a716-446655440000"),
      /disabled in production/i,
    );
    await assert.rejects(api.getInsuranceHistory(), /disabled in production/i);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
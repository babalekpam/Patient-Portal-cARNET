import assert from "node:assert/strict";
import test from "node:test";
import {
  getNavimediWebRelayUpstreamBaseUrl,
  getNavimediNativeApiBaseUrl,
  isNavimediNativeApiOverrideActive,
  NAVIMEDI_API_BASE_URL,
  TEMPORARY_HANDOFF_RELAY_UPSTREAM,
  resolveNavimediNativeBaseUrl,
} from "../lib/ehr/navimediConfig";

const OVERRIDE_KEY = "EXPO_PUBLIC_CARNET_NAVIMEDI_NATIVE_API_BASE_URL";
const RELAY_OVERRIDE_KEY = "EXPO_PUBLIC_CARNET_NAVIMEDI_RELAY_UPSTREAM_URL";
const originalNodeEnv = process.env.NODE_ENV;
const originalOverride = process.env[OVERRIDE_KEY];
const originalRelayOverride = process.env[RELAY_OVERRIDE_KEY];
const mutableEnv = process.env as Record<string, string | undefined>;

function restoreEnvironment(): void {
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = originalNodeEnv;
  if (originalOverride === undefined) delete process.env[OVERRIDE_KEY];
  else process.env[OVERRIDE_KEY] = originalOverride;
  if (originalRelayOverride === undefined) delete process.env[RELAY_OVERRIDE_KEY];
  else process.env[RELAY_OVERRIDE_KEY] = originalRelayOverride;
}

test.afterEach(restoreEnvironment);

test("uses production NaviMED native API by default", () => {
  delete process.env[OVERRIDE_KEY];
  mutableEnv.NODE_ENV = "development";
  assert.equal(getNavimediNativeApiBaseUrl(), NAVIMEDI_API_BASE_URL);
  assert.equal(isNavimediNativeApiOverrideActive(), false);
});

test("accepts and normalizes only a development HTTPS /api override", () => {
  mutableEnv.NODE_ENV = "development";
  process.env[OVERRIDE_KEY] =
    "https://942dd837-7012-47ef-8574-574ac5ab89f8-00-2gel21gszwmqv.picard.replit.dev/api/";
  assert.equal(
    getNavimediNativeApiBaseUrl(),
    "https://942dd837-7012-47ef-8574-574ac5ab89f8-00-2gel21gszwmqv.picard.replit.dev/api",
  );
  assert.equal(isNavimediNativeApiOverrideActive(), true);
});

test("rejects invalid or production native overrides", () => {
  mutableEnv.NODE_ENV = "development";
  for (const value of [
    "http://temporary.example/api",
    "https://temporary.example/not-api",
    "https://temporary.example/api?patient=other",
    "https://user:password@temporary.example/api",
  ]) {
    process.env[OVERRIDE_KEY] = value;
    assert.throws(() => getNavimediNativeApiBaseUrl(), /valid HTTPS URL ending in \/api/i);
  }

  process.env[OVERRIDE_KEY] =
    "https://942dd837-7012-47ef-8574-574ac5ab89f8-00-2gel21gszwmqv.picard.replit.dev/api";
  mutableEnv.NODE_ENV = "production";
  assert.throws(() => getNavimediNativeApiBaseUrl(), /development-only/i);
});

test("does not redirect explicitly configured non-production providers", () => {
  mutableEnv.NODE_ENV = "development";
  process.env[OVERRIDE_KEY] = "https://temporary.example/api";
  assert.equal(
    resolveNavimediNativeBaseUrl("https://custom.example/api"),
    "https://custom.example/api",
  );
});

test("binds web relay identity to the fixed upstream and restores on switch", () => {
  delete process.env[RELAY_OVERRIDE_KEY];
  mutableEnv.NODE_ENV = "development";
  assert.equal(getNavimediWebRelayUpstreamBaseUrl(), NAVIMEDI_API_BASE_URL);

  process.env[RELAY_OVERRIDE_KEY] = `${TEMPORARY_HANDOFF_RELAY_UPSTREAM}/`;
  assert.equal(
    getNavimediWebRelayUpstreamBaseUrl(),
    TEMPORARY_HANDOFF_RELAY_UPSTREAM,
  );

  delete process.env[RELAY_OVERRIDE_KEY];
  assert.equal(getNavimediWebRelayUpstreamBaseUrl(), NAVIMEDI_API_BASE_URL);
});
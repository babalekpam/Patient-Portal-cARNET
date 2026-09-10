import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  cappedExpiry,
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
  sessionValidity,
  isStaleGeneration,
  type SessionRecord,
} from "../lib/sessionCore";
import { fhirPatientReference, requireFhirPatientContext } from "../lib/sessionFHIR";

const NOW = 1_700_000_000_000;

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    version: 2,
    issuedAt: NOW,
    expiresAt: NOW + SESSION_MAX_MS,
    lastActivityAt: NOW,
    sessionKey: "provider-a|https://a.example/fhir",
    ...overrides,
  };
}

test("caps every local session at fifteen minutes", () => {
  assert.equal(cappedExpiry(NOW, null), NOW + SESSION_MAX_MS);
  assert.equal(cappedExpiry(NOW, NOW + 60 * SESSION_MAX_MS), NOW + SESSION_MAX_MS);
});

test("honors a trustworthy earlier server expiration", () => {
  assert.equal(cappedExpiry(NOW, NOW + 30_000), NOW + 30_000);
  assert.equal(cappedExpiry(NOW, NOW - 1), NOW);
});

test("expires at five minutes without activity", () => {
  const issuer = "provider-a|https://a.example/fhir";
  assert.equal(sessionValidity(record(), issuer, NOW + SESSION_IDLE_MS), "inactive");
  assert.equal(sessionValidity(record(), issuer, NOW + SESSION_IDLE_MS - 1), "valid");
});

test("rejects a changed issuer under the same provider id and malformed metadata", () => {
  assert.equal(sessionValidity(record(), "provider-a|https://changed.example/fhir", NOW + 1), "invalid");
  assert.equal(
    sessionValidity(record({ expiresAt: NOW + SESSION_MAX_MS + 1 }), "provider-a|https://a.example/fhir", NOW + 1),
    "invalid",
  );
});

test("absolute expiration wins even after recent activity", () => {
  const expired = record({
    expiresAt: NOW + 10_000,
    lastActivityAt: NOW + 9_999,
  });
  assert.equal(sessionValidity(expired, "provider-a|https://a.example/fhir", NOW + 10_000), "expired");
});

test("same-provider responses are stale after a session generation changes", () => {
  const requestFromPatientA = 7;
  const currentPatientB = 9;
  assert.equal(isStaleGeneration(requestFromPatientA, currentPatientB), true);
  assert.equal(isStaleGeneration(currentPatientB, currentPatientB), false);
});

test("a stale unauthorized response must not be handled for the current session", () => {
  const shouldHandleUnauthorized = (request: number, current: number) =>
    !isStaleGeneration(request, current);
  assert.equal(shouldHandleUnauthorized(3, 4), false);
  assert.equal(shouldHandleUnauthorized(4, 4), true);
});

test("cleanup completion is awaited before a replacement login starts", async () => {
  let releaseCleanup!: () => void;
  const cleanup = new Promise<void>((resolve) => { releaseCleanup = resolve; });
  const events: string[] = [];
  const login = (async () => {
    events.push("waiting");
    await cleanup;
    events.push("login");
  })();
  await Promise.resolve();
  assert.deepEqual(events, ["waiting"]);
  releaseCleanup();
  await login;
  assert.deepEqual(events, ["waiting", "login"]);
});

test("FHIR login requires explicit safe server-issued patient context", () => {
  assert.throws(() => requireFhirPatientContext({ access_token: "token" }), /patient context/);
  assert.throws(() => requireFhirPatientContext({ patient: "../Patient/other" }), /patient context/);
  assert.equal(requireFhirPatientContext({ patient: "patient-123.abc" }), "patient-123.abc");
  assert.equal(fhirPatientReference("patient-123.abc"), "Patient/patient-123.abc");
});

test("FHIR adapter never performs unqualified patient discovery", () => {
  const adapterSource = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../lib/ehr/adapters/fhir.ts"),
    "utf8",
  );
  assert.doesNotMatch(adapterSource, /\/Patient\?(?:[^"'`]*)_count/);
  const loginBody = adapterSource.slice(
    adapterSource.indexOf("async login("),
    adapterSource.indexOf("async forgotPassword("),
  );
  assert.doesNotMatch(loginBody, /this\.(?:token|patientId)\s*=/);
});

test("crossed logins commit only the latest token and patient context", async () => {
  let operation = 1;
  const adapter = { token: "", patient: "" };
  let releaseA!: () => void;
  const responseA = new Promise<{ token: string; patient: string }>((resolve) => {
    releaseA = () => resolve({ token: "token-a", patient: "patient-a" });
  });
  const commit = async (
    id: number,
    response: Promise<{ token: string; patient: string }>,
  ) => {
    const value = await response;
    if (id !== operation) return;
    adapter.token = value.token;
    adapter.patient = requireFhirPatientContext(value);
  };
  const loginA = commit(1, responseA);
  operation = 2;
  await commit(2, Promise.resolve({ token: "token-b", patient: "patient-b" }));
  releaseA();
  await loginA;
  assert.deepEqual(adapter, { token: "token-b", patient: "patient-b" });
});
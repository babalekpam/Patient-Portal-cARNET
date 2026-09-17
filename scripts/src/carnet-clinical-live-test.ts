/**
 * Focused development-only clinical integration harness.
 *
 * This is intentionally separate from the read-only handoff harness. It uses
 * only retained NaviMED credentials/fixture records, performs the explicitly
 * authorized patient reply/read mutations, and never creates or cleans up
 * clinical fixture data. Output is limited to fixed stage/code assertions.
 */

import * as mobileNetworkModule from "../../artifacts/mobile/lib/ehr/network";
import type { PatientLoginResponse } from "../../artifacts/mobile/lib/ehr/network";
import {
  RELAY_EXPECTED_ISSUER_HEADER,
  TEMPORARY_HANDOFF_RELAY_UPSTREAM,
} from "../../artifacts/api-server/src/lib/relay-upstream";
import { NAVIMEDI_RELAY_PREFIX } from "../../artifacts/api-server/src/lib/relay-policy";
import {
  type ClinicalRecordReferences,
  type FixtureExpectation,
  type JsonRecord,
  type PatientRole,
  FixtureSchemaError,
  clinicalRecordReferences,
  findCredentialRecord,
  fixtureRecord,
  isNonEmptyString,
  isRecord,
  stringValue,
} from "./carnet-live-test-fixtures";

const mobileNetwork = (
  (mobileNetworkModule as unknown as { default?: typeof mobileNetworkModule }).default ??
  mobileNetworkModule
) as typeof mobileNetworkModule;

const CREDENTIALS_ENV = "CARNET_TEST_CREDENTIALS_JSON";
const FIXTURE_ENV = "CARNET_TEST_FIXTURE_JSON";
const RECORD_REFERENCES_ENV = "CARNET_TEST_RECORD_REFERENCES_JSON";
const MAX_ENV_BYTES = 1_000_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_AUTH_ATTEMPTS = 50;
const MAX_RATE_LIMIT_WAIT_MS = 60_000;
const SYNTHETIC_REPLY =
  "Synthetic diagnostic verification: please confirm the released laboratory result.";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TargetMode = "direct" | "relay";
type RequestedRole = "full" | "a2";
type Stage =
  | "config"
  | "credentials"
  | "fixture"
  | "preauth"
  | "login"
  | "profile"
  | "messages"
  | "results"
  | "cross_patient"
  | "read"
  | "reply"
  | "logout"
  | "cleanup";
type FailureCode =
  | "ENV_MISSING"
  | "ENV_TOO_LARGE"
  | "ENV_INVALID_JSON"
  | "SCHEMA_INVALID"
  | "REQUEST_FAILED"
  | "RATE_LIMITED"
  | "HTTP_STATUS"
  | "BODY_INVALID"
  | "IDENTITY_INVALID"
  | "IDENTITY_MISMATCH"
  | "FIXTURE_RECORD_MISSING"
  | "FIXTURE_OWNERSHIP_AMBIGUOUS"
  | "MESSAGE_MISSING"
  | "RESULT_MISSING"
  | "PENDING_ORDER_EXPOSED"
  | "READ_STATE_MISSING"
  | "READ_STATE_NOT_PERSISTED"
  | "REPLY_NOT_PERSISTED"
  | "CROSS_PATIENT_ALLOWED"
  | "CLEANUP_FAILED";

interface TargetConfig {
  mode: TargetMode;
  baseUrl: string;
  issuer?: string;
}

interface RequestResult {
  response: Response;
  body: unknown;
  cookie: string;
}

interface PreparedRole {
  fixture: FixtureExpectation;
  references: ClinicalRecordReferences;
  loginBody: JsonRecord;
}

interface Session {
  role: PatientRole;
  fixture: FixtureExpectation;
  cookie: string;
  token: string;
  tokenRevoked: boolean;
  login?: PatientLoginResponse;
}

interface RunOptions {
  role: RequestedRole;
  target: TargetConfig;
}

class HarnessFailure extends Error {
  readonly stage: Stage;
  readonly code: FailureCode;

  constructor(stage: Stage, code: FailureCode) {
    super(`${stage}:${code}`);
    this.name = "HarnessFailure";
    this.stage = stage;
    this.code = code;
  }
}

let currentStage: Stage = "config";
let activeTarget: TargetConfig | undefined;
let assertionCount = 0;
let authAttemptCount = 0;

function fail(stage: Stage, code: FailureCode): never {
  currentStage = stage;
  throw new HarnessFailure(stage, code);
}

function verify(condition: boolean, stage: Stage, code: FailureCode): void {
  if (!condition) fail(stage, code);
  assertionCount += 1;
}

function parseJsonEnv(name: string, stage: Stage): unknown {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) fail(stage, "ENV_MISSING");
  if (Buffer.byteLength(raw, "utf8") > MAX_ENV_BYTES) fail(stage, "ENV_TOO_LARGE");
  try {
    return JSON.parse(raw);
  } catch {
    fail(stage, "ENV_INVALID_JSON");
  }
}

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  const next = index === -1 ? undefined : process.argv[index + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

function parseRunOptions(): RunOptions {
  const role = argumentValue("--role")?.toLowerCase() || "full";
  if (role !== "full" && role !== "a2") fail("config", "SCHEMA_INVALID");
  const target = argumentValue("--target")?.toLowerCase();
  if (target !== "direct" && target !== "relay") fail("config", "SCHEMA_INVALID");
  if (target === "direct") {
    return {
      role,
      target: {
        mode: "direct",
        baseUrl: TEMPORARY_HANDOFF_RELAY_UPSTREAM,
      },
    };
  }

  const relayDomain = process.env.REPLIT_DEV_DOMAIN;
  if (!isNonEmptyString(relayDomain)) fail("config", "SCHEMA_INVALID");
  const normalizedDomain = relayDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (
    !normalizedDomain ||
    normalizedDomain.includes("/") ||
    normalizedDomain.includes("@") ||
    (!normalizedDomain.endsWith(".replit.dev") && !normalizedDomain.endsWith(".repl.co"))
  ) {
    fail("config", "SCHEMA_INVALID");
  }
  return {
    role,
    target: {
      mode: "relay",
      baseUrl: `https://${normalizedDomain}${NAVIMEDI_RELAY_PREFIX}`,
      issuer: TEMPORARY_HANDOFF_RELAY_UPSTREAM,
    },
  };
}

function cookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie") || ""];
  return values
    .flatMap((value) => value.split(/,(?=[^;,]+=)/))
    .map((value) => value.trim().split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
}

function mergeCookies(previous: string, response: Response): string {
  const merged = new Map<string, string>();
  for (const cookie of previous.split(";")) {
    const [name, ...rest] = cookie.trim().split("=");
    if (name && rest.length) merged.set(name, `${name}=${rest.join("=")}`);
  }
  for (const cookie of cookieHeader(response).split(";")) {
    const [name, ...rest] = cookie.trim().split("=");
    if (name && rest.length) merged.set(name, `${name}=${rest.join("=")}`);
  }
  return [...merged.values()].join("; ");
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("response body exceeded harness limit");
  }
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("server returned a non-JSON response");
  }
}

async function request(
  path: string,
  options: {
    method?: string;
    token?: string;
    csrf?: string;
    cookie?: string;
    body?: unknown;
  } = {},
): Promise<RequestResult> {
  if (!activeTarget) fail("config", "SCHEMA_INVALID");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.csrf) headers["X-CSRF-Token"] = options.csrf;
  if (options.cookie) headers.Cookie = options.cookie;
  if (activeTarget.issuer) headers[RELAY_EXPECTED_ISSUER_HEADER] = activeTarget.issuer;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${activeTarget.baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    return {
      response,
      body: await readJson(response),
      cookie: mergeCookies(options.cookie || "", response),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestAt(
  stage: Stage,
  path: string,
  options: {
    method?: string;
    token?: string;
    csrf?: string;
    cookie?: string;
    body?: unknown;
  } = {},
): Promise<RequestResult> {
  currentStage = stage;
  try {
    const result = await request(path, options);
    if (result.response.status === 429) {
      const retryAfter = result.response.headers.get("retry-after");
      let waitMs = 60_000;
      if (retryAfter && /^\d+$/.test(retryAfter.trim())) {
        waitMs = Number(retryAfter.trim()) * 1_000;
      } else if (retryAfter) {
        const retryAt = Date.parse(retryAfter);
        if (Number.isFinite(retryAt)) waitMs = Math.max(0, retryAt - Date.now());
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(Math.max(waitMs, 0), MAX_RATE_LIMIT_WAIT_MS)),
      );
      // A cooldown never retries or bypasses the upstream rate limit.
      fail(stage, "RATE_LIMITED");
    }
    return result;
  } catch (error) {
    if (error instanceof HarnessFailure) throw error;
    fail(stage, "REQUEST_FAILED");
  }
}

function expectStatus(
  result: RequestResult,
  stage: Stage,
  statuses: readonly number[],
): void {
  if (result.response.status === 429) fail(stage, "RATE_LIMITED");
  verify(statuses.includes(result.response.status), stage, "HTTP_STATUS");
}

function csrfToken(body: unknown, stage: Stage): string {
  const token = isRecord(body) ? body.csrfToken : undefined;
  if (!isNonEmptyString(token)) fail(stage, "BODY_INVALID");
  return token;
}

function issuedToken(body: unknown): string {
  const token = isRecord(body) ? body.token : undefined;
  if (!isNonEmptyString(token)) fail("login", "IDENTITY_INVALID");
  return token;
}

function prepareRole(
  role: PatientRole,
  credentialsValue: unknown,
  fixtureValue: unknown,
  referencesValue: unknown,
): PreparedRole {
  let credential;
  try {
    credential = findCredentialRecord(credentialsValue, role);
  } catch (error) {
    if (error instanceof FixtureSchemaError) fail("credentials", "SCHEMA_INVALID");
    throw error;
  }
  let fixture: FixtureExpectation;
  try {
    fixture = fixtureRecord(fixtureValue, credential, role);
  } catch (error) {
    if (error instanceof FixtureSchemaError) fail("fixture", "SCHEMA_INVALID");
    throw error;
  }
  let references: ClinicalRecordReferences;
  try {
    references = clinicalRecordReferences(referencesValue, role);
  } catch (error) {
    if (error instanceof FixtureSchemaError) fail("fixture", "SCHEMA_INVALID");
    throw error;
  }
  verify(
    references.owner.patientId === fixture.identity.patientId &&
      references.owner.tenantId === fixture.identity.tenantId,
    "fixture",
    "IDENTITY_MISMATCH",
  );
  verify(
    role === "A2" ? !references.hasResultReference : references.hasResultReference,
    "fixture",
    "FIXTURE_RECORD_MISSING",
  );
  fixture = {
    ...fixture,
    labOrderId: references.labOrderId,
    messageId: references.messageId,
    resultIds: references.releasedResultIds,
  };

  const email = stringValue(credential.record, "email");
  const password = credential.record.password;
  if (!email || typeof password !== "string" || password.length === 0) {
    fail("credentials", "SCHEMA_INVALID");
  }
  const loginBody: JsonRecord = { email, password };
  for (const key of ["tenantId", "mfaCode"]) {
    const optional = credential.record[key];
    if (typeof optional === "string" && optional.length > 0) loginBody[key] = optional;
  }
  return { fixture, references, loginBody };
}

function requireClinicalMarker(
  role: PatientRole,
  fixture: FixtureExpectation,
  needsMessage: boolean,
  needsResult: boolean,
  needsOrder: boolean,
): void {
  if (needsMessage && (!fixture.messageId || !UUID_PATTERN.test(fixture.messageId))) {
    fail("fixture", "FIXTURE_RECORD_MISSING");
  }
  if (needsResult && fixture.resultIds.length === 0) {
    fail("fixture", "FIXTURE_RECORD_MISSING");
  }
  if (needsOrder && (!fixture.labOrderId || !isNonEmptyString(fixture.labOrderId))) {
    fail("fixture", "FIXTURE_RECORD_MISSING");
  }
  if (fixture.messageId && !UUID_PATTERN.test(fixture.messageId)) {
    fail("fixture", "FIXTURE_OWNERSHIP_AMBIGUOUS");
  }
  if (fixture.resultIds.some((id) => !isNonEmptyString(id))) {
    fail("fixture", "FIXTURE_OWNERSHIP_AMBIGUOUS");
  }
  void role;
}

function ensureDistinctMarkers(
  a1: FixtureExpectation,
  a2: FixtureExpectation,
  b1: FixtureExpectation,
): void {
  const a1Ids = [a1.labOrderId, a1.messageId, ...a1.resultIds].filter(
    (id): id is string => id !== undefined,
  );
  const a2Ids = [a2.labOrderId, a2.messageId, ...a2.resultIds].filter(
    (id): id is string => id !== undefined,
  );
  const b1Ids = [b1.labOrderId, b1.messageId, ...b1.resultIds].filter(
    (id): id is string => id !== undefined,
  );
  verify(new Set(a1Ids).size === a1Ids.length, "fixture", "FIXTURE_OWNERSHIP_AMBIGUOUS");
  verify(new Set(a2Ids).size === a2Ids.length, "fixture", "FIXTURE_OWNERSHIP_AMBIGUOUS");
  verify(new Set(b1Ids).size === b1Ids.length, "fixture", "FIXTURE_OWNERSHIP_AMBIGUOUS");
  verify(!a1Ids.some((id) => a2Ids.includes(id)), "fixture", "FIXTURE_OWNERSHIP_AMBIGUOUS");
  verify(!a1Ids.some((id) => b1Ids.includes(id)), "fixture", "FIXTURE_OWNERSHIP_AMBIGUOUS");
  verify(!a2Ids.some((id) => b1Ids.includes(id)), "fixture", "FIXTURE_OWNERSHIP_AMBIGUOUS");
}

function assertA2PendingOrderExclusion(
  messages: JsonRecord[],
  results: JsonRecord[],
  fixture: FixtureExpectation,
): void {
  if (!fixture.labOrderId) fail("fixture", "FIXTURE_RECORD_MISSING");
  verify(
    !results.some((result) => orderIdentifier(result, "results") === fixture.labOrderId),
    "results",
    "PENDING_ORDER_EXPOSED",
  );
  // A2's supplied private reference is the pending-order evidence. Messages
  // are not an order-presence oracle and may legitimately be empty.
  verify(results.length === 0, "results", "PENDING_ORDER_EXPOSED");
  void messages;
}

function runSyntheticReferenceRegression(): void {
  const envelope = {
    A1: {
      owner: { patientId: "synthetic-patient-a1", tenantId: "synthetic-tenant-a" },
      orderId: "synthetic-order-a1",
      messageId: "synthetic-message-a1",
      releasedResultIds: ["synthetic-result-a1"],
    },
    A2: {
      owner: { patientId: "synthetic-patient-a2", tenantId: "synthetic-tenant-a" },
      orderId: "synthetic-order-a2",
      resultIds: [],
    },
    B1: {
      owner: { patientId: "synthetic-patient-b1", tenantId: "synthetic-tenant-b" },
      orderId: "synthetic-order-b1",
      messageId: "synthetic-message-b1",
      releasedResultIds: ["synthetic-result-b1"],
    },
  };
  try {
    const a1 = clinicalRecordReferences(envelope, "A1");
    const a2 = clinicalRecordReferences(envelope, "A2");
    const b1 = clinicalRecordReferences(envelope, "B1");
    assertA2PendingOrderExclusion([], [], {
      identity: { patientId: "synthetic-patient-a2", tenantId: "synthetic-tenant-a" },
      labOrderId: "synthetic-order-a2",
      resultIds: [],
    });
    verify(
      a1.owner.patientId === "synthetic-patient-a1" &&
        a1.labOrderId === "synthetic-order-a1" &&
        a1.messageId === "synthetic-message-a1" &&
        a1.releasedResultIds[0] === "synthetic-result-a1" &&
        a2.owner.patientId === "synthetic-patient-a2" &&
        a2.labOrderId === "synthetic-order-a2" &&
        !a2.hasResultReference &&
        b1.owner.patientId === "synthetic-patient-b1" &&
        b1.releasedResultIds[0] === "synthetic-result-b1",
      "fixture",
      "SCHEMA_INVALID",
    );
    let rejectedAmbiguousOwner = false;
    try {
      clinicalRecordReferences(
        {
          A1: {
            owner: { patientId: "synthetic-patient-a1", tenantId: "synthetic-tenant-a" },
            orderId: "synthetic-order-a1",
            pendingOrderId: "synthetic-order-a1-alternate",
          },
          B1: {
            owner: { patientId: "synthetic-patient-b1", tenantId: "synthetic-tenant-b" },
            orderId: "synthetic-order-b1",
          },
        },
        "A1",
      );
    } catch {
      rejectedAmbiguousOwner = true;
    }
    verify(rejectedAmbiguousOwner, "fixture", "SCHEMA_INVALID");
  } catch (error) {
    if (error instanceof HarnessFailure) throw error;
    fail("fixture", "SCHEMA_INVALID");
  }
}

async function establishSession(
  options: RunOptions,
  role: PatientRole,
  prepared: PreparedRole,
): Promise<Session> {
  const session: Session = {
    role,
    fixture: prepared.fixture,
    cookie: "",
    token: "",
    tokenRevoked: false,
  };
  try {
    let preauthCsrf = "";
    if (options.target.mode === "direct") {
      const preauth = await requestAt("preauth", "/csrf-token");
      session.cookie = preauth.cookie;
      expectStatus(preauth, "preauth", [200]);
      preauthCsrf = csrfToken(preauth.body, "preauth");
    }

    authAttemptCount += 1;
    if (authAttemptCount > MAX_AUTH_ATTEMPTS) fail("login", "RATE_LIMITED");
    const login = await requestAt("login", "/auth/patient-login", {
      method: "POST",
      ...(preauthCsrf ? { csrf: preauthCsrf } : {}),
      cookie: session.cookie,
      body: prepared.loginBody,
    });
    session.cookie = login.cookie;
    // Capture a bounded bearer before strict response validation so malformed
    // successful responses still enter the isolated revocation path.
    session.token = isNonEmptyString(isRecord(login.body) ? login.body.token : undefined)
      ? (login.body as JsonRecord).token as string
      : "";
    expectStatus(login, "login", [200]);
    if (!session.token) fail("login", "IDENTITY_INVALID");
    try {
      session.login = mobileNetwork.requirePatientLoginResponse(login.body);
    } catch {
      fail("login", "IDENTITY_INVALID");
    }
    session.token = session.login.token;
    verify(
      session.login.patient.id === prepared.fixture.identity.patientId,
      "login",
      "IDENTITY_MISMATCH",
    );
    verify(
      session.login.patient.tenantId === prepared.fixture.identity.tenantId &&
        session.login.user.tenantId === prepared.fixture.identity.tenantId,
      "login",
      "IDENTITY_MISMATCH",
    );

    const profile = await requestAt("profile", "/patient/profile", {
      token: session.token,
      cookie: session.cookie,
    });
    session.cookie = profile.cookie;
    expectStatus(profile, "profile", [200]);
    try {
      mobileNetwork.requireMatchingPatientProfile(profile.body, session.login);
    } catch {
      fail("profile", "IDENTITY_INVALID");
    }
    assertionCount += 1;
    return session;
  } catch (error) {
    if (session.token && !session.tokenRevoked) {
      try {
        await revokeSession(session);
      } catch {
        fail("cleanup", "CLEANUP_FAILED");
      }
    }
    throw error;
  }
}

function messageIdentifier(record: JsonRecord, stage: Stage): string | undefined {
  const values: string[] = [];
  for (const key of ["id", "messageId"]) {
    if (!(key in record)) continue;
    const value = record[key];
    if (!isNonEmptyString(value)) fail(stage, "BODY_INVALID");
    values.push(value);
  }
  const unique = [...new Set(values)];
  if (unique.length > 1) fail(stage, "BODY_INVALID");
  return unique[0];
}

function resultIdentifier(record: JsonRecord, stage: Stage): string | undefined {
  const values: string[] = [];
  for (const key of ["id", "resultId"]) {
    if (!(key in record)) continue;
    const value = record[key];
    if (!isNonEmptyString(value)) fail(stage, "BODY_INVALID");
    values.push(value);
  }
  const unique = [...new Set(values)];
  if (unique.length > 1) fail(stage, "BODY_INVALID");
  return unique[0];
}

function orderIdentifier(record: JsonRecord, stage: Stage): string | undefined {
  const values: string[] = [];
  for (const key of [
    "labOrderId",
    "laboratoryOrderId",
    "orderId",
    "lab_order_id",
    "laboratory_order_id",
    "order_id",
  ]) {
    if (!(key in record)) continue;
    const value = record[key];
    if (!isNonEmptyString(value)) fail(stage, "BODY_INVALID");
    values.push(value);
  }
  for (const key of ["order", "labOrder", "laboratoryOrder", "laboratory_order"]) {
    const nested = record[key];
    if (!isRecord(nested)) continue;
    for (const idKey of ["id", "labOrderId", "laboratoryOrderId", "orderId"]) {
      if (!(idKey in nested)) continue;
      if (!isNonEmptyString(nested[idKey])) fail(stage, "BODY_INVALID");
      values.push(nested[idKey]);
    }
  }
  const unique = [...new Set(values)];
  if (unique.length > 1) fail(stage, "BODY_INVALID");
  return unique[0];
}

function assertScopedIdentity(
  record: JsonRecord,
  fixture: FixtureExpectation,
  stage: Stage,
): void {
  for (const key of ["patientId", "patientRecordId", "patient_id"]) {
    if (!(key in record)) continue;
    if (!isNonEmptyString(record[key])) fail(stage, "BODY_INVALID");
    verify(record[key] === fixture.identity.patientId, stage, "IDENTITY_MISMATCH");
  }
  for (const key of ["tenantId", "patientTenantId", "patient_tenant_id"]) {
    if (!(key in record)) continue;
    if (!isNonEmptyString(record[key])) fail(stage, "BODY_INVALID");
    verify(record[key] === fixture.identity.tenantId, stage, "IDENTITY_MISMATCH");
  }
}

function readState(record: JsonRecord, stage: Stage): "read" | "unread" {
  for (const key of ["readByPatientAt", "patientReadAt", "readAt"]) {
    if (!(key in record)) continue;
    if (record[key] === null) return "unread";
    if (isNonEmptyString(record[key])) return "read";
    fail(stage, "READ_STATE_MISSING");
  }
  for (const key of ["readByPatient", "patientRead", "isRead", "read"]) {
    if (!(key in record)) continue;
    if (typeof record[key] !== "boolean") fail(stage, "READ_STATE_MISSING");
    return record[key] ? "read" : "unread";
  }
  fail(stage, "READ_STATE_MISSING");
}

function findMessage(
  messages: JsonRecord[],
  id: string,
  stage: Stage,
): JsonRecord {
  const match = messages.find((record) => messageIdentifier(record, stage) === id);
  if (!match) fail(stage, "MESSAGE_MISSING");
  return match;
}

function requireArrayBody(body: unknown, stage: Stage): JsonRecord[] {
  if (!Array.isArray(body) || !body.every(isRecord)) fail(stage, "BODY_INVALID");
  return body;
}

function containsExactReply(value: unknown, orderId: string | undefined): boolean {
  const visit = (current: unknown, depth: number): boolean => {
    if (depth > 8) return false;
    if (typeof current === "string") return current === SYNTHETIC_REPLY;
    if (Array.isArray(current)) return current.some((child) => visit(child, depth + 1));
    if (!isRecord(current)) return false;
    if (orderId && orderIdentifier(current, "reply") !== undefined) {
      if (orderIdentifier(current, "reply") !== orderId) return false;
    }
    return Object.values(current).some((child) => visit(child, depth + 1));
  };
  return visit(value, 0);
}

async function listMessages(session: Session): Promise<JsonRecord[]> {
  const response = await requestAt("messages", "/patient/laboratory-messages", {
    token: session.token,
    cookie: session.cookie,
  });
  session.cookie = response.cookie;
  expectStatus(response, "messages", [200]);
  const messages = requireArrayBody(response.body, "messages");
  for (const message of messages) assertScopedIdentity(message, session.fixture, "messages");
  return messages;
}

async function listResults(session: Session): Promise<JsonRecord[]> {
  const response = await requestAt("results", "/patient/lab-results", {
    token: session.token,
    cookie: session.cookie,
  });
  session.cookie = response.cookie;
  expectStatus(response, "results", [200]);
  const results = requireArrayBody(response.body, "results");
  for (const result of results) assertScopedIdentity(result, session.fixture, "results");
  return results;
}

function assertOwnClinicalData(
  role: PatientRole,
  messages: JsonRecord[],
  results: JsonRecord[],
  fixture: FixtureExpectation,
  foreignFixture: FixtureExpectation,
): void {
  if (!fixture.messageId || !fixture.resultIds.length) {
    fail("fixture", "FIXTURE_RECORD_MISSING");
  }
  const ownMessage = findMessage(messages, fixture.messageId, "messages");
  verify(
    fixture.labOrderId !== undefined &&
      orderIdentifier(ownMessage, "messages") === fixture.labOrderId,
    "messages",
    "FIXTURE_OWNERSHIP_AMBIGUOUS",
  );
  verify(
    !messages.some(
      (message) =>
        foreignFixture.messageId !== undefined &&
        messageIdentifier(message, "messages") === foreignFixture.messageId,
    ),
    "messages",
    "CROSS_PATIENT_ALLOWED",
  );

  const returnedResultIds = results
    .map((result) => resultIdentifier(result, "results"))
    .filter((id): id is string => id !== undefined);
  for (const resultId of fixture.resultIds) {
    const result = results.find((candidate) => resultIdentifier(candidate, "results") === resultId);
    verify(Boolean(result), "results", "RESULT_MISSING");
    if (result) {
      verify(pendingResultState(result) === "released", "results", "RESULT_MISSING");
    }
  }
  verify(
    !returnedResultIds.some((id) => foreignFixture.resultIds.includes(id)),
    "results",
    "CROSS_PATIENT_ALLOWED",
  );
  verify(
    returnedResultIds.every((id) => !foreignFixture.resultIds.includes(id)),
    "results",
    "CROSS_PATIENT_ALLOWED",
  );
  void role;
}

async function csrfForSession(session: Session): Promise<string> {
  const response = await requestAt("read", "/csrf-token", {
    token: session.token,
    cookie: session.cookie,
  });
  session.cookie = response.cookie;
  expectStatus(response, "read", [200]);
  return csrfToken(response.body, "read");
}

async function expectCrossPatientRejected(
  session: Session,
  foreignFixture: FixtureExpectation,
): Promise<void> {
  if (!foreignFixture.messageId) fail("fixture", "FIXTURE_RECORD_MISSING");
  const before = await listMessages(session);
  const beforeOwn = session.fixture.messageId
    ? findMessage(before, session.fixture.messageId, "cross_patient")
    : undefined;
  const beforeSnapshot = beforeOwn ? JSON.stringify(beforeOwn) : "";
  const csrf = await csrfForSession(session);
  const path = `/patient/laboratory-messages/${encodeURIComponent(foreignFixture.messageId)}`;
  const read = await requestAt("cross_patient", `${path}/read`, {
    method: "POST",
    token: session.token,
    csrf,
    cookie: session.cookie,
  });
  session.cookie = read.cookie;
  verify(
    [401, 403, 404].includes(read.response.status),
    "cross_patient",
    "CROSS_PATIENT_ALLOWED",
  );

  const reply = await requestAt("cross_patient", `${path}/reply`, {
    method: "POST",
    token: session.token,
    csrf,
    cookie: session.cookie,
    body: { content: SYNTHETIC_REPLY },
  });
  session.cookie = reply.cookie;
  verify(
    [401, 403, 404].includes(reply.response.status),
    "cross_patient",
    "CROSS_PATIENT_ALLOWED",
  );
  const after = await listMessages(session);
  const afterOwn = session.fixture.messageId
    ? findMessage(after, session.fixture.messageId, "cross_patient")
    : undefined;
  verify(
    beforeSnapshot === (afterOwn ? JSON.stringify(afterOwn) : ""),
    "cross_patient",
    "CROSS_PATIENT_ALLOWED",
  );
}

async function markReadAndVerify(session: Session): Promise<void> {
  if (!session.fixture.messageId) fail("fixture", "FIXTURE_RECORD_MISSING");
  const before = await listMessages(session);
  const beforeMessage = findMessage(before, session.fixture.messageId, "read");
  const beforeState = readState(beforeMessage, "read");
  const csrf = await csrfForSession(session);
  const path = `/patient/laboratory-messages/${encodeURIComponent(session.fixture.messageId)}/read`;
  const marked = await requestAt("read", path, {
    method: "POST",
    token: session.token,
    csrf,
    cookie: session.cookie,
  });
  session.cookie = marked.cookie;
  expectStatus(marked, "read", [200, 204]);
  if (marked.response.status === 200 && marked.body !== undefined && isRecord(marked.body)) {
    const returnedState = readState(marked.body, "read");
    verify(returnedState === "read", "read", "READ_STATE_NOT_PERSISTED");
  }
  const after = await listMessages(session);
  const afterMessage = findMessage(after, session.fixture.messageId, "read");
  const afterState = readState(afterMessage, "read");
  verify(afterState === "read", "read", "READ_STATE_NOT_PERSISTED");
  // This records whether this invocation observed a transition without
  // requiring the second direct/relay invocation to start unread.
  verify(beforeState === "unread" || beforeState === "read", "read", "READ_STATE_MISSING");
}

async function replyAndVerify(session: Session): Promise<void> {
  if (!session.fixture.messageId) fail("fixture", "FIXTURE_RECORD_MISSING");
  const csrf = await csrfForSession(session);
  const path = `/patient/laboratory-messages/${encodeURIComponent(session.fixture.messageId)}/reply`;
  const reply = await requestAt("reply", path, {
    method: "POST",
    token: session.token,
    csrf,
    cookie: session.cookie,
    body: { content: SYNTHETIC_REPLY },
  });
  session.cookie = reply.cookie;
  expectStatus(reply, "reply", [200, 201, 204]);
  if (reply.response.status !== 204) {
    verify(
      containsExactReply(reply.body, session.fixture.labOrderId),
      "reply",
      "REPLY_NOT_PERSISTED",
    );
  }

  const reloaded = await listMessages(session);
  verify(
    containsExactReply(reloaded, session.fixture.labOrderId),
    "reply",
    "REPLY_NOT_PERSISTED",
  );
}

function pendingResultState(record: JsonRecord): "released" | "unreleased" | "unknown" {
  if ("releasedAt" in record) {
    if (record.releasedAt === null) return "unreleased";
    if (isNonEmptyString(record.releasedAt)) return "released";
    return "unknown";
  }
  if ("isReleased" in record) {
    if (typeof record.isReleased !== "boolean") return "unknown";
    return record.isReleased ? "released" : "unreleased";
  }
  if ("status" in record) {
    if (!isNonEmptyString(record.status)) return "unknown";
    const status = record.status.toLowerCase();
    if (["released", "final", "completed"].includes(status)) return "released";
    if (["pending", "preliminary", "unreleased", "draft", "in_progress"].includes(status)) {
      return "unreleased";
    }
  }
  return "unknown";
}

async function verifyA2PendingOrder(session: Session): Promise<void> {
  if (!session.fixture.labOrderId) fail("fixture", "FIXTURE_RECORD_MISSING");
  const messages = await listMessages(session);
  const results = await listResults(session);
  assertA2PendingOrderExclusion(messages, results, session.fixture);
}

async function revokeSession(session: Session): Promise<void> {
  if (!session.token || session.tokenRevoked) return;
  try {
    const csrf = await requestAt("cleanup", "/csrf-token", {
      token: session.token,
      cookie: session.cookie,
    });
    session.cookie = csrf.cookie;
    expectStatus(csrf, "cleanup", [200]);
    const logout = await requestAt("cleanup", "/auth/patient-logout", {
      method: "POST",
      token: session.token,
      csrf: csrfToken(csrf.body, "cleanup"),
      cookie: session.cookie,
    });
    session.cookie = logout.cookie;
    expectStatus(logout, "cleanup", [200, 204]);
    session.tokenRevoked = true;
  } catch (error) {
    if (error instanceof HarnessFailure) throw error;
    fail("cleanup", "CLEANUP_FAILED");
  }
}

async function run(): Promise<void> {
  const options = parseRunOptions();
  activeTarget = options.target;
  runSyntheticReferenceRegression();
  const credentialsValue = parseJsonEnv(CREDENTIALS_ENV, "credentials");
  const fixtureValue = parseJsonEnv(FIXTURE_ENV, "fixture");
  const referencesValue = parseJsonEnv(RECORD_REFERENCES_ENV, "fixture");
  if (options.role === "a2") {
    const preparedA2 = prepareRole("A2", credentialsValue, fixtureValue, referencesValue);
    requireClinicalMarker("A2", preparedA2.fixture, false, false, true);
    const sessions: Session[] = [];
    try {
      const a2 = await establishSession(options, "A2", preparedA2);
      sessions.push(a2);
      await verifyA2PendingOrder(a2);
      console.log(
        `CARNET clinical A2 pending-order check: PASS [target=${options.target.mode} verified_assertions=${assertionCount}]`,
      );
      console.log(
        "- supplied A2 pending-order reference was checked against an empty released-results response",
      );
      console.log("- no API order-presence or unreleased-result filtering claim was made");
      console.log(
        "CARNET clinical staff receipt: GAP [no documented lab-staff auth/receipt route or contract in handoff/local source]",
      );
      process.exitCode = 2;
    } finally {
      const outcomes = await Promise.allSettled(sessions.map((session) => revokeSession(session)));
      if (outcomes.some((outcome) => outcome.status === "rejected")) {
        fail("cleanup", "CLEANUP_FAILED");
      }
    }
    return;
  }
  const preparedA1 = prepareRole("A1", credentialsValue, fixtureValue, referencesValue);
  const preparedA2 = prepareRole("A2", credentialsValue, fixtureValue, referencesValue);
  const preparedB1 = prepareRole("B1", credentialsValue, fixtureValue, referencesValue);
  requireClinicalMarker("A1", preparedA1.fixture, true, true, true);
  requireClinicalMarker("A2", preparedA2.fixture, false, false, true);
  requireClinicalMarker("B1", preparedB1.fixture, true, true, true);
  ensureDistinctMarkers(preparedA1.fixture, preparedA2.fixture, preparedB1.fixture);

  const sessions: Session[] = [];
  try {
    const a1 = await establishSession(options, "A1", preparedA1);
    sessions.push(a1);
    const b1 = await establishSession(options, "B1", preparedB1);
    sessions.push(b1);

    const [a1Messages, a1Results, b1Messages, b1Results] = await Promise.all([
      listMessages(a1),
      listResults(a1),
      listMessages(b1),
      listResults(b1),
    ]);
    assertOwnClinicalData("A1", a1Messages, a1Results, a1.fixture, b1.fixture);
    assertOwnClinicalData("B1", b1Messages, b1Results, b1.fixture, a1.fixture);

    await expectCrossPatientRejected(a1, b1.fixture);
    await expectCrossPatientRejected(b1, a1.fixture);
    await markReadAndVerify(a1);
    await replyAndVerify(a1);
    await markReadAndVerify(b1);
    await replyAndVerify(b1);

    const a2 = await establishSession(options, "A2", preparedA2);
    sessions.push(a2);
    await verifyA2PendingOrder(a2);

    await revokeSession(a1);
    const a1AfterLogout = await requestAt("logout", "/patient/profile", {
      token: a1.token,
      cookie: a1.cookie,
    });
    expectStatus(a1AfterLogout, "logout", [401, 403]);
    await revokeSession(b1);
    await revokeSession(a2);

    console.log(
      `CARNET clinical patient checks: PASS [target=${options.target.mode} verified_assertions=${assertionCount}]`,
    );
    console.log("- A1/B1 fixture-owned messages/results and cross-patient list exclusion verified");
    console.log("- explicit cross-patient read/reply attempts rejected");
    console.log("- patient mark-read and synthetic reply persisted after GET reload");
    console.log(
      "- supplied A2 pending-order reference was checked; the released-results response contained no rows",
    );
    console.log("- no API order-presence or unreleased-result filtering claim was made");
    console.log(
      "- unreleased-result filtering claim not made because no actual unreleased result record was available",
    );
    console.log(
      "CARNET clinical staff receipt: GAP [no documented lab-staff auth/receipt route or contract in handoff/local source]",
    );
    process.exitCode = 2;
  } finally {
    const outcomes = await Promise.allSettled(sessions.map((session) => revokeSession(session)));
    if (outcomes.some((outcome) => outcome.status === "rejected")) {
      fail("cleanup", "CLEANUP_FAILED");
    }
  }
}

function reportFailure(error: unknown): void {
  const failure =
    error instanceof HarnessFailure
      ? error
      : new HarnessFailure(currentStage, "REQUEST_FAILED");
  console.error(
    `CARNET clinical patient checks: FAILED [target=${activeTarget?.mode || "unknown"} stage=${failure.stage} code=${failure.code}]`,
  );
  process.exitCode = 1;
}

run().catch(reportFailure);
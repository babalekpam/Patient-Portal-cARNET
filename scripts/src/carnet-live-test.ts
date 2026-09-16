/**
 * Sanitized, read-only NaviMED handoff harness.
 *
 * This script intentionally never logs response bodies, patient identifiers,
 * tokens, credentials, or message content. It performs only the
 * authentication lifecycle plus GET requests; the only writes are login and
 * best-effort logout/revocation.
 */

import * as mobileNetworkModule from "../../artifacts/mobile/lib/ehr/network";
import type { PatientLoginResponse } from "../../artifacts/mobile/lib/ehr/network";
import {
  RELAY_EXPECTED_ISSUER_HEADER,
  TEMPORARY_HANDOFF_RELAY_UPSTREAM,
} from "../../artifacts/api-server/src/lib/relay-upstream";
import { NAVIMEDI_RELAY_PREFIX } from "../../artifacts/api-server/src/lib/relay-policy";
import {
  type FixtureExpectation,
  type JsonRecord,
  type LocatedRecord,
  type PatientRole,
  FixtureSchemaError,
  PATIENT_ROLES,
  findCredentialRecord,
  fixtureRecord,
  isNonEmptyString,
  isRecord,
  stringValue,
} from "./carnet-live-test-fixtures";

// The mobile workspace is intentionally CommonJS for Expo tooling while this
// scripts workspace is ESM. Normalize the module boundary without duplicating
// the strict login/profile parsers.
const mobileNetwork = (
  (mobileNetworkModule as unknown as { default?: typeof mobileNetworkModule }).default ??
  mobileNetworkModule
) as typeof mobileNetworkModule;

const CREDENTIALS_ENV = "CARNET_TEST_CREDENTIALS_JSON";
const FIXTURE_ENV = "CARNET_TEST_FIXTURE_JSON";
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_ENV_BYTES = 1_000_000;
const MAX_RATE_LIMIT_WAIT_MS = 15 * 60 * 1_000;

type RequestedRole = PatientRole | "all";
type TargetMode = "direct" | "relay";
type Stage =
  | "config"
  | "credentials"
  | "fixture"
  | "preauth"
  | "login"
  | "profile"
  | "messages"
  | "results"
  | "logout"
  | "revocation"
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
  | "MESSAGE_MISSING"
  | "MESSAGE_STATE_CHANGED"
  | "RESULT_MISSING"
  | "RELOAD_STATE_CHANGED"
  | "CROSS_PATIENT_OVERLAP"
  | "CLEANUP_FAILED";

interface RequestResult {
  response: Response;
  body: unknown;
  cookie: string;
}

interface TargetConfig {
  mode: TargetMode;
  baseUrl: string;
  issuer?: string;
}

interface RunOptions {
  role: RequestedRole;
  target: TargetConfig;
}

interface RoleObservation {
  messageIds: string[];
  resultIds: string[];
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

function fail(stage: Stage, code: FailureCode): never {
  currentStage = stage;
  throw new HarnessFailure(stage, code);
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

function cookieHeader(response: Response): string {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
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

async function waitOnRateLimit(response: Response): Promise<void> {
  if (response.status !== 429) return;
  const retryAfter = response.headers.get("retry-after");
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
}

async function readJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("response body exceeded the harness limit");
  }
  if (!body.trim()) return null;
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("server returned a non-JSON response");
  }
}

let activeTarget: TargetConfig | undefined;

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  const next = index === -1 ? undefined : process.argv[index + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

function parseRunOptions(): RunOptions {
  const rawRole = argumentValue("--role")?.toUpperCase();
  const rawTarget = argumentValue("--target")?.toLowerCase();
  if (!rawRole || (rawRole !== "ALL" && !PATIENT_ROLES.includes(rawRole as PatientRole))) {
    fail("config", "SCHEMA_INVALID");
  }
  if (rawTarget !== "direct" && rawTarget !== "relay") {
    fail("config", "SCHEMA_INVALID");
  }

  if (rawTarget === "direct") {
    return {
      role: rawRole === "ALL" ? "all" : (rawRole as PatientRole),
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
    role: rawRole === "ALL" ? "all" : (rawRole as PatientRole),
    target: {
      mode: "relay",
      baseUrl: `https://${normalizedDomain}${NAVIMEDI_RELAY_PREFIX}`,
      issuer: TEMPORARY_HANDOFF_RELAY_UPSTREAM,
    },
  };
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
    await waitOnRateLimit(response);
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
    return await request(path, options);
  } catch {
    fail(stage, "REQUEST_FAILED");
  }
}

function csrfToken(body: unknown, stage: Stage): string {
  const token = isRecord(body) ? body.csrfToken : undefined;
  if (!isNonEmptyString(token)) fail(stage, "BODY_INVALID");
  return token;
}

function expectStatus(
  result: RequestResult,
  stage: Stage,
  expected: number[],
): void {
  if (result.response.status === 429) fail(stage, "RATE_LIMITED");
  if (!expected.includes(result.response.status)) fail(stage, "HTTP_STATUS");
}

function issuedTokenFrom(body: unknown): string | undefined {
  const token = isRecord(body) ? body.token : undefined;
  return isNonEmptyString(token) ? token : undefined;
}

function messageIdentifier(record: JsonRecord): string | undefined {
  return stringValue(record, "id") || stringValue(record, "messageId");
}

function isUnreadMessage(record: JsonRecord): boolean {
  if ("readByPatientAt" in record) return record.readByPatientAt === null;
  if ("readByPatient" in record) return record.readByPatient === false;
  if ("read" in record) return record.read === false;
  return false;
}

function runSyntheticIdentityRegression(): void {
  const syntheticLogin = {
    success: true,
    token: "synthetic-token",
    user: {
      id: "synthetic-user-account",
      tenantId: "synthetic-tenant",
      role: "patient",
      firstName: "Synthetic",
      lastName: "Patient",
      email: "patientA1@example.test",
    },
    tenant: {
      id: "synthetic-tenant",
      name: "Synthetic tenant",
      type: "patient",
    },
    patient: {
      id: "synthetic-patient-record",
      tenantId: "synthetic-tenant",
      firstName: "Synthetic",
      lastName: "Patient",
      email: "patientA1@example.test",
    },
  };
  try {
    const parsedLogin = mobileNetwork.requirePatientLoginResponse(syntheticLogin);
    if (parsedLogin.user.id === parsedLogin.patient.id) {
      fail("config", "SCHEMA_INVALID");
    }
    mobileNetwork.requireMatchingPatientProfile(
      {
        id: "synthetic-patient-record",
        tenantId: "synthetic-tenant",
        patient: {
          id: "synthetic-patient-record",
          tenantId: "synthetic-tenant",
        },
      },
      parsedLogin,
    );
    let rejectedAccountId = false;
    try {
      mobileNetwork.requireMatchingPatientProfile(
        {
          id: "synthetic-user-account",
          tenantId: "synthetic-tenant",
        },
        parsedLogin,
      );
    } catch {
      rejectedAccountId = true;
    }
    if (!rejectedAccountId) fail("config", "SCHEMA_INVALID");

    const credentialEnvelope = {
      retained: [
        { email: "clinician@example.test", password: "not-used" },
        { email: "patientA1@example.test", password: "preserve\u0000bytes" },
      ],
    };
    const fixtureEnvelope = {
      retained: {
        identities: [
          { tenantId: "synthetic-tenant", role: "clinician" },
          {
            patientId: "synthetic-patient-record",
            tenantId: "synthetic-tenant",
            role: "patient",
          },
        ],
      },
    };
    const locatedCredential = findCredentialRecord(credentialEnvelope, "A1");
    const mappedFixture = fixtureRecord(fixtureEnvelope, locatedCredential, "A1");
    if (
      mappedFixture.identity.patientId !== "synthetic-patient-record" ||
      mappedFixture.identity.tenantId !== "synthetic-tenant" ||
      locatedCredential.record.password !== "preserve\u0000bytes"
    ) {
      fail("config", "SCHEMA_INVALID");
    }
  } catch (error) {
    if (error instanceof HarnessFailure) throw error;
    fail("config", "SCHEMA_INVALID");
  }
}

function assertNoCrossPatientOverlap(
  role: PatientRole,
  messageIds: string[],
  resultIds: string[],
  observations: Map<PatientRole, RoleObservation>,
): void {
  const currentIds = new Set([...messageIds, ...resultIds]);
  for (const [otherRole, observation] of observations) {
    if (
      [...currentIds].some((id) =>
        observation.messageIds.includes(id) || observation.resultIds.includes(id),
      )
    ) {
      void role;
      void otherRole;
      fail("results", "CROSS_PATIENT_OVERLAP");
    }
  }
  observations.set(role, {
    messageIds: [...new Set(messageIds)],
    resultIds: [...new Set(resultIds)],
  });
}

async function run(): Promise<void> {
  const options = parseRunOptions();
  activeTarget = options.target;
  runSyntheticIdentityRegression();
  currentStage = "credentials";
  const credentialsValue = parseJsonEnv(CREDENTIALS_ENV, "credentials");
  currentStage = "fixture";
  const fixtureValue = parseJsonEnv(FIXTURE_ENV, "fixture");
  const roles = options.role === "all" ? PATIENT_ROLES : [options.role];
  const observations = new Map<PatientRole, RoleObservation>();
  for (const role of roles) {
    await runForRole(options, role, credentialsValue, fixtureValue, observations);
  }
  if (options.role === "all") {
    const returnedIdsAvailable = [...observations.values()].some(
      (observation) => observation.messageIds.length > 0 || observation.resultIds.length > 0,
    );
    console.log(
      returnedIdsAvailable
        ? "- returned laboratory message/result IDs had no cross-role overlap"
        : "- returned laboratory message/result IDs unavailable; overlap assertion not claimed",
    );
    console.log("- cross-session validity after another role's logout not exercised");
  }
}

async function runForRole(
  options: RunOptions,
  role: PatientRole,
  credentialsValue: unknown,
  fixtureValue: unknown,
  observations: Map<PatientRole, RoleObservation>,
): Promise<void> {
  let credential: LocatedRecord;
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

  let cookie = "";
  let token = "";
  let tokenRevoked = false;
  let messages: JsonRecord[] = [];

  const revokeIssuedToken = async (): Promise<void> => {
    if (!token || tokenRevoked) return;
    try {
      const authCsrf = await requestAt("cleanup", "/csrf-token", { token, cookie });
      cookie = authCsrf.cookie;
      expectStatus(authCsrf, "cleanup", [200]);
      const logout = await requestAt("cleanup", "/auth/patient-logout", {
        method: "POST",
        token,
        csrf: csrfToken(authCsrf.body, "cleanup"),
        cookie,
      });
      expectStatus(logout, "cleanup", [200, 204]);
      tokenRevoked = true;
    } catch (error) {
      if (error instanceof HarnessFailure) throw error;
      fail("cleanup", "CLEANUP_FAILED");
    }
  };

  try {
    let preauthCsrf = "";
    if (options.target.mode === "direct") {
      const preauth = await requestAt("preauth", "/csrf-token");
      cookie = preauth.cookie;
      expectStatus(preauth, "preauth", [200]);
      preauthCsrf = csrfToken(preauth.body, "preauth");
    }

    const login = await requestAt("login", "/auth/patient-login", {
      method: "POST",
      ...(preauthCsrf ? { csrf: preauthCsrf } : {}),
      cookie,
      body: loginBody,
    });
    cookie = login.cookie;
    // Capture a token before validating the rest of the success contract so
    // malformed successful responses still enter the revocation finally path.
    token = issuedTokenFrom(login.body) || "";
    expectStatus(login, "login", [200]);
    let parsedLogin: PatientLoginResponse;
    try {
      parsedLogin = mobileNetwork.requirePatientLoginResponse(login.body);
    } catch {
      fail("login", "IDENTITY_INVALID");
    }
    token = parsedLogin.token;
    if (
      parsedLogin.patient.id !== fixture.identity.patientId ||
      parsedLogin.patient.tenantId !== fixture.identity.tenantId ||
      parsedLogin.user.tenantId !== fixture.identity.tenantId
    ) {
      fail("login", "IDENTITY_MISMATCH");
    }

    const profile = await requestAt("profile", "/patient/profile", { token, cookie });
    cookie = profile.cookie;
    expectStatus(profile, "profile", [200]);
    try {
      mobileNetwork.requireMatchingPatientProfile(profile.body, parsedLogin);
    } catch {
      fail("profile", "IDENTITY_INVALID");
    }

    const laboratory = await requestAt("messages", "/patient/laboratory-messages", {
      token,
      cookie,
    });
    cookie = laboratory.cookie;
    expectStatus(laboratory, "messages", [200]);
    if (!Array.isArray(laboratory.body)) fail("messages", "BODY_INVALID");
    messages = laboratory.body.filter(isRecord);
    const verifiedFixtureMessage = Boolean(fixture.messageId);
    if (fixture.messageId) {
      const fixtureMessage = messages.find(
        (message) => messageIdentifier(message) === fixture.messageId,
      );
      if (!fixtureMessage) fail("messages", "MESSAGE_MISSING");
      if (!isUnreadMessage(fixtureMessage)) fail("messages", "MESSAGE_STATE_CHANGED");
    }

    const laboratoryReload = await requestAt("messages", "/patient/laboratory-messages", {
      token,
      cookie,
    });
    cookie = laboratoryReload.cookie;
    expectStatus(laboratoryReload, "messages", [200]);
    if (!Array.isArray(laboratoryReload.body)) fail("messages", "BODY_INVALID");
    if (fixture.messageId) {
      const reloadedFixtureMessage = laboratoryReload.body
        .filter(isRecord)
        .find((message) => messageIdentifier(message) === fixture.messageId);
      if (!reloadedFixtureMessage) fail("messages", "MESSAGE_MISSING");
      if (!isUnreadMessage(reloadedFixtureMessage)) {
        fail("messages", "RELOAD_STATE_CHANGED");
      }
    }

    const results = await requestAt("results", "/patient/lab-results", { token, cookie });
    cookie = results.cookie;
    expectStatus(results, "results", [200]);
    if (!Array.isArray(results.body)) fail("results", "BODY_INVALID");
    const resultIds = results.body
      .filter(isRecord)
      .map((result) => stringValue(result, "id") || stringValue(result, "resultId"))
      .filter((id): id is string => id !== undefined);
    for (const expectedResultId of fixture.resultIds) {
      if (!resultIds.includes(expectedResultId)) fail("results", "RESULT_MISSING");
    }
    const messageIds = messages
      .map(messageIdentifier)
      .filter((id): id is string => id !== undefined);
    assertNoCrossPatientOverlap(role, messageIds, resultIds, observations);

    currentStage = "logout";
    await revokeIssuedToken();
    const afterLogout = await requestAt("revocation", "/patient/profile", { token, cookie });
    expectStatus(afterLogout, "revocation", [401, 403]);

    console.log("CARNET live read-only harness: PASS");
    console.log(`- retained patient role ${role} verified via ${options.target.mode} target`);
    console.log("- retained credential and fixture schema resolved without disclosure");
    console.log(
      options.target.mode === "direct"
        ? "- direct pre-auth CSRF, patient login, and tenant-bound profile verified"
        : "- relay issuer-bound patient login and tenant-bound profile verified",
    );
    console.log(
      verifiedFixtureMessage
        ? "- laboratory message fixture ownership and unread reload state verified"
        : "- laboratory message fixture ID unavailable; ownership/read-state assertion not claimed",
    );
    console.log(
      fixture.resultIds.length > 0
        ? "- expected laboratory result fixture ownership verified"
        : "- laboratory result fixture IDs unavailable; ownership assertion not claimed",
    );
    console.log("- logout revocation verified; old bearer rejected");
  } finally {
    // Any issued bearer is revoked even if a later contract check fails.
    if (token && !tokenRevoked) await revokeIssuedToken();
  }
}

function reportFailure(error: unknown): void {
  const failure =
    error instanceof HarnessFailure
      ? error
      : new HarnessFailure(currentStage, "REQUEST_FAILED");
  // Fixed stage/code only. Never stringify or print an upstream error.
  console.error(
    `CARNET live read-only harness: FAILED [stage=${failure.stage} code=${failure.code}]`,
  );
  process.exitCode = 1;
}

if (process.argv.includes("--synthetic")) {
  try {
    runSyntheticIdentityRegression();
    console.log("CARNET live read-only harness: SYNTHETIC PASS");
  } catch (error) {
    reportFailure(error);
  }
} else {
  run().catch(reportFailure);
}
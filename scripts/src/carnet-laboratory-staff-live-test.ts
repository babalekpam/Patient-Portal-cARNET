/**
 * Focused development-only laboratory-staff receipt harness.
 *
 * This deliberately does not share patient bearer authentication. It uses the
 * documented staff cookie contract against the fixed temporary development
 * upstream, reads already-existing patient replies, and performs only the
 * documented laboratory mark-read mutation. Credentials, cookies, identifiers,
 * response bodies, and message content never appear in output.
 */

import { TEMPORARY_HANDOFF_RELAY_UPSTREAM } from "../../artifacts/api-server/src/lib/relay-upstream";
import {
  type FixtureExpectation,
  type JsonRecord,
  findCredentialRecord,
  fixtureRecord,
  isNonEmptyString,
  isRecord,
} from "./carnet-live-test-fixtures";

const CREDENTIALS_ENV = "CARNET_TEST_CREDENTIALS_JSON";
const FIXTURE_ENV = "CARNET_TEST_FIXTURE_JSON";
const REFERENCES_ENV = "CARNET_TEST_RECORD_REFERENCES_JSON";
const MAX_ENV_BYTES = 1_000_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_AUTH_ATTEMPTS = 50;
const ACTORS = ["labActorA", "labActorB"] as const;

type ActorName = (typeof ACTORS)[number];
type Stage =
  | "config"
  | "credentials"
  | "fixture"
  | "preauth"
  | "login"
  | "messages"
  | "read"
  | "logout"
  | "logout-replay";
type FailureCode =
  | "ENV_MISSING"
  | "ENV_TOO_LARGE"
  | "ENV_INVALID_JSON"
  | "SCHEMA_INVALID"
  | "REQUEST_FAILED"
  | "RATE_LIMITED"
  | "HTTP_STATUS"
  | "BODY_INVALID"
  | "IDENTITY_MISMATCH"
  | "MESSAGE_MISSING"
  | "CROSS_LAB_ALLOWED"
  | "READ_STATE_NOT_PERSISTED"
  | "LOGOUT_NOT_REVOKED"
  | "LOGOUT_AUTH_REJECTION_INVALID";

interface RequestResult {
  response: Response;
  body: unknown;
  cookie: string;
}

interface StaffCredential {
  email: string;
  password: string;
  tenantId: string;
  userId?: string;
}

interface ReplyMarkers {
  direct: string;
  relay: string;
}

interface ReceiptReference {
  patientTenantId: string;
  laboratoryTenantId: string;
  patientId: string;
  labOrderId: string;
  senderId: string;
  direction: string;
  messageId?: string;
  markers?: ReplyMarkers;
}

interface PreparedActor {
  actor: ActorName;
  credential: StaffCredential;
}

interface LocatedArray {
  records: JsonRecord[];
  identityRecords: JsonRecord[];
}

interface StaffSession {
  actor: ActorName;
  cookie: string;
  csrf: string;
  logoutCompleted: boolean;
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
let authAttemptCount = 0;

function fail(stage: Stage, code: FailureCode): never {
  currentStage = stage;
  throw new HarnessFailure(stage, code);
}

function verify(condition: boolean, stage: Stage, code: FailureCode): void {
  if (!condition) fail(stage, code);
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
    throw new Error("bounded response exceeded");
  }
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("non-json response");
  }
}

async function request(
  path: string,
  options: {
    method?: string;
    cookie?: string;
    csrf?: string;
    body?: unknown;
  } = {},
): Promise<RequestResult> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.csrf) headers["X-CSRF-Token"] = options.csrf;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${TEMPORARY_HANDOFF_RELAY_UPSTREAM}${path}`, {
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
    cookie?: string;
    csrf?: string;
    body?: unknown;
  } = {},
): Promise<RequestResult> {
  currentStage = stage;
  try {
    const result = await request(path, options);
    if (result.response.status === 429) fail(stage, "RATE_LIMITED");
    return result;
  } catch (error) {
    if (error instanceof HarnessFailure) throw error;
    fail(stage, "REQUEST_FAILED");
  }
}

function expectStatus(
  result: RequestResult,
  stage: Stage,
  expected: readonly number[],
): void {
  if (result.response.status === 429) fail(stage, "RATE_LIMITED");
  verify(expected.includes(result.response.status), stage, "HTTP_STATUS");
}

function csrfToken(body: unknown, stage: Stage): string {
  const value = isRecord(body) ? body.csrfToken : undefined;
  if (!isNonEmptyString(value)) fail(stage, "BODY_INVALID");
  return value;
}

function requiredString(record: JsonRecord, key: string, stage: Stage): string {
  const value = record[key];
  if (!isNonEmptyString(value) || value.length > 1024 || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(stage, "SCHEMA_INVALID");
  }
  return value;
}

function optionalString(record: JsonRecord, key: string, stage: Stage): string | undefined {
  if (!(key in record)) return undefined;
  return requiredString(record, key, stage);
}

function isCredentialRecord(value: unknown): value is JsonRecord {
  return (
    isRecord(value) &&
    isNonEmptyString(value.email) &&
    isNonEmptyString(value.password)
  );
}

function isFixtureIdentityRecord(value: unknown): value is JsonRecord {
  return (
    isRecord(value) &&
    isNonEmptyString(value.tenantId) &&
    isNonEmptyString(value.userId)
  );
}

function collectKnownArrays(
  value: unknown,
  predicate: (value: unknown) => value is JsonRecord,
): JsonRecord[][] {
  const arrays: JsonRecord[][] = [];
  const seen = new Set<object>();
  const visit = (current: unknown, depth: number): void => {
    if (
      depth > 16 ||
      (!isRecord(current) && !Array.isArray(current)) ||
      (typeof current === "object" && current !== null && seen.has(current))
    ) {
      return;
    }
    if (typeof current === "object" && current !== null) seen.add(current);
    if (Array.isArray(current)) {
      if (current.length > 0 && current.every(predicate)) {
        arrays.push(current);
      }
      for (const child of current) visit(child, depth + 1);
      return;
    }
    for (const child of Object.values(current)) visit(child, depth + 1);
  };
  visit(value, 0);
  return arrays.filter((array, index, all) => all.indexOf(array) === index);
}

function findStaffCredential(
  credentialsValue: unknown,
  fixtureValue: unknown,
  actor: ActorName,
  laboratoryTenantId: string,
): StaffCredential {
  const credentialArrays = collectKnownArrays(credentialsValue, isCredentialRecord);
  const fixtureArrays = collectKnownArrays(fixtureValue, isFixtureIdentityRecord);
  const aligned: LocatedArray[] = [];
  for (const records of credentialArrays) {
    for (const identityRecords of fixtureArrays) {
      if (records.length === identityRecords.length) aligned.push({ records, identityRecords });
    }
  }
  if (aligned.length !== 1) fail("credentials", "SCHEMA_INVALID");
  const candidates = aligned[0].records
    .map((record, index) => ({
      record,
      identity: aligned[0].identityRecords[index],
      index,
    }))
    .filter(({ record, identity }) => {
      if (!identity) return false;
      const email = String(record.email).toLowerCase();
      // The retained account array is explicitly linked to the fixture array
      // by position. Only the documented labActor email marker is accepted;
      // hospital lab-tech accounts are intentionally not interchangeable.
      return (
        /lab.*actor|actor.*lab/.test(email) &&
        identity.tenantId === laboratoryTenantId
      );
    });
  if (candidates.length !== 1) fail("credentials", "SCHEMA_INVALID");
  const { record } = candidates[0];
  const email = requiredString(record, "email", "credentials");
  const password = requiredString(record, "password", "credentials");
  const tenantId = laboratoryTenantId;
  const userId = optionalString(record, "userId", "credentials");
  void actor;
  return { email, password, tenantId, ...(userId ? { userId } : {}) };
}

function findFixturePatientUserId(
  fixtureValue: unknown,
  credential: { parentArray?: unknown[]; index?: number },
  expectedPatientId: string,
): string {
  const identityArrays = collectKnownArrays(fixtureValue, isFixtureIdentityRecord);
  const aligned = identityArrays.filter(
    (records) => records.length === credential.parentArray?.length,
  );
  const candidates = aligned
    .map((records) => records[credential.index ?? -1])
    .filter(
      (record): record is JsonRecord =>
        isRecord(record) &&
        record.patientId === expectedPatientId &&
        isNonEmptyString(record.userId),
    );
  if (candidates.length !== 1) fail("fixture", "SCHEMA_INVALID");
  return requiredString(candidates[0], "userId", "fixture");
}

function exactField(record: JsonRecord, key: string, stage: Stage): string {
  const values: string[] = [];
  if (key in record) values.push(requiredString(record, key, stage));
  const owner = record.owner;
  if (isRecord(owner) && key in owner) values.push(requiredString(owner, key, stage));
  if (values.length !== 1 && (values.length !== 2 || values[0] !== values[1])) {
    fail(stage, "SCHEMA_INVALID");
  }
  return values[0];
}

function optionalExactField(record: JsonRecord, key: string, stage: Stage): string | undefined {
  const values: string[] = [];
  if (key in record) values.push(requiredString(record, key, stage));
  const owner = record.owner;
  if (isRecord(owner) && key in owner) values.push(requiredString(owner, key, stage));
  if (values.length > 2 || (values.length === 2 && values[0] !== values[1])) {
    fail(stage, "SCHEMA_INVALID");
  }
  return values[0];
}

function findReferenceRecords(value: unknown, role: "A1" | "B1"): JsonRecord[] {
  if (!isRecord(value)) fail("fixture", "SCHEMA_INVALID");
  const roleSegments = new Set([role.toLowerCase(), `patient${role}`.toLowerCase()]);
  const records: JsonRecord[] = [];
  const seen = new Set<object>();
  const visit = (current: unknown, path: string[], depth: number): void => {
    if (
      depth > 16 ||
      (!isRecord(current) && !Array.isArray(current)) ||
      (typeof current === "object" && current !== null && seen.has(current))
    ) {
      return;
    }
    if (typeof current === "object" && current !== null) seen.add(current);
    if (isRecord(current)) {
      const rolePath = path.some((segment) => roleSegments.has(segment.toLowerCase()));
      if (
        rolePath &&
        ["patientId", "patientTenantId", "laboratoryTenantId", "labOrderId", "senderId", "direction"].every(
          (key) => key in current,
        )
      ) {
        records.push(current);
      }
      for (const [key, child] of Object.entries(current)) visit(child, [...path, key], depth + 1);
    } else {
      for (const [index, child] of current.entries()) {
        visit(child, [...path, String(index)], depth + 1);
      }
    }
  };
  visit(value, [], 0);
  const unique = records.filter((record, index, all) => all.indexOf(record) === index);
  if (unique.length === 0) fail("fixture", "SCHEMA_INVALID");
  return unique;
}

function parseReferenceRecord(record: JsonRecord): ReceiptReference {
  const keys = [
    "patientTenantId",
    "laboratoryTenantId",
    "patientId",
    "labOrderId",
    "senderId",
  ] as const;
  for (const key of keys) exactField(record, key, "fixture");
  return {
    patientTenantId: exactField(record, "patientTenantId", "fixture"),
    laboratoryTenantId: exactField(record, "laboratoryTenantId", "fixture"),
    patientId: exactField(record, "patientId", "fixture"),
    labOrderId: exactField(record, "labOrderId", "fixture"),
    senderId: exactField(record, "senderId", "fixture"),
    direction: exactField(record, "direction", "fixture"),
    messageId: optionalExactField(record, "messageId", "fixture"),
    markers: parseMarkers(record),
  };
}

function parseMarkers(record: JsonRecord): ReplyMarkers | undefined {
  const direct = optionalExactField(record, "directReplyMarker", "fixture");
  const relay = optionalExactField(record, "relayReplyMarker", "fixture");
  const nested = record.replyMarkers;
  if (isRecord(nested)) {
    const nestedDirect = requiredString(nested, "direct", "fixture");
    const nestedRelay = requiredString(nested, "relay", "fixture");
    if (direct !== undefined || relay !== undefined) fail("fixture", "SCHEMA_INVALID");
    return { direct: nestedDirect, relay: nestedRelay };
  }
  if (direct === undefined && relay === undefined) return undefined;
  if (direct === undefined || relay === undefined) fail("fixture", "SCHEMA_INVALID");
  return { direct, relay };
}

function parseReferences(
  value: unknown,
  role: "A1" | "B1",
  patientUserId: string,
): ReceiptReference[] {
  const normalized = findReferenceRecords(value, role).map((record) => {
    const parsed = parseReferenceRecord(record);
    if (parsed.direction !== "patient_to_laboratory") {
      // The retained reference envelope may contain the existing thread
      // anchor (laboratory_to_patient), while the authoritative patient
      // sender is linked from the retained patient fixture account.
      parsed.senderId = patientUserId;
      parsed.direction = "patient_to_laboratory";
      parsed.markers = undefined;
    }
    // Existing retained message IDs identify the thread anchor, while the
    // patient reply row returned by the staff inbox may have another ID.
    // Ownership is therefore the complete field tuple above; mark-read uses
    // the ID discovered only after that tuple has matched.
    parsed.messageId = undefined;
    if (parsed.direction === "patient_to_laboratory" && parsed.senderId !== patientUserId) {
      fail("fixture", "IDENTITY_MISMATCH");
    }
    return parsed;
  });
  const unique = normalized.filter(
    (reference, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.patientTenantId === reference.patientTenantId &&
          candidate.laboratoryTenantId === reference.laboratoryTenantId &&
          candidate.patientId === reference.patientId &&
          candidate.labOrderId === reference.labOrderId &&
          candidate.senderId === reference.senderId &&
          candidate.direction === reference.direction,
      ) === index,
  );
  if (unique.length === 0) fail("fixture", "SCHEMA_INVALID");
  return unique;
}

function requireArrayBody(body: unknown, stage: Stage): JsonRecord[] {
  if (!Array.isArray(body) || !body.every(isRecord)) fail(stage, "BODY_INVALID");
  return body;
}

function messageId(record: JsonRecord, stage: Stage): string {
  const id = record.id;
  if (!isNonEmptyString(id)) fail(stage, "BODY_INVALID");
  return id;
}

function fieldEquals(record: JsonRecord, key: string, expected: string): boolean {
  return record[key] === expected;
}

function authoritativeMatch(record: JsonRecord, reference: ReceiptReference): boolean {
  return (
    fieldEquals(record, "patientTenantId", reference.patientTenantId) &&
    fieldEquals(record, "laboratoryTenantId", reference.laboratoryTenantId) &&
    fieldEquals(record, "patientId", reference.patientId) &&
    fieldEquals(record, "labOrderId", reference.labOrderId) &&
    fieldEquals(record, "senderId", reference.senderId) &&
    fieldEquals(record, "direction", reference.direction) &&
    (reference.messageId === undefined ||
      messageId(record, "messages") === reference.messageId)
  );
}

function matchingReferences(
  messages: JsonRecord[],
  references: ReceiptReference[],
): JsonRecord[] {
  const matched: JsonRecord[] = [];
  for (const reference of references) {
    const message = messages.find((candidate) => authoritativeMatch(candidate, reference));
    if (!message) fail("messages", "MESSAGE_MISSING");
    matched.push(message);
  }
  return matched;
}

function containsExact(value: unknown, expected: string, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((child) => containsExact(child, expected, depth + 1));
  if (isRecord(value)) {
    return Object.values(value).some((child) => containsExact(child, expected, depth + 1));
  }
  return false;
}

function verifyReceipt(
  messages: JsonRecord[],
  references: ReceiptReference[],
  foreignReferences: ReceiptReference[],
  stage: Stage,
): JsonRecord[] {
  const own = matchingReferences(messages, references);
  const foreignVisible = messages.some(
    (message) =>
      foreignReferences.some(
        (foreignReference) =>
          authoritativeMatch(message, foreignReference) ||
          (foreignReference.messageId !== undefined &&
            messageId(message, stage) === foreignReference.messageId &&
            message.patientId === foreignReference.patientId),
      ),
  );
  verify(!foreignVisible, stage, "CROSS_LAB_ALLOWED");
  for (const reference of references) {
    if (reference.markers) {
      const { direct, relay } = reference.markers;
      verify(
        messages.some(
          (message) =>
            authoritativeMatch(message, reference) && containsExact(message, direct),
        ),
        stage,
        "MESSAGE_MISSING",
      );
      verify(
        messages.some(
          (message) =>
            authoritativeMatch(message, reference) && containsExact(message, relay),
        ),
        stage,
        "MESSAGE_MISSING",
      );
    }
  }
  return own;
}

async function loginStaff(actor: PreparedActor): Promise<StaffSession> {
  const session: StaffSession = {
    actor: actor.actor,
    cookie: "",
    csrf: "",
    logoutCompleted: false,
  };
  const preauth = await requestAt("preauth", "/csrf-token");
  session.cookie = preauth.cookie;
  expectStatus(preauth, "preauth", [200]);
  const preauthToken = csrfToken(preauth.body, "preauth");
  authAttemptCount += 1;
  if (authAttemptCount > MAX_AUTH_ATTEMPTS) fail("login", "RATE_LIMITED");
  const login = await requestAt("login", "/auth/login", {
    method: "POST",
    cookie: session.cookie,
    csrf: preauthToken,
    body: {
      email: actor.credential.email,
      password: actor.credential.password,
      tenantId: actor.credential.tenantId,
    },
  });
  session.cookie = login.cookie;
  expectStatus(login, "login", [200]);
  // The staff contract is cookie-only. A returned bearer would be a contract
  // violation, not an alternative authentication path.
  verify(!(isRecord(login.body) && "token" in login.body), "login", "BODY_INVALID");

  const refreshed = await requestAt("login", "/csrf-token", { cookie: session.cookie });
  session.cookie = refreshed.cookie;
  expectStatus(refreshed, "login", [200]);
  session.csrf = csrfToken(refreshed.body, "login");
  return session;
}

async function listInbox(session: StaffSession): Promise<JsonRecord[]> {
  const response = await requestAt("messages", "/laboratory/carnet/messages", {
    cookie: session.cookie,
  });
  session.cookie = response.cookie;
  expectStatus(response, "messages", [200]);
  return requireArrayBody(response.body, "messages");
}

function isAuthenticationJson(body: unknown): boolean {
  if (!isRecord(body)) return false;
  const candidates = ["code", "error", "message", "reason"]
    .map((key) => body[key])
    .filter((value): value is string => typeof value === "string");
  return candidates.some((value) =>
    /(auth|unauthori[sz]ed|forbidden|session|login|credential|sign.?in|token)/i.test(value),
  );
}

function requireAuthenticationRejection(result: RequestResult): void {
  verify(
    result.response.status === 401 || result.response.status === 403,
    "logout-replay",
    "LOGOUT_NOT_REVOKED",
  );
  verify(
    isAuthenticationJson(result.body),
    "logout-replay",
    "LOGOUT_AUTH_REJECTION_INVALID",
  );
}

async function logoutStaff(session: StaffSession): Promise<void> {
  if (!session.cookie || session.logoutCompleted) return;
  const response = await requestAt("logout", "/auth/logout", {
    method: "POST",
    cookie: session.cookie,
    csrf: session.csrf,
  });
  expectStatus(response, "logout", [200, 204]);
  session.cookie = response.cookie;
  session.csrf = "";
  session.logoutCompleted = true;
}

async function logoutAndVerifyReplay(session: StaffSession): Promise<void> {
  // This is intentionally retained only in memory until the replay assertion
  // completes. It must be the exact pre-logout Cookie header, including the
  // server-issued navimed_refresh cookie.
  const preLogoutCookie = session.cookie;
  verify(
    preLogoutCookie.split(";").some((cookie) => cookie.trim().startsWith("navimed_refresh=")),
    "logout",
    "SCHEMA_INVALID",
  );
  await logoutStaff(session);
  const replay = await requestAt("logout-replay", "/laboratory/carnet/messages", {
    cookie: preLogoutCookie,
  });
  requireAuthenticationRejection(replay);
}

async function markReadAndReload(
  session: StaffSession,
  references: ReceiptReference[],
): Promise<void> {
  const before = await listInbox(session);
  const beforeMessages = matchingReferences(before, references);
  const targetIds = [...new Set(
    beforeMessages.map((message, index) => references[index].messageId || messageId(message, "read")),
  )];
  for (const targetId of targetIds) {
    const path = `/laboratory/carnet/messages/${encodeURIComponent(targetId)}/read`;
    const marked = await requestAt("read", path, {
      method: "POST",
      cookie: session.cookie,
      csrf: session.csrf,
      body: {},
    });
    session.cookie = marked.cookie;
    expectStatus(marked, "read", [200, 204]);
  }
  const reloaded = await listInbox(session);
  for (const reference of references) {
    const message = reloaded.find((candidate) => authoritativeMatch(candidate, reference));
    if (!message) fail("read", "MESSAGE_MISSING");
    verify(isNonEmptyString(message.readByLaboratoryAt), "read", "READ_STATE_NOT_PERSISTED");
  }
}

function destroyCookieJars(sessions: StaffSession[]): void {
  for (const session of sessions) {
    session.cookie = "";
    session.csrf = "";
    session.logoutCompleted = true;
  }
  sessions.length = 0;
}

async function cleanupStaffSessions(sessions: StaffSession[]): Promise<void> {
  for (const session of sessions) {
    try {
      await logoutStaff(session);
    } catch {
      // Preserve the primary failure while still attempting every issued
      // session. No response body or credential material is surfaced.
    }
  }
}

function runSyntheticRegression(): void {
  const linkedCredential = findStaffCredential(
    {
      accounts: [{ email: "labActorA@example.test", password: "synthetic-password" }],
    },
    {
      identities: [{ tenantId: "lab-tenant-a", userId: "staff-account-a" }],
    },
    "labActorA",
    "lab-tenant-a",
  );
  verify(
    linkedCredential.tenantId === "lab-tenant-a" &&
      linkedCredential.email === "labActorA@example.test",
    "credentials",
    "SCHEMA_INVALID",
  );
  const reference: ReceiptReference = {
    patientTenantId: "patient-tenant-a",
    laboratoryTenantId: "lab-tenant-a",
    patientId: "patient-record-a",
    labOrderId: "order-a",
    senderId: "patient-user-a",
    direction: "patient_to_laboratory",
    messageId: "message-a",
    markers: { direct: "direct-marker", relay: "relay-marker" },
  };
  const foreign: ReceiptReference = {
    ...reference,
    laboratoryTenantId: "lab-tenant-b",
    patientId: "patient-record-b",
    labOrderId: "order-b",
    senderId: "patient-user-b",
    direction: "patient_to_laboratory",
    messageId: "message-b",
  };
  const own = {
    id: reference.messageId,
    patientTenantId: reference.patientTenantId,
    laboratoryTenantId: reference.laboratoryTenantId,
    patientId: reference.patientId,
    labOrderId: reference.labOrderId,
    senderId: reference.senderId,
    direction: "patient_to_laboratory",
    content: ["direct-marker", "relay-marker"],
  };
  const parsed = verifyReceipt([own], [reference], [foreign], "messages");
  verify(parsed[0].id === reference.messageId, "messages", "MESSAGE_MISSING");
  let rejected = false;
  try {
    verifyReceipt(
      [{ ...own, laboratoryTenantId: foreign.laboratoryTenantId }],
      [reference],
      [foreign],
      "messages",
    );
  } catch {
    rejected = true;
  }
  verify(rejected, "messages", "CROSS_LAB_ALLOWED");
  const normalized = parseReferences(
    {
      patientA1: {
        patientId: "patient-record-a",
        patientTenantId: "patient-tenant-a",
        laboratoryTenantId: "lab-tenant-a",
        labOrderId: "order-a",
        senderId: "staff-account-a",
        direction: "laboratory_to_patient",
      },
    },
    "A1",
    "patient-user-a",
  );
  verify(
    normalized.length === 1 &&
      normalized[0].senderId === "patient-user-a" &&
      normalized[0].direction === "patient_to_laboratory",
    "fixture",
    "SCHEMA_INVALID",
  );

  type MockSession = { active: boolean };
  const mockA: MockSession = { active: true };
  const mockB: MockSession = { active: true };
  const mockedLogout = (): RequestResult => {
    // A successful-looking response is not proof of revocation.
    return {
      response: new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      body: { ok: true },
      cookie: "navimed_refresh=synthetic",
    };
  };
  const mockedReplay = (session: MockSession): RequestResult => ({
    response: new Response(
      JSON.stringify(
        session.active ? { messages: [] } : { error: "authentication required" },
      ),
      {
        status: session.active ? 200 : 401,
        headers: { "content-type": "application/json" },
      },
    ),
    body: session.active ? { messages: [] } : { error: "authentication required" },
    cookie: "",
  });
  mockedLogout();
  let silentFailure = false;
  try {
    requireAuthenticationRejection(mockedReplay(mockA));
  } catch (error) {
    silentFailure =
      error instanceof HarnessFailure && error.code === "LOGOUT_NOT_REVOKED";
  }
  verify(silentFailure, "logout-replay", "LOGOUT_NOT_REVOKED");
  mockA.active = false;
  const effectiveLogout = mockedLogout();
  verify(
    isRecord(effectiveLogout.body) && effectiveLogout.body.ok === true,
    "logout",
    "BODY_INVALID",
  );
  requireAuthenticationRejection(mockedReplay(mockA));
  const bInbox = mockedReplay(mockB);
  verify(bInbox.response.status === 200, "messages", "HTTP_STATUS");
  mockB.active = false;
  requireAuthenticationRejection(mockedReplay(mockB));
}

async function run(): Promise<void> {
  if (TEMPORARY_HANDOFF_RELAY_UPSTREAM !== "https://942dd837-7012-47ef-8574-574ac5ab89f8-00-2gel21gszwmqv.picard.replit.dev/api") {
    fail("config", "SCHEMA_INVALID");
  }
  const credentials = parseJsonEnv(CREDENTIALS_ENV, "credentials");
  const fixture = parseJsonEnv(FIXTURE_ENV, "fixture");
  const references = parseJsonEnv(REFERENCES_ENV, "fixture");
  const a1Credential = findCredentialRecord(credentials, "A1");
  const b1Credential = findCredentialRecord(credentials, "B1");
  let a1Fixture: FixtureExpectation;
  let b1Fixture: FixtureExpectation;
  try {
    a1Fixture = fixtureRecord(fixture, a1Credential, "A1");
    b1Fixture = fixtureRecord(fixture, b1Credential, "B1");
  } catch {
    fail("fixture", "SCHEMA_INVALID");
  }
  const a1PatientUserId = findFixturePatientUserId(
    fixture,
    a1Credential,
    a1Fixture.identity.patientId,
  );
  const b1PatientUserId = findFixturePatientUserId(
    fixture,
    b1Credential,
    b1Fixture.identity.patientId,
  );
  const a1 = parseReferences(references, "A1", a1PatientUserId);
  const b1 = parseReferences(references, "B1", b1PatientUserId);
  const preparedA = {
    actor: "labActorA" as const,
    credential: findStaffCredential(credentials, fixture, "labActorA", a1[0].laboratoryTenantId),
  };
  const preparedB = {
    actor: "labActorB" as const,
    credential: findStaffCredential(credentials, fixture, "labActorB", b1[0].laboratoryTenantId),
  };
  for (const reference of a1) {
    verify(reference.patientId === a1Fixture.identity.patientId, "fixture", "IDENTITY_MISMATCH");
    verify(reference.patientTenantId === a1Fixture.identity.tenantId, "fixture", "IDENTITY_MISMATCH");
    verify(reference.laboratoryTenantId === preparedA.credential.tenantId, "fixture", "IDENTITY_MISMATCH");
  }
  for (const reference of b1) {
    verify(reference.patientId === b1Fixture.identity.patientId, "fixture", "IDENTITY_MISMATCH");
    verify(reference.patientTenantId === b1Fixture.identity.tenantId, "fixture", "IDENTITY_MISMATCH");
    verify(reference.laboratoryTenantId === preparedB.credential.tenantId, "fixture", "IDENTITY_MISMATCH");
  }
  verify(a1[0].laboratoryTenantId !== b1[0].laboratoryTenantId, "fixture", "SCHEMA_INVALID");
  const sessions: StaffSession[] = [];
  try {
    const staffA = await loginStaff(preparedA);
    sessions.push(staffA);
    const staffB = await loginStaff(preparedB);
    sessions.push(staffB);
    const inboxA = await listInbox(staffA);
    const inboxB = await listInbox(staffB);
    const aMessages = verifyReceipt(inboxA, a1, b1, "messages");
    verifyReceipt(inboxB, b1, a1, "messages");

    if (process.argv.includes("--logout-only")) {
      await logoutAndVerifyReplay(staffA);
      await listInbox(staffB);
      await logoutAndVerifyReplay(staffB);
      console.log("CARNET laboratory staff logout checks: PASS");
      console.log("- genuine labActorA/labActorB cookie login and refreshed CSRF verified");
      console.log("- both laboratory inboxes were available before logout");
      console.log("- A pre-logout cookie replay was rejected with JSON authentication failure");
      console.log("- B inbox remained available after A logout");
      console.log("- B pre-logout cookie replay was rejected with JSON authentication failure");
      console.log(
        "- no clinical mutations, fixture changes, production calls, or native builds performed",
      );
      console.log(
        "- direct-vs-relay attribution GAP remains; production remains held and device testing remains pending",
      );
      return;
    }

    // A's known message ID must not be markable by the other lab, even though
    // the other lab has a genuine authenticated cookie and fresh CSRF token.
    const wrongLab = await requestAt(
      "read",
      `/laboratory/carnet/messages/${encodeURIComponent(a1[0].messageId || messageId(aMessages[0], "read"))}/read`,
      { method: "POST", cookie: staffB.cookie, csrf: staffB.csrf, body: {} },
    );
    staffB.cookie = wrongLab.cookie;
    verify([401, 403, 404].includes(wrongLab.response.status), "read", "CROSS_LAB_ALLOWED");
    await markReadAndReload(staffA, a1);
    await markReadAndReload(staffB, b1);
    console.log("CARNET laboratory staff receipt checks: PASS");
    console.log("- retained labActorA/labActorB cookie login and refreshed CSRF verified");
    console.log("- intended patient replies matched strict patient/lab/order/sender/direction ownership");
    console.log("- other laboratory inbox exclusion and wrong-lab mark-read rejection verified");
    console.log("- laboratory read state persisted after inbox reload");
    console.log(
      a1.every((reference) => reference.markers) && b1.every((reference) => reference.markers)
        ? "- direct-vs-relay reply markers correlated for both retained patient records"
        : "- direct-vs-relay attribution GAP: retained references did not distinguish reply source",
    );
    console.log("- patient bearer authentication and patient relay allowlist were not changed");
    console.log("- server-session logout revocation not established; staff logout route is undocumented and local jars were destroyed");
    console.log("- development-only evidence; production remains held and device testing remains pending");
  } finally {
    await cleanupStaffSessions(sessions);
    destroyCookieJars(sessions);
  }
}

function reportFailure(error: unknown): void {
  const failure =
    error instanceof HarnessFailure
      ? error
      : new HarnessFailure(currentStage, "REQUEST_FAILED");
  console.error(
    `CARNET laboratory staff receipt checks: FAILED [stage=${failure.stage} code=${failure.code}]`,
  );
  process.exitCode = 1;
}

if (process.argv.includes("--synthetic")) {
  try {
    runSyntheticRegression();
    console.log("CARNET laboratory staff receipt checks: SYNTHETIC PASS");
  } catch (error) {
    reportFailure(error);
  }
} else {
  run().catch(reportFailure);
}
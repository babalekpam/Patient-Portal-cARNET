/**
 * Sanitized, read-only NaviMED handoff harness.
 *
 * This script intentionally has no fixture fallback and never logs response
 * bodies, patient identifiers, tokens, or message content. It performs only
 * the authentication lifecycle plus GET requests; the only writes are login
 * and best-effort logout/revocation.
 */

const HANDOFF_API_BASE_URL =
  "https://942dd837-7012-47ef-8574-574ac5ab89f8-00-2gel21gszwmqv.picard.replit.dev/api";
const CREDENTIALS_ENV = "CARNET_TEST_CREDENTIALS_JSON";
const FIXTURE_ENV = "CARNET_TEST_FIXTURE_JSON";
const MAX_RESPONSE_BYTES = 1_000_000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonEnv(name: string): unknown {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not configured`);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${name} is not valid JSON`);
  }
}

function stringValue(record: JsonRecord | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function findCredentialRecord(value: unknown): JsonRecord {
  if (!isRecord(value)) throw new Error("credentials JSON must be an object");
  if (stringValue(value, "email") && stringValue(value, "password")) return value;
  for (const key of ["patientA1", "patientA1Credentials", "credentials"]) {
    const nested = value[key];
    if (isRecord(nested) && stringValue(nested, "email") && stringValue(nested, "password")) {
      return nested;
    }
  }
  throw new Error("credentials JSON does not contain patientA1 email/password");
}

function findFixtureRecord(value: unknown): JsonRecord {
  if (!isRecord(value)) throw new Error("fixture JSON must be an object");
  const nested = value.patientA1 ?? value.patient ?? value.identity;
  return isRecord(nested) ? nested : value;
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

async function request(
  path: string,
  options: { method?: string; token?: string; csrf?: string; cookie?: string; body?: unknown } = {},
): Promise<{ response: Response; body: unknown; cookie: string }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.csrf) headers["X-CSRF-Token"] = options.csrf;
  if (options.cookie) headers.Cookie = options.cookie;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${HANDOFF_API_BASE_URL}${path}`, {
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

function csrfToken(body: unknown): string {
  const token = isRecord(body) ? body.csrfToken : undefined;
  if (typeof token !== "string" || !token.trim()) throw new Error("CSRF token was not returned");
  return token.trim();
}

function bearerToken(body: unknown): string {
  const token = isRecord(body) ? body.token : undefined;
  if (typeof token !== "string" || !token.trim()) throw new Error("login token was not returned");
  return token.trim();
}

function expectStatus(response: Response, ...statuses: number[]): void {
  if (!statuses.includes(response.status)) {
    throw new Error(`unexpected HTTP status ${response.status}`);
  }
}

function patientIdentity(record: JsonRecord): { patientId?: string; tenantId?: string } {
  const patient = isRecord(record.patient) ? record.patient : undefined;
  const tenant = isRecord(record.tenant) ? record.tenant : undefined;
  return {
    patientId: stringValue(record, "patientId") || stringValue(patient, "id"),
    tenantId:
      stringValue(record, "tenantId") ||
      stringValue(patient, "tenantId") ||
      stringValue(tenant, "id"),
  };
}

function issuedTokenFrom(body: unknown): string | undefined {
  const token = isRecord(body) ? body.token : undefined;
  return typeof token === "string" && token.trim() ? token.trim() : undefined;
}

async function run(): Promise<void> {
  const credentials = findCredentialRecord(parseJsonEnv(CREDENTIALS_ENV));
  const fixture = findFixtureRecord(parseJsonEnv(FIXTURE_ENV));
  const expected = patientIdentity(fixture);
  if (!expected.patientId || !expected.tenantId) {
    throw new Error("fixture JSON must include expected patientId and tenantId");
  }
  const loginBody: JsonRecord = {
    email: stringValue(credentials, "email"),
    password: stringValue(credentials, "password"),
  };
  for (const key of ["tenantId", "mfaCode"]) {
    const value = stringValue(credentials, key);
    if (value) loginBody[key] = value;
  }

  let cookie = "";
  let token = "";
  let tokenRevoked = false;
  let messages: JsonRecord[] = [];
  let resultCount = 0;

  const revokeIssuedToken = async (): Promise<void> => {
    if (!token || tokenRevoked) return;
    const authCsrf = await request("/csrf-token", { token, cookie });
    cookie = authCsrf.cookie;
    expectStatus(authCsrf.response, 200);
    const logout = await request("/auth/patient-logout", {
      method: "POST",
      token,
      csrf: csrfToken(authCsrf.body),
      cookie,
    });
    expectStatus(logout.response, 200, 204);
    tokenRevoked = true;
  };

  try {
    const preauth = await request("/csrf-token");
    cookie = preauth.cookie;
    expectStatus(preauth.response, 200);
    const preauthCsrf = csrfToken(preauth.body);

    const login = await request("/auth/patient-login", {
      method: "POST",
      csrf: preauthCsrf,
      cookie,
      body: loginBody,
    });
    cookie = login.cookie;
    // Capture a token before validating the rest of the success contract so
    // malformed successful responses still enter the revocation finally path.
    token = issuedTokenFrom(login.body) || "";
    expectStatus(login.response, 200);
    token = bearerToken(login.body);
    const loggedInIdentity = patientIdentity(isRecord(login.body) ? login.body : {});
    if (!loggedInIdentity.patientId || !loggedInIdentity.tenantId) {
      throw new Error("login identity was incomplete");
    }
    if (expected.patientId !== loggedInIdentity.patientId) {
      throw new Error("login patient identity did not match fixture");
    }
    if (expected.tenantId !== loggedInIdentity.tenantId) {
      throw new Error("login tenant identity did not match fixture");
    }

    const profile = await request("/patient/profile", { token, cookie });
    cookie = profile.cookie;
    expectStatus(profile.response, 200);
    const profileIdentity = patientIdentity(isRecord(profile.body) ? profile.body : {});
    if (!profileIdentity.patientId || !profileIdentity.tenantId) {
      throw new Error("profile identity was incomplete");
    }
    if (
      loggedInIdentity.patientId !== profileIdentity.patientId ||
      loggedInIdentity.tenantId !== profileIdentity.tenantId
    ) {
      throw new Error("login and profile identities did not match");
    }
    if (expected.patientId !== profileIdentity.patientId) {
      throw new Error("profile patient identity did not match fixture");
    }
    if (expected.tenantId !== profileIdentity.tenantId) {
      throw new Error("profile tenant identity did not match fixture");
    }

    const laboratory = await request("/patient/laboratory-messages", { token, cookie });
    cookie = laboratory.cookie;
    expectStatus(laboratory.response, 200);
    if (!Array.isArray(laboratory.body)) throw new Error("laboratory response was not a list");
    messages = laboratory.body.filter(isRecord);
    const expectedMessageId =
      stringValue(fixture, "initialLaboratoryMessageId") ||
      stringValue(fixture, "laboratoryMessageId");
    if (
      expectedMessageId &&
      !messages.some((message) => stringValue(message, "id") === expectedMessageId)
    ) {
      throw new Error("fixture laboratory message was not returned");
    }
    // No read or reply operation is sent. The fixture's baseline unread state
    // must survive this harness unchanged.
    if (
      expectedMessageId &&
      !messages.some(
        (message) =>
          stringValue(message, "id") === expectedMessageId &&
          message.readByPatientAt === null,
      )
    ) {
      throw new Error("fixture laboratory message was not initially unread");
    }

    const results = await request("/patient/lab-results", { token, cookie });
    cookie = results.cookie;
    expectStatus(results.response, 200);
    if (!Array.isArray(results.body)) throw new Error("laboratory results response was not a list");
    resultCount = results.body.length;

    await revokeIssuedToken();
    const afterLogout = await request("/patient/profile", { token, cookie });
    expectStatus(afterLogout.response, 401, 403);

    console.log("CARNET live read-only harness: PASS");
    console.log("- authenticated patient identity and profile verified");
    console.log(`- laboratory messages read without mutation (${messages.length} returned)`);
    console.log(`- laboratory results read without mutation (${resultCount} returned)`);
    console.log("- session revoked and old bearer rejected");
  } finally {
    await revokeIssuedToken();
  }
}

run().catch(() => {
  // Deliberately omit the error message: upstream errors may contain patient
  // content. The fixed diagnostic label is non-sensitive.
  console.error("CARNET live read-only harness: FAILED (sanitized)");
  process.exitCode = 1;
});
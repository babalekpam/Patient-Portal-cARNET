import assert from "node:assert/strict";
import test from "node:test";
import {
  isBearerHeader,
  isSafeJson,
  matchRelayRoute,
  parseRelayPath,
} from "./relay-policy";

test("allows every mobile API operation with only its supported method", () => {
  const allowed = [
    ["GET", "/csrf-token"],
    ["POST", "/auth/patient-login"],
    ["POST", "/auth/patient-logout"],
    ["POST", "/auth/forgot-password"],
    ["GET", "/patient/profile"],
    ["PATCH", "/patient/profile"],
    ["GET", "/patient/appointments"],
    ["POST", "/patient/appointments"],
    ["POST", "/patient/appointment-requests"],
    ["GET", "/patient/prescriptions"],
    ["GET", "/patient/lab-results"],
    ["GET", "/patient/laboratory-messages"],
    ["POST", "/patient/laboratory-messages/550e8400-e29b-41d4-a716-446655440000/reply"],
    ["POST", "/patient/laboratory-messages/550e8400-e29b-41d4-a716-446655440000/read"],
    ["GET", "/medical-communications"],
    ["POST", "/medical-communications"],
    ["GET", "/patient/visit-summaries"],
    ["GET", "/patient/bills"],
    ["GET", "/patient/insurance-history"],
    ["GET", "/patient/telehealth/appointments"],
    ["GET", "/patient/telehealth/sessions/appt_123"],
    ["POST", "/patient/telehealth/sessions/appt_123"],
  ] as const;
  for (const [method, path] of allowed) {
    assert.ok(matchRelayRoute(method, path), `${method} ${path}`);
  }
  assert.equal(matchRelayRoute("DELETE", "/patient/profile"), null);
  assert.equal(matchRelayRoute("GET", "/patient/unknown"), null);
});

test("rejects query strings, traversal, encoded separators, and malformed paths", () => {
  const rejected = [
    "/api/navimedi/patient/profile?token=secret",
    "/api/navimedi/patient/../admin",
    "/api/navimedi/patient/%2fadmin",
    "/api/navimedi/patient/%5Cadmin",
    "/api/navimedi//patient/profile",
    "/api/navimedical/patient/profile",
  ];
  for (const url of rejected) assert.equal(parseRelayPath(url), null, url);
  assert.equal(
    parseRelayPath("/api/navimedi/patient/profile"),
    "/patient/profile",
  );
  assert.equal(
    parseRelayPath("/api/navimedi/patient/insurance-history?limit=20&offset=0&filingType=medication"),
    "/patient/insurance-history?limit=20&offset=0&filingType=medication",
  );
  assert.equal(parseRelayPath("/api/navimedi/patient/profile?limit=20"), null);
  assert.equal(parseRelayPath("/api/navimedi/patient/insurance-history?limit=101"), null);
  assert.equal(parseRelayPath("/api/navimedi/patient/insurance-history?patientId=other"), null);
  assert.equal(
    matchRelayRoute("GET", "/patient/insurance-history?limit=20&offset=0")?.protected,
    true,
  );
});

test("marks only patient login and password recovery operations public", () => {
  assert.equal(matchRelayRoute("POST", "/auth/login"), null);
  assert.equal(matchRelayRoute("POST", "/auth/patient-login")?.protected, false);
  assert.equal(matchRelayRoute("POST", "/auth/patient-logout")?.protected, true);
  assert.equal(matchRelayRoute("POST", "/auth/forgot-password")?.protected, false);
  assert.equal(matchRelayRoute("GET", "/csrf-token")?.protected, true);
  assert.equal(matchRelayRoute("GET", "/patient/profile")?.protected, true);
});

test("validates actual supported mobile payload fields and rejects extras", () => {
  const login = matchRelayRoute("POST", "/auth/patient-login")!;
  assert.equal(login.validateBody({
    email: "patient@example.com",
    password: "correct horse battery staple",
    tenantId: "hospital-1",
  }), true);
  assert.equal(login.validateBody({
    email: "patient@example.com",
    password: "correct horse battery staple",
    tenantId: "hospital-1",
    mfaCode: "123456",
  }), true);
  assert.equal(login.validateBody({
    email: "patient@example.com",
    password: "password",
    role: "admin",
  }), false);
  assert.equal(login.validateBody({
    email: "patient@example.com",
    password: "password",
    unexpected: "field",
  }), false);
  assert.equal(login.validateBody({
    email: "patient@example.com",
    password: "password",
    mfaCode: "",
  }), false);
  assert.equal(login.validateBody({
    email: "patient@example.com",
    password: "password",
    mfaCode: "a".repeat(129),
  }), false);

  const logout = matchRelayRoute("POST", "/auth/patient-logout")!;
  assert.equal(logout.protected, true);
  assert.equal(logout.validateBody(undefined), true);
  assert.equal(logout.validateBody({}), false);

  const profile = matchRelayRoute("PATCH", "/patient/profile")!;
  assert.equal(profile.validateBody({ phone: "+1 555 0100", address: "1 Main St" }), true);
  assert.equal(profile.validateBody({ mrn: "cannot-change" }), false);

  const appointment = matchRelayRoute("POST", "/patient/appointments")!;
  assert.equal(appointment.validateBody({
    providerId: "provider-1",
    appointmentDate: "2026-06-01T10:00:00Z",
    type: "telehealth",
    duration: 30,
    chiefComplaint: "Follow-up",
  }), true);
  assert.equal(appointment.validateBody({ providerId: "provider-1" }), false);

  const message = matchRelayRoute("POST", "/medical-communications")!;
  assert.equal(message.validateBody({
    type: "general_message",
    priority: "normal",
    originalContent: { subject: "Question", message: "Please call me." },
  }), true);
  assert.equal(message.validateBody({
    type: "general_message",
    priority: "normal",
    originalContent: { subject: "Question", message: "Text", html: "<script>" },
  }), false);

  const laboratoryReply = matchRelayRoute(
    "POST",
    "/patient/laboratory-messages/550e8400-e29b-41d4-a716-446655440000/reply",
  )!;
  assert.equal(laboratoryReply.protected, true);
  assert.equal(laboratoryReply.validateBody({ content: "Please clarify this result." }), true);
  assert.equal(laboratoryReply.validateBody({ content: "" }), false);
  assert.equal(laboratoryReply.validateBody({ content: "   " }), false);
  assert.equal(laboratoryReply.validateBody({ content: "reply", patientId: "patient-b" }), false);
  assert.equal(laboratoryReply.validateBody({ content: "reply", labOrderId: "order-b" }), false);

  const laboratoryRead = matchRelayRoute(
    "POST",
    "/patient/laboratory-messages/550e8400-e29b-41d4-a716-446655440000/read",
  )!;
  assert.equal(laboratoryRead.protected, true);
  assert.equal(laboratoryRead.validateBody(undefined), true);
  assert.equal(laboratoryRead.validateBody({}), false);
  assert.equal(
    matchRelayRoute("POST", "/patient/laboratory-messages/not-a-uuid/read"),
    null,
  );
});

test("requires a syntactically bounded bearer credential", () => {
  assert.equal(isBearerHeader(undefined), false);
  assert.equal(isBearerHeader("Basic abcdefghijklmnop"), false);
  assert.equal(isBearerHeader("Bearer short"), false);
  assert.equal(isBearerHeader(`Bearer ${"a".repeat(16)}`), true);
  assert.equal(isBearerHeader(`Bearer ${"a".repeat(4097)}`), false);
});

test("bounds JSON complexity", () => {
  assert.equal(isSafeJson({ ok: [1, "two", true, null] }), true);
  let deep: unknown = "value";
  for (let index = 0; index < 22; index += 1) deep = { child: deep };
  assert.equal(isSafeJson(deep), false);
  assert.equal(isSafeJson({ invalid: Number.POSITIVE_INFINITY }), false);
});
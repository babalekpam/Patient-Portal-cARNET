# External NaviMED interface requirements

NaviMED is an external identity provider and resource server; this repository
cannot manufacture or attest to its MFA, token policy, RBAC, patient ownership,
audit, or infrastructure controls. Before real patient use, the service owner
must contractually accept this interface and provide testable evidence.

## Identity and session contract

- Use OAuth 2.0 authorization code flow with PKCE (`S256`) in a system browser.
  Register exact claimed HTTPS universal/app links per platform; reject
  wildcard, HTTP, unclaimed custom-scheme, state/nonce, issuer, or redirect
  mismatches. Do not place tokens in URLs or expose a client secret in the app.
- Publish issuer metadata and signing keys with safe key rotation. Validate
  signature, issuer, audience, expiry/not-before, token type and authorized
  client server-side. Access tokens must be short-lived; the service owner must
  define and evidence the actual lifetime.
- Rotate refresh tokens on every use, bind their family to client/session,
  detect replay, revoke the family on reuse, and support immediate
  user/admin/incident revocation. Define absolute and idle expiry, logout,
  password-reset, account-disable, lost-device, and signing-key-compromise
  behavior. Return generic errors without account enumeration.
- Enforce independently verified MFA according to approved risk rules, with
  phishing-resistant options for privileged users. Document enrollment,
  step-up, recovery, factor replacement, trusted-device/device-binding policy,
  brute-force throttling, progressive lockout, anti-enumeration and
  suspicious-login alerts. Local biometrics may unlock local storage but do not
  satisfy server MFA.

## Resource-server contract

- Derive patient, tenant, role and scopes only from a validated server-side
  identity/session. Centralize deny-by-default authorization and check resource
  ownership on every read, mutation, export, document and telehealth operation;
  never trust a client-supplied patient/tenant identifier.
- Separate patient, clinician, support and administrator identities; require
  least privilege and stronger privileged access. Supply automated negative
  tests for horizontal/vertical access, guessed identifiers, stale/revoked
  tokens and tenant boundaries.
- Validate schemas and uploads, minimize response fields, enforce idempotency
  where needed, CSRF protection for cookie-authenticated requests, bounded
  pagination/body/file sizes, endpoint and account rate limits, timeouts and
  safe retry semantics.
- Emit integrity-protected, access-controlled audit events containing actor,
  action, resource **category** (not content), result, time and correlation ID.
  Never log credentials, tokens, message/document bodies or unnecessary PHI.
  Define retention, alert routing, clock synchronization and authorized access.
- Provide versioned OpenAPI/security/error contracts, deprecation windows,
  availability and incident contacts, data location/subprocessors, deletion and
  retention semantics, backup/restore objectives, and test/sandbox isolation
  using synthetic data.

## Platform-dependent controls

TLS is mandatory. Certificate pinning needs server-controlled backup pins,
overlap during rotation, expiry monitoring, tested fail-closed behavior and an
emergency update plan; otherwise document why platform trust is safer. Device
or app attestation requires platform support, server verification, replay
prevention, privacy review and a recovery path; client collection alone is not
enforcement. Any E2EE claim requires a protocol design and independent review
covering endpoint keys, rotation/recovery, multi-device use, backups, metadata,
notifications and clinical/vendor participants.

NaviMED/hosting owners must separately evidence WAF/DDoS, ingress/egress and
VPC boundaries, service-to-service identity, KMS/secrets, SIEM alerts,
vulnerability/patch management, immutable backups and tested restore. Mobile
traffic remains internet-facing, and repository code cannot verify these
operational controls.

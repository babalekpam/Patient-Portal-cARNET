# CARNET Threat Model

## Project Overview

CARNET is an Expo/React Native patient portal that connects patients to the external NaviMED API for profiles, appointments, prescriptions, laboratory results, messages, visits, bills, documents, and telehealth. The workspace also contains a small Express service used for health checks and a fixed-target NaviMED relay for web clients.

This system handles protected health information (PHI), account credentials, bearer tokens, uploaded medical documents, and sensitive communications. Mobile clients and browsers are untrusted. Authentication and authorization must be enforced by the API, not by client navigation or UI state.

## Assets

- **Patient identity and credentials** — compromise permits account takeover.
- **Session and CSRF tokens** — compromise permits impersonation and unauthorized actions.
- **PHI** — profiles, appointments, prescriptions, laboratory results, messages, visits, bills, uploaded documents, and telehealth details.
- **Signing and service credentials** — App Store, push, deployment, API, and service-account credentials.
- **Audit evidence** — trustworthy records of access, changes, exports, and administrative actions.
- **Availability** — patients must be able to access time-sensitive care information and communications.

## Trust Boundaries

- **Mobile device to NaviMED API** — requests cross the public internet and must use authenticated TLS.
- **Browser to Replit relay** — the relay is internet-facing and must not become an unauthenticated general-purpose path to patient APIs.
- **Relay to NaviMED API** — authorization, method, path, payload size, and timeout controls are required.
- **Authenticated patient to other patients** — every resource lookup and mutation must be scoped to the authenticated patient server-side.
- **Patient to clinical/admin roles** — privileged clinical and administrative functions must be unavailable to patient sessions.
- **Application to local device storage** — tokens and cached PHI require platform-backed secure storage and lifecycle controls.
- **Application to third-party SDKs and services** — data disclosure must be minimized, documented, and contractually governed.
- **Development to production** — secrets, logs, test data, and access rights must remain separated.

## Scan Anchors

- Mobile authentication and session handling: `artifacts/mobile/context/AuthContext.tsx`, `artifacts/mobile/lib/api.ts`
- Provider/adapter lifecycle: `artifacts/mobile/context/EHRContext.tsx`, `artifacts/mobile/lib/ehr/adapters/`
- Offline PHI storage: `artifacts/mobile/lib/offline.ts`
- Browser relay and logging: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/lib/logger.ts`
- Expo permissions and native configuration: `artifacts/mobile/app.json`
- Production surfaces: mobile client, `/api/navimedi/*` relay, and external `https://www.navimedi.org/api`
- Dev-only visual tooling: `artifacts/mockup-sandbox/`

## Threat Categories

### Spoofing

Attackers may steal bearer tokens from device storage, reuse sessions on another device, brute-force passwords, or impersonate users where MFA and device binding are absent.

Required guarantees:

- Authentication MUST support an independently verified second factor for sensitive patient access.
- Access tokens MUST be short-lived, revocable, audience-bound, and stored using iOS Keychain or Android Keystore.
- Restored sessions MUST validate token expiry and server session state before exposing patient screens.
- Authentication endpoints MUST implement throttling, lockout protections, and suspicious-login monitoring.

### Tampering

Attackers may alter API requests, cached PHI, document metadata, or relay paths. A compromised device may manipulate client-side state.

Required guarantees:

- Every mutation MUST be authorized and validated server-side.
- The relay MUST allowlist paths and methods, cap request sizes, enforce timeouts, and forward only required headers.
- CSRF protection MUST remain enforced on applicable write requests.
- Client-side flags MUST never be treated as authorization decisions.

### Repudiation

Without immutable audit trails, users or operators may deny accessing, changing, sharing, or exporting PHI.

Required guarantees:

- Sensitive access and mutation events MUST generate PHI-safe audit records with actor, action, resource category, timestamp, result, and correlation ID.
- Audit logs MUST be access-controlled, integrity-protected, retained under policy, and monitored.
- Credentials, tokens, message bodies, document contents, and unnecessary PHI MUST NOT be logged.

### Information Disclosure

Bearer tokens and cached health data may be exposed through unencrypted local storage, screenshots, logs, committed credentials, overly broad API responses, or third-party SDKs.

Required guarantees:

- Tokens MUST use platform-backed secure storage; cached PHI MUST be encrypted with managed keys and minimized.
- Sensitive screens SHOULD prevent screenshots and recording where platform policy permits.
- API responses MUST return only fields required by the authenticated patient.
- Signing keys and service credentials MUST never be committed to source control and exposed credentials MUST be rotated.
- TLS MUST be enforced for all external traffic; pinning decisions MUST include a safe rotation and failure strategy.

### Denial of Service

Unthrottled authentication, unrestricted relay traffic, large bodies, dependency flaws, and slow upstream requests can exhaust resources or disrupt patient access.

Required guarantees:

- Public and authenticated endpoints MUST use layered rate limits and bounded request sizes.
- Upstream calls MUST have timeouts, cancellation, concurrency controls, and safe retry limits.
- WAF/DDoS controls and operational alerts MUST be verified for the production hosting path.
- Critical and high dependency vulnerabilities MUST be triaged and remediated continuously.

### Elevation of Privilege

Missing server-side role and ownership checks can let a patient access another patient's data or clinical/admin functions.

Required guarantees:

- All protected routes MUST authenticate the token and enforce resource ownership server-side.
- Role checks MUST be centralized, deny by default, and covered by negative authorization tests.
- Identifiers supplied by clients MUST never determine access without server-side ownership checks.
- Internal and administrative tools MUST require separate identities, least privilege, and strong authentication.

## Security Assurance Requirements

- HIPAA, HITECH, GDPR, and PCI-DSS MUST NOT be claimed from code alone. Applicability, contracts, risk assessments, policies, training, retention, breach procedures, vendor agreements, and independent evidence are required.
- SAST, dependency scanning, secret scanning, privacy dataflow scanning, and DAST SHOULD run in CI with release-blocking severity thresholds.
- Independent penetration testing, incident-response exercises, and third-party SDK reviews SHOULD occur on a documented schedule.
- Security-sensitive changes SHOULD require designated security review and evidence of verification.
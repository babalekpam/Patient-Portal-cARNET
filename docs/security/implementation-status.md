# Implemented security boundaries and remaining blockers

**Evidence date:** 2026-09-08, America/Chicago. This is not a compliance
attestation, independent penetration test, or approval to handle real patients.

## Implemented here

- Native bearer tokens and bounded local record JSON use Expo SecureStore
  (Keychain/Keystore), device-only and accessible while unlocked. Chunk writes
  commit metadata last, serialize access, and fail explicitly on corruption or
  size/storage errors. This is OS-backed storage, not custom cryptography.
- Browsers retain tokens and local records in JavaScript memory only.
  Reloading closes the browser session. No token/PHI persistence to browser
  localStorage, sessionStorage, or IndexedDB is intentionally used.
- Legacy plaintext tokens and local PHI are deleted, not migrated. This policy
  was approved for the synthetic-data environment. New sign-in, sign-out and
  expiry clear local records, sharing permission, notifications and picker
  cache. The application does not delete patients' original photo-library files.
- Locally enforced five-minute inactivity and fifteen-minute maximum sessions
  respect earlier server-returned expiry. These are **local** cutoffs: they do
  not shorten the issuer's token lifetime or revoke a stolen token upstream.
- Credentials bind to the selected provider **and canonical issuer address**.
  Request-generation checks reject stale responses across account/session
  switches, including a previous session's delayed 401 or JSON response.
- Authenticated route guards, query-cache cleanup, a background privacy
  curtain, and native screen-capture prevention are implemented. Browser
  screenshots cannot be blocked. OS/device-version behavior still needs
  physical-device verification; a second camera cannot be prevented.
- Document previews are session-only memory. Only metadata is written to
  SecureStore. Temporary app-owned ImagePicker copies are removed. There is
  no claim of an encrypted long-term document vault.
- Sharing is off by default with an explicit opt-in and warning. Shared
  copies leave the application's control. Medication notifications contain
  generic text, not medication names, dosage or patient identifiers.
- Biometric enablement requires an OS authentication prompt. Biometrics are
  a local unlock convenience, **not MFA**.
- The web relay has exact path/method and JSON-payload allowlists, Bearer
  presence checks, CSRF forwarding/checks, restricted CORS, safe headers,
  bounded request/response sizes, cancellation/timeouts, per-instance
  throttling, and PHI-safe logs. The public project-download route is removed.
- Static Expo delivery serves only bounded startup asset snapshots, not
  request-derived filesystem paths; traversal and source/key-like files are
  rejected.
- The CARNET patient client integrates the read-only
  `GET /patient/insurance-history` contract through the NaviMED adapter and
  direct fallback. Strict parsing preserves null versus explicit zero amounts,
  keeps medical-treatment and medication pages separate, and uses
  session-generation/account-scoped caches that are cleared on logout or
  provider changes. The web relay allowlist accepts only this patient route's
  bounded pagination parameters and always requires a Bearer credential.
- CI definitions cover redacted secret scanning, CodeQL and dependency audit.
  An added workflow is not evidence that GitHub Actions, branch protection,
  required checks or review approvals have been enabled.

## Native routing is intentionally direct

iOS and Android NaviMED requests still go directly to
`https://www.navimedi.org/api`. Only Expo Web uses the CARNET `/api/navimedi`
relay. This preserves the production native routing rather than redirecting
patients' credentials to a transient development host.

**Consequences:** relay rate limits, validation, timeouts and header filtering
do not protect direct native traffic. Nor does checking Bearer presence in
the relay validate a token, verify a patient, or enforce ownership/RBAC.
NaviMED must authenticate and authorize every request, validate every input,
rate-limit abuse, revoke sessions and enforce cross-patient/tenant isolation
at its own boundary. An attacker can call NaviMED without using CARNET.

Production web deployments must configure exact HTTPS `TRUSTED_CORS_ORIGINS`.
Only development permits the exact `REPLIT_EXPO_DEV_DOMAIN`; this is not a
wildcard trust of development domains. In-memory relay limits are per
process and are not distributed WAF/DDoS or account-lockout protection.

## Release blockers

1. **Exposed Apple keys:** on September 8, 2026, the owner reported that all
   three Key IDs identified by the four tracked filenames were revoked or
   already inactive. This is owner-reported, not independently verified
   through Apple's API. The four working-tree files have been removed and
   `.p8` files are now ignored by Git. Historical commits, attachments,
   archives and external copies have not been purged or verified by this
   cleanup. No history rewrite or replacement-key generation was performed.
   Any needed replacement must be configured through secure credential
   handling, never committed or uploaded to chat. Revocation verification
   and agreed historical-copy cleanup remain part of credential remediation.
2. **Dependency gate cleared:** the latest September 8, 2026 workspace and
   pnpm audits both report **0 critical, 0 high, 0 moderate and 0 low**
   findings. The previously retained image-size dependency is now removed
   from both Metro dependency paths and replaced with an independent
   synchronous parser plus bounded KTX support. The decoder is upgraded to
   the genuine published 0.5.0 release, with CommonJS compatibility and
   additional malformed-input hardening. No warnings are suppressed or
   package versions disguised. The high/critical dependency audit now passes.
   This clears the dependency gate, not the other release requirements below.
   See [dependency remediation](./dependency-remediation.md).
3. **Expo compatibility gate cleared:** all ten recommended SDK 54 package
   updates are installed. Expo is now 54.0.37; React Native remains 0.81.5 and
   React remains 19.1.0. The compatibility check reports dependencies are up
   to date, and Expo Doctor passes all 18 checks. Existing dependency security
   patches remain active and both dependency audits still report zero findings.
   These are source/dependency updates, not proof of native-device behavior.
   Physical-device verification and a new native release remain outstanding;
   no iOS/Android binary was built or published.
4. **Issuer/resource-server controls:** PKCE/OAuth, MFA/recovery/lockout,
   server token lifetime/rotation/revocation, patient/tenant RBAC and negative
   authorization tests require the NaviMED backend and staging access.
   Generic FHIR sign-in must receive a server-issued patient context; an
   unqualified Patient search is never an identity lookup.
5. **Device and operational evidence:** physical iOS/Android testing, pinning
   with an approved key-rotation plan, root/jailbreak/attestation enforcement,
   E2EE design, independent penetration testing, monitoring/SIEM/WAF,
   backups, incident response adoption and jurisdictional/legal review
   are not demonstrated by this repository.
6. **Distribution:** these changes are not in the existing App Store binary.
   The previously reported Expo Launch/App Store association issue is a
   separate release blocker. No publishing was attempted in this pass.
7. **Insurance-history deployment and live verification:** the endpoint is
    documented as implemented in NaviMED development only; no production VPS
    deployment was performed. The only available backend evidence is the
    uploaded synthetic API summary. No separate fixture source or test
    accounts/credentials were provided, and no live/native-device verification
    was possible. Do not treat the client contract tests as production endpoint
    or upstream patient-isolation evidence.

## Verification scope

Automated tests exercise chunked storage with a mocked platform driver,
session expiry/issuer/generation/cleanup behavior, relay policy and HTTP
forwarding with a mocked upstream, and static-file delivery attacks. These
tests do not prove Keychain/Keystore, biometric hardware, screenshots, real
NaviMED authorization or production infrastructure behavior.

The privacy dataflow scanner and latest static scan returned no findings.
Mobile and API TypeScript checks passed. Local verification passed 19 mobile
storage/session/confirmation tests, 12 relay tests, and 6 static-serving tests.
Dependency remediation additionally passed 8 installed-package security and
compatibility tests, bringing the verified total to 45 tests; all workspace
TypeScript checks passed.
The running preview renders sign-in, and live local HTTP checks returned 200
for health, 401 for protected requests without a token, 404 for the removed
download endpoint, and 204 for the exact Expo development-origin preflight.

Browser security verification uses synthetic patient responses intercepted
by the test browser, not actual NaviMED authentication. It therefore cannot
verify upstream ownership, real credential handling, rate limits or MFA.
The verified browser paths include signed-out deep-link guards, sign-in,
privacy opt-in, rejected-session sign-out, and explicit clear-data confirmation:
Cancel preserves the active session; Confirm returns to sign-in; Back cannot
reopen the protected page. A first browser check exposed a nonfunctional native
alert on web; the cross-platform confirmation was fixed and this path rechecked.
A clean automated scan does not demonstrate compliance or eliminate all
vulnerabilities.
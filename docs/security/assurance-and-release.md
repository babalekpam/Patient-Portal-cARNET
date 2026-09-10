# Assurance register and release checklist

**Status date:** 2026-09-07 (America/Chicago). This is an engineering template, not an adopted
policy or compliance attestation. “Documented” means criteria exist, not that a
runtime control has been verified.

## Evidence status

| Control | Owner / boundary | Status and evidence required before patient use |
| --- | --- | --- |
| Threat model and trust boundaries | CARNET | **Documented:** `threat_model.md`; re-review after architecture/dataflow changes. |
| Secure mobile token storage and cached-PHI lifecycle | CARNET mobile | **Implemented in source; device validation outstanding.** See `implementation-status.md`. Require device tests for lock/logout/reinstall/backup, screenshot policy, storage failures, and lost-device response. |
| OAuth authorization code + PKCE; redirect/universal-link validation | NaviMED + mobile | **External blocker.** Current password/bearer interface is not evidence. Require conformance evidence described in `external-backend-requirements.md`. |
| MFA, recovery, brute-force throttling, lockout, suspicious-login alerts | NaviMED identity service | **External blocker; not implemented here.** Biometrics/device unlock is not MFA. Require test records and operating ownership. |
| Short-lived, audience-bound access tokens; rotating refresh tokens, replay detection, revocation, device/session inventory | NaviMED identity service | **External blocker; not verified.** Do not claim short expiry or device binding. |
| Server-side resource ownership and centralized deny-by-default patient/clinical/admin RBAC | NaviMED resource server | **External blocker; not verified.** Require negative cross-patient/cross-tenant/role tests and audit evidence; UI routes are not authorization. |
| Relay allowlist, methods, body/concurrency limits, timeouts, header filtering, CSRF/CORS and rate limits | CARNET API + hosting | **Implemented and locally tested for the web relay only.** Native clients call NaviMED directly. Equivalent upstream protections and production CORS/edge limits remain release blockers; see `implementation-status.md`. |
| PHI-safe audit trail and monitoring | NaviMED + operations | **External/operational blocker.** Require actor/action/resource class/result/time/correlation ID without tokens or PHI payloads; prove access control, integrity, retention, alerts, and clock synchronization. |
| TLS; certificate-pinning rotation/failure design; app/device attestation | NaviMED + mobile + platform operations | **External dependency / decision pending.** Require hostname/TLS evidence. Pinning and attestation must not be claimed until server keys, rotation, outage recovery, and enforcement are tested. |
| End-to-end encryption for messages/telehealth | NaviMED + communication vendors | **Architecture dependency, not claimed.** TLS alone is not E2EE. Document endpoints, key ownership/recovery, metadata exposure, participant authentication, backup, and lawful/clinical access requirements before selecting it. |
| WAF/DDoS, VPC/network segmentation, secrets/KMS, backups/restore, SIEM/on-call | Hosting/NaviMED operations | **External permission blocker.** Repository CI cannot prove runtime configuration. Require provider exports/screenshots, alert tests, restore exercise, access review, and incident contacts. A VPC does not protect the public mobile-to-NaviMED path. |
| Secrets, SAST, and dependency scanning | Repository owner | **CI defined:** `.github/workflows/security.yml`. Findings still require triage. Repository owner must enable Actions/GHAS features as applicable and protect the release branch; no branch protection or mandatory review is claimed here. |
| Vendor/SDK privacy and supply-chain review | Product/security/privacy | **Template documented:** `vendor-review.md`; no vendor approval is implied. Produce inventory, SCA/SBOM results, contracts and dataflow decision. |
| Penetration test, privacy dataflow review, accessibility/safety review, incident exercise | Independent assessor + owners | **Not performed.** Complete on a production-equivalent environment before patient use and after material change. |
| Privacy/legal program: notices/consent, data-subject and deletion handling, retention, BAAs/DPAs, training and risk assessment | Privacy/legal/organization | **Not adopted / external.** Store-listing answers and deletion-page text are not proof of implementation or legal sufficiency. |

## Release evidence checklist

For a candidate release, the release owner links evidence in the change/release
record; do not paste credentials, tokens, PHI, raw scanner output containing
sensitive values, or unredacted production logs.

- [ ] Scope, dataflow, threat model changes, data classification, and production
      endpoints reviewed; test fixtures contain only synthetic data.
- [ ] All rows above are either verified with dated evidence and an owner or the
      release remains blocked. External NaviMED evidence includes OAuth/PKCE,
      MFA/recovery/lockout, token lifecycle/revocation/device binding, ownership
      and RBAC negative tests, and PHI-safe audit records.
- [ ] Security CI is green; high/critical SAST/SCA/secret findings are fixed or
      have a time-bounded, owner-approved exception. An exposed secret is
      revoked, not merely removed from source.
- [ ] Mobile device tests cover secure storage, lock/logout/expiry, cache purge,
      backup exclusion, screen capture, notification redaction, deep links,
      rooted/jailbroken-device decision, and least-privilege permissions.
- [ ] API/relay tests cover authentication, CSRF where applicable, ownership and
      tenant isolation, deny-by-default roles, schema/file validation, path and
      method allowlists, size/rate/concurrency limits, timeouts, safe errors,
      CORS, and absence of credentials/PHI in logs.
- [ ] TLS, signing/provenance, SBOM, SDK/vendor approvals, privacy disclosures,
      account/data deletion behavior and retention have named approvers.
- [ ] Production operations supply evidence for WAF/DDoS, network boundaries,
      KMS/secrets access, immutable audit/SIEM alerts, backup restore, least
      privilege, on-call and rollback. Incident contacts and revocation paths
      have been exercised.
- [ ] Independent penetration test and incident tabletop findings are closed;
      privacy/legal has authorized the intended jurisdictions and data use.

Repository owners must configure protected branches, required status checks,
environment approvals, least-privilege deployment identities, and designated
security review in GitHub/hosting administration. This repository does not
assert those settings are enabled, and this workflow does not deploy.

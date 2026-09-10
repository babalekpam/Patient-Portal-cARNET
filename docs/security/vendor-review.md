# Vendor, SDK, and dependency review gate

This is an intake/renewal template, not a vendor approval or adopted
procurement/privacy policy. Apply it before adding an SDK/service, on material
version or dataflow change, after an incident, and at an owner-defined periodic
review.

## Decision record

- Business need, owner, exact package/service/version, publisher and support/EOL
  status; document a lower-data or first-party alternative and exit plan.
- Dataflow: every collected/transmitted/stored field, PHI/personal-data class,
  purpose, endpoint, platform permission, retention/deletion, location,
  subprocessors, training/advertising/analytics use and user controls. Default
  to no PHI in analytics, crash reports, notifications or support tooling.
- Security: architecture and attestations **with scope/date**, vulnerability and
  incident history, disclosure/patch SLA, tenant isolation, encryption and key
  ownership, access/audit controls, backup/deletion verification, breach notice
  terms and incident contacts. Obtain BAA/DPA or other terms only when
  privacy/legal determines they are required; a contract is not technical proof.
- Mobile SDK behavior: permission necessity, background collection, device
  identifiers, dynamic code/WebView/native modules, TLS/pinning interaction,
  attestation compatibility, logging defaults and opt-out/kill switch.
- Supply chain: verify registry/publisher and repository provenance, inspect
  install scripts/native binaries and transitive dependencies, generate/review
  an SBOM, run SCA and license review, use the workspace lockfile and existing
  minimum-release-age controls, and record critical/high findings or a
  time-bounded owner-approved exception. Do not edit dependency state from this
  documentation process.
- Operations: least-privilege service identity, secret rotation/revocation,
  sandbox/production separation, availability/restore objectives, monitoring,
  export/portability, termination deletion certificate and responsible owner.

Approval requires product, security, privacy/legal and operations decisions
appropriate to the data and risk, with date, evidence links, constraints,
renewal date and removal owner. Reject or isolate a vendor when required
evidence/contract terms are unavailable. CI SCA detects known package issues but
does not approve vendors, privacy behavior, contracts, native code or runtime
configuration.

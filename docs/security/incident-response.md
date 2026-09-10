# Security and privacy incident response template

This is an engineering procedure template, not an adopted incident, legal, or
breach-notification policy. Before patient use, the organization must name a
24x7 incident commander, security lead, privacy/legal decision maker,
communications lead, NaviMED/vendor contacts, backups, and an out-of-band
contact channel; approve jurisdiction-specific timelines; and exercise it.

1. **Report and triage.** Open a restricted case, record reporter, UTC times,
   systems/data possibly affected, indicators and safety/availability impact.
   Assign severity and incident commander. Do not put PHI or secrets in tickets
   or chat; link to access-controlled evidence.
2. **Contain safely.** Preserve care availability where possible. Disable
   affected accounts/routes/integrations, isolate hosts, block indicators and
   stop suspect releases. Coordinate with NaviMED/hosting rather than altering
   third-party evidence. Record every action and decision.
3. **Revoke credentials.** Revoke exposed API/deployment/signing credentials at
   the issuer, invalidate access/refresh token families and sessions, rotate
   server keys using overlap/runbooks, reset affected MFA/recovery paths, and
   remove unauthorized identities. Removing a value from Git is not
   revocation. Verify old credentials fail without printing them.
4. **Preserve and investigate.** Snapshot relevant logs/configuration and
   provenance with UTC timestamps, hashes, chain of custody and least-privilege
   access. Collect only necessary data; do not run destructive cleanup before
   preservation. Determine entry, duration, affected tenants/people/data,
   access/acquisition/exfiltration, integrity, availability and vendor scope.
5. **Privacy/breach assessment.** Privacy/legal documents applicable laws and
   contracts; data type and identifiability; whether PHI/personal data was
   accessed, acquired, altered or unavailable; encryption/key status; likely
   harm/misuse; recipients and mitigation. They—not engineers—decide whether
   the event is a reportable breach and direct notifications to individuals,
   regulators, customers, insurers or law enforcement within applicable
   deadlines. Preserve the rationale even when notification is not required.
6. **Eradicate and recover.** Fix root cause, rebuild from trusted artifacts,
   restore and validate data, run focused authorization/security tests, increase
   PHI-safe monitoring, and obtain incident/security/operations approval before
   re-enabling. Notify affected vendors through approved channels.
7. **Close and improve.** Within the organization’s approved timeframe, hold a
   blameless review; assign owners/dates for control, threat-model, test,
   retention and training changes. Retain the case/evidence under approved
   legal and records policy and verify follow-up actions.

If contacts or legal authority are unavailable, keep real patient data out of
the system; do not substitute guessed contacts or notification deadlines.

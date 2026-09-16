# CARNET laboratory handoff — source verification

## Implemented

The laboratory integration includes patient-only list, explicit read, and reply
operations. Threads group by laboratory order while writes address a message
row. Opening a thread does not mark it read. Unsupported providers do not
advertise laboratory operations.

Development native and web-relay destinations are configured independently.
Web requests declare their expected backend identity; the relay rejects a
mismatch before forwarding any credential. Neither override is a production
configuration. Stored sessions must retain issuer and session ownership.

General messaging remains list/compose, not verified two-way threading. Profile
saves require a fresh read and comparison before confirmation.

## Source checks completed

- Workspace typecheck passed before the final safety fixes.
- Mobile, API server, and scripts typechecks passed after those fixes.
- Relay policy/upstream checks, relay integration tests, adapter/config tests,
  and insurance/session regression checks passed.
- The sanitized live harness synthetic regression passed with distinct account
  and patient-record IDs, strict mobile login/profile parsers, retained
  credential-to-fixture mapping, and exact password-byte preservation.
- Security review approved the combined implementation, not the original
  unmodified laboratory pull request.

## Sanitized live evidence — 2026-09-16

- One bounded direct-target run covered each retained role independently
  (A1, A2, and B1) against the exact temporary `/api` backend. Each role
  completed patient login, tenant-bound profile validation, one laboratory
  message GET followed by a second reload GET, one lab-results GET, logout,
  and rejection of the old bearer.
- One bounded local web-relay run covered A1, A2, and B1 independently. The
  relay request used the source-defined `/api/navimedi` route and the exact
  temporary upstream issuer header. Each role completed the same read-only
  profile/laboratory/logout lifecycle; the relay performed its own protected
  login pre-auth exchange.
- The runs performed no laboratory read-state POST, reply POST, fixture
  creation, fixture cleanup, or other clinical mutation. Returned
  result/message IDs are checked for cross-role overlap in `--role all` mode
  when IDs are present, without printing them.

The retained fixture envelope did not expose known expected laboratory-message
or laboratory-result IDs through the supported expected-key paths. Therefore
the runs do **not** claim message/result ownership, A1/B1 positive-result
proof, A2 no-released-results proof, unread-state preservation, or
cross-tenant resource ownership. The reload GETs were exercised, but a
fixture-specific read-state assertion was intentionally skipped rather than
replaced with a count assertion.

The sequential all-role run did not keep B1 active while A1 was logged out;
cross-session “B remains valid after A logout” isolation is not verified.
Laboratory-actor login/tenant isolation, laboratory-authored read-state
behavior, and laboratory reply authorization remain unverified. No physical
device, supported native build, production release, or native-device
read-state check has been performed. Backend HTTP evidence must not be
described as CARNET device evidence. Preserve any initial unread laboratory
message during future device baselines.

No production requests, native-device requests, fixture
recreation, or test cleanup were performed.

Credentials and fixture data belong only in development Secrets:
`CARNET_TEST_CREDENTIALS_JSON` and `CARNET_TEST_FIXTURE_JSON`.
Never expose them through public Expo configuration, source, logs, or chat.
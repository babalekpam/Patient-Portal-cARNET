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
- Security review approved the combined implementation, not the original
  unmodified laboratory pull request.

## Not yet verified

The temporary backend health check returned HTTP 502 during this handoff.
Synthetic credentials and fixture identities were not available in this
workspace. Consequently no genuine live login, clinical-data request, reply,
read-state, cross-account isolation, or live token revocation was verified
by CARNET during this work.

The read-only live harness is an initial single-patient smoke check, not proof
of all-patient or cross-tenant authorization. Full retained-fixture checks for
the other patients and laboratory actors remain required. Backend-reported
HTTP proof must not be described as CARNET device evidence.

No physical-device, supported native-build, or production-release verification
has been performed. Preserve the initial unread laboratory message during the
device baseline. Do not recreate fixtures or run cleanup until testing ends.

Credentials and fixture data belong only in development Secrets:
`CARNET_TEST_CREDENTIALS_JSON` and `CARNET_TEST_FIXTURE_JSON`.
Never expose them through public Expo configuration, source, logs, or chat.
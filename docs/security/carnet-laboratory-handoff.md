# CARNET laboratory handoff — source verification

## Current handoff status

The reported development checks are complete for patient/tenant isolation,
laboratory reply delivery, read-state persistence, and patient/staff logout
revocation. The chronological evidence below is preserved; later results
supersede earlier blocked or unverified entries. Do not repeat completed checks
unless relevant code changes invalidate their evidence.

Remaining limitations:

- Laboratory receipt is not attributed separately to direct API versus web
  relay. Existing replies cannot establish that distinction retrospectively.
- A2 demonstrates pending-order exclusion only. No actual A2 lab-result row
  exists, so filtering an existing unreleased result has not been tested.
- Actual iOS and Android device verification remains pending.
- NaviMED production deployment and authenticated verification remain blocked
  and belong to the NaviMED agent. Development evidence is not production
  certification.

Keep the retained fixture intact. Do not recreate accounts, clean up records,
add messages, or publish production builds. Await the user's instructions
before starting device testing.

## Device-testing checklist — pending user availability

Run separately on an iPhone and Android phone when the user has their laptop:

1. Record the app revision, device model, OS version, and Expo/native build
   identifier. Confirm the explicitly configured development backend; never
   substitute production. Use existing synthetic accounts privately.
2. Launch CARNET and sign in as A1. Check usable loading/error states and that
   A1's referenced released results, messages, existing replies, and recorded
   read-state display correctly. Reload without sending or marking anything.
3. Log out, then sign in as B1 on the same device. Confirm only B1's referenced
   records appear, including after reload and navigating back. No A1 data
   should remain visible.
4. Log out and sign in as A2. Confirm the pending order does not appear as a
   released result. Record this as pending-order exclusion, not unreleased
   result filtering.
5. Log out, close and reopen the app, and confirm protected records are not
   accessible without authentication. Check layout, scrolling, keyboard, and
   accessible labels on each platform without altering clinical data.
6. Record sanitized PASS/FAIL/BLOCKED outcomes per platform and revision.
   Capture no credentials, cookies, tokens, record IDs, or clinical content.
   Device results do not remove the production blockers or receipt-attribution
   limitation.

This is a read-only clinical device baseline: authentication/logout are
permitted when testing is authorized, but new replies, read-state mutations,
fixture changes, and builds/publication require separate instructions.

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
  order/message/result IDs are checked for cross-role overlap in `--role all`
  mode when IDs are present, without printing them.

The retained fixture envelope did not expose known expected laboratory-message
or laboratory-result IDs through the supported expected-key paths. Therefore
the runs do **not** claim message/result ownership, A1/B1 positive-result
proof, A2 no-released-results proof, unread-state preservation, or
cross-tenant resource ownership. The reload GETs were exercised, but a
fixture-specific read-state assertion was intentionally skipped rather than
replaced with a count assertion.

The initial sequential all-role run did not keep B1 active while A1 was logged
out. The subsequent concurrent check below verifies this session behavior.
Laboratory-actor login/tenant isolation, laboratory-authored read-state
behavior, and laboratory reply authorization remain unverified. No physical
device, supported native build, production release, or native-device
read-state check has been performed. Backend HTTP evidence must not be
described as CARNET device evidence. Preserve any initial unread laboratory
message during future device baselines.

No production requests, native-device requests, fixture
recreation, or test cleanup were performed.

Credentials and fixture data belong only in development Secrets:
`CARNET_TEST_CREDENTIALS_JSON`, `CARNET_TEST_FIXTURE_JSON`, and the bounded
`CARNET_TEST_RECORD_REFERENCES_JSON` record-reference envelope.
Never expose them through public Expo configuration, source, logs, or chat.

## Development-only harness follow-up — 2026-09-16

- The live harness now accepts `--role isolation` as a separate, bounded
  A1+B1 check. It establishes both genuine sessions concurrently, validates
  both responses with the existing strict mobile login/profile parsers, reads
  laboratory messages/results with GET-only requests, revokes A1, and then
  validates B1's still-active bearer and patient-record/tenant profile before
  revoking B1. Direct and relay targets remain separate invocations.
- The isolation flow preserves the initial unread laboratory marker when a
  supported expected message field, or an unambiguous single-row order field,
  is present. It never marks a message read, replies, creates fixtures, or
  cleans up fixture data.
- Fixture parsing recognizes only documented, bounded expected order/message/
  result key names and role-labelled paths. If those markers are absent or
  ambiguous, ownership and unread-state assertions remain unclaimed rather
  than inferred. Returned IDs are used only for in-memory overlap checks and
  are never printed.
- `pnpm --dir scripts run typecheck` and
  `pnpm --dir scripts test` passed for this harness change.
- Bounded live runs of `--role isolation --target direct` and
  `--role isolation --target relay` both passed. Genuine A1 and B1 sessions
  were concurrently active; A1 logout rejected A1's old bearer while B1's
  patient/tenant profile remained valid. B1 was then logged out.
- These runs issued only authentication/session operations and clinical GETs.
  Conditional marker/overlap diagnostics do not establish that concrete
  clinical ownership or unread-state assertions were available. Those remain
  evidence gaps, as do laboratory actor authorization and device testing.

## External production blocker report — 2026-09-16

The user reports that production is not ready because
`lab_patient_messages`, `auth_sessions`, insurance `filing_type`, runtime role
configuration, and NaviMED function/policy dependencies are missing or
unverified. This is an external report and was **not independently verified in
this repository**. No production network, database, backend, or configuration
changes were made here. These items remain release blockers alongside the
existing external backend and operational requirements.

## Authorized clinical integration follow-up — 2026-09-16

A separate focused harness was added at
`scripts/src/carnet-clinical-live-test.ts` (invoked with
`pnpm --dir scripts run carnet:clinical:test -- --target direct|relay`). It
contains the explicitly authorized synthetic patient reply and mark-read
checks, strict A1/A2/B1 fixture ownership checks, cross-patient read/reply
negative checks, retained-session cleanup in `finally`, and fixed
rate-limit/response bounds. The harness does not create, delete, or reset
clinical records.

The local checks completed:

- `pnpm --dir scripts run typecheck` passed.
- `pnpm --dir scripts test` passed (3 tests).
- The bounded record-reference envelope resolved exact retained A1/B1
  order/message/released-result markers and the A2 pending-order marker, with
  explicit reference owners matching the independently resolved patient
  identities. A2 carries no result reference.
- The earlier full direct and relay attempts passed reference/identity
  validation, authentication, and all A1/B1 patient checks before stopping at
  the old A2 pending-message prerequisite. That old stop was a harness
  assumption, not evidence that A2 had to expose an order message. Every
  issued bearer entered the retained revocation path; no fixture change or
  fixture cleanup occurred.

The A1/B1 evidence from those later direct and relay attempts is concrete:
exact retained ownership for each patient, cross-patient read/reply rejection
without a session-owned message change, and permitted own mark-read plus
synthetic-reply persistence after GET reload. An earlier pre-fix direct
attempt stopped at a reply-status predicate and is not counted; the later
direct and relay attempts reached those A1/B1 checks.

The exact development fixture/state request to NaviMED is: retain and expose
an existing A1 laboratory message UUID and released-result record ID(s), an
existing B1 laboratory message UUID and released-result record ID(s), and an
existing A2 pending laboratory order ID. If an unreleased result is part of
the intended A2 check, retain that existing result and its unreleased state
as well; the harness must never manufacture one. The patient/tenant identity
markers are present and were not disclosed.

The local handoff, relay route policy, and mobile adapter document patient
laboratory list, patient mark-read, and patient reply operations only. They do
not document a laboratory-staff authentication contract or a staff receipt
route. No guessed staff URL was called. Therefore laboratory visibility of a
patient reply to the correct lab remains a precise contract gap requiring a
genuine staff credential, documented login/tenant contract, documented
message-receipt route, and response ownership fields before it can be tested.

## Authorized clinical reference follow-up — 2026-09-16

The focused clinical harness now consumes the separately bounded
`CARNET_TEST_RECORD_REFERENCES_JSON` secret. It accepts only role-labelled
existing-record references with an explicit owner (`patientId` and tenant
identity); it never promotes an ID discovered in a returned response into an
ownership assertion. A1 and B1 require an exact retained order, message, and
released-result reference. A2 requires an exact retained pending-order
reference and an explicit no-result-row reference. Ambiguous, unassigned, or
unreleased-only result markers fail closed with a sanitized predicate/schema
failure.

The harness uses strict login/profile identity parsers, bearer plus CSRF
headers for writes, a bounded one-way 429 cooldown (no retry bypass), and a
`finally` revocation path for every issued bearer. It performs only the
authorized patient mark-read and synthetic reply writes; it does not create,
delete, reset, or clean up fixture records. Cross-patient read/reply attempts
must reject and the session's own message snapshot must remain unchanged.

Local verification:

- `pnpm --dir scripts run typecheck` — PASS.
- `pnpm --dir scripts test` — PASS (3 tests).
- `pnpm --dir scripts run carnet:clinical:test -- --role a2 --target direct`
  — PASS (process exit 2 is the documented laboratory-staff receipt GAP).
- `pnpm --dir scripts run carnet:clinical:test -- --role a2 --target relay`
  — PASS (process exit 2 is the documented laboratory-staff receipt GAP).

Both direct and relay invocations used retained references without printing
secret values, IDs, bodies, credentials, or secret keys. The targeted A2
checks used the supplied private pending-order reference as the only order
evidence, verified that the returned released-results list was empty (and
therefore contained no row for that pending order), and made no API
order-presence claim. They make no unreleased-result filtering claim because
A2 has no result row. Patient staff receipt remains unverified because no
documented laboratory-staff login/tenant contract or receipt route is
attached. These development HTTP checks are not native-device evidence and
are not a production certificate; no repeated full clinical mutation run,
production call, configuration change, native build, or fixture cleanup was
performed.

## Authorized laboratory-staff receipt follow-up

The attached development laboratory-staff contract is implemented in the
separate focused harness
`scripts/src/carnet-laboratory-staff-live-test.ts`, invoked with:

```text
pnpm --dir scripts run carnet:lab:staff:test
```

The harness is direct-target only and hard-pins the temporary development API
origin. It consumes the retained `labActorA`/`labActorB` cookie credentials
from `CARNET_TEST_CREDENTIALS_JSON`, patient fixture identities from
`CARNET_TEST_FIXTURE_JSON`, and explicit A1/B1 ownership references from
`CARNET_TEST_RECORD_REFERENCES_JSON`. The supported ownership record requires
`patientTenantId`, `laboratoryTenantId`, `patientId`, `labOrderId`, and
`senderId` (the intended patient user). A retained `messageId` is treated as
thread metadata, not receipt ownership; a returned row ID is used only after
all authoritative ownership fields match. Ambiguous or unassigned records
fail closed.

It performs the contract's pre-auth CSRF GET, cookie login, post-login CSRF
refresh, laboratory inbox GET, strict patient-to-laboratory ownership checks,
other-laboratory exclusion check, authorized `{}` mark-read POST and reload
persistence check. It also submits the retained A1 message ID to the other
laboratory's mark-read route and requires authorization failure. It never
changes patient bearer authentication or the patient relay allowlist, sends
no new patient replies, creates or cleans up fixtures, or guesses a staff
logout route. Cookie jars and CSRF values are destroyed locally in `finally`;
server-session revocation is explicitly unclaimed because the contract does
not document staff logout.

The harness can correlate prior direct and web-relay replies when the retained
reference includes both exact `directReplyMarker` and `relayReplyMarker`
(or a `replyMarkers` object with `direct` and `relay`). Without those source
markers it reports a sanitized direct-vs-relay attribution gap rather than
guessing. It emits no credential, cookie, token, identifier, body, message
content, or secret-key values. A bounded HTTP 429 stops the run without retry
or limiter bypass. Production remains held and actual-device testing remains
separate.

### Bounded development result — 2026-09-16

The bounded direct run completed with a sanitized PASS. The retained
credential envelope is a positional account array; the harness now accepts
only the exact email/password account-record predicate and aligns it to the
same-length fixture identity array. `labActorA` and `labActorB` are selected
by the documented lab-actor account marker and the fixture-linked laboratory
tenant, never by a patient-record ID.

The retained reference envelope contained an existing thread anchor in the
laboratory-to-patient direction for one role. The harness did not treat that
anchor's sender as patient evidence. It required the exact patient fixture
user identity, then matched the existing patient-to-laboratory inbox row on
`patientTenantId`, `laboratoryTenantId`, `patientId`, `labOrderId`,
fixture-linked patient `senderId`, and `direction`. Returned row IDs were used
only after that complete ownership match to address the authorized read
mutation. No values or IDs were printed.

The run verified genuine cookie staff login for both retained lab actors,
post-login CSRF refresh, both intended inbox receipts, exclusion from the
other laboratory, wrong-lab mark-read rejection, and read-state persistence
after reload. The retained references did not distinguish direct from
web-relay reply source, so source attribution remains an explicit GAP rather
than a guess. The undocumented staff logout route was not called; local jars
were destroyed and server-session revocation remains unestablished. Patient
bearer authentication and the patient relay allowlist were unchanged.

### Focused staff logout verification — 2026-09-16

The development-only harness now accepts `--logout-only` and reuses the
retained staff account/fixture parser. It hard-pins the exact temporary
development API origin, performs genuine cookie login for both retained
laboratory actors, refreshes CSRF for each session, and confirms both inboxes
before testing logout. Aside from the required staff inbox GETs, it performs no
patient-facing clinical reads, mark-read mutations, replies, fixture changes,
cleanup, production calls, native builds, or relay-target requests.

The bounded direct-target run passed. For actor A, the harness sent
`POST /api/auth/logout` with the authenticated cookie jar (including the
server-issued refresh cookie) and CSRF header, with no request body. It
retained the exact pre-logout cookie string only in memory and replayed it
against `GET /laboratory/carnet/messages`; the replay was rejected with a
JSON authentication response (401/403), rather than being accepted based on
an `{ok:true}` logout response. Actor B remained independently able to access
the inbox after A's logout. B was then logged out and its separately retained
pre-logout cookie replay was likewise rejected with a JSON authentication
response. Every issued session is attempted through the logout cleanup path in
`finally`, and all in-memory jars are then destroyed.

The synthetic regression covers a mocked `{ok:true}` logout whose pre-logout
replay incorrectly returns 200; that case fails the verifier, while a
separate active session remains usable. `pnpm --dir scripts run typecheck`,
`pnpm --dir scripts test` (4 tests), the staff synthetic check, and the one
bounded live `--logout-only` verification passed. Direct-vs-relay reply
attribution remains a GAP that cannot be resolved retrospectively. Production
remains held and physical-device testing remains pending.
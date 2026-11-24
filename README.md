# Carnet

Carnet is the patient's app. A patient signs in and sees their own health
record as their hospital holds it in NaviMED: appointments, prescriptions, lab
results, bills, messages, visit summaries and visits by community health
workers.

It is one of three linked products:

| Product | Who uses it | Role |
|---|---|---|
| **Carnet** (this repository) | Patients | See and manage their own record |
| **NaviMED** | Hospitals | Hold the patient record; Carnet reads from it |
| **Barika** | Community health workers and their employers | Record visits in the community |

Carnet stores no clinical data of its own. Everything a patient sees comes from
NaviMED through the patient's own signed-in session.

## What is in this repository

```text
artifacts/
  mobile/         Expo / React Native app (iOS and Android), 10 languages
  api-server/     Small Express server: a relay to NaviMED for the web build
lib/
  db/, api-spec/, api-zod/, api-client-react/   Workspace libraries
docs/
  security/       Security, release and incident documents
  accessibility.md
scripts/          Utility scripts and dependency security tests
```

More detail for developers is in [`replit.md`](replit.md) and
[`docs/security/README.md`](docs/security/README.md).

## What patients can do

- Sign in with email and password, with Face ID or fingerprint on return
- Home dashboard, profile, emergency card and health timeline
- Appointments (with calendar view) and appointment requests
- Prescriptions, medication reminders and an interaction check
- Lab results and messages from the laboratory
- Bills and insurance history
- Messages to and from the care team, visit summaries, telehealth
- **Community Health**: visits by a community health worker
- Documents, family members, health metrics, record export
- Light and dark themes, 10 languages

## Community Health

The Community Health screen shows what a Barika community health worker recorded
about the patient: a registration, a screening or a referral.

An entry appears **only after the patient's hospital has approved it** in
NaviMED. Entries that are waiting for review, or were rejected, are never sent
to the app. Each card shows the visit, the result, the advice, the referral
status, who made the visit and who checked it.

- Screen: `artifacts/mobile/app/community-health.tsx`, opened from the home screen
- Data: read-only `GET /patient/community-health`, through the NaviMED adapter
  (`artifacts/mobile/lib/ehr/adapters/navimedi.ts`) and `artifacts/mobile/lib/api.ts`
- Relay: allowed in `artifacts/api-server/src/lib/relay-policy.ts`

Patients a health worker registered without an email address sign in with the
address NaviMED issues for them, ending `@patients.carnet.invalid`, because
sign-in is by email.

## How the app talks to NaviMED

- The **mobile apps** call the NaviMED API directly.
- The **web build** goes through this repository's API server, which relays to
  NaviMED. The relay forwards only the requests listed in `relay-policy.ts`;
  anything else is refused. Add a route there, with its tests, before using a
  new NaviMED endpoint.

## Requirements

- Node.js 24 and pnpm

## Configuration

| Variable | Purpose |
|---|---|
| `PORT` | Port the relay server listens on |
| `NODE_ENV` | `production` when deployed |
| `LOG_LEVEL` | Log detail for the relay server |
| `EXPO_PUBLIC_DOMAIN` | Domain the web build is served from |
| `EXPO_PUBLIC_CARNET_NAVIMEDI_NATIVE_API_BASE_URL` | NaviMED API address used by the mobile apps |
| `EXPO_PUBLIC_CARNET_NAVIMEDI_RELAY_UPSTREAM_URL` | NaviMED API address the relay forwards to |

Variables starting with `EXPO_PUBLIC_` are compiled into the app and visible to
anyone. Never put a secret in one.

## Running locally

```bash
pnpm install

# relay server
pnpm --filter @workspace/api-server run dev

# mobile app
pnpm --filter @workspace/mobile run dev
```

## Tests

```bash
pnpm run test:mobile                # startup, sign-in, session, adapter and accessibility tests
pnpm run test:dependency-security   # dependency security checks
pnpm run typecheck                  # all packages
```

## Releasing

1. Build and deploy the relay server.
2. Confirm an existing patient can sign in and that each screen loads.
3. Publish a new mobile build to the stores (`com.argilette.navimed`).

The Community Health screen needs the matching NaviMED release to be live
first; until then it shows an empty list. There is no database change in
Carnet for it.

## Security and privacy

- A patient only ever receives their own record; NaviMED enforces this with the
  patient's session.
- Never log or commit passwords, tokens, activation links or patient data.
- See [`docs/security/`](docs/security/README.md) for the release checklist,
  incident response and what the NaviMED backend must provide.

## Not built yet

- The Community Health screen has not yet been run on a physical device
- African languages (the app has en, fr, es, pt, ar, zh, de, it, ja, ko)

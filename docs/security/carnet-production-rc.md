# CARNET production RC preparation

Prepared without a native build, store submission, rollout, or publishing
request.

## RC identity and versions

- Marketing version: **1.0.12** (previous local value 1.0.11; patch increment)
- iOS local build number: **41** (previous local value 40)
- Android local version code: **12** (previous local value 11)
- iOS bundle identifier: `com.argilette.navimed` (preserved)
- Android application ID: `com.argilette.navimed` (preserved)
- Apple team, Expo owner/project ID, signing associations, and store
  association values were not changed.
- Store maximum versions were not queried or verified. The values above are
  local increments only.

## Production feature gates

Laboratory handoff messaging and insurance history are disabled in production
release builds. The gates are enforced in the home/billing/messages UI,
protected navigation and deep-link handling, screen query enabling, API
fallback methods, the NaviMED adapter, the production relay route policy, and
the session-scoped insurance cache.
No arbitrary storage flag can enable either feature. Restricted relay routes
are available only when the server explicitly runs with `NODE_ENV=development`;
unset, test, and production environments reject them. Development builds keep
both client features available. Existing lab results, bills, and general
messaging remain available. Production deep links redirect after bootstrap to
the authenticated home or unauthenticated login route without depending on
current authentication state.

## Backend and release blockers

- The default NaviMED endpoint remains `https://www.navimedi.org/api`; this is
  preserved configuration, not a fresh production verification.
- Development native/relay overrides are ignored in production, so exported
  workspace variables cannot redirect release traffic or crash startup.
- No production request or credential value was used. End-to-end production
  authentication, patient data, and backend behavior remain unverified.
- No device smoke test was run. Native signing/profile capability validity,
  managed publishing identity ownership, and current iOS/Google Play
  submission readiness remain blockers for a real release.
- The repository-root `.easignore` was inspected independently with
  `git check-ignore` against a temporary copy. It excludes nested credentials,
  environment/key files, harness scripts, tests/fixtures, root
  `attached_assets`, screenshots, logs, and generated output while retaining
  workspace manifests, native runtime source, app assets, and required
  package-manager/build tooling. This is an exclusion-rule inspection only;
  no cloud EAS archive was created or verified.
- No EAS/Expo build, submission, rollout, or workflow restart was performed.

## Offline JavaScript export evidence

Using the supported Expo `export:embed` command (JS bundle only, no native
build or publish), both production platform exports completed with the
development NaviMED override variables explicitly unset:

`env -u EXPO_PUBLIC_CARNET_NAVIMEDI_NATIVE_API_BASE_URL -u
EXPO_PUBLIC_CARNET_NAVIMEDI_RELAY_UPSTREAM_URL NODE_ENV=production CI=1 pnpm
exec expo export:embed --platform <ios|android> --dev false --minify true
--bundle-output /tmp/carnet-production-<platform>.js --assets-dest
/tmp/carnet-production-<platform>-assets`

- iOS: `NODE_ENV=production`, minified bundle, 3,956,042 bytes, 60 assets,
  1,868 modules bundled.
- Android: `NODE_ENV=production`, minified bundle, 3,957,577 bytes, 64 assets,
  1,867 modules bundled.

The exported JS and asset filenames were audited by marker/count checks only;
no secret values were read. Both exports had zero synthetic reference
environment names (`EXPO_PUBLIC_*`, `REPLIT_*`, `REPL_ID`, `DATABASE_URL`, and
`OPENAI_API_KEY`), zero exact temporary relay URL occurrences, zero
project-specific harness markers, and zero known credential/key markers
(`AuthKey_`, service-account, `credentials/`, private-key headers, `.p8`,
`.p12`, `.jks`, and `.mobileprovision`). Each retained two references to the
configured `https://www.navimedi.org/api` endpoint. Two generic
`__fixtures__/__tests__` metadata markers from a bundled dependency remained;
no project harness or fixture path was present. These are JS-only export
checks, not verification of a cloud archive, native binary, signing result,
device behavior, or store submission.
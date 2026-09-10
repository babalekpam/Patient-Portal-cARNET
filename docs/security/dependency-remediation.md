# Dependency remediation evidence

## September 8, 2026: critical Orval findings

| Severity | Before | After |
| --- | ---: | ---: |
| Critical | 11 | 0 |
| High | 86 | 83 |
| Moderate | 51 | 50 |
| Low | 7 | 7 |

Counts are from the workspace dependency scanner, including development tools
and transitive packages. They are not a count of exploitable patient-facing
endpoints or an assurance of application security.

### Scope

- Updated the API-spec package's Orval dependency from resolved 8.5.3 to
  resolved 8.29.0, with a regenerated lockfile.
- All eleven critical findings were on Orval. Its configured input is the
  repository's local health-check specification. No patient request invokes
  the generator.
- Regenerated and formatted the five existing health-check client and
  validator files. Their route, request method and validation schema are
  unchanged. The generator's React Query wrapper now exposes query-result
  properties through getters.
- No mobile, server or mockup direct dependency versions were changed.
  Orval's transitive packages changed; shared YAML resolution also updated
  the Vite peer context.
- The registry's latest release, 8.30.0, was too new for the configured
  minimum-release-age policy. The policy was preserved; 8.29.0 was the newest
  eligible release. No firewall or audit suppression was introduced.

### Verification

- Code generation passed.
- All workspace TypeScript checks passed, including libraries, API server,
  mobile and mockup sources, and scripts.
- Dependency rescan reported no critical findings and no remaining Orval
  findings.
- API and Expo development workflows restarted successfully.
- Live development health endpoint returned `{"status":"ok"}`.
- Web sign-in preview rendered successfully, with existing non-blocking
  React Native web deprecation warnings.
- No native binary was built, no database migration was run, and nothing
  was published.

## September 8, 2026: remaining compatible dependency remediation

| Severity | Initial workspace baseline | Current workspace and pnpm audits |
| --- | ---: | ---: |
| Critical | 11 | 0 |
| High | 86 | 0 |
| Moderate | 51 | 0 |
| Low | 7 | 0 |

The scanners can assign different severities to the same advisory. Earlier
pnpm results classified some shell-quote and tar findings as critical while
the workspace scanner classified them as high. Both now report no known
vulnerabilities after removing/replacing the final three affected resolutions.

### Completed changes

- Removed unused root connectors SDK, archiving and image-processing packages,
  the unused API proxy middleware, and the project-local EAS/ngrok publishing
  and tunnel tools. None were required by the existing patient feature paths.
- Updated server/web tooling, including Express, Drizzle, Vite and esbuild,
  and refreshed compatible transitive dependencies. No database migration
  was performed.
- Updated the explicit SDK 54 CLI and Babel development tooling. The later
  compatibility pass aligned ten existing SDK 54 packages, including Expo
  54.0.37. React Native 0.81.5 and React 19.1.0 remain unchanged.
- Added major-line-specific security floors where current parents retain
  vulnerable pins. The narrow xcode UUID override uses the CommonJS-compatible
  11.1.1 release; an installed-parent test checks its actual identifier path.
- Preserved the minimum-release-age protection. No scanner ignores, fake
  package versions or weakened audit thresholds were introduced.

### Final three advisories resolved

| Advisory | Package | Status |
| --- | --- | --- |
| GHSA-w3rx-r6r6-pgpr | image-size 1.2.1 | Dependency removed from both Metro parents |
| GHSA-5p2g-fcmc-qvqq | image-size 1.2.1 | Dependency removed from both Metro parents |
| GHSA-vcc3-ghjq-m6fr | decode-uri-component 0.2.2 | Upgraded to published 0.5.0 with dual-module compatibility and additional hardening |

The latest available image-size release was also affected. Rather than retain
its version-based warnings, Metro now uses the independent probe-image-size
7.4.0 synchronous parser through a small build-tool adapter. Bounded, independent
KTX1/KTX2 header readers preserve the one required format absent from that
parser. Both installed Metro versions retain support for all ten of their
image extensions. ICNS/JXL were not supported Metro image extensions; they are
rejected, not passed to the removed vulnerable parsers. No image-size source
was renamed or vendored into the replacement.

Published decoder 0.5.0 is ESM-only by default. A registered patch adds matching
CommonJS/ESM entry points so existing query-string consumers continue to work.
The genuine registry package and integrity are retained. Further single-pass
hardening is carried forward because the published release still contained
replacement-map rescans, even though its known advisory marks that version
fixed. CJS and ESM parity is regression-tested.

The decoder no longer reprocesses emitted percent sequences or interprets
decoded text as replacement syntax. This intentionally corrects malformed-input
corruption; valid Unicode, plus handling and normal query parsing are covered
by regressions.

Tests resolve the actual installed dependency through Expo/Metro or
query-string, not an uncommitted patch-edit directory. Malicious cases run in
separate processes with timeouts, including 20,000 distinct encoded runs,
zero-length image entries and invalid extended box sizes. Tests cover every
Metro image extension, both KTX byte orders, the tracked app assets, and actual
file-based Metro asset assembly including @2x scale normalization. The adapter
accepts both byte buffers and filenames; filename reads require a regular file,
are bounded to the first 512 KiB, and always close the file descriptor. The
pre-existing, unreferenced logo.svg is actually a PDF; it remains unchanged and
the tests explicitly verify rejection rather than treating it as a valid SVG.

Run the persistent regression suite with:

```sh
pnpm run test:dependency-security
```

The security CI workflow runs that suite before the existing dependency audit.
The audit now passes with no known vulnerabilities. No ignore rules or
weakened thresholds were added. Commit the lockfile, workspace dependency
extensions, shared scripts adapter and three active patches together.
Keep the scripts workspace available to Metro in CI and release packaging.

### Verification and remaining release boundaries

- All workspace TypeScript checks passed.
- 45 automated tests passed: 19 mobile session/storage/confirmation, 12 relay,
  6 static-server, and 8 dependency regression/compatibility tests.
- Static and privacy scanners returned no findings.
- API, Expo and component-preview workflows restarted successfully; the API
  health endpoint returned `{"status":"ok"}` and the sign-in web preview rendered.
- All ten SDK 54 compatibility updates are installed. The compatibility check
  reports dependencies are up to date, Expo Doctor passes 18/18 checks, and
  both dependency scanners still report zero known vulnerabilities.
- The source/lockfile updates still require physical-device and native-release
  verification on replit.com. No iOS/Android binary was built or published here.
- Upstream NaviMED authentication/authorization, operational monitoring,
  signing-key/history verification and the existing App Store association
  problem remain separate requirements. This is not approval to use real
  patient data.
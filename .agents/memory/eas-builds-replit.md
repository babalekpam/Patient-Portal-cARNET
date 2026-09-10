---
name: Native publishing boundaries
description: Managed publishing identity, historical release-tooling limits, entitlement verification, and safe credential handling.
---

# Native publishing boundaries

Do not assume a project-local EAS binary exists or restore it as an app dependency.

**Why:** Publishing-only EAS and tunnel tooling contributed a large vulnerable
dependency tree without being needed by the proxied preview or patient features.
Keeping release tooling separate avoids returning that exposure to the app.

**How to apply:** Inspect the current publishing configuration and supported
credential flow when release work is actually authorized. Old local-binary,
key-file and submission-profile examples are no longer valid. Dependency
remediation in the workspace does not update an installed store binary.

## Managed publishing identity is separate evidence

Correct source configuration does not prove that a managed upload targets the
intended Apple app.

**Why:** A new managed publishing attempt still reported the deleted app's
bundle identifier and Apple app entry while the mobile source declared the
intended identity. Dependency alignment did not resolve that separate failure.

**How to apply:** Compare the identity reported by the latest upload with the
intended source configuration before recommending another attempt. Do not
claim SDK fixes repair store linkage, or invent a reset/relink control without
documentation or evidence from the actual publishing screen.

For this project, Replit Support confirmed that Expo Launch's managed Expo
identity cannot submit into the Apple app owned by the user's separate Expo
identity. The managed target cannot be redirected to that existing listing.

**Why:** Expo Launch created its own bundle/app association. After that managed
Apple entry was deleted, submissions continued targeting the deleted entry and
returned HTTP 409. Correct local bundle configuration did not change ownership.

**How to apply:** If preserving the existing Apple listing is required, do not
retry Expo Launch or suggest its generic “Use existing” path for this project.
Use a release pipeline authenticated as the owner of the existing Expo/Apple
identity. Keep that release tooling and all credentials outside app source and
managed through supported secret/credential interfaces.

## Historical manual tooling is not a current publishing recipe

**Why:** Earlier manual experiments had different authentication and terminal
requirements from the supported managed publishing flow. Simulating an
interactive terminal stalled rather than solving Apple authentication.

**How to apply:** Follow the current Expo skill's supported publishing flow,
not historical CLI commands. Do not restore release-tooling dependencies,
reuse revoked credentials, or alter unrelated distribution certificates.

## Provisioning capabilities must match the binary

**Why:** A reused provisioning profile once predated the app's push capability,
so native signing failed even though app-side entitlement configuration existed.

**How to apply:** Verify the current provisioning profile includes the required
capabilities through the supported credential flow; a previously successful
profile or API-key authentication is not evidence of current compatibility.

Inspect the current version source and increment settings before a release;
historical EAS settings are not evidence of the current configuration.

## Android versionCode — NOT auto-incremented
Reusing an Android versionCode already published to Play previously caused a
submission failure. Changing local configuration after a binary is built does
not change the value embedded in that binary.

## iOS push fix CONFIRMED working
Previously, Apple ID authentication allowed EAS to synchronize push capabilities
that API-key-only authentication skipped. The successful profile at that time
is not proof that the current profile or credential is still valid.

## iOS and Android can be at DIFFERENT store versions — check per platform
**Why:** a version was once assumed to be live on both stores when it had only
been released on Android. That caused unnecessary rejection of a valid iOS update.
**How to apply:** Verify each platform's actual build and store status through
the current supported publishing interfaces. Never infer one platform's
released version from the other's.

## Submitting + tracking
- Submission and credential-validation behavior differ: a past non-interactive
  submission worked even though an iOS build required interactive authentication.
- A timed-out local wait need not mean a remote submission stopped. Check the
  actual remote job before creating duplicates through the supported publishing
  diagnostics, rather than inventing status commands.

## Android submit via service account (for future updates)
Use the supported secure credential flow when configuring Google Play
submission. Do not assume a historical local credential file or track setting
still exists, and do not put a replacement credential in chat or source control.

## SECRET-HANDLING GOTCHA: files attached in chat land in git-tracked `attached_assets/`
**Why:** a service-account JSON the user attached was auto-copied into `attached_assets/` and committed by the end-of-task checkpoint — a real private-key leak into git history (`attached_assets/` is NOT gitignored, unlike `credentials/`).
**How to apply:** Do not read, echo or copy secret contents through chat. Use
managed credential handling, remove exposed working-tree copies and prevent
accidental recommits. Revocation must happen at the issuer; deleting a file
does not neutralize historical copies. History rewriting is destructive and
requires informed authorization.

## Notes
- Workspace dependency reinstalls can invalidate a running bundler's cached
  dependency paths. Complete package operations before restarting the preview.
- Verify current store and publishing status independently; a historical
  successful submission is not proof that today's security changes are released.

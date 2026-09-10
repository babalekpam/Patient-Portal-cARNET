# CARNET accessibility

## Scope and target

The patient client targets WCAG 2.2 AA for keyboard operation, accessible names
and states, and contrast. This covers the web-rendered Expo app and native
accessibility properties on the same patient screens. It is not a claim of
certification or proof of VoiceOver/TalkBack behavior on physical devices.

Changes are enabled by default; patients do not need to find an accessibility
setting to use a keyboard or screen reader.

## Shared behavior

- Controls have button/radio/checkbox semantics, names, disabled/busy/selection
  states, and minimum 44-unit touch targets.
- Web control states are explicitly mapped to ARIA. Radio/checkbox keyboard
  handling supplements the web framework without duplicating button activation.
- A keyboard-visible skip link leads to the main content. Focus indicators
  remain visible in light, dark, and forced-color modes.
- Dialogs are named, retain focus while open, support Escape/Android Back
  dismissal, and return focus on close. Inline editing is not misrepresented as
  a modal dialog.
- Form fields have accessible labels independent of their placeholders.
  Loading/error messages and screen changes have appropriate semantics.
- Headers, textual status labels, and metric values support nonvisual reading.
  Meaning does not rely solely on a color or chart.
- New generic assistive labels cover all ten supported languages, and the web
  document language follows the selected language.
- Card/shimmer animation respects the operating system's reduced-motion
  preference. Text scaling remains enabled.
- Privacy curtains/capture blocking also conceal the protected accessibility
  subtree and its app-owned dialogs; they do not merely paint over patient data.
  Keyboard activation counts toward session activity, without changing expiry.
  Native dialog contents are removed immediately during concealment rather
  than remaining readable throughout a dismissal animation.

Background concealment and screenshot blocking remain native-only behavior.
The browser retains its existing screenshot warning and session enforcement;
simulating a hidden browser tab does not exercise native capture protection.

## Contrast

Both theme palettes are tested using the WCAG relative-luminance formula:

- Normal/secondary/tertiary text and status labels: at least **4.5:1** against
  their specified surfaces.
- Filled-control text and gradient-header text: at least **4.5:1** against their
  specified backgrounds.
- Input boundaries and focus indicators: at least **3:1** against adjacent
  application surfaces.

Use `onPrimary` on the matching solid primary/status fills. It is dark ink in
dark mode, not always white. Dark gradient headers use `whiteText` or
`onPrimaryMuted`. Decorative separators are not interactive-control boundaries.
Token tests do not prove that every possible rendered combination, external
document, provider webpage, or user-supplied image meets contrast requirements.

## Verification

Source checks on **September 8, 2026**:

- Workspace TypeScript checks passed; the mobile check also passed after the
  integrated fixes.
- **33 unit checks passed:** theme contrast and ten-language label parity,
  keyboard/ARIA mapping, and existing confirmation/session/storage safeguards.
- The mounted mobile-sized sign-in preview was inspected.
- Synthetic browser checks confirmed provider radio selection with Space,
  exactly-once password visibility toggling, Profile inline-edit initial focus
  and Escape cancellation, named Family dialogs, keyboard focus containment,
  cancellation without saving, and return to the Family opener after dismissal.
  The inline language list closed with Escape and returned focus after selecting
  French. A dark-theme control displayed the expected high-contrast focus outline.

Run mobile unit tests from the scripts workspace:

```sh
cd scripts
pnpm exec tsx --test ../artifacts/mobile/tests/*.test.ts
```

Browser verification should use synthetic data and cover keyboard-only sign-in,
provider radio selection, inline profile editing, named dialogs, Escape/focus
return, light/dark focus, and logout. Do not send test writes to a real provider.

Before a native release, verify actual VoiceOver and TalkBack reading order,
hardware-keyboard navigation, larger OS text sizes, switch controls, reduced
motion, and privacy transitions on devices. External provider pages and
uploaded documents need their own accessibility review. No native binary or
App Store submission is produced by these source changes.
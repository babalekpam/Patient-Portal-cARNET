---
name: Security backport verification
description: Lessons from preserving legacy module compatibility while fixing parser denial-of-service paths.
---

Review the entire malformed-input recovery pipeline, not only a helper that
has been replaced by a linear algorithm.

**Why:** A first decoder backport removed recursive decoding but left a global
replacement map. Tests with one repeated escape passed while many distinct
escaped runs still forced repeated full-input scans. Replacement strings also
interpreted decoded metacharacters and reprocessed emitted percent sequences.

**How to apply:** Include distinct-run adversarial cases, once-only decoding,
literal replacement metacharacters and timeout-bounded processes. Inspect output
fidelity as well as execution time.

Keep parser safety checks independent from format-recognition strictness.

**Why:** An initial image-length backport stopped non-advancing chunks but also
rejected legitimate metadata. Bounds and progress can be enforced while safely
skipping bounded non-image entries.

**How to apply:** Pair malicious-length tests with valid metadata before and
after recognized records. Resolve tests through the app's actual installed
parent dependency so they prove the registered patch is used.

Keep version-based advisories visible when local patches are necessary.

**Why:** A fixed upstream module can be incompatible with an older CommonJS
parent, and an upstream package may have no published safe release. Changing
versions or suppressing findings merely to obtain a zero count hides these
constraints rather than addressing them.

**How to apply:** Prefer compatible parent updates first, document any backport,
verify patch hashes and installed behavior, and distinguish tested mitigation
from an upstream fixed release or independent release approval.

Do not assume an advisory's fixed-version label proves the entire parser is safe.

**Why:** The published decoder fix removed one dangerous helper but retained
the surrounding rescan pipeline that our broader regression could still exhaust.
Upgrading legitimately cleared the advisory while still requiring extra
hardening to preserve the stronger behavior we had already verified.

**How to apply:** Keep adversarial behavior tests across upstream upgrades,
including parity when adding a second module format. For library replacements,
preserve the formats the actual parent consumes rather than importing every
rare parser from the old dependency merely to match an overly broad test corpus.

A warm preview is not proof that replacement build tooling can produce assets.

**Why:** Buffered parser tests and a cached preview passed while the parent's
full asset assembly used a different, filename-based input contract. A later
SDK update forced asset regeneration and exposed the missing input form.

**How to apply:** Exercise fresh temporary assets through the parent's full
packaging path, not just its dimensions helper. Cover caller input forms and
scale normalization alongside malformed-content tests.
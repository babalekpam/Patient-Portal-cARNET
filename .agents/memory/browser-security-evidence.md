---
name: Browser security evidence
description: Reliable evidence for destructive confirmation and memory-only session cleanup in browser tests.
---

Verify a destructive dialog's actual return value and resulting authenticated
state, not just a test driver's intention to accept or dismiss it.

**Why:** A browser check reported that dismissing a confirmation signed out the
patient. A controlled check with one dialog handler and the actual return
value captured showed that false preserved the session and true ended it.
The original handler interaction was not conclusively reproduced.

**How to apply:** Investigate dialog handlers before altering correctly gated
destructive code. Native React Native alerts need an explicit web equivalent.

Test patient-data cleanup without reloading or manually navigating the whole
browser page between patients.

**Why:** An empty localStorage/sessionStorage snapshot proves nothing about
in-memory records, and reloading independently clears an in-memory session.

**How to apply:** Confirm the app's own sign-out transition, then sign in again
through the current page before checking that the previous patient's local
records and sharing permission are absent.
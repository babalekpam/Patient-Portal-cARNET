---
name: Patient session boundaries
description: Why issuer binding and stale-operation rejection are essential in the multi-provider patient portal.
---

Treat the selected provider's canonical issuer address, not just its display
identifier, as part of the credential boundary. Never treat editable saved
provider preferences as authority to redirect a restored bearer credential.

**Why:** This portal supports user-configured EHR endpoints. The same provider
identifier can refer to a changed destination after preferences are edited.
A correct token restore can therefore still disclose a token to the wrong
server if it checks only the identifier.

**How to apply:** Preserve destination binding in any authentication or
provider-selection redesign. An endpoint change requires new authentication,
not credential transfer.

Reject stale asynchronous work before it mutates authentication or patient
state, including failures, body parsing, OS permission prompts and scheduling.

**Why:** A response can arrive after a different patient signs in to the same
provider. Clearing credentials in an old failure handler can destroy the new
session; an old successful response can repopulate cleared patient data.
Checking only the current provider or a boolean authenticated flag cannot
distinguish these cases.

**How to apply:** Preserve per-operation session ownership through all awaits.
Old failures must be rejected without signing out a newer session, and login
responses must not modify shared adapter state until the current attempt is
accepted.
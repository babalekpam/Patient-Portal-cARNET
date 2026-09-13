---
name: NaviMED CSRF on writes
description: The navimedi.org server enforces CSRF on all mutating requests; the RN patient app must send X-CSRF-Token or every write 403s.
---

# NaviMED requires CSRF token on all writes

The navimedi.org API enforces CSRF protection on **every** mutating request
(POST/PUT/PATCH/DELETE), including login. A write without a valid
`X-CSRF-Token` header returns **403** (this is what made telehealth session
creation fail in TestFlight while reads worked).

**Flow the app must follow:**
- Before login, obtain `/csrf-token` and preserve its matching server-issued
  cookie for the login request. The token header alone is not sufficient.
- After auth, lazily `GET /csrf-token` with the Bearer auth header → `{ csrfToken }`.
- Attach `X-CSRF-Token: <csrfToken>` to all writes.
- On a 403 whose JSON body `code` is `CSRF_TOKEN_MISSING`, `CSRF_TOKEN_INVALID`,
  or `CSRF_SESSION_INVALID`: re-fetch the token and retry **once**. A plain 403
  (real authz failure) must surface unchanged.
- Clear the in-memory CSRF token on logout and on any 401 (it is keyed to the
  auth session).

**Why:** the token is session-keyed, so it must be primed per login and dropped
per logout, and a single retry recovers from a rotated/expired token without
masking genuine authorization failures.

Do not assume authentication endpoints are exempt from CSRF protection.
**Why:** That assumption caused TestFlight login failure despite passing mocked
tests. The upstream pre-auth token is bound to a server-issued cookie;
the token header alone is not a complete authentication handshake.

**How to apply:** Keep test fixtures consistent with this observed upstream
contract. Native transport must carry cookies; server-side relays need their
own isolated handshake and cannot rely on a server fetch cookie jar.

**How to apply:** the app uses `fetch` (NOT axios like the server reference).
The logic lives in a `mutate()` helper in BOTH `lib/api.ts` (ApiClient) and
`lib/ehr/adapters/navimedi.ts` (NavimediAdapter). The live runtime path is the
NavimediAdapter (set via EHRContext); ApiClient direct-fetch is the fallback —
keep both in sync.

**Patient vs doctor endpoints:** patients must use `/patient/telehealth/*` and
`/patient/appointments`. The `/telehealth/*` (no `/patient`) routes are
doctor-only and 403 any patient. The app already used the patient routes.

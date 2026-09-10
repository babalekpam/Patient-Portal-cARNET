---
name: Telehealth feature & Google Play publishing risk
description: Why the in-app telehealth feature is risky to publish for the CARNET patient portal
---

# Telehealth feature & Google Play publishing risk

The CARNET mobile app's in-app telehealth feature (screen `app/telehealth.tsx`, route `/telehealth`)
calls Navimed endpoints `GET /patient/telehealth/appointments`, `POST|GET /patient/telehealth/sessions/:id`.

**Status update (June 7, 2026):** `GET /patient/telehealth/appointments` against `https://www.navimedi.org/api`
now returns HTTP **401** (with or without a bearer token), NOT 404. The route is therefore implemented
server-side and requires auth — a change from the earlier 404 (not implemented) state. End-to-end success
(real appointment data for a logged-in patient) was NOT verified here because no valid patient token was
available; 401 only proves the endpoint exists.

**Why this matters:** The app was previously suspended from Google Play for "Misleading Claims" —
advertising a telehealth feature that did not actually work. The appeal was only conditionally accepted
after the feature was *removed*. Re-publishing a non-working telehealth feature recreates that exact
violation and risks a repeat (possibly permanent) suspension.

**How to apply:** Before publishing any build that includes telehealth, verify the Navimed telehealth
endpoints actually return data (not 404). If they 404, warn the user and do not auto-publish. Confirm
the live `GET /patient/telehealth/appointments` against `https://www.navimedi.org/api` with a valid token.

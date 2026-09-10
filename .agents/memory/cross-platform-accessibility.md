---
name: Cross-platform accessibility
description: Why keyboard, ARIA, dialog, and privacy behavior require rendered-web verification in this Expo app.
---

Treat native accessibility props and rendered web accessibility as separate
contracts, even when TypeScript accepts the same component props.

**Why:** The installed React Native Web accepted native state props without
forwarding the corresponding ARIA state. Its Space handling also differed
between buttons and radio/checkbox roles. Palette tests and type checks did
not detect either behavioral gap. Text inputs also stop keydown bubbling,
so a page-level Escape listener can fail specifically while editing a field.

**How to apply:** Verify actual DOM names/states and keyboard activation once,
without doubling the framework's existing button handling. Supply real dismiss
callbacks; do not add a second Escape listener over a framework-owned handler.
Distinguish inline edit forms from dialogs rather than inventing dialog
semantics to satisfy a test. Capture-phase handlers must be scoped to their own
widget, so they cannot dismiss an unrelated overlay or inactive screen.

Visual concealment must also protect the accessibility tree, including portals.

**Why:** An opaque privacy curtain leaves medical content readable and
keyboard-focusable underneath unless it is hidden/inert. Native and web modal
portals are outside their parent's visual/accessibility containment.

**How to apply:** Preserve patient drafts under the curtain while making the
protected subtree inaccessible. Propagate visibility through context to
app-owned dialogs; keep only privacy/recovery controls reachable. Do not put
patient details into global route announcements.
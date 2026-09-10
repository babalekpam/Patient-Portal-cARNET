---
name: GitHub connection boundaries
description: Distinguishes the GitHub data connector from workspace Git remote authentication.
---

A healthy GitHub connector does not prove that command-line Git can fetch or
push the repository.

**Why:** The connector successfully read the repository with full write
permission while the workspace remote and GitHub CLI both rejected their
separate saved authentication. Reauthorizing a healthy connector is not a
valid repair for an unrelated Git credential.

**How to apply:** Check remote divergence before syncing. Preserve and reconcile
both histories locally first. If command-line authentication is stale, ask the
user to reconnect the repository through Replit's Git/version-control interface;
never extract connector tokens or place credentials in a remote URL.

The Git pane can report a generic `PUSH_REJECTED` even for a valid fast-forward.
An authenticated command-line push may expose the actual server reason. Updating
files under `.github/workflows/` with a classic GitHub token requires both
`repo` and `workflow` scopes.

**Why:** The Git pane repeatedly blamed remote commits when GitHub was actually
rejecting a workflow-file update because the token lacked `workflow`.

**How to apply:** Prefer normal provider authentication. If a temporary token is
unavoidable, request it only through Replit Secrets, keep its scope and lifetime
minimal, never embed it in a remote URL, and have the user revoke it immediately
after the verified push.

History rewrites cannot update GitHub-managed `refs/pull/*` references.

**Why:** Rewriting and force-updating every normal branch can still leave a
merged pull request advertising the old secret-bearing commit. A fresh mirror
clone is required to detect this residual reference.

**How to apply:** After a sensitive-data rewrite, verify every advertised ref
from a fresh server clone. If a pull-request ref remains, GitHub Support must
dereference the affected PR, run server garbage collection, and remove cached
views before the data is fully purged from GitHub.
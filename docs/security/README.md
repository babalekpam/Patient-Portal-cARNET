# Security assurance

These documents are engineering templates and acceptance criteria, not adopted
organizational policies. They do not establish HIPAA, HITECH, GDPR, PCI-DSS, or
other certification or compliance. Legal/privacy owners must determine
applicability and approve policy, contracts, notices, retention, and breach
decisions before real patient data is used.

| Document | Purpose |
| --- | --- |
| [implementation-status.md](implementation-status.md) | Implemented boundaries, test evidence, and remaining release blockers |
| [assurance-and-release.md](assurance-and-release.md) | Control ownership, current evidence, and release gate |
| [external-backend-requirements.md](external-backend-requirements.md) | Required NaviMED identity/resource-server contract |
| [incident-response.md](incident-response.md) | Concise incident and privacy-response template |
| [vendor-review.md](vendor-review.md) | Vendor, SDK, and dependency intake/renewal gate |

The repository [threat model](../../threat_model.md) is the source for risks and
required guarantees. Current scope assumes no real patients. Moving beyond
synthetic data requires every release blocker in the assurance register to have
named owners and reviewable evidence.

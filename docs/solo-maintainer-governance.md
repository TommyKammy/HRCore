# Solo-Maintainer Governance Posture

HRCore currently operates in a solo-maintainer / owner-acknowledged development
model. The repository owner can acknowledge scope, accept bounded repository
evidence, and defer stronger gates, but that acknowledgement is not an
independent second key.

Owner acknowledgement is not an independent second key.

## Two-Key ADR Boundary

ADR 0011 (#11 / P0-R05 authorization and data scope), ADR 0012 (#12 / P0-R06
audit immutability and production backup), and ADR 0014 (#14 / P0-R08 raw
payload and CSV/export) remain Proposed. They do not satisfy the original ADR
0000 two-key acceptance semantics because the repository does not yet record a
real independent approver, independent counter-approver, and completed
time-locked review window for those boundary-changing decisions.

Owner acknowledgement, issue closeout, Codex review, passing repository tests,
or a single-maintainer merge must not be described as Accepted two-key approval
for ADR 0011, ADR 0012, ADR 0014, or their child gate issues. Those records may
remain Proposed design anchors for bounded non-production development, including
synthetic or explicitly approved non-production evidence paths, as long as the
stronger gates stay closed.

## Readiness Boundary

Production-like readiness remains blocked for real employee data, live IdP/Okta
tenant operation, production audit immutability, raw payload viewing,
CSV/export, production backup, DLQ/ops, legal/privacy runtime, and related
stronger-readiness claims.

No third-party legal, security, privacy, operator, or independent maintainer
approval is recorded by this note. Any future claim that the affected domains
are Accepted or production-like ready must cite the later Accepted two-key ADR
or closeout that records the real independent approval evidence.

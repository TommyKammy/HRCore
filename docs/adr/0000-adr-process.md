# ADR 0000: Architecture Decision Record Process

## Status

Accepted

## Date

2026-05-16

## Decision owners

- Author: repository maintainer or issue assignee proposing the decision
- Approver: named maintainer or delegated architecture owner required before an ADR becomes Accepted
- Counter-approver: Not required because this process records review requirements without changing runtime trust boundaries, security posture, authorization, auditability, data retention, production operations, provider trust, irreversible migration shape, or compliance evidence.
- Time-locked review window: Not required because this process does not require two-key handling.

## Depends on ADRs

None

## Context

HRCore needs durable architecture decisions before later implementation issues add HR workflow behavior. The repository seed therefore defines how ADRs are numbered, reviewed, approved, superseded, and applied when they conflict with implementation-oriented text.

## Decision

All durable architecture decisions must be recorded under `docs/adr/` as ADRs.

ADR numbering is monotonic and four digits wide. `0000` is reserved for this process. New ADRs use the next unused number in filename order, for example `0001-short-title.md`. Numbers are never reused, even when an ADR is rejected or superseded.

Every ADR must include these metadata fields:

- Status
- Date
- Decision owners
- Author
- Approver
- Counter-approver, or `Not required` with a short reason
- Time-locked review window, or `Not required` with a short reason

Every ADR must include a `Depends on ADRs` section. Use `None` when the ADR has no ADR dependencies. Otherwise list the ADR numbers and titles this decision depends on, using repository-relative links when the dependency already exists.

An ADR may be Proposed, Accepted, Rejected, Deprecated, or Superseded. Only Accepted ADRs define active architecture policy. Superseded ADRs must link to the replacing ADR.

Accepted ADRs must name an `Approver`. An unresolved placeholder, blank value, TODO, sample name, or role-only label is not an approver for an Accepted ADR.

Two-key handling is required for decisions that affect security, identity, authorization, tenant boundaries, auditability, data retention, backup or restore semantics, production operations, external provider trust, irreversible migration shape, or compliance evidence. When the need for two-key handling is unclear, fail closed and require two-key handling.

For two-key decisions, the `Counter-approver` is a second named maintainer or delegated owner who approves the boundary-changing decision independently from the author and normal `Approver`. The author cannot be the `Approver` or `Counter-approver` for a two-key decision. The normal `Approver` confirms the ADR is ready to become repository policy; the `Counter-approver` confirms the sensitive boundary change has an independent second key.

For two-key decisions, the `Time-locked review window` records the review interval that stayed open before the ADR became Accepted. Phase 0 repository ADRs should use a concise default of 24 hours from the ADR pull request publication or from the last material trust-boundary change, whichever is later. If a decision is not two-key, both `Counter-approver` and `Time-locked review window` must say `Not required because ...` with a decision-specific reason.

For precedence, newer Accepted ADRs supersede older Accepted ADRs when they explicitly say so. Accepted ADRs override README text, issue bodies, planning notes, generated docs, local scripts, and implementation comments unless a newer Accepted ADR supersedes them. Implementation text must be updated to follow the ADR instead of treating the conflict as a reason to ignore the ADR.

ADR files are authoritative decision records, but executable code and tests remain authoritative for observed runtime behavior. If code behavior and an Accepted ADR disagree, treat the mismatch as drift: keep the ADR as the policy source, fix or intentionally supersede the ADR, and add verification for the selected boundary.

## Consequences

- Future phase work has a stable place to record architecture decisions before implementation expands.
- Reviewers can identify which decisions need a second key.
- Conflicts between durable decisions and implementation prose have a deterministic precedence rule.
- The repository avoids using issue text or generated summaries as architecture authority.

# ADR 0000: Architecture Decision Record Process

## Status

Accepted

## Date

2026-05-16

## Decision owners

- Author: repository maintainer or issue assignee proposing the decision
- Approver: named maintainer or delegated architecture owner required before an ADR becomes Accepted
- Two-key reviewer: second named reviewer required when a decision changes trust boundaries, security posture, irreversible data shape, production operations, or compliance-relevant behavior

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
- Two-key reviewer, or `Not required` with a short reason

An ADR may be Proposed, Accepted, Rejected, Deprecated, or Superseded. Only Accepted ADRs define active architecture policy. Superseded ADRs must link to the replacing ADR.

Two-key handling is required for decisions that affect security, identity, authorization, tenant boundaries, auditability, data retention, backup or restore semantics, production operations, external provider trust, irreversible migration shape, or compliance evidence. The author and approver cannot satisfy the two-key reviewer role by themselves. When the need for two-key handling is unclear, fail closed and require the second reviewer.

When an Accepted ADR conflicts with README text, implementation comments, issue bodies, planning notes, generated docs, or local scripts, the Accepted ADR wins unless a newer Accepted ADR explicitly supersedes it. Implementation text must be updated to follow the ADR instead of treating the conflict as a reason to ignore the ADR.

ADR files are authoritative decision records, but executable code and tests remain authoritative for observed runtime behavior. If code behavior and an Accepted ADR disagree, treat the mismatch as drift: keep the ADR as the policy source, fix or intentionally supersede the ADR, and add verification for the selected boundary.

## Consequences

- Future phase work has a stable place to record architecture decisions before implementation expands.
- Reviewers can identify which decisions need a second key.
- Conflicts between durable decisions and implementation prose have a deterministic precedence rule.
- The repository avoids using issue text or generated summaries as architecture authority.

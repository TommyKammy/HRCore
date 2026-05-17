# ADR 0017: Employment Status and Work Arrangement Extension Boundary

## Status

Proposed

## Date

2026-05-18

## Decision owners

- Author: TommyKammy
- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.
- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.
- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.

## Depends on ADRs

- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)
- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)
- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)
- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)
- [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](0007-sensitive-personal-information-boundary.md)
- [ADR 0008: Leave of Absence, Childcare Leave, and Reduced Working Hours MVP-A/v1 Handling Boundary](0008-leave-work-arrangement-boundary.md)
- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)
- [ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary](0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md)
- [ADR 0016: Sensitive Personal Information Privacy Classification, Consent, and Processing-Purpose Extension Boundary](0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary.md)
- [Run-Mode Governance](../run-modes.md)

## Context

ADR 0008 keeps leave of absence, childcare leave, reduced working hours, and
detailed labor-case handling out of MVP-A and v1 runtime behavior. This ADR
records the future extension anchor for employment status and work arrangement
periods without implementing that behavior.

Future support for leave of absence, childcare leave, reduced working hours,
and similar work arrangements affects labor and privacy boundaries,
auditability, compliance evidence, data retention, and future irreversible data
shape. ADR 0000 therefore requires fail-closed two-key handling before this ADR
can become Accepted.

The repository needs a design-level boundary for future support for leave of
absence, childcare leave, reduced working hours, and similar work arrangements;
whether future implementation uses `employment_status_period`,
`work_arrangement_period`, or both; how those periods relate to
`lifecycle_event`; how primary versus multiple simultaneous arrangements are
represented; and which period overlap, correction, backdate, audit, and privacy
constraints later implementation issues must preserve.

This ADR is intentionally an extension contract, not runtime implementation. It
does not decide concrete table names, columns, indexes, OpenAPI contracts, DTOs,
UI screens, approval flows, payroll treatment, benefit treatment, provider
integration, privacy jobs, retention jobs, or policy parser rules.

## Decision

Future support for leave of absence, childcare leave, reduced working hours,
and similar work arrangements must use a clearly separated combination of
`employment_status_period` and `work_arrangement_period` when both legal
employment state and working-pattern arrangements need representation.

`employment_status_period` is the future anchor for mutually exclusive primary
employment states such as active employment, leave of absence, childcare leave,
retirement, suspension, or other legal/employment states that change the
person's primary employment status in a legal entity or employer context.

`work_arrangement_period` is the future anchor for working-pattern arrangements
such as reduced working hours, temporary work patterns, flexible or remote work
arrangements, and similar arrangements that can coexist with a primary
employment status when a later Accepted ADR and implementation issue authorize
the specific arrangement type.

`lifecycle_event` is not the source of truth for active employment status or
work arrangement periods. Future lifecycle events are evidentiary triggers or
derivation inputs; lifecycle events are evidentiary triggers or derivation
inputs, not the mutable source of truth for an active period.
Accepted or authoritative lifecycle events may create, correct, close, or link
to period records, but period records must hold the authoritative effective
date range, subject binding, legal entity or employer binding, classification,
audit linkage, and correction state.

Future implementation must not infer an active leave, childcare leave,
reduced-hours, or similar arrangement solely from event names, comments, issue
text, planning notes, nearby records, display summaries, badge text, or generic
status labels. Missing period authority, subject binding, legal entity or
employer binding, effective-date boundaries, classification, or audit linkage
must fail closed.

For primary status handling, employment status has one primary effective period
per person and legal entity at a point in time. Overlapping primary
`employment_status_period` records for the same person and legal entity must be
rejected unless a later Accepted ADR defines a deterministic correction,
transition, or precedence rule.

For multiple arrangement handling, multiple simultaneous work arrangements may
exist only when each arrangement type and purpose is explicitly classified, the
arrangements are directly linked to the authoritative subject and legal entity
or employer context, and the overlap is allowed by a later Accepted ADR or
implementation issue. A generic multiple flag, note, lifecycle event, or status
label is not sufficient to authorize simultaneous arrangements.

For period overlap constraints, overlapping periods must be rejected unless a
later Accepted ADR defines a deterministic resolution rule. Future
implementation must define closed-open or otherwise explicit effective-date
semantics before enforcing overlap checks, and must reject ambiguous open-ended
or mixed-boundary periods when the overlap result cannot be proven.

Correction and backdate handling must preserve audit evidence; correction and
backdate handling must preserve audit evidence. A correction,
backdated start, backdated end, cancellation, or replacement must retain the
previous period, the new period or corrected values, the actor and effective
actor, request or job correlation, reason classification, authoritative
lifecycle event link where applicable, approval evidence where applicable, and
outcome. Later implementation must not rewrite history in place without a
durable audit trail.

Privacy and sensitive-data handling must follow ADR 0006, ADR 0007, ADR 0008,
ADR 0014, and ADR 0016. Period records, lifecycle events, audit evidence,
notes, raw payloads, attachments, exports, fixtures, seeds, logs, and migration
examples must not hide medical, caregiving, disability, childcare-detail,
harassment, disciplinary, union, or equivalent sensitive labor/privacy facts in
generic fields or untyped payloads.

Concrete schema, migrations, API shape, UI workflow, payroll/benefit behavior,
provider integration, privacy jobs, retention jobs, and policy-as-code
enforcement are deferred to later implementation issues or later Accepted ADRs.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement runtime features, migrations, OpenAPI endpoints,
DTOs, UI workflows, approval flows, payroll/benefit logic, provider
integrations, privacy jobs, production secrets, external services, or
policy-as-code parser rules.

## Consequences

- ADR 0008's MVP-A/v1 leave and work-arrangement boundary remains intact.
- Future implementation has separate anchors for primary employment status and
  potentially multiple work arrangements without making `lifecycle_event` the
  mutable source of truth for active periods.
- Later schema, API, UI, payroll, benefit, provider, privacy, retention, and
  policy-as-code work must cite this ADR or a later Accepted two-key ADR before
  implementing period records or lifecycle-event generation behavior.
- Repository guard coverage can catch removal or weakening of the Proposed
  status, two-key posture, extension-anchor boundary, lifecycle generation
  boundary, primary/multiple handling, overlap constraints, correction/backdate
  audit handling, and no-runtime-implementation commitment.
- This Proposed ADR records the intended extension boundary but does not become
  active Accepted repository policy until the ADR 0000 two-key approval
  metadata is complete.

## Supersedes

None

## Superseded by

None

# ADR 0009: Retiree Data Retention Period and Physical Deletion Exception Boundary

## Status

Proposed

## Date

2026-05-17

## Decision owners

- Author: TommyKammy
- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.
- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.
- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.

## Depends on ADRs

- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)
- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)
- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)
- [ADR 0005: My Number and Specific Personal Information Scope Boundary](0005-my-number-scope-boundary.md)
- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)
- [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](0007-sensitive-personal-information-boundary.md)
- [ADR 0008: Leave of Absence, Childcare Leave, and Reduced Working Hours MVP-A/v1 Handling Boundary](0008-leave-work-arrangement-boundary.md)
- [Run-Mode Governance](../run-modes.md)

## Context

HRCore is still before PoC and MVP-A implementation. Retired employee data can
involve statutory retention periods, auditability, legal holds, payroll or
benefit evidence, deletion and erasure requests, anonymization, IdP offboarding
history, rollback needs, backup and recovery behavior, and physical deletion
exceptions. Before core HR tables, OpenAPI contracts, migrations, fixtures,
exports, audit payloads, raw provider payloads, notes, attachments, logs, jobs,
or legal workflows expand, the repository needs a durable boundary for retiree
retention period and physical deletion exception decisions.

ADR 0000 classifies unclear legal, privacy, compliance evidence, data retention,
auditability, backup or restore semantics, production operation, external trust,
and irreversible migration-shape decisions as fail-closed two-key decisions.
This ADR affects legal/privacy posture, data retention, auditability,
backup/recovery boundaries, compliance evidence, and future implementation
boundaries. It therefore cannot become Accepted until the ADR 0000 two-key
metadata is complete.

ADR 0002 defines policy-as-code as the repository-owned verification strategy,
ADR 0003 prohibits hard-delete for core HR entities unless a later Accepted ADR
explicitly supersedes that rule, ADR 0005 keeps My Number and Specific Personal
Information outside the MVP-A/v1 core boundary, ADR 0006 keeps APPI
processing-purpose and DSAR handling behind explicit privacy decisions, ADR 0007
keeps sensitive personal information outside MVP-A/v1, ADR 0008 keeps detailed
leave, childcare leave, and reduced-hours handling behind explicit two-key
decisions, and Run-Mode Governance keeps data-retention and legal/privacy
decisions in the two-key lane.

The relevant planning-note paths for this issue are
`01_企画・構想/04_スコープ定義.md`, `04_データ・API/10_ER案.md`,
`04_データ・API/13_フィールドカタログ.md`, and
`05_実行計画/07_プロジェクト計画・ロードマップ.md`. They align with this ADR
because they keep retiree data retention, anonymization, physical deletion,
IdP-after-termination access, and Future Extension retention anchors behind
later gates rather than treating planning text as implementation authority. This
ADR records the repository-owned decision boundary so planning notes, issue
bodies, DTO comments, schema placeholders, fixture examples, or generated
documentation do not become the source of truth.

## Decision

HRCore MVP-A and v1 must not encode production statutory retention periods,
automatic purge schedules, anonymization schedules, physical deletion
exceptions, legal-hold rules, payroll/benefit retention rules, or deletion
approval workflows as executable behavior.

ADR 0003 hard-delete restrictions remain in force for core HR entities unless a
later Accepted two-key ADR explicitly supersedes or narrows them. A later
retention, anonymization, deletion, or physical deletion exception design must
state whether and how it supersedes ADR 0003 before any physical deletion path
can be implemented.

Retired employee records may remain logically inactive or ended for MVP-A and v1
only where needed for initial HR core history, assignment, IdP/writeback
readiness, auditability, and rollback-safe operation. This logical state does
not decide production retention periods, legal hold behavior, anonymization,
physical deletion, payroll or benefit retention, or deletion request
fulfillment.

Any future retention, anonymization, deletion, or physical deletion exception
support requires a later Accepted two-key ADR and must define legal basis,
retention period source, jurisdiction/legal-entity applicability, data category
classification, legal hold behavior, deletion/anonymization trigger, audit
evidence, rollback/recovery boundary, approval authority, and accountable human
owner before implementation.

`employment_status`, `termination_date`, `lifecycle_event`, `deleted_at`,
`retention_until`, or a generic retention flag alone is not sufficient to
authorize physical deletion, anonymization, or production retention automation.
Those markers may describe lifecycle or candidate scheduling state only when a
later issue explicitly authorizes the schema, API, policy, UI, job, or
operational work and the required two-key ADR is Accepted.

Generic escape hatches must not be used to hide retiree retention exceptions,
legal hold state, deletion requests, anonymization state, or sensitive/legal
retention facts. This includes `jsonb`, `metadata`, `note`, `memo`,
`raw_payload`, `audit_event`, attachment blobs, CSV export columns, fixtures,
seed data, logs, migration examples, and similar untyped or semi-typed surfaces.

Future implementation concepts such as `retention_policy`,
`retention_action_log`, `legal_hold`, `deletion_request`,
`anonymization_event`, `retention_until`, and `physical_delete_exception` remain
conceptual/deferred anchors unless a later issue explicitly authorizes schema,
API, policy, UI, job, or operational work.

Retention, anonymization, and deletion job extension architecture remains
deferred to #86. Privacy classification, consent, and processing-purpose
extension architecture remains deferred to #84. Concrete policy-as-code
prohibited payload rules remain deferred to #88. Detailed employment status and
work arrangement extension architecture remains deferred to #85.

Actual legal interpretation, statutory retention period numbers,
payroll/benefit retention rules, legal-hold operating procedures, deletion
request fulfillment procedures, privacy notice text, counsel sign-off,
contractual wording, backup purge behavior, and production data-retention
operations remain human/two-key responsibilities.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement retention product behavior, database migrations,
OpenAPI endpoints, DTOs, deletion/anonymization jobs, legal workflow screens,
payroll/benefit retention logic, provider integrations, privacy jobs,
production secrets, external service dependencies, production data-retention
operations, or Phase 1 HR workflow implementation.

## Consequences

- MVP-A and v1 preserve a narrow data-retention, legal/privacy, auditability,
  and recovery boundary until the repository has complete two-key evidence for
  broader retiree retention or physical deletion handling.
- Core table, API, DTO, payload, export, log, fixture, seed, attachment, audit,
  JSON, note, memo, raw provider payload, and migration work must fail closed if
  it would introduce retiree retention exceptions, legal hold state, deletion
  requests, anonymization state, physical deletion exceptions, or sensitive/legal
  retention facts through an unapproved surface.
- Repository guard coverage can catch removal or weakening of this ADR and its
  MVP-A/v1 retention boundary, ADR 0003 hard-delete relationship, future-support
  prerequisites, deferred-anchor list, and no-escape-hatch commitments before
  broader implementation work starts.
- Future implementation issues can use retention policy, retention action log,
  legal hold, deletion request, anonymization event, retention-until, and
  physical deletion exception as conceptual anchors, but they must not create
  schema, API, UI, provider, job, payroll/benefit, legal workflow, approval, or
  production data-retention operation surfaces until their own issue and ADR
  boundaries allow it.
- This Proposed ADR records the intended boundary but does not become active
  Accepted repository policy until the ADR 0000 two-key approval metadata is
  complete.

## Supersedes

None

## Superseded by

None

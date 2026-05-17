# ADR 0008: Leave of Absence, Childcare Leave, and Reduced Working Hours MVP-A/v1 Handling Boundary

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
- [Run-Mode Governance](../run-modes.md)

## Context

HRCore is still before PoC and MVP-A implementation. Leave of absence,
childcare leave, and reduced working hours can involve labor-law handling,
benefits, payroll, eligibility, statutory deadlines, medical or caregiving
facts, childcare facts, disability facts, harassment or disciplinary facts,
union activity, retention obligations, and sensitive personal information.
Before core HR tables, OpenAPI contracts, migrations, fixtures, exports, audit
payloads, raw provider payloads, notes, attachments, or logs expand, the
repository needs a durable boundary for these labor-status and work-arrangement
topics.

ADR 0000 classifies unclear legal, privacy, security, compliance evidence, data
retention, auditability, production operation, external trust, and irreversible
migration-shape decisions as fail-closed two-key decisions. This ADR affects
legal/privacy posture, labor-status handling, compliance evidence, data
retention, auditability, and future implementation boundaries. It therefore
cannot become Accepted until the ADR 0000 two-key metadata is complete.

ADR 0002 defines policy-as-code as the repository-owned verification strategy,
ADR 0003 protects MVP-A core stability, ADR 0005 keeps My Number and Specific
Personal Information outside the MVP-A/v1 core boundary, ADR 0006 keeps APPI
processing-purpose and DSAR handling behind explicit privacy decisions, ADR
0007 keeps sensitive personal information outside MVP-A/v1, and Run-Mode
Governance keeps legal/privacy decisions in the two-key lane.

The relevant planning-note paths for this issue are
`01_企画・構想/04_スコープ定義.md`, `04_データ・API/10_ER案.md`,
`04_データ・API/13_フィールドカタログ.md`, and
`05_実行計画/07_プロジェクト計画・ロードマップ.md`. The current repository
closeout evidence records those notes as aligned with ADR-gated legal/privacy
and Future Extension decisions. This ADR records the repository-owned decision
boundary so planning text, issue bodies, DTO comments, schema placeholders,
fixture examples, or generated documentation do not become the source of truth.

## Decision

HRCore MVP-A and v1 may model only the generic, non-sensitive employment or
work-arrangement state needed for initial HR core onboarding, assignment, or
IdP/writeback readiness.

HRCore MVP-A and v1 must not implement full leave-of-absence, childcare leave,
reduced-hours, payroll, benefit, statutory deadline, eligibility, entitlement,
medical/caregiving reason, disability, harassment, disciplinary, union, or
detailed labor-case management workflows.

Any future support for leave of absence, childcare leave, or reduced working
hours requires a later Accepted two-key ADR and must define the labor/legal
purpose, processing purpose, sensitive-personal-information classification,
consent or lawful handling basis where needed, field-level masking, export
permission, audit evidence, retention/deletion behavior, payroll/benefit
boundary, and accountable human owner before implementation.

`employment_status`, `work_arrangement`, `lifecycle_event`, or a generic
event/status flag alone is not sufficient to authorize sensitive or legally
regulated leave handling. Generic state may identify a narrow operational state
only when that state is required for initial HR core onboarding, assignment, or
IdP/writeback readiness and does not encode detailed labor-case facts.

Generic escape hatches must not be used to store detailed leave reasons,
medical/caregiving facts, childcare facts beyond the approved boundary,
disability facts, harassment or disciplinary investigation facts, union
activity, or equivalent sensitive labor/privacy data. This includes `jsonb`,
`metadata`, `note`, `memo`, `raw_payload`, `audit_event`, attachment blobs, CSV
export columns, fixtures, seed data, logs, migration examples, and similar
untyped or semi-typed surfaces.

Future implementation concepts such as `employment_status`,
`work_arrangement`, `lifecycle_event`, `leave_case`, `leave_reason`, and
effective-dated work pattern remain conceptual/deferred anchors unless a later
issue explicitly authorizes schema, API, policy, UI, or operational work.

Future Extension employment status and work arrangement architecture remain
deferred to #85. Privacy classification, consent, and processing-purpose
extension architecture remain deferred to #84. Concrete policy-as-code
prohibited payload rules remain deferred to #88. Broader retention and physical
deletion exceptions remain deferred to #70.

Actual legal interpretation, statutory leave eligibility, payroll or benefit
treatment, medical or caregiving documentation requirements, labor-management
procedures, privacy notice text, counsel sign-off, contractual wording, and
production labor/privacy operations remain human/two-key responsibilities.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement leave product behavior, database migrations,
OpenAPI endpoints, DTOs, approval UI, payroll/benefit logic, provider
integrations, privacy jobs, production secrets, external service dependencies,
legal/labor operational procedures beyond this ADR boundary, or Phase 1 HR
workflow implementation.

## Consequences

- MVP-A and v1 preserve a narrow legal, labor, and privacy boundary until the
  repository has complete two-key evidence for broader leave, childcare leave,
  or reduced working hours handling.
- Core table, API, DTO, payload, export, log, fixture, seed, attachment, audit,
  JSON, note, memo, raw provider payload, and migration work must fail closed if
  it would introduce detailed leave, labor-case, or sensitive labor/privacy
  handling.
- Repository guard coverage can catch removal or weakening of this ADR and its
  generic-state, deferred-workflow, and no-escape-hatch commitments before
  broader implementation work starts.
- Future implementation issues can use employment status, work arrangement,
  lifecycle event, leave case, leave reason, and effective-dated work pattern as
  conceptual anchors, but they must not create schema, API, UI, provider, job,
  payroll, benefit, approval, or production labor-operation surfaces until their
  own issue and ADR boundaries allow it.
- This Proposed ADR records the intended boundary but does not become active
  Accepted repository policy until the ADR 0000 two-key approval metadata is
  complete.

## Supersedes

None

## Superseded by

None

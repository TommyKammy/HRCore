# ADR 0013: Requester-Equals-Approver Prevention DB, Service, and Verifier Boundary

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
- [ADR 0004: Agent Execution Cost Cap and Automatic Stop Conditions](0004-agent-execution-cost-cap.md)
- [ADR 0010: Break-Glass Access and Emergency Local Account MVP-A/v1 Boundary](0010-break-glass-emergency-access-boundary.md)
- [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](0011-data-scope-policy-dsl-rls-boundary.md)
- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)
- [Run-Mode Governance](../run-modes.md)

## Context

HRCore is still before PoC and MVP-A implementation. Requester-equals-approver
prevention affects identity, authorization, approval integrity, auditability,
irreversible migration shape, production operations, and compliance evidence.
ADR 0000 therefore treats this as a fail-closed two-key decision. This ADR
cannot become Accepted until the ADR 0000 two-key metadata is complete.

ADR 0002 defines repository guard strategy, ADR 0003 protects MVP-A core
stability and migration shape, ADR 0004 requires agents to stop on suspicious
scope expansion, ADR 0010 keeps emergency access outside generic admin
shortcuts, ADR 0011 keeps authorization policy outside untyped surfaces, ADR
0012 defines audit immutability expectations, and Run-Mode Governance keeps
authorization-boundary decisions in the two-key lane.

The relevant planning-note paths for this issue are
`03_UI・業務/12_承認フロー詳細設計.md`, `04_データ・API/10_ER案.md`,
`04_データ・API/13_フィールドカタログ.md`, and
`04_データ・API/17_PostgreSQL DDLたたき台.md`. They mention approval-flow
negative tests and conceptual fields such as
`transaction_request.submitter_user_id` and
`approval_step.approver_user_id`. Those notes align with this ADR because they
identify requester, approver, and self-approval risks as design concerns while
leaving the repository-owned DB, service, and verifier enforcement boundary to
an ADR. These planning notes are not present in the current repository
checkout, so no planning note was updated in this issue.

## Decision

HRCore MVP-A and v1 must not allow the same effective actor to both submit or
request and approve the same business transaction.

The service or application approval command path is the authoritative
enforcement point. It is the only layer that can evaluate effective actor,
delegated approval context, break-glass context, role assignment, request
state, and workflow transition together.

Database constraints are required as supporting fail-closed guards where the
approver is a resolved user on an approval step or action. DB constraints alone
are not sufficient because role-based approvers, delegated approvers, future
routing rules, break-glass review, and multi-step workflows need service-level
context.

Verifier and policy-as-code coverage is required so future schema, service,
API, fixture, seed, and test changes cannot silently reintroduce self-approval
paths. Verifier checks are required, but verifier checks alone are not
sufficient runtime enforcement.

Approval actions must fail closed once implementation is authorized when
requester identity, approver identity, effective actor, delegated actor,
approval step binding, transaction or request binding, break-glass bypass
state, or audit correlation is missing, ambiguous, stale, mutable through an
untyped surface, or unverifiable.

A generic admin role, `is_admin`, HR role membership, local admin flag,
break-glass account, operator comment, note, memo, mutable metadata, JSON
payload, CSV row, raw payload, fixture, seed data, migration comment, README
snippet, or audit log entry alone must not be accepted as proof that
self-approval was prevented.

Break-glass and emergency access do not bypass the separation-of-duties rule
unless a later Accepted two-key ADR explicitly defines a controlled exception,
evidence requirements, and post-use review boundary.

Generic escape hatches must not be used to hide self-approval state,
separation-of-duties violations, approval evidence, break-glass bypass state,
delegation state, or audit correlation. This includes `jsonb`, `metadata`,
`note`, `memo`, `raw_payload`, audit payloads, CSV export columns, fixtures,
seed data, logs, migration examples, README snippets, and similar untyped or
semi-typed surfaces.

Future implementation concepts such as `transaction_request.submitter_user_id`,
`approval_step.approver_user_id`, `approval_action.actor_user_id`,
`effective_actor_user_id`, `delegated_actor_user_id`, `approval_policy`,
`separation_of_duties_policy`, `self_approval_violation`,
`approval_verification_result`, `break_glass_context`, `correlation_id`, and
`audit_event` remain conceptual/deferred anchors unless a later issue
explicitly authorizes schema, migration, API, verifier, service, job, or UI
work.

Raw payload and CSV export redaction and watermarking remain deferred to #75.
Concrete policy-as-code prohibited payload rules remain deferred to #88.
Retention-action-log extension design remains deferred to #86 where relevant.
Phase 2A approval implementation remains deferred to later MVP-A
implementation issues.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement approval runtime behavior, database migrations, SQL
constraints, triggers, service code, verifier code, APIs, DTOs, UI workflows,
notification behavior, seed data, fixtures, production operations, or Phase 1
HR workflow implementation.

## Consequences

- MVP-A and v1 preserve a service-authoritative separation-of-duties boundary
  while database and verifier work remain supporting guards.
- Later approval schema, service, verifier, API, DTO, workflow, seed, fixture,
  audit, or migration work must cite this ADR or a later Accepted two-key ADR
  that explicitly supersedes it.
- Repository guard coverage can catch removal or weakening of this ADR and its
  MVP-A/v1 self-approval prevention boundary, service-authoritative enforcement
  point, DB supporting guard, verifier requirement, fail-closed rule, and
  no-escape-hatch commitments before broader implementation work starts.
- Future implementation issues can use requester, approver, effective actor,
  delegated actor, approval policy, separation-of-duties policy,
  self-approval violation, approval verification result, break-glass context,
  correlation, and audit concepts as anchors, but they must not create schema,
  API, verifier, service, job, UI, migration, seed, fixture, or production
  operation surfaces until their own issue and ADR boundaries allow it.
- This Proposed ADR records the intended boundary but does not become active
  Accepted repository policy until the ADR 0000 two-key approval metadata is
  complete.

## Supersedes

None

## Superseded by

None

# ADR 0010: Break-Glass Access and Emergency Local Account MVP-A/v1 Boundary

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
- [Run-Mode Governance](../run-modes.md)

## Context

HRCore is still before PoC and MVP-A implementation. Break-glass access and
emergency local accounts affect security, identity, authorization,
auditability, production operations, provider trust, and compliance evidence.
They can also become permanent unaudited administrator paths if account custody,
activation, revocation, rotation, and post-use review are left implicit.

ADR 0000 classifies unclear security, identity, authorization, auditability,
production operation, external provider trust, and compliance evidence decisions
as fail-closed two-key decisions. This ADR therefore cannot become Accepted
until the ADR 0000 two-key metadata is complete.

ADR 0002 defines policy-as-code as the repository-owned verification strategy,
ADR 0003 protects MVP-A core stability, ADR 0004 requires agents to stop on
suspicious scope expansion, and Run-Mode Governance keeps security-sensitive
and production-impacting decisions in the two-key lane.

The relevant planning-note paths for this issue are
`01_企画・構想/05_ステークホルダー・ガバナンス.md`,
`04_データ・API/10_ER案.md`, `04_データ・API/16_API一覧.md`, and
`04_データ・API/17_PostgreSQL DDLたたき台.md`. They align with this ADR
because they identify security, audit, IdP, approval, and operations surfaces as
early governance concerns, while the repository closeout evidence for #82
records break-glass, data scope, and audit immutability as follow-up decision
work instead of current executable behavior. This ADR records the
repository-owned decision boundary so planning notes, issue bodies, schema
placeholders, fixture examples, README snippets, or generated documentation do
not become the source of truth.

## Decision

HRCore MVP-A and v1 must not implement real emergency local accounts, hard-coded
credentials, seed credentials, shared passwords, secret material, local bypass
endpoints, unaudited administrator elevation, IdP bypass logic, or production
break-glass runbooks as executable behavior.

Any future emergency access support requires a later Accepted two-key ADR and
must define account count, custody model, credential storage
location/classification, MFA or equivalent compensating control, activation
criteria, approval authority, time limit, revocation/rotation, least-privilege
scope, network/source restrictions, audit evidence, alerting, post-use review,
test cadence, and accountable human owner before implementation.

Break-glass access must be fail-closed by default. The absence of an Accepted
ADR, named custodians, auditable activation evidence, and rotation/revocation
procedure must block production emergency-access implementation.

`is_admin`, `role=admin`, a local account flag, environment variable, seed user,
fixture user, or operator note alone is not sufficient to authorize emergency
access. These markers cannot substitute for the later Accepted two-key ADR,
custody evidence, activation approval, time limit, revocation/rotation
procedure, least-privilege scope, network/source restriction, audit evidence,
alerting, post-use review, test cadence, and accountable owner required by this
ADR.

Generic escape hatches must not be used to hide credentials, break-glass
activation state, bypass decisions, emergency access approvals, or post-use
review evidence. This includes `jsonb`, `metadata`, `note`, `memo`,
`raw_payload`, `audit_event`, attachment blobs, CSV export columns, fixtures,
seed data, logs, migration examples, `.env` examples, README snippets, and
similar untyped or semi-typed surfaces.

Future implementation concepts such as `break_glass_account`,
`emergency_access_request`, `emergency_access_approval`,
`emergency_access_session`, `credential_custody_record`, `activation_evidence`,
and `post_use_review` remain conceptual/deferred anchors unless a later issue
explicitly authorizes schema, API, policy, UI, provider, job,
secret-management, or operational work.

Data-scope enforcement and DSL/RLS design remain deferred to #72. Audit
immutability, hash chain, WORM, and S3 Object Lock design remain deferred to
#73. Requester-equals-approver prevention remains deferred to #74. Raw payload
and CSV export redaction and watermarking remain deferred to #75. Concrete
policy-as-code prohibited payload rules remain deferred to #88.

Actual custodian names, production credential storage, production MFA
enrollment, IdP provider configuration, incident-response procedure,
legal/compliance sign-off, operational on-call process, and production
break-glass runbook text remain human/two-key responsibilities.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement emergency account product behavior, authentication
code, IdP configuration, local bypass endpoints, seed credentials, `.env`
secrets, database migrations, OpenAPI endpoints, DTOs, UI workflows, provider
integrations, background jobs, production secrets, external service
dependencies, production operations, or Phase 1 HR workflow implementation.

## Consequences

- MVP-A and v1 preserve a narrow security and operations boundary until the
  repository has complete two-key evidence for any emergency access behavior.
- Core table, API, DTO, payload, export, log, fixture, seed, attachment, audit,
  JSON, note, memo, raw provider payload, migration, README, and `.env` example
  work must fail closed if it would introduce emergency credentials,
  break-glass activation state, bypass decisions, emergency access approvals,
  or post-use review evidence through an unapproved surface.
- Repository guard coverage can catch removal or weakening of this ADR and its
  MVP-A/v1 break-glass boundary, fail-closed rule, no-secret/no-credential
  rule, and no-escape-hatch commitments before broader implementation work
  starts.
- Future implementation issues can use break-glass account, emergency access
  request, emergency access approval, emergency access session, credential
  custody record, activation evidence, and post-use review as conceptual
  anchors, but they must not create schema, API, UI, provider, job,
  secret-management, credential, or production operation surfaces until their
  own issue and ADR boundaries allow it.
- This Proposed ADR records the intended boundary but does not become active
  Accepted repository policy until the ADR 0000 two-key approval metadata is
  complete.

## Supersedes

None

## Superseded by

None

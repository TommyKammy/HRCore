# ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary

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
- [Run-Mode Governance](../run-modes.md)

## Context

HRCore is still before PoC and MVP-A implementation. `data_scope_policy` and
`condition_jsonb` appear in planning notes as authorization-related data-model
anchors, and the screen/API notes describe data-scope, CSV, raw-payload, and
audit-log surfaces. Those notes are planning input, not authorization policy.

Data-scope authorization affects security, identity, authorization, tenant or
legal-entity boundaries, auditability, privacy handling, export behavior, raw
provider payload visibility, and compliance evidence. ADR 0000 therefore treats
this as a fail-closed two-key decision. This ADR cannot become Accepted until
the ADR 0000 two-key metadata is complete.

ADR 0002 defines repository guard strategy, ADR 0003 protects MVP-A core
stability and migration shape, ADR 0004 requires agents to stop on suspicious
scope expansion, ADR 0010 keeps break-glass access outside generic role/admin
shortcuts, and Run-Mode Governance keeps authorization-boundary decisions in
the two-key lane.

The relevant planning-note paths reviewed for this issue are
`01_企画・構想/05_ステークホルダー・ガバナンス.md`,
`03_画面・UX/14_画面一覧詳細.md`, `04_データ・API/10_ER案.md`,
`04_データ・API/16_API一覧.md`, and
`04_データ・API/17_PostgreSQL DDLたたき台.md`. In the current repository
checkout they correspond to `Plan/05_stakeholders_governance.md`,
`Plan/14_screen_catalog_detailed.md`, `Plan/10_data_model_er.md`,
`Plan/16_api_catalog.md`, and `Plan/17_postgresql_ddl_draft.md`. They align
with this ADR because they identify data-scope, CSV, raw-payload, audit, role,
and governance surfaces as design concerns while leaving the concrete DSL/RLS
authorization boundary to a repository ADR. No planning note was updated in
this issue.

## Decision

HRCore MVP-A and v1 must not treat arbitrary `condition_jsonb`, free-form JSON,
raw SQL fragments, user-authored expressions, tenant-supplied code, unchecked
metadata, note or memo text, CSV columns, raw payloads, audit-event payloads,
fixtures, seed data, logs, migration examples, `.env` examples, README
snippets, or similar untyped surfaces as authorization policy.

HRCore MVP-A and v1 should use a constrained, allowlisted, application-owned
data-scope DSL as the planning baseline for
`data_scope_policy.condition_jsonb`. The DSL baseline must use a small
vocabulary of allowed scope dimensions and operators rather than arbitrary JSON
semantics, raw SQL, or tenant-authored expressions.

PostgreSQL RLS must not be the MVP-A authorization source of truth until a later
Accepted two-key ADR defines tenancy/session context, connection-pool behavior,
migration/rollback semantics, admin, batch, and job behavior, bypass
prevention, test strategy, and operational debugging procedures.

RLS may remain a future defense-in-depth option, but application, service, and
query-layer authorization remains required. The absence of RLS must not make
application-owned data-scope enforcement optional.

Data-scope checks must fail closed by default. An unknown scope type, unknown
operator, unsupported field, invalid schema version, empty policy where a policy
is required, missing actor context, missing legal-entity or department context,
parser error, or policy-evaluation error must deny access rather than broaden
scope.

A generic role name, `is_admin`, local admin flag, role assignment, UI route
permission, note or memo text, raw JSON blob, or operator comment alone is not
sufficient to authorize row, field, CSV, raw-payload, or audit-log access.

The future DSL vocabulary must distinguish at least scope dimensions,
operators, subject or actor context, target entity context, legal entity,
department or organization, employment or assignment relationship,
effective-date handling, field or PII class, export, raw-view, and audit-view
capability markers, and schema versioning as conceptual anchors. This ADR does
not decide the final grammar, JSON schema, field-level permission matrix, role
catalog, department hierarchy semantics, masking rules, raw-payload viewer
rules, audit-log viewer rules, or SQL policy text.

Future implementation concepts such as `data_scope_policy`, `condition_jsonb`,
`data_scope_condition`, `scope_dimension`, `scope_operator`, `actor_context`,
`target_context`, `field_scope`, `export_scope`, `raw_payload_scope`,
`audit_log_scope`, `policy_schema_version`, and
`policy_evaluation_result` remain conceptual/deferred anchors unless a later
issue explicitly authorizes schema, API, policy, query-builder, service, UI,
verifier, or migration work.

Audit immutability, hash chain, WORM, and S3 Object Lock design remain deferred
to #73. Requester-equals-approver prevention remains deferred to #74. Raw
payload and CSV export redaction and watermarking remain deferred to #75.
Concrete policy-as-code prohibited payload rules remain deferred to #88. Phase
2A field-level and data-scope implementation remains deferred to later MVP-A
implementation issues.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement authorization runtime behavior, SQL migrations, RLS
policies, query builders, APIs, DTOs, UI workflows, CSV export behavior, raw
payload viewers, audit-log viewers, policy engines, OPA/Rego rules, production
secrets, external service dependencies, production operations, or Phase 1 HR
workflow implementation.

## Consequences

- MVP-A and v1 preserve an application-owned authorization baseline while the
  concrete data-scope implementation remains deferred.
- Repository guard coverage can catch removal or weakening of this ADR and its
  MVP-A/v1 data-scope boundary, application-owned DSL baseline,
  RLS-not-source-of-truth rule, fail-closed rule, and no-arbitrary-JSON or
  no-escape-hatch commitments.
- Later schema, API, query-builder, service, UI, export, raw-payload,
  audit-log, policy-engine, or RLS work must cite this ADR or a later Accepted
  two-key ADR that explicitly supersedes it.
- This Proposed ADR records the intended boundary but does not become active
  Accepted repository policy until the ADR 0000 two-key approval metadata is
  complete.

## Supersedes

None

## Superseded by

None

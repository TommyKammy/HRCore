# ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary

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
- [Run-Mode Governance](../run-modes.md)

## Context

HRCore is still before PoC and MVP-A implementation. Audit events, immutable
evidence, hash-chain verification, WORM storage, S3 Object Lock, legal hold,
external archive storage, and production evidence export affect auditability,
data retention, backup or restore semantics, production operations, external
provider trust, irreversible migration shape, and compliance evidence.

ADR 0000 classifies unclear auditability, data-retention, backup or restore,
production operation, external-provider-trust, irreversible-migration-shape, and
compliance-evidence decisions as fail-closed two-key decisions. This ADR
therefore cannot become Accepted until the ADR 0000 two-key metadata is
complete.

ADR 0002 defines policy-as-code as the repository-owned verification strategy,
ADR 0003 protects MVP-A core stability and migration shape, ADR 0004 requires
agents to stop on suspicious scope expansion, ADR 0010 keeps emergency access
outside generic admin shortcuts, ADR 0011 keeps data-scope and audit-log access
outside untyped authorization surfaces, and Run-Mode Governance keeps
auditability and production-storage decisions in the two-key lane.

The relevant planning-note paths for this issue are
`01_企画・構想/05_ステークホルダー・ガバナンス.md`,
`03_画面・UX/14_画面一覧詳細.md`, `04_データ・API/10_ER案.md`,
`04_データ・API/16_API一覧.md`, and
`04_データ・API/17_PostgreSQL DDLたたき台.md`. The corresponding repository
checkout paths used by recent ADRs, such as `Plan/05_stakeholders_governance.md`,
`Plan/14_screen_catalog_detailed.md`, `Plan/10_data_model_er.md`,
`Plan/16_api_catalog.md`, and `Plan/17_postgresql_ddl_draft.md`, are not present
in this worktree. No planning note was updated in this issue. This ADR records
the repository-owned decision boundary so planning notes, issue bodies, schema
placeholders, fixture examples, README snippets, operator notes, or generated
documentation do not become the source of truth.

## Decision

HRCore MVP-A and v1 must not claim audit immutability from an ordinary mutable
database row, application log, CSV export, raw payload, metadata blob, note or
memo text, fixture, seed data, migration comment, README snippet, or operator
note alone.

HRCore MVP-A and v1 should use append-only `audit_event` plus hash-chain and
tamper-evidence semantics as the planning baseline for repository and
application design.

WORM storage, S3 Object Lock, external archive buckets, retention lock mode,
legal hold, cross-account storage, replication, and production immutable
evidence export must not be treated as implemented or selected until a later
Accepted two-key ADR defines the production storage/provider boundary.

S3 Object Lock may remain a future production-grade immutable archive option,
but append-only audit behavior, canonical event hashing, chain verification, and
tamper-evidence checks remain required design expectations. The absence of S3
Object Lock does not make the HRCore audit-event baseline optional.

Audit immutability checks must fail closed by default once implementation is
authorized. A missing previous hash, missing event hash, unsupported hash
algorithm, non-canonical payload, duplicate or skipped chain sequence, broken
chain, changed historical payload, missing actor, source, or correlation
context, clock rollback, or verification error must produce an explicit failure
rather than silently trusting the audit trail.

A generic `updated_at`, mutable `metadata_jsonb`, note or memo text, raw
payload, application log line, database trigger comment, admin role, `is_admin`,
local admin flag, operator comment, or object-storage path alone is not
sufficient to prove audit immutability.

Future implementation concepts such as `audit_event`, `previous_hash`,
`event_hash`, `hash_algorithm`, `canonical_event_payload`,
`audit_chain_scope`, `audit_chain_sequence`, `audit_chain_checkpoint`,
`audit_chain_verification_result`, `external_audit_archive`,
`object_lock_retention`, `legal_hold`, `archive_manifest`, and
`archive_evidence_uri` remain conceptual/deferred anchors unless a later issue
explicitly authorizes schema, migration, API, verifier, service, job, storage,
provider, or operational work.

Requester-equals-approver prevention remains deferred to #74. Raw payload and
CSV export redaction and watermarking remain deferred to #75. Concrete
policy-as-code prohibited payload rules remain deferred to #88.
Retention-action-log extension design remains deferred to #86 where relevant.
Phase 2A audit implementation remains deferred to later MVP-A implementation
issues.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement audit runtime behavior, database migrations,
hash-chain code, WORM or S3 configuration, object storage integration,
retention jobs, APIs, DTOs, UI workflows, export behavior, redaction behavior,
policy engines, production secrets, external service dependencies, production
operations, or Phase 1 HR workflow implementation.

## Consequences

- MVP-A and v1 preserve an append-only and tamper-evidence audit planning
  baseline without claiming production immutable archive behavior.
- Core table, API, DTO, payload, export, log, fixture, seed, attachment, audit,
  JSON, note, memo, raw provider payload, migration, README, and operator-note
  work must fail closed if it would claim audit immutability through an
  unapproved mutable or untyped surface.
- Repository guard coverage can catch removal or weakening of this ADR and its
  MVP-A/v1 audit immutability boundary, append-only/hash-chain baseline,
  WORM/S3 deferral, fail-closed rule, and no-mutable-row/no-escape-hatch
  commitments before broader implementation work starts.
- Future implementation issues can use audit-event, previous-hash, event-hash,
  canonical-payload, chain-scope, chain-sequence, verification-result,
  external-archive, object-lock-retention, legal-hold, archive-manifest, and
  evidence-URI concepts as anchors, but they must not create schema, API,
  verifier, service, job, storage-provider, archive, retention, or production
  operation surfaces until their own issue and ADR boundaries allow it.
- This Proposed ADR records the intended boundary but does not become active
  Accepted repository policy until the ADR 0000 two-key approval metadata is
  complete.

## Supersedes

None

## Superseded by

None

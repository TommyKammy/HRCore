# ADR 0003: MVP-A Core Stability Contract

## Status

Accepted

## Date

2026-05-17

## Decision owners

- Author: TommyKammy
- Approver: TommyKammy
- Counter-approver: Not required because this contract freezes baseline schema and migration compatibility rules without changing live security, identity, authorization, tenant boundaries, auditability, data retention, backup or restore semantics, production operations, external provider trust, or compliance evidence.
- Time-locked review window: Not required because this decision does not require two-key handling.

## Depends on ADRs

- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)
- [ADR 0001: Initial Backend Stack](0001-initial-backend-stack.md)
- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)

## Context

HRCore is still in the MVP-A baseline stage. Later issues will add core HR
entities, migrations, extension points, and policy-as-code enforcement. Before
that work expands the data model, the repository needs a stable core contract
that future schema, migration, API, and extension work can preserve.

Leaving these invariants implicit would let later implementation issues redefine
identity, enum, deletion, rename, or migration-number behavior through local
code shape instead of an Accepted ADR. This decision records the MVP-A baseline
and connects it to the policy-as-code CI strategy from ADR 0002 without
implementing the complete policy engine in this issue.

## Decision

All primary keys for core HR entities must use UUID values.

Stable entity identifiers must not be changed in place. If an identifier needs
to be replaced, the replacement must be modeled as a new authoritative lifecycle
event, alias, redirect, or migration path rather than overwriting the stable
identifier as if it had always been different.

`entity_type` values must use `SCREAMING_SNAKE_CASE`.

Hard-delete is prohibited for core HR entities unless a later Accepted ADR explicitly supersedes this rule.
Deletion behavior for core HR entities must preserve the durable lifecycle,
audit, retention, or tombstone semantics needed by the accepted data model in
force at that time.

Existing enum values must not be redefined with a different meaning. A new
meaning requires a new enum value, a compatibility migration, or a later
Accepted ADR that explicitly supersedes this rule.

Table or column renames must keep an alias, compatibility view, compatibility column, API translation layer, or documented migration bridge until dependent code and data have moved to the new name.

Migration numbers `0001-0099` are reserved for core work.
Migration numbers `0200+` are reserved for extension work.
The gap between those ranges is left unallocated by this ADR and must not be
treated as extension space without a later Accepted ADR or repository policy
update.

These invariants are policy-as-code rule commitments under ADR 0002. Initial
guard coverage may use repository-owned lexical sentinels to prove the ADR and
its required commitments remain present. Future enforcement must follow ADR
0002's structured-inspection direction before treating schema, migration,
OpenAPI, ORM metadata, or diff facts as authoritative.

This ADR does not implement a full policy engine, OPA/Rego policy, broad data-model migration, Future Extension payload rule set, legal or privacy scope decision, provider mock, LocalStack or development AWS decision, agent cost-cap control, production secret, external service dependency, or Phase 1 HR workflow.

## Consequences

- Future core HR schema work has explicit stability rules for identity, entity
  typing, deletion, enum meanings, renames, and migration numbering.
- Policy-as-code implementation issues can convert these commitments into
  parser-backed checks without treating this issue as the full enforcement
  engine.
- Pull requests that mutate stable identifiers, redefine enum meanings, hard
  delete core HR entities by default, overlap migration number ranges, or rename
  schema surfaces without compatibility handling should be treated as
  architecture drift unless a later Accepted ADR supersedes this contract.
- Repository guard tests provide a lightweight failure if the ADR or required
  stability commitments disappear.

## Supersedes

None

## Superseded by

None

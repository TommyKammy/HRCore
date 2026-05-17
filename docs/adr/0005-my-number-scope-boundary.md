# ADR 0005: My Number and Specific Personal Information Scope Boundary

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

## Context

HRCore is still preparing the MVP-A and v1 boundary. Before core HR tables,
OpenAPI contracts, migrations, fixtures, exports, logs, and provider payload
surfaces expand, the repository needs a durable decision for My Number and
Specific Personal Information.

ADR 0000 classifies unclear legal, privacy, security, compliance evidence, data
retention, auditability, production operation, external trust, and irreversible
migration-shape decisions as fail-closed two-key decisions. This scope boundary
affects legal and privacy posture, compliance evidence, data retention,
auditability, and future irreversible schema shape. It therefore cannot become
Accepted until the ADR 0000 two-key metadata is complete.

Existing planning notes already point MVP-A away from storing Number Act data in
HRCore core tables and toward a later decision gate for any separate reference
or storage model. This ADR records the repository-owned decision boundary so the
planning text does not remain the source of truth.

## Decision

MVP-A and v1 must not store My Number or Specific Personal Information in HRCore
core tables.

HRCore core tables must not contain direct My Number or Specific Personal
Information columns, including `my_number`, `individual_number`,
`specific_personal_information`, or equivalent local names that would persist
Number Act target data in the core HR schema.

HRCore OpenAPI contracts, request or response DTOs, seed data, fixtures, logs,
raw provider payload storage, CSV export surfaces, and migration examples must
not persist, expose, export, log, seed, fixture, or hide My Number or Specific
Personal Information.

MVP-A and v1 may not add a generic escape hatch for this data by hiding it
inside JSON, note, memo, attachment, raw payload, metadata, generic audit
payload, audit fields, or similar untyped storage surfaces.

Existing external systems remain the system of record for My Number and
Specific Personal Information until a future support model is approved through a
later Accepted two-key ADR. Any future support requires a later Accepted
two-key ADR and must remain separate from core HR tables through an approved
external system, external vault, separate schema, separate service, or
reference-only integration.

Detailed external-reference and separate-schema design is deferred to R08,
especially #83 and the related R08 extension-anchor issues. This ADR does not
design `sensitive_data_reference`, a vault contract, separate schema ownership,
cross-schema authorization, retention behavior, export behavior, audit evidence,
or concrete policy-as-code prohibited payload rules. Issue #88 remains
responsible for future concrete prohibited payload rules if that issue is
accepted and scoped to implement them.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement product features, database migrations, external
vault integration, legal workflow screens, APPI or DSAR policy, R08 schema
design, full policy-as-code enforcement, production secrets, external services,
or Phase 1 HR workflows.

## Consequences

- MVP-A and v1 preserve a narrow legal and privacy boundary until the repository
  has complete two-key evidence for any broader Number Act handling.
- Core HR table, API, payload, export, log, fixture, seed, attachment, audit,
  and migration work must fail closed if it would introduce My Number or
  Specific Personal Information storage.
- Repository guard coverage can keep this ADR discoverable and catch removal or
  weakening of the non-storage boundary before broader implementation begins.
- R08 remains the owner for any future external-reference, separate-schema,
  separate-service, vault, or reference-only design.
- This Proposed ADR records the intended boundary but does not become active
  Accepted repository policy until the ADR 0000 two-key approval metadata is
  complete.

## Supersedes

None

## Superseded by

None

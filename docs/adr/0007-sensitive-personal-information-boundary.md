# ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary

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
- [Run-Mode Governance](../run-modes.md)

## Context

HRCore is still before PoC and MVP-A implementation. Before core HR tables,
OpenAPI contracts, migrations, fixtures, exports, audit evidence, raw provider
payload storage, attachments, or notes expand, the repository needs a durable
boundary for sensitive personal information.

ADR 0000 classifies unclear legal, privacy, security, compliance evidence, data
retention, auditability, production operation, external trust, and irreversible
migration-shape decisions as fail-closed two-key decisions. This ADR affects
legal/privacy posture, compliance evidence, data retention, auditability, and
future implementation boundaries. It therefore cannot become Accepted until the
ADR 0000 two-key metadata is complete.

ADR 0002 defines policy-as-code as the repository-owned verification strategy,
ADR 0003 protects MVP-A core stability, ADR 0005 keeps My Number and Specific
Personal Information outside the MVP-A/v1 core boundary, ADR 0006 keeps APPI
processing-purpose and DSAR handling behind explicit privacy decisions, and
Run-Mode Governance keeps legal/privacy decisions in the two-key lane.

Current planning direction keeps sensitive personal information outside MVP-A
until a dedicated decision gate passes. This ADR records that repository-owned
boundary so planning notes, issue bodies, DTO comments, schema placeholders, or
generated documentation do not become the source of truth.

## Decision

HRCore MVP-A and v1 must not store, expose, export, seed, fixture, log, or hide
sensitive personal information in core tables, APIs, DTOs, raw provider payload
storage, CSV export surfaces, audit payloads, JSON, notes, memos, attachments,
migration examples, or equivalent storage and transport surfaces.

Sensitive personal information examples include at least:

- health/medical information.
- disability information.
- labor union membership.
- harassment or disciplinary investigation records.
- family origin/permanent domicile-style attributes.
- any equivalent local category that requires stricter consent, purpose,
  masking, audit, or access handling.

Any future support requires a later Accepted two-key ADR and must define the
processing purpose, consent or lawful handling basis, field-level
classification, masking, export permission, audit evidence, retention/deletion
behavior, and accountable human owner before implementation.

`person.pii_level_code` or a generic PII flag alone is not sufficient to
authorize sensitive personal information handling. A generic classification
marker cannot substitute for the later Accepted two-key ADR, purpose evidence,
consent or lawful handling basis, field-level classification, masking, export
permission, audit evidence, retention/deletion behavior, and accountable owner
required by this ADR.

Generic escape hatches must not be used to store sensitive personal information.
This includes `jsonb`, `metadata`, `note`, `memo`, `raw_payload`,
`audit_event`, attachment blobs, CSV export columns, fixtures, seed data, logs,
audit fields, migration examples, and similar untyped or semi-typed surfaces.

Future implementation concepts such as `privacy_classification_rule`,
`privacy_consent`, `processing_purpose`, field-level mask policy, and export
permission remain conceptual/deferred anchors unless a later issue explicitly
authorizes schema, API, policy, UI, or operational work.

Retention and physical deletion exceptions remain deferred to #70. Privacy
classification, consent, and processing-purpose extension architecture remain
deferred to #84. Concrete policy-as-code prohibited payload rules remain
deferred to #88.

Actual legal interpretation, statutory consent text, privacy notice text,
counsel sign-off, contractual wording, and production privacy operations remain
human/two-key responsibilities.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement sensitive-data fields, consent flows, production
privacy operations, schema changes, legal workflow screens, OpenAPI endpoints,
DTOs, UI workflows, provider integrations, privacy jobs, production secrets,
external service dependencies, or Phase 1 HR workflow implementation.

## Consequences

- MVP-A and v1 preserve a narrow legal and privacy boundary until the repository
  has complete two-key evidence for any broader sensitive personal information
  handling.
- Core table, API, DTO, payload, export, log, fixture, seed, attachment, audit,
  JSON, note, memo, raw provider payload, and migration work must fail closed if
  it would introduce sensitive personal information handling.
- Repository guard coverage can catch removal or weakening of this ADR and its
  non-storage and no-escape-hatch commitments before broader implementation
  work starts.
- Future implementation issues can use privacy classification, consent,
  processing purpose, masking, export permission, and audit evidence as
  conceptual anchors, but they must not create schema, API, UI, provider, job,
  or production privacy-operation surfaces until their own issue and ADR
  boundaries allow it.
- This Proposed ADR records the intended boundary but does not become active
  Accepted repository policy until the ADR 0000 two-key approval metadata is
  complete.

## Supersedes

None

## Superseded by

None

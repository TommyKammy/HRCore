# ADR 0015: My Number and Specific Personal Information External Reference and Separate Schema Boundary

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
- [ADR 0005: My Number and Specific Personal Information Scope Boundary](0005-my-number-scope-boundary.md)
- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)
- [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](0007-sensitive-personal-information-boundary.md)
- [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](0011-data-scope-policy-dsl-rls-boundary.md)
- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)
- [ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary](0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md)
- [Run-Mode Governance](../run-modes.md)

## Context

HRCore is still before PoC and MVP-A implementation. ADR 0005 already keeps My
Number and Specific Personal Information out of MVP-A and v1 core HR tables and
out of generic escape hatches. This ADR records the future extension anchor for
external references, vault references, separate schemas, separate services, and
reference-only integration without weakening ADR 0005.

My Number and Specific Personal Information handling is a legal, privacy,
security, auditability, compliance-evidence, data-retention, external-trust, and
future irreversible-data-shape decision. ADR 0000 therefore treats this as a
fail-closed two-key decision. This ADR cannot become Accepted until the ADR 0000
two-key metadata is complete.

ADR 0002 defines repository guard strategy. ADR 0003 protects core schema and
migration shape. ADR 0005 provides the current non-storage rule. ADR 0006 and
ADR 0007 define privacy and sensitive-data boundaries. ADR 0011 requires
authorization policy to remain constrained and fail closed. ADR 0012 requires
durable audit evidence. ADR 0014 blocks raw payload and CSV export escape
hatches. Run-Mode Governance keeps this legal/privacy decision in the two-key
lane.

This ADR is intentionally an extension contract, not an implementation plan. It
does not decide a vendor, vault product, schema name, table shape, service API,
retention job, secret-management system, or user workflow.

## Decision

MVP-A and v1 core HR tables must not store My Number or Specific Personal Information.

MVP-A and v1 must not hide My Number or Specific Personal Information in generic JSON, metadata, notes, raw provider payloads, audit payloads, logs, fixtures, seeds, attachments, or CSV exports.

future support must be loosely coupled from core HR tables through one of the
following approved extension patterns, if a later Accepted two-key ADR and
implementation issue authorize it:

- external system of record
- external vault
- separate schema
- separate service
- reference-only integration

The only information HRCore core tables may store before a later Accepted
two-key ADR narrows this boundary is an opaque external reference plus minimal
non-sensitive linkage metadata needed to route a request. An opaque external
reference must never be the raw My Number value, a reversible encoding of the
raw value, a checksum intended for matching the raw value, a masked copy that
still exposes the underlying value, a vault secret, or a provider payload that
contains Number Act data.

Any future reference contract must define purpose binding, authorization, audit evidence, redaction, download, export, and logging restrictions, and the cross-schema or cross-service ownership boundary before a reference can be resolved or used.

Resolving a reference must fail closed when purpose, actor authorization,
subject binding, external-system binding, vault binding, schema ownership,
service ownership, audit correlation, redaction policy, export permission,
logging policy, or retention authority is missing, stale, malformed, or only
inferred from names, paths, comments, or nearby metadata.

An opaque reference alone must not authorize display, export, logging,
download, persistence of the underlying Number Act data, provider replay,
fixture generation, seed generation, CSV generation, attachment generation, or
audit-payload expansion.

Separate-schema or separate-service handling must keep ownership explicit. Core
HR schema migrations, core DTOs, OpenAPI request or response contracts, core
audit payloads, raw provider payload stores, logs, fixtures, seeds, attachments,
and CSV exports must not become side channels for My Number or Specific
Personal Information.

Any future implementation must record all of the following before it may
resolve or use a reference:

- the accountable owner of the external system, vault, schema, or service
- the subject and legal-entity or employer binding
- the processing purpose and allowed operation
- the actor, effective actor, and delegation or break-glass context where relevant
- the authorization decision and data-scope decision
- the redaction, masking, export, download, and logging profile
- the audit correlation, request or job ID, and outcome
- the retention, deletion, and incident-response ownership boundary

Concrete implementation, migrations, API shape, UI workflow, external
vault/service integration, secrets, retention jobs, and policy-as-code
enforcement are deferred to later implementation issues or later Accepted ADRs.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement runtime features, database migrations, API endpoints, UI workflows, provider adapters, vault integration, secret handling, export jobs, retention jobs, or policy-as-code parser rules.

## Consequences

- ADR 0005's MVP-A/v1 non-storage boundary remains intact.
- Future Number Act handling has a repository-owned extension anchor without
  pulling raw Number Act data into HRCore core tables or untyped surfaces.
- Later work must cite this ADR or a later Accepted two-key ADR before adding
  any external-reference, vault, separate-schema, separate-service, or
  reference-only behavior.
- Repository guard coverage can catch removal or weakening of the Proposed
  status, two-key posture, non-storage boundary, loose-coupling extension
  anchor, and fail-closed reference-resolution commitments.
- This Proposed ADR records the intended extension boundary but does not become
  active Accepted repository policy until the ADR 0000 two-key approval metadata
  is complete.

## Supersedes

None

## Superseded by

None

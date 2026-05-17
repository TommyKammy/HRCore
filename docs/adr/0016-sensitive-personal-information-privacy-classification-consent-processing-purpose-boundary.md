# ADR 0016: Sensitive Personal Information Privacy Classification, Consent, and Processing-Purpose Extension Boundary

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
- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)
- [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](0007-sensitive-personal-information-boundary.md)
- [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](0011-data-scope-policy-dsl-rls-boundary.md)
- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)
- [ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary](0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md)
- [ADR 0015: My Number and Specific Personal Information External Reference and Separate Schema Boundary](0015-my-number-external-reference-separate-schema-boundary.md)
- [Run-Mode Governance](../run-modes.md)

## Context

HRCore is still before PoC and MVP-A implementation. ADR 0007 already keeps
sensitive personal information outside MVP-A and v1 core tables, APIs, DTOs,
raw provider payloads, exports, audit payloads, JSON, notes, memos,
attachments, fixtures, seeds, logs, migration examples, and equivalent escape
hatches.

This ADR records the future extension anchor for privacy classification,
consent or lawful-handling basis, processing purpose, masking/redaction profile,
export permission, audit evidence, and data-scope interaction. It does not
authorize storing or processing sensitive personal information.

Sensitive personal information handling affects legal/privacy posture,
security, authorization, auditability, data retention, compliance evidence,
external provider trust, production operations, and future irreversible data
shape. ADR 0000 therefore treats this as a fail-closed two-key decision. This
ADR cannot become Accepted until the ADR 0000 two-key metadata is complete.

ADR 0002 defines repository guard strategy, ADR 0003 protects MVP-A core
stability and migration shape, ADR 0006 keeps processing-purpose and DSAR
handling behind privacy boundaries, ADR 0007 provides the current sensitive
personal information non-storage rule, ADR 0011 requires data-scope policy to
remain constrained and fail closed, ADR 0012 requires durable audit evidence,
ADR 0014 blocks raw payload and CSV export escape hatches, ADR 0015 defines a
loose-coupling pattern for adjacent regulated identifiers, and Run-Mode
Governance keeps legal/privacy decisions in the two-key lane.

This ADR is intentionally an extension contract, not an implementation plan. It
does not decide concrete schema names, table shapes, API contracts, consent
capture workflow, DSAR operation, provider integration, retention job, policy
parser, UI screen, production legal text, or production privacy operation.

## Decision

MVP-A and v1 must not store, expose, export, seed, fixture, log, or hide sensitive personal information in core tables, APIs, DTOs, raw provider payloads, audit payloads, JSON, notes, memos, attachments, CSV exports, fixtures, seeds, logs, or migration examples.

Future support for sensitive personal information must be implemented only as a
loosely coupled extension if a later Accepted two-key ADR and implementation
issue authorize it. The extension boundary must define the following anchors
before fields, tables, APIs, UI, jobs, providers, exports, or policy rules are
added:

- privacy classification.
- consent or lawful-handling basis.
- processing purpose.
- masking/redaction profile.
- export permission.
- audit evidence.
- data-scope interaction.

The extension anchor must bind classification, basis, purpose, masking,
permission, evidence, and scope to an accountable owner and to the specific
subject, legal entity or employer context, actor, effective actor, operation,
request or job, and outcome before any sensitive personal information can be
resolved, displayed, exported, logged, downloaded, persisted, replayed, or
included in audit payloads.

A generic classification flag, consent metadata, purpose text, HR role,
application admin flag, break-glass context, operator comment, raw provider
payload, audit log entry, note, memo, attachment, CSV row, fixture, seed, or
migration comment must not authorize display, export, logging, download, persistence, provider replay, fixture generation, seed generation, CSV generation, attachment generation, audit-payload expansion, or migration generation of sensitive personal information.

Generic escape hatches must not be used to hide sensitive personal information
or its classification, consent or lawful-handling basis, processing purpose,
masking/redaction profile, export permission, audit evidence, data scope,
request owner, accountable owner, or authorization decision. This includes
`jsonb`, `metadata`, `note`, `memo`, `raw_payload`, `audit_event`, attachment
blobs, CSV export columns, logs, fixtures, seed data, migration examples, `.env`
examples, README snippets, and similar untyped or semi-typed surfaces.

Future extension concepts such as `privacy_classification`,
`privacy_classification_rule`, `lawful_handling_basis`, `privacy_consent`,
`processing_purpose`, `sensitive_data_scope`, `masking_profile`,
`redaction_profile`, `export_permission`, `audit_evidence`,
`purpose_binding`, `consent_evidence`, `data_scope_policy`, `request_owner`,
`accountable_owner`, and `correlation_id` remain conceptual/deferred anchors
unless a later issue explicitly authorizes schema, migration, API, verifier,
service, job, storage, or UI work.

Concrete schema, migrations, API shape, UI workflow, consent capture, DSAR operations, provider integration, retention jobs, and policy-as-code enforcement are deferred to later implementation issues or later Accepted ADRs.

The exact legal text, statutory consent wording, privacy notice wording,
provider contract terms, retention schedule, DSAR operating procedure, counsel
sign-off, and production privacy operation remain human/two-key
responsibilities.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement runtime features, migrations, OpenAPI endpoints, DTOs, UI workflows, consent flows, provider integrations, privacy jobs, production secrets, external services, or policy-as-code parser rules.

## Consequences

- ADR 0007's MVP-A/v1 non-storage and no-escape-hatch boundary remains intact.
- Future sensitive personal information handling has a repository-owned
  extension anchor without pulling sensitive personal information into core HR
  tables, APIs, DTOs, raw payloads, audit payloads, CSV exports, fixtures,
  seeds, logs, migration examples, or untyped surfaces.
- Later work must cite this ADR or a later Accepted two-key ADR before adding
  privacy-classification, consent or lawful-handling, processing-purpose,
  masking/redaction, export-permission, audit-evidence, or data-scope behavior
  for sensitive personal information.
- Repository guard coverage can catch removal or weakening of the Proposed
  status, two-key posture, non-storage boundary, no-escape-hatch commitment,
  loose-coupling extension anchor, and deferred-implementation boundary.
- This Proposed ADR records the intended extension boundary but does not become
  active Accepted repository policy until the ADR 0000 two-key approval
  metadata is complete.

## Supersedes

None

## Superseded by

None

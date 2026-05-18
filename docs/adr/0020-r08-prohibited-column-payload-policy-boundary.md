# ADR 0020: R08 Prohibited Column and Payload Policy Boundary

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
- [ADR 0008: Leave of Absence, Childcare Leave, and Reduced Working Hours MVP-A/v1 Handling Boundary](0008-leave-work-arrangement-boundary.md)
- [ADR 0009: Retiree Data Retention Period and Physical Deletion Exception Boundary](0009-retiree-retention-physical-deletion-boundary.md)
- [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](0011-data-scope-policy-dsl-rls-boundary.md)
- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)
- [ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary](0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md)
- [ADR 0015: My Number and Specific Personal Information External Reference and Separate Schema Boundary](0015-my-number-external-reference-separate-schema-boundary.md)
- [ADR 0016: Sensitive Personal Information Privacy Classification, Consent, and Processing-Purpose Extension Boundary](0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary.md)
- [ADR 0017: Employment Status and Work Arrangement Extension Boundary](0017-employment-status-work-arrangement-extension-boundary.md)
- [ADR 0018: Retiree Retention, Anonymization, Deletion Job, and Retention Log Extension Boundary](0018-retiree-retention-anonymization-deletion-job-retention-log-extension-boundary.md)
- [ADR 0019: Legal Entity Timezone and Business Calendar Extension Boundary](0019-legal-entity-timezone-business-calendar-extension-boundary.md)
- [Run-Mode Governance](../run-modes.md)

## Context

R08 Future Extension planning has accumulated several Proposed ADRs that
define data classes, escape hatches, and no-runtime implementation boundaries.
Those ADRs already prohibit storing or hiding sensitive HR, privacy, legal,
audit, retention, raw payload, and export data in core HR tables or untyped
side channels.

ADR 0002 defines the repository policy-as-code baseline and distinguishes
narrow lexical sentinels from later structured inspection. This ADR connects
the R08 prohibited list to that baseline so CI closeout evidence can cite a
single documented rule boundary without claiming a full policy engine.

The boundary affects legal, privacy, security, auditability, retention,
compliance evidence, irreversible data shape, and future production
operations. ADR 0000 therefore requires fail-closed two-key handling before
this ADR can become Accepted.

This ADR is intentionally a policy boundary and repository guard commitment.
It does not implement parser-backed schema inspection, OpenAPI analysis,
TypeScript AST analysis, PR-diff analysis, OPA/Rego evaluation, runtime
authorization, or broad policy enforcement.

## Decision

The R08 prohibited list is a policy-as-code commitment under ADR 0002. Future
CI and repository guards must protect this list before implementation begins,
and closeout evidence for R08 policy work must include the list or a direct
link to this ADR.

The R08 prohibited list covers column names, payload names, fixture values,
seed values, logs, attachments, export fields, migration examples, OpenAPI
schemas, DTOs, comments, and equivalent repository surfaces that would store,
expose, export, seed, fixture, log, or hide the following data or authority
signals without a later Accepted two-key ADR and the required structured
implementation:

- Number Act data, My Number, Specific Personal Information, external My Number
  references that can be resolved without the required external authority,
  vault references that expose raw values, and any alias that stores or
  reconstructs those values inside HRCore core tables.
- sensitive personal information, including health or medical information,
  disability information, labor union membership, harassment or disciplinary
  investigation records, family-origin or permanent-domicile-style attributes,
  and equivalent local categories requiring stricter consent, purpose,
  masking, audit, or access handling.
- privacy classification, consent or lawful-handling basis, processing
  purpose, masking or redaction profile, export permission, DSAR handling,
  privacy evidence, and data-scope interaction fields when they are used as
  generic escape hatches instead of explicit classified boundaries.
- leave of absence, childcare leave, reduced working hours, medical or
  caregiving reason, disability-related work arrangement facts, statutory
  deadline facts, payroll or benefit leave facts, entitlement facts, and other
  sensitive labor or work-arrangement payloads beyond ADR 0008 and ADR 0017.
- retiree retention, retention exception, legal hold, deletion request,
  anonymization request, deletion-job state, retention-action state,
  physical-deletion exception, payroll or benefit retention facts, and any
  side channel that bypasses ADR 0009 and ADR 0018.
- raw provider payloads, raw import payloads, raw export payloads, raw payload
  replay data, CSV exports, CSV rows, export manifests, download traces,
  watermark evidence, redaction bypass data, and payload fields that bypass
  ADR 0014.
- audit payload expansion that turns `audit_event`, audit metadata, logs,
  queue messages, migration comments, or operator notes into storage for
  prohibited data, missing authority, export approval, retention decisions, or
  raw payload content.
- generic JSON, `jsonb`, `metadata`, `note`, `memo`, `raw_payload`,
  `audit_event`, free-form comments, untyped text blobs, attachment blobs,
  fixture files, seeds, logs, CSV exports, migration examples, README snippets,
  OpenAPI contracts, DTOs, and other untyped side channels when they are used
  to bypass the explicit ADR boundaries.

Core-table forbidden columns include direct names and obvious aliases for the
prohibited data families above, including `my_number`, `individual_number`,
`specific_personal_information`, sensitive-information fields, leave reason
fields, retention exception fields, legal hold fields, deletion or
anonymization request fields, raw payload fields, CSV export fields, and
generic `jsonb`, `metadata`, `note`, `memo`, or attachment fields that are
introduced as escape hatches for those families.

This ADR connects the prohibited list to the current repository guard /
documented policy baseline. The current executable coverage is repository
guard coverage that checks this ADR's discoverability, Proposed/two-key
posture, prohibited-list commitments, and deferred-parser/full-engine
commitments.

Regex or lexical checks are acceptable only for narrow sentinels that identify
explicitly prohibited strings or required documentation commitments. SQL
parsers, TypeScript AST analyzers, OpenAPI schema analyzers, PR-diff engines,
and OPA/Rego remain deferred until later implementation issues or later
Accepted ADRs define their exact scope, authority, and fail-closed behavior.

This ADR must not claim full policy-as-code enforcement. A PR may claim only
the repository guard and documented policy baseline implemented in that PR
unless parser-backed or structured checks are actually implemented and
verified.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement runtime features, migrations, OpenAPI endpoints,
DTOs, UI workflows, provider integrations, production secrets, external
services, Phase 1 HR workflows, SQL parsers, TypeScript AST analyzers,
OPA/Rego rules, PR-diff engines, or broad runtime policy enforcement.

## Consequences

- Future R08 implementation and CI work has a single prohibited-list baseline
  to cite before introducing concrete schemas, contracts, payloads, export
  surfaces, fixtures, seeds, logs, attachments, or migration examples.
- Repository guard coverage can catch removal or weakening of the Proposed
  status, ADR 0000 two-key posture, prohibited-list families, README
  discoverability, and deferred-parser/full-engine boundary.
- Future parser-backed or structured enforcement remains possible, but cannot
  be implied by this documentation and lexical guard baseline.
- This Proposed ADR records the intended R08 prohibited column and payload
  boundary but does not become active Accepted repository policy until ADR 0000
  two-key approval metadata is complete.

## Supersedes

None

## Superseded by

None

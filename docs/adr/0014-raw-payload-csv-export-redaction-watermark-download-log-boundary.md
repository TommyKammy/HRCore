# ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary

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
- [ADR 0004: Agent Execution Cost Cap and Automatic Stop Conditions](0004-agent-execution-cost-cap.md)
- [ADR 0005: My Number and Specific Personal Information Scope Boundary](0005-my-number-scope-boundary.md)
- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)
- [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](0007-sensitive-personal-information-boundary.md)
- [ADR 0010: Break-Glass Access and Emergency Local Account MVP-A/v1 Boundary](0010-break-glass-emergency-access-boundary.md)
- [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](0011-data-scope-policy-dsl-rls-boundary.md)
- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)
- [ADR 0013: Requester-Equals-Approver Prevention DB, Service, and Verifier Boundary](0013-self-approval-prevention-boundary.md)
- [Run-Mode Governance](../run-modes.md)

## Context

HRCore is still before PoC and MVP-A implementation. Raw provider payload
viewing, raw payload download, CSV export, export download, watermarking,
download evidence, redaction, masking, and export permissions affect privacy,
security, authorization, auditability, data retention, compliance evidence,
provider trust, production operations, and future irreversible data shape.
ADR 0000 therefore treats this as a fail-closed two-key decision. This ADR
cannot become Accepted until the ADR 0000 two-key metadata is complete.

ADR 0002 defines repository guard strategy, ADR 0003 protects MVP-A core
stability and migration shape, ADR 0004 requires agents to stop on suspicious
scope expansion, ADR 0005 keeps My Number and Specific Personal Information out
of MVP-A/v1 HRCore storage and export surfaces, ADR 0006 keeps processing
purpose and DSAR handling behind privacy boundaries, ADR 0007 keeps sensitive
personal information out of raw payload and CSV escape hatches, ADR 0010 keeps
break-glass access outside generic admin shortcuts, ADR 0011 keeps data-scope,
raw-view, export, and audit-view authorization outside untyped surfaces, ADR
0012 defines audit immutability expectations, ADR 0013 keeps approval
separation-of-duties from becoming a generic export authorization, and
Run-Mode Governance keeps privacy, security, authorization, auditability, and
compliance-evidence decisions in the two-key lane.

The relevant planning-note paths reviewed for this issue are
`03_UI・業務/14_画面一覧・画面要件.md`,
`04_データ・API/13_フィールドカタログ.md`,
`04_データ・API/16_API一覧.md`,
`04_データ・API/17_PostgreSQL DDLたたき台.md`,
`05_実行計画/11_未決事項・意思決定バックログ.md`, and
`07_進行管理/06_Phase2D_MVP-D_CSV-Ops-DLQ.md`. They mention raw payload,
CSV export, export permission, masking, field catalog gates, audit events,
download surfaces, and Phase 2D CSV/Ops/DLQ work. They are planning input, not
runtime authorization or export policy. This ADR records the repository-owned
decision boundary so planning notes, issue bodies, schema placeholders, fixture
examples, README snippets, raw JSON, CSV rows, operator notes, or generated
documentation do not become the source of truth. No planning note was updated
in this issue.

## Decision

HRCore MVP-A and v1 must treat raw payload viewing and CSV export as separate high-risk data-exfiltration surfaces, not ordinary screen viewing or generic admin operations.

Raw provider, import, and export payloads are default-deny for viewing and download.
If raw payload material is retained or shown, it must be minimized or redacted before persistence, display, export, or download unless a later Accepted two-key ADR explicitly authorizes a narrower unredacted diagnostic exception.

CSV export requires explicit export permission that is separate from screen access, field access, raw-view access, audit-log access, HR role membership, and generic admin access.

CSV export must apply data-scope filtering, field classification, redaction or masking rules, export-template allowlists, purpose and request ownership, and audit correlation before any file can be produced or downloaded.

Exported CSV files must carry a watermark or equivalent traceability marker that binds the output to actor, timestamp, export job, request or correlation ID, template or scope, and redaction profile. The marker may later be visible, metadata-based, manifest-based, or another defined mechanism, but absence of traceability must fail closed.

Every raw-payload view or download and every CSV export or download must produce durable audit evidence, including actor, effective actor or delegation where relevant, purpose, source surface, data scope, field or export template, row or object count where available, redaction profile, watermark or manifest ID, request or correlation ID, and outcome.

A generic `is_admin`, HR role, local admin flag, break-glass account, operator comment, note, memo, mutable metadata, raw JSON, CSV row, application log, fixture, seed data, migration comment, README snippet, or audit log entry alone is not sufficient to authorize raw-payload access or CSV export.

Break-glass and emergency access do not bypass raw-payload redaction, export permission, watermark, or download-log requirements unless a later Accepted two-key ADR explicitly defines a controlled exception, evidence requirements, and post-use review boundary.

Approval and self-approval boundaries from ADR 0013 do not authorize data export by themselves. Raw-view and export actions need their own permissions, purpose, evidence, and audit correlation.

Generic escape hatches must not be used to hide raw-payload access, CSV export scope, redaction state, watermark state, download evidence, field classification, data scope, purpose, request owner, or audit correlation. This includes `jsonb`, `metadata`, `note`, `memo`, `raw_payload`, audit payloads, CSV export columns, attachments, logs, fixtures, seed data, migration examples, `.env` examples, README snippets, and similar untyped or semi-typed surfaces.

Future implementation concepts such as `export_permission`,
`raw_payload_view_permission`, `audit_log_view_permission`,
`redaction_profile`, `masking_rule`, `export_template`, `export_job`,
`export_file_manifest`, `watermark_token`, `download_log`,
`raw_payload_access_log`, `export_download_log`, `data_scope_policy`,
`pii_classification`, `purpose_code`, `request_owner`, `correlation_id`, and
`audit_event` remain conceptual/deferred anchors unless a later issue
explicitly authorizes schema, migration, API, verifier, service, job, storage,
or UI work.

Concrete policy-as-code prohibited payload rules remain deferred to #88.
Retention-action-log extension design remains deferred to #86 where relevant.
PII masking implementation remains deferred to later implementation issues.
Phase 2D CSV/Ops/DLQ implementation remains deferred to later Phase 2D issues.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement raw payload viewers, CSV export runtime behavior, export jobs, database migrations, SQL constraints, service code, verifier code, watermark generation, redaction logic, APIs, DTOs, UI workflows, file storage, production operations, or Phase 1 HR workflow implementation.

This ADR does not decide exact redaction algorithm, masking syntax, watermark
format, CSV template schema, download-log table shape, storage provider, file
retention period, encryption key management, OpenAPI endpoints, DTO shapes, UI
screens, production operational procedure, legal or compliance sign-off, or
incident-response runbook details.

## Consequences

- MVP-A and v1 preserve a default-deny raw-payload boundary and a separate CSV
  export authorization boundary before implementation expands.
- Later schema, API, service, job, verifier, UI, storage, fixture, seed,
  migration, and operations work must cite this ADR or a later Accepted two-key
  ADR that explicitly supersedes it before adding raw-view or export behavior.
- Repository guard coverage can catch removal or weakening of this ADR and its
  MVP-A/v1 raw-payload/CSV-export boundary, separate-permission rule,
  default-deny raw-payload rule, redaction or masking requirement,
  watermark/traceability requirement, download-log/audit-evidence requirement,
  and no-escape-hatch commitments.
- Planning notes may continue to identify CSV, Ops, DLQ, raw-payload, masking,
  and audit surfaces as future design areas, but they do not authorize
  implementation or Accepted policy without the ADR 0000 two-key evidence.
- This Proposed ADR records the intended boundary but does not become active
  Accepted repository policy until the ADR 0000 two-key approval metadata is
  complete.

## Supersedes

None

## Superseded by

None

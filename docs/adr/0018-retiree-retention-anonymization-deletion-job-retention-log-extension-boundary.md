# ADR 0018: Retiree Retention, Anonymization, Deletion Job, and Retention Log Extension Boundary

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
- [ADR 0009: Retiree Data Retention Period and Physical Deletion Exception Boundary](0009-retiree-retention-physical-deletion-boundary.md)
- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)
- [ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary](0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md)
- [ADR 0016: Sensitive Personal Information Privacy Classification, Consent, and Processing-Purpose Extension Boundary](0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary.md)
- [ADR 0017: Employment Status and Work Arrangement Extension Boundary](0017-employment-status-work-arrangement-extension-boundary.md)
- [Run-Mode Governance](../run-modes.md)

## Context

ADR 0009 preserves the MVP-A and v1 retiree retention period and physical
deletion exception boundary without implementing production retention behavior.
This ADR records the next Future Extension anchor for retiree retention policy,
anonymization, deletion requests, legal hold, retention exceptions, automated
system jobs, retention-action evidence, human audit evidence, and shared
correlation semantics.

Retiree data retention and deletion handling affect legal/privacy posture, data
retention, auditability, backup or restore semantics, production operations,
compliance evidence, and future irreversible data shape. ADR 0000 therefore
requires fail-closed two-key handling before this ADR can become Accepted.

This ADR is intentionally a design boundary. It does not decide concrete table
names, columns, indexes, OpenAPI contracts, DTOs, UI screens, approval flows,
payroll or benefit behavior, provider integration, production operations,
policy parser rules, or executable deletion and anonymization jobs.

## Decision

ADR 0009's MVP-A/v1 retiree retention and physical deletion exception boundary
remains intact. This ADR does not supersede, weaken, narrow, or silently
replace ADR 0009. Any future physical deletion, anonymization, retention
automation, legal-hold, payroll/benefit retention, or deletion-request
implementation must cite ADR 0009 and this ADR or a later Accepted two-key ADR
that explicitly supersedes them.

Future support for retiree retention and deletion handling must define explicit
anchors for `retention_policy`, `anonymization_request`, `deletion_request`,
`legal_hold`, `retention_exception`, `retention_action_log`, `audit_event`, and
`correlation_id` before implementation begins.

`retention_policy` is the future anchor for the policy source, legal basis,
jurisdiction or legal-entity applicability, data category, retention period,
exception handling, review owner, and versioned effective interval.

`anonymization_request` and `deletion_request` are future anchors for
human-requested or legally required actions. They must record request source,
request owner, subject binding, scope, purpose or legal basis, approval
authority, legal-hold conflicts, outcome, and evidence requirements before any
runtime workflow can be implemented.

`legal_hold` and `retention_exception` are future anchors for blocking or
modifying retention, anonymization, or deletion behavior. Missing legal-hold
state, missing exception authority, ambiguous subject binding, or unclear legal
entity binding must fail closed rather than allowing deletion, anonymization, or
policy-driven purge behavior.

Future system-generated retention actions must be recorded in
`retention_action_log`. System-generated actions include scheduled retention
evaluation, retention eligibility calculation, anonymization job execution,
deletion job execution, legal-hold blocking, policy exception application,
retry, failure, rollback, and restore-sensitive retention reconciliation. The
record must bind the action to the authoritative policy, subject, scope, job or
worker identity, input snapshot or policy version, outcome, and evidence needed
to prove that the action was automatic or system-triggered.

Future human operations must be recorded in `audit_event`. Human operations
include request intake, approval, rejection, legal-hold placement or removal,
retention exception approval, manual override, review, correction, incident
response, restore decision, and post-action verification. The audit event must
record the actor, effective actor or delegation where relevant, purpose, request
or case link, subject scope, decision, outcome, and review evidence.

When one workflow includes both system retention actions and human operations,
the records must share a `correlation_id`. The shared `correlation_id` is the
future evidence bridge between `retention_action_log` and `audit_event`; it does
not merge the two record types or let either record type stand in for the other.
Retention-action evidence is not a substitute for human audit evidence, and
human audit evidence is not a substitute for system retention-action evidence.

Ordinary audit logs, application logs, notes, comments, CSV rows, fixtures,
seeds, raw payloads, generic metadata, and generic JSON surfaces are not
sufficient retention or deletion evidence. A generic `audit_event`,
`retention_action_log`, `correlation_id`, `deleted_at`, `retention_until`,
status flag, lifecycle event, or operator comment alone is not sufficient to
authorize anonymization, deletion, physical deletion exception handling,
retention exception handling, legal-hold release, or production retention
automation.

Incident and restore considerations must be bounded before implementation.
Future design must state whether a restore, failed job, partial job, rollback,
backup recovery, or incident response can recreate deleted or anonymized data,
how that is detected, how the authoritative retention state is reconciled, and
which `retention_action_log`, `audit_event`, and `correlation_id` evidence must
survive or be reconstructed before production operation.

Concrete schema, migrations, API shape, UI workflow, deletion/anonymization
jobs, legal workflow, payroll/benefit retention behavior, provider integration,
production operations, and policy-as-code enforcement are deferred to later
implementation issues or later Accepted ADRs.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement runtime features, migrations, OpenAPI endpoints,
DTOs, UI workflows, deletion/anonymization jobs, legal workflow screens,
payroll/benefit retention logic, provider integrations, production secrets,
external services, or policy-as-code parser rules.

## Consequences

- ADR 0009's retiree retention and physical deletion exception boundary remains
  intact.
- Future implementation has separate evidence anchors for system retention
  actions and human operations, with `correlation_id` as the bridge when a
  workflow uses both.
- Later schema, API, UI, job, legal workflow, payroll, benefit, provider,
  production-operation, and policy-as-code work must cite this ADR or a later
  Accepted two-key ADR before implementing retiree retention, anonymization,
  deletion-request, legal-hold, retention-exception, or retention-action-log
  behavior.
- Repository guard coverage can catch removal or weakening of the Proposed
  status, two-key posture, ADR 0009 preservation, system-action versus
  human-audit boundary, `correlation_id` evidence bridge, and no-runtime
  implementation commitment.
- This Proposed ADR records the intended extension boundary but does not become
  active Accepted repository policy until the ADR 0000 two-key approval metadata
  is complete.

## Supersedes

None

## Superseded by

None

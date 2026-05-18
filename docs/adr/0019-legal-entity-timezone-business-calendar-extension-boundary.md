# ADR 0019: Legal Entity Timezone and Business Calendar Extension Boundary

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
- [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](0011-data-scope-policy-dsl-rls-boundary.md)
- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)
- [ADR 0017: Employment Status and Work Arrangement Extension Boundary](0017-employment-status-work-arrangement-extension-boundary.md)
- [Run-Mode Governance](../run-modes.md)

## Context

ADR 0017 records future employment-status and work-arrangement periods in a
legal entity or employer context without implementing runtime period behavior.
Future overseas corporation support needs a related extension boundary for
legal-entity ownership, timezone resolution, business-calendar ownership, and
future-date processing.

Timezone and business-calendar behavior affects operational scheduling,
employment lifecycle timing, auditability, compliance evidence, future
production operations, and irreversible data-shape decisions. ADR 0000
therefore requires fail-closed two-key handling before this ADR can become
Accepted.

This ADR is intentionally a design boundary. It does not decide concrete table
names, columns, indexes, OpenAPI contracts, DTOs, UI screens, worker queues,
calendar library selection, holiday provider selection, provider integration,
production operations, or policy parser rules.

## Decision

Future overseas corporation support must attach timezone and
business-calendar behavior through `legal_entity` or an equivalent explicit
owner. Timezone and calendar ownership must not be inferred from country names,
tenant names, repository paths, operator notes, issue text, display labels, or
nearby employee records.

`legal_entity` is the future anchor for the corporation or employer context
that owns employment timing decisions. It must identify the authoritative owner
for jurisdiction, employment context, timezone authority, business-calendar
authority, effective interval, and audit evidence before runtime behavior is
implemented.

`timezone_resolver` is the future anchor for resolving the effective timezone
used by employment lifecycle and future-date processing. Future-date
processing must not hard-code `Asia/Tokyo` as the universal runtime authority.
Timezone authority must be resolved through an explicit `legal_entity` or
configured owner boundary, with a versioned or otherwise auditable source.

`business_calendar` is the future anchor for business-day, holiday, closure,
weekend, and exceptional non-working-day rules. Business-calendar authority
must be owned by a `legal_entity` or an equivalent explicit configured owner,
and future implementation must record the calendar source, version or effective
interval, jurisdiction or legal-entity applicability, and review owner.

Timezone and business-calendar authority must be resolved through an explicit `legal_entity` or configured owner boundary.
Missing timezone authority, missing business-calendar authority, ambiguous
legal-entity ownership, or unresolved calendar version must fail closed rather
than falling back to `Asia/Tokyo`, UTC, the server timezone, tenant display
text, process environment defaults, or a guessed jurisdiction.

`future_date_apply_worker` is the future design anchor for applying scheduled
or effective-dated employment changes. Future-date apply worker behavior is a
design boundary only in this ADR. Later implementation must define how the
worker selects eligible records, binds each record to a legal entity, resolves
timezone authority, resolves business-day authority, handles local-date versus
instant semantics, avoids duplicate apply, records outcome, and stops when any
authority signal is missing or ambiguous.

Business-day resolution must be explicit before runtime implementation. Later
implementation must state whether an action applies on the scheduled local
date, the next business day, the previous business day, a legal-entity-specific
cutoff, or another Accepted rule. A generic date, lifecycle event, status flag,
operator note, or queue timestamp is not sufficient to decide business-day
behavior.

Audit evidence must bind the scheduled action, legal entity, timezone source,
business-calendar source, effective date, worker identity, replay or correction
reason, outcome, and `correlation_id`. Audit evidence must distinguish
human-requested scheduling decisions from system-applied worker actions and
must not let a worker log, queue message, lifecycle event, or generic
`audit_event` stand in for missing legal-entity, timezone, or calendar
authority.

Replay and correction must not recompute historical outcomes from a changed
timezone or calendar without preserving the original authority and a corrected
replacement record. Later implementation must preserve the original scheduled
input, original resolved timezone, original business-calendar version, original
worker outcome, correction reason, replacement authority, replacement outcome,
actor or worker identity, and `correlation_id`.

Concrete schema, migrations, API shape, UI workflow, worker implementation,
calendar library, calendar provider, provider integration, production
operations, and policy-as-code enforcement are deferred to later implementation
issues or later Accepted ADRs.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement runtime features, migrations, OpenAPI endpoints,
DTOs, UI workflows, future-date workers, calendar libraries, provider
integrations, production secrets, external services, or policy-as-code parser
rules.

## Consequences

- Future overseas corporation support has explicit legal-entity, timezone, and
  business-calendar anchors before runtime scheduling behavior is implemented.
- Future-date processing cannot treat `Asia/Tokyo`, UTC, server-local time, or
  environment defaults as universal runtime authority.
- Later schema, API, UI, worker, provider, production-operation, and
  policy-as-code work must cite this ADR or a later Accepted two-key ADR before
  implementing legal-entity timezone, business-calendar, or future-date apply
  behavior.
- Repository guard coverage can catch removal or weakening of the Proposed
  status, two-key posture, legal-entity ownership boundary,
  timezone/business-calendar resolver boundary, future-date apply worker
  boundary, replay/correction semantics, and no-runtime-implementation
  commitment.
- This Proposed ADR records the intended extension boundary but does not become
  active Accepted repository policy until the ADR 0000 two-key approval
  metadata is complete.

## Supersedes

None

## Superseded by

None

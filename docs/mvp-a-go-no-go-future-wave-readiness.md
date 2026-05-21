# Post-MVP-A Future Wave Readiness

This document defines minimum Ready conditions for post-MVP-A waves. It keeps
MVP-B transfer, MVP-C termination, and MVP-D CSV/Ops/DLQ gated separately from
the MVP-A Go/No-Go package.

## Decision Status

- Status: Proposed for future-wave readiness review.
- Part of: #157.
- Depends on: #159.
- Scope owner: TommyKammy.
- Review consequence: An MVP-A Go decision does not approve MVP-B, MVP-C, or
  MVP-D. Each later wave needs its own Ready review before implementation
  issues can be treated as executable.

## Shared Future-Wave Gate

All later waves must show evidence for the boundaries below before entering
implementation:

- legal, labor, privacy, retention, consent, DSAR, My Number, Specific Personal
  Information, and sensitive personal information scope for the wave's actual
  data and workflow;
- authorization, data-scope, audit immutability, raw-payload, CSV export, and
  prohibited-payload gates where the wave can read, change, export, or replay
  employee lifecycle evidence;
- extension architecture that keeps wave-specific records, DTOs, payloads,
  fixtures, logs, notes, and exports from becoming generic escape hatches for
  deferred data;
- operational evidence for retry, idempotency, rollback, failed-path durability,
  support procedures, and audit correlation at the wave's enforcement boundary;
- explicit links to the planning, review-gate, or ADR issue that owns each
  unresolved gate.

Missing, placeholder, inferred, or partially trusted evidence blocks Ready
status. Issue text, branch names, comments, nearby metadata, and MVP-A approval
cannot substitute for authoritative gate acceptance.

## Reusable Phase 1 PoC Evidence

The following MVP-A foundations may be reused as inputs only:

- mock-first Okta mastering boundary and synthetic provider projection evidence
  from `EPIC-P1-01` and the Okta PoC connection contract;
- minimum HRCore person, employment, assignment, contact-point,
  transaction-request, lifecycle-event, and audit evidence shape from
  `EPIC-P1-05`;
- synthetic `work_email` writeback ingestion, provider refresh, and conflict
  evidence from `EPIC-P1-02`;
- retry, idempotency, future-date failure, conflict resolution, and direct
  `correlation_id` traceability evidence from `EPIC-P1-R01`;
- MVP-A Go/No-Go scope exclusions and deferred P0 gate classifications from
  #158 and the MVP-A scope boundary.

Reusable evidence stays at synthetic PoC depth. It proves that the repository
has a narrow foundation for identity lifecycle traceability; it does not prove
transfer, termination, CSV export, operator console, DLQ, production provider,
regulated-data, or legal/labor/privacy readiness.

## MVP-B Transfer Ready Conditions

MVP-B is Ready only when a transfer-specific review package defines and accepts:

- transfer request, transfer approval, authoritative effective-date handling,
  assignment change, provider projection, writeback, conflict handling, and
  audit correlation for the transfer path;
- the authoritative source for transfer scope, subject, legal entity or
  employer, department, manager, location, cost center, and provider target
  binding;
- fail-closed handling for missing or mismatched approvals, stale assignments,
  ambiguous effective dates, provider subject drift, and writeback conflicts;
- legal, labor, privacy, authorization, data-scope, audit, and operational
  gates that are specific to transfer operations;
- extension boundaries for work-arrangement, legal-entity, timezone,
  business-calendar, and future-date apply behavior when those concepts affect
  transfer semantics.

MVP-B may reuse the Phase 1 synthetic onboarding foundation for person,
assignment, provider projection, writeback, retry, idempotency, and correlation
shape. It must newly produce transfer-specific approval, effective-date,
assignment-change, provider projection, rollback, conflict, and audit evidence.

## MVP-C Termination Ready Conditions

MVP-C is Ready only when a termination-specific review package defines and
accepts:

- termination request, approval, effective-date handling, offboarding,
  deprovisioning, retention or legal-hold classification, post-termination
  access, and audit correlation for the termination path;
- the authoritative source for employment end state, termination reason
  classification, final access date, provider disablement or deprovisioning
  state, retention policy, and legal-hold state;
- fail-closed handling for missing approvals, ambiguous end dates, stale
  provider identity, partial deprovisioning, retention uncertainty, legal-hold
  conflicts, and post-termination access exceptions;
- legal, labor, privacy, retention, DSAR, audit, authorization, and operational
  gates that are specific to termination operations;
- extension boundaries for retiree retention, anonymization, deletion jobs,
  retention logs, provider offboarding, and emergency access when those concepts
  affect termination semantics.

MVP-C may reuse the Phase 1 synthetic foundation for lifecycle records,
provider projection shape, retry, idempotency, conflict evidence, and
correlation traceability. It must newly produce termination approval,
effective-date, offboarding, deprovisioning, retention or legal-hold,
post-termination access, failed-path cleanup, and audit evidence.

## MVP-D CSV/Ops/DLQ Ready Conditions

MVP-D is Ready only when an operations-specific review package defines and
accepts:

- raw-payload viewing, CSV export, export download, operational dead-letter
  queues, replay handling, support console behavior, watermark or manifest
  traceability, and download-log evidence;
- separate permissions for screen access, raw view, export, download, replay,
  support action, and emergency operation;
- authoritative data-scope, field classification, export template, redaction or
  masking profile, purpose, request owner, correlation, and audit binding for
  every export or operational replay;
- fail-closed handling for missing export permission, missing watermark or
  manifest trace, prohibited fields, unclassified fields, mixed-snapshot reads,
  replay subject drift, and partial DLQ or restore writes;
- operational evidence for queue depth, retry attempts, poison messages,
  replay outcomes, support actions, failed-path cleanup, backup/restore, and
  incident review.

MVP-D may reuse the Phase 1 synthetic foundation for correlation identifiers,
retry/idempotency expectations, writeback conflict shape, and audit event
shape. It must newly produce CSV/export, raw-payload, support-console, DLQ,
replay, watermark or manifest, download-log, mixed-snapshot, and operational
failure evidence.

## Wave-Specific Evidence That Must Be Newly Produced

The later waves cannot inherit approval from MVP-A. Before a wave is Ready, it
must show its own:

- accepted scope decision and explicit out-of-scope list;
- authoritative state model and subject binding for the wave;
- legal, labor, privacy, retention, audit, authorization, and provider
  boundaries for the wave;
- extension architecture decision or accepted ADR references for any deferred
  records, schemas, services, DTOs, exports, or operational surfaces;
- focused repository guard or verifier coverage at the real enforcement
  boundary;
- operational evidence for successful paths, rejected paths, retry/idempotency,
  rollback, partial-write prevention, and audit correlation;
- local verification plan that remains publishable without workstation-local
  path literals, production secrets, or live provider credentials.

## Implementation Issue Handling

Later implementation issues for Phase 2B, Phase 2C, or Phase 2D must remain
unopened or not-ready from this child. This document records Ready conditions
only; it does not create, ready, or authorize implementation work for the later
waves.

## Review Checklist

- MVP-B, MVP-C, and MVP-D each have a separate Ready decision.
- Reusable MVP-A foundations are distinguished from wave-specific missing
  evidence.
- MVP-A Go cannot be treated as implicit approval for a later wave.
- Planning, review-gate, and ADR dependencies are linked where the missing
  evidence belongs.
- No production provider, protected-data, export, DLQ, support-console, or
  regulated-operation claim is made by this document.

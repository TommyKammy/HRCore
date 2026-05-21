# MVP-A Go/No-Go Scope Boundary

This document defines the scope boundary for the MVP-A Go/No-Go package after
the completed Phase 1 PoC waves. It is a decision artifact for whether MVP-A
onboarding materialization may proceed. It is not a production readiness claim
and does not create Phase 2A implementation work.

## Decision Status

- Status: Proposed for Go/No-Go package review.
- Part of: #157.
- Depends on: #158.
- Scope owner: TommyKammy.
- Review consequence: MVP-A onboarding may proceed only inside the boundary
  below, and only after the listed gates are accepted in their assigned lane.

## Minimum MVP-A Onboarding Workflow

MVP-A may proceed after Phase 1 with a narrow onboarding workflow:

1. Create or receive a synthetic or approved employee onboarding request.
2. Persist the minimum HRCore person, employment, assignment, contact-point,
   transaction-request, lifecycle-event, and audit evidence needed for the
   onboarding path.
3. Apply the onboarding lifecycle idempotently and record retryable failure
   evidence when a future-date or provider step cannot complete.
4. Project the onboarding result to the mock-first Okta mastering adapter under
   the Phase 1 PoC connection contract.
5. Ingest provider-confirmed `work_email` writeback evidence and hold or
   resolve conflicts without silently overwriting HRCore state.
6. Preserve a direct `correlation_id` trace across transaction, lifecycle,
   provisioning, writeback, conflict, resolution, refresh, and audit evidence.

This scope is limited to MVP-A onboarding materialization from the proven PoC
chain. It does not authorize real employee data, production provider traffic,
production HR operations, or broader lifecycle modules.

## In Scope For MVP-A

- MVP-A onboarding flow implementation and verification within the Phase 1 PoC
  evidence boundary.
- Synthetic or explicitly approved non-production data only.
- Mock-first Okta mastering behavior unless a later accepted provider gate
  explicitly authorizes real tenant use.
- Minimal HRCore persistence for the onboarding path and directly linked
  evidence records.
- Idempotency, retry, writeback conflict handling, and correlation traceability
  for the onboarding path.
- Documentation, tests, and repository guards that keep the MVP-A boundary
  explicit before implementation expands.

## Explicitly Out Of Scope

- MVP-B transfer workflows, transfer approval operations, transfer provider
  writeback, and transfer-specific lifecycle screens.
- MVP-C termination workflows, offboarding operations, deprovisioning
  production behavior, and termination-specific legal or retention handling.
- MVP-D CSV/Ops/DLQ, including CSV export runtime, raw-payload viewers,
  operational dead-letter queues, export download logs, and production support
  consoles.
- Production legal, labor, privacy, retention, consent, DSAR, My Number,
  Specific Personal Information, sensitive personal information, leave,
  work-arrangement, retiree, or legal-entity extensions unless their own
  accepted gate authorizes them.
- Real provider commitments not proven by PoC, including live Okta tenant
  binding, provider credentials, webhook commitments, production provider audit
  search, production secret handling, or vendor contract assumptions.
- Phase 2A implementation issue creation from this child. This document defines
  scope and gates only.

MVP-A Go must not imply that MVP-B, MVP-C, or MVP-D are ready. Those waves
remain separate scope decisions and implementation tracks.

## Deferred P0 Gate Classification

| Gate                                                                             | Classification for MVP-A                                                    | Consequence                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-R05 / #11 data-scope and authorization boundary                               | Conditional-go control                                                      | MVP-A onboarding may proceed only with default-deny assumptions, no production authorization claim, and no reliance on arbitrary JSON, role names, forwarded headers, comments, or inferred tenant/account links as authority. Real-data or production-like use requires an accepted authorization and data-scope gate before access control is trusted.                         |
| P0-R06 / #12 audit immutability and production evidence boundary                 | Conditional-go control                                                      | MVP-A onboarding may proceed with append-only audit evidence and correlation traceability at PoC/MVP-A depth, but must not claim WORM, S3 Object Lock, hash-chain production immutability, or external archive readiness. Real-data or production-like use requires accepted audit immutability and storage evidence before audit trails are treated as compliance-grade.        |
| P0-R08 / #14 raw payload, CSV export, prohibited payload, and extension boundary | Pre-MVP-A real-data blocker; later-wave implementation gate for CSV/Ops/DLQ | MVP-A onboarding may proceed only while raw payload viewing, CSV export, prohibited sensitive fields, and Future Extension payloads remain blocked or documented as deferred. Real-data or production-like use requires accepted redaction, export permission, watermark or traceability, download-log, and prohibited-payload controls. MVP-D CSV/Ops/DLQ remains a later wave. |

## Required Before Real-Data Or Production-Like Runtime Use

Before HRCore uses real employee data, production-like provider traffic, or a
runtime that operators could mistake for production, the Go/No-Go package must
record explicit acceptance for:

- provider and environment binding, including tenant, credentials, webhook,
  secret source, and provider audit evidence;
- authorization and data-scope enforcement, including actor context, subject
  binding, tenant or legal-entity boundaries, and fail-closed behavior;
- audit immutability and production evidence, including tamper-evidence,
  retention, archive, restore, and operational review boundaries;
- raw payload and CSV export controls, including redaction, separate export
  permission, watermark or manifest traceability, and download logs;
- legal, labor, privacy, retention, consent, DSAR, My Number, Specific Personal
  Information, and sensitive personal information boundaries when any such data
  or workflow is in scope;
- incident, support, backup, restore, and operator access procedures.

Missing, placeholder, malformed, or partially trusted evidence for any item
above blocks production-like use. The system must not infer acceptance from
issue text, planning notes, path shape, naming conventions, comments, sample
secrets, or nearby metadata.

## Loose Coupling For Future Extensions

Future legal, labor, privacy, retention, My Number, sensitive-data,
work-arrangement, retiree, legal-entity, export, and CSV/Ops/DLQ extensions
must remain loosely coupled from core MVP-A onboarding unless an explicit
accepted decision says otherwise.

Extension work should use separate authoritative records, references, schemas,
services, or modules when required by the applicable ADR boundary. Core MVP-A
tables, DTOs, fixtures, logs, metadata, notes, raw payloads, audit payloads, and
CSV surfaces must not become escape hatches for deferred extension data.

## Review Checklist

- MVP-A onboarding in-scope behavior is reviewable without relying on
  production providers or real employee data.
- MVP-B transfer, MVP-C termination, and MVP-D CSV/Ops/DLQ remain out of scope.
- P0-R05, P0-R06, and P0-R08 have explicit MVP-A consequences.
- Real-data and production-like runtime use stays blocked until the listed
  gates are accepted.
- Future legal, labor, privacy, and related extensions remain loosely coupled
  and cannot be mixed into core MVP-A by accident.

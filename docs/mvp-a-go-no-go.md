# MVP-A Go/No-Go Decision

This is the final single-entry decision package for whether HRCore may start
Phase 2A MVP-A onboarding issues after the completed Phase 1 PoC waves.

## Final Recommendation

- Final recommendation: Conditional Go.
- Decision scope: starting Phase 2A MVP-A onboarding issues.
- Evidence depth: synthetic PoC and repository-owned verification only.

Conditional Go means Phase 2A MVP-A onboarding materialization may start inside
the MVP-A scope boundary. It does not authorize production use, does not
authorize real employee data, does not authorize live provider traffic, and does
not accept later MVP-B, MVP-C, or MVP-D readiness.

## Evidence Basis

The decision is based on the repository-owned Phase 1 package:

- `docs/mvp-a-go-no-go-poc-results.md` records the completed PoC waves and
  their synthetic evidence.
- `docs/mvp-a-go-no-go-scope.md` records the MVP-A onboarding scope boundary,
  deferred P0 gates, and real-data or production-like blockers.
- `docs/mvp-a-go-no-go-future-wave-readiness.md` records separate Ready
  conditions for MVP-B transfer, MVP-C termination, and MVP-D CSV/Ops/DLQ.
- `docs/epic-p1-r01-traceability-closeout.md` records the final Phase 1
  retry, idempotency, conflict, and direct correlation trace evidence.

The evidence proves a narrow synthetic path only: minimum HRCore records, mock
Okta projection, `work_email` writeback evidence, conflict handling, retry
behavior, idempotency, and direct `correlation_id` traceability. The evidence
does not prove production authorization, production audit immutability,
regulated-data handling, real provider operation, or later lifecycle waves.

## Residual Risk Classification

| Risk                                                                                                                                   | Classification                                                                           | Rationale                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing final decision entrypoint                                                                                                      | Blocker before this child closes                                                         | Phase 2A issue creation needs one consolidated decision record. This document is the entrypoint and removes that documentation blocker once merged.                                                                                            |
| Unproven MVP-A onboarding implementation                                                                                               | Conditional-go follow-up                                                                 | The Phase 1 evidence is enough to start implementation issues, but MVP-A runtime behavior must still be implemented and verified in Phase 2A before any onboarding closeout claim.                                                             |
| P0-R05 / #11 authorization and data-scope enforcement                                                                                  | Conditional-go follow-up; production-like blocker                                        | MVP-A may proceed only with default-deny assumptions and no production authorization claim. Real-data or production-like use remains blocked until accepted authorization, actor, subject, tenant, and data-scope enforcement evidence exists. |
| P0-R06 / #12 production audit immutability                                                                                             | Conditional-go follow-up; production-like blocker                                        | Phase 1 proves append-only PoC evidence and correlation traceability, not WORM, S3 Object Lock, hash-chain immutability, restore evidence, or compliance-grade audit storage.                                                                  |
| P0-R08 / #14 raw payload, CSV export, prohibited payload, and extension controls                                                       | Conditional-go follow-up for MVP-A boundary enforcement; later-wave gate for CSV/Ops/DLQ | Raw payload viewing, CSV export, prohibited sensitive fields, and Future Extension payloads must stay blocked or deferred for MVP-A. CSV/Ops/DLQ remains a later MVP-D wave.                                                                   |
| Real provider tenant, credentials, webhook, and provider audit search                                                                  | Conditional-go follow-up; production-like blocker                                        | The Okta boundary is mock-first. Placeholder credentials, sample secrets, tenant naming, or issue text cannot authorize live provider use.                                                                                                     |
| Legal, labor, privacy, retention, consent, DSAR, My Number, Specific Personal Information, and sensitive personal information handling | Conditional-go follow-up; real-data blocker                                              | Proposed ADRs preserve non-storage and extension boundaries. Real-data or regulated workflow use requires the relevant accepted gate and two-key evidence where required.                                                                      |
| MVP-B transfer readiness                                                                                                               | Backlog                                                                                  | Transfer needs a separate Ready review and transfer-specific approval, effective-date, assignment-change, rollback, conflict, and audit evidence.                                                                                              |
| MVP-C termination readiness                                                                                                            | Backlog                                                                                  | Termination needs a separate Ready review and termination-specific offboarding, deprovisioning, retention or legal-hold, failed-path cleanup, and audit evidence.                                                                              |
| MVP-D CSV/Ops/DLQ readiness                                                                                                            | Backlog                                                                                  | CSV export, raw payload viewing, support console, DLQ, replay, watermark or manifest, download-log, mixed-snapshot, and operational failure evidence are not part of MVP-A.                                                                    |

No MVP-A onboarding blocker remains at PoC depth after this decision entrypoint
is present. The remaining risks are either Phase 2A conditional-go follow-ups or
backlog gates for later waves.

## Next Issue Wave

Create the next issue wave as `EPIC-P2A-MVP-A Onboarding Materialization` with
these child issues:

1. `P2A-01 Onboarding request intake and authoritative subject binding`
2. `P2A-02 Idempotent onboarding lifecycle application and retry evidence`
3. `P2A-03 Mock-first provider projection and work_email writeback integration`
4. `P2A-04 Onboarding conflict resolution and direct correlation trace`
5. `P2A-05 MVP-A onboarding closeout, gates, and non-production verification`

Each child should include explicit acceptance criteria for synthetic or
approved non-production data only, mock-first provider behavior, fail-closed
scope handling, direct authoritative record linkage, and local verification with
`npm run verify:pre-pr`.

## Gates That Must Remain Closed

The following gates must remain closed until their own accepted issue, ADR, or
review package proves the boundary:

- production-like runtime;
- real-data use;
- live provider tenant binding, credentials, webhooks, or provider audit search;
- authorization and data-scope enforcement claims;
- production audit immutability, hash-chain, WORM, object-lock, archive,
  restore, or compliance-grade evidence claims;
- raw payload viewing, CSV export, export download, watermark or manifest,
  download-log, support console, DLQ, or replay behavior;
- legal, labor, privacy, retention, consent, DSAR, My Number, Specific Personal
  Information, sensitive personal information, leave, work-arrangement, retiree,
  or legal-entity workflow handling;
- MVP-B transfer, MVP-C termination, and MVP-D CSV/Ops/DLQ implementation
  readiness.

Missing, malformed, placeholder, inferred, or partially trusted evidence for a
closed gate must block that gate. GitHub-authored issue text, branch names,
comments, path shape, nearby metadata, sample secrets, and operator-facing
summaries are not authoritative acceptance evidence.

## Decision

Start Phase 2A MVP-A onboarding issues under Conditional Go. Keep all
production-like, real-data, live-provider, regulated-data, export, operational,
and later-wave gates closed until separately accepted.

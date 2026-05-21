# MVP-A Go/No-Go PoC Results Summary

This summary consolidates the completed Phase 1 PoC evidence for MVP-A
Go/No-Go input. It records what is proven at synthetic PoC depth only and does
not expand the runtime scope.

## Completed PoC Waves

| Wave                                                              | Proven PoC behavior                                                                                                                                                                                                                                                                                                          | Evidence source                                                                                                                                        |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EPIC-P1-01` Okta main provisioning PoC (#119)                    | Mock-first Okta mastering boundary, synthetic user lifecycle projection, constrained group projection, and operator-readable provisioning run evidence without live tenant credentials or real employee data.                                                                                                                | Merged PRs #125, #126, #127, #128, and #129; `docs/okta-poc-connection-contract.md`; `src/okta-mastering-adapter.test.ts`; `src/provisioning-runs.ts`. |
| `EPIC-P1-05` HR Core skeleton (#130)                              | Minimum synthetic HR Core persistence for `person`, `employment`, `assignment`, `contact_point`, `transaction_request`, `lifecycle_event`, and minimal audit evidence.                                                                                                                                                       | Merged PRs #135, #136, #137, and #138; `src/synthetic-hire.test.ts`; `src/persistence/schema.ts`; committed Drizzle migrations.                        |
| `EPIC-P1-02` `work_email` writeback PoC (#139)                    | Synthetic provider-confirmed `work_email` writeback ingestion, mock Okta writeback emission, provider refresh, and conflict detection for HR Core `contact_point(work_email)`.                                                                                                                                               | Merged PRs #144, #145, #146, and #147; `src/writeback-ingest.test.ts`; `src/writeback-ingest.ts`.                                                      |
| `EPIC-P1-R01` failure, idempotency, and audit traceability (#148) | Synthetic repeated lifecycle execution stays idempotent; future-date apply failure records retryable evidence and can succeed on retry; writeback conflicts can be resolved and reprocessed; one correlation trace links transaction, lifecycle, job, provider/writeback, conflict, resolution, refresh, and audit evidence. | Merged PRs #153, #154, #155, and #156; `docs/epic-p1-r01-traceability-closeout.md`; `src/p1-r01-traceability.test.ts`; `src/p1-r01-traceability.ts`.   |

## Proven At PoC Depth

- HRCore can run the Phase 1 identity lifecycle path with synthetic data only:
  HR Core skeleton records, mock Okta projection, provisioning evidence, and
  `work_email` writeback evidence can be joined by explicit identifiers.
- The Okta path is mock-first by repository contract. Local verification and
  supervised execution do not require a live Okta tenant, provider credentials,
  production secrets, protected personnel data, or external provider services.
- The HR Core skeleton is sufficient for the Phase 1 PoC chain: synthetic hire
  data persists through core records, transaction requests, lifecycle events,
  contact points, and minimal audit events.
- Provider-confirmed `work_email` can be ingested into the synthetic HR Core
  skeleton, refreshed from mock provider evidence, and held or resolved when
  HRCore and provider values conflict.
- Failure, retry, idempotency, conflict, and correlation trace evidence is
  explicitly covered by `EPIC-P1-R01`:
  - repeated synthetic hire request submit/apply operations do not double-apply
    lifecycle effects;
  - a future-date apply failure records retryable evidence and a later retry
    records successful lifecycle application;
  - writeback provider refresh can detect a conflict, record operator
    resolution, and confirm the later provider value;
  - the correlation verifier fails closed when required lifecycle, future-date
    job, writeback, audit, or directly linked subject evidence is absent or
    mismatched.

## Out Of Scope For Production

The completed PoC evidence is not a production readiness claim. These items
remain outside the proven scope and must be accepted or implemented separately
before MVP-A production use:

- real Okta or other provider integration, tenant binding, webhook handling,
  provider secret management, and production provider audit search;
- HR Portal approval UI, approval governance, requester-equals-approver
  prevention, and human workflow operations;
- RBAC, data-scope policy enforcement, PostgreSQL RLS, and production
  authorization boundaries;
- WORM/object-lock audit storage, hash-chain audit immutability, raw payload
  access controls, CSV export controls, and legal/two-key acceptance evidence;
- production scheduling, incident operations, retention/export handling,
  protected-data handling, and use of real employee or customer data.

## Go/No-Go Input

At PoC depth, Phase 1 has enough synthetic evidence to move into the MVP-A
Go/No-Go decision step: the normal path, writeback path, representative failure
path, retry behavior, idempotency, conflict handling, and end-to-end correlation
trace have all been demonstrated against repository-owned tests and closeout
artifacts.

The decision should remain bounded: this is a Go input for continuing MVP-A
materialization, not a Go for production provider integration or regulated
operation. Production gaps above should be carried as explicit follow-up
acceptance gates.

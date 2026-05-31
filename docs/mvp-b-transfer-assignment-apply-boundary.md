# MVP-B Transfer Assignment Apply Boundary

This note records the bounded MVP-B transfer apply behavior implemented for
synthetic local assignment history.

## Implemented Boundary

- Approved transfer requests with `payloadVersion` `mvp_b_transfer_v1` can be
  applied into deterministic assignment-change evidence.
- Apply closes the explicitly referenced open current assignment on the day
  before the transfer effective date, creates one deterministic target
  assignment for the same person and employment, records an
  `assignment_change` lifecycle event, records `mvp_b.transfer.apply` audit
  evidence, and moves the transfer request to `completed`.
- Retry is idempotent only when the completed request, lifecycle event,
  assignment rows, and audit evidence match the same persisted payload and
  apply command.
- The bounded collision guard fails closed when another assignment for the same
  person and employment overlaps the target transfer effective date.

## Deferred Gates

- Final P0-R03 production-grade date-effective database constraints, exclusion
  constraints, correction/backdate semantics, timezone and business-calendar
  policy, multi-assignment policy, and production overlap adjudication remain
  deferred.
- P0-R08 raw payload, CSV/export, prohibited payload, and regulated-data
  controls remain governed by ADR 0020 and are not broadened by this MVP-B
  transfer apply slice.
- This boundary is synthetic and non-production. It must not be cited as final
  production-grade date-effective enforcement.

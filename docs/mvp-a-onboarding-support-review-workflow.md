# MVP-A Onboarding Support Review Workflow

This document records the practical MVP-A support review workflow for bounded
onboarding audit evidence. It is a synthetic, repository-owned support surface
for MVP-A readiness only. It is not a production audit search system, provider
audit search, support console, compliance archive, or immutable audit-storage
claim.

## Runtime Contract

`POST /support/mvp-a/onboarding-reviews` records a support review for one
explicit MVP-A onboarding `correlationId`.

The request must include:

- `x-hrcore-mvp-a-actor-id` with a bound `operator-support-` actor.
- `x-hrcore-mvp-a-tenant-environment` equal to
  `repo_owned_synthetic_mvp_a_onboarding`.
- `correlationId` for one directly linked onboarding correlation path.
- `reviewCorrelationId` for the support review action.
- `reasonCode` equal to `onboarding_evidence_review`.
- Optional `requestedEvidenceSurfaces` and `requestedFieldScopes` limited to
  the MVP-A onboarding evidence authorization gate.

The route validates actor, tenant/environment, reason, requested surfaces, and
field scopes before returning trace evidence. Missing reason, missing actor
binding, tenant/environment mismatch, unclassified evidence surfaces, empty
correlation input, raw request-body disclosure requests, and unsupported
provider-audit-search reasons fail closed before support-review audit evidence
is written.

## Durable Evidence

Accepted support reviews insert a local `audit_event` with:

- `actor_id` set to the support actor.
- `action` set to
  `mvp_a.support_review.inspect.reason.onboarding_evidence_review`.
- `subject_table` set to `transaction_request`.
- `subject_id` set to the directly traced onboarding transaction request.
- `correlation_id` set to the support review correlation.

The response includes the bounded authorization decision, filtered trace
summary, support-review audit evidence, and deferred production blockers. It
does not return persisted onboarding payload JSON or raw provider payloads.

## Blocked Production Claims

These production audit and support readiness items remain follow-up blockers:

- WORM / S3 Object Lock audit immutability and archive evidence.
- Hash-chain archive verification for production audit storage.
- Provider audit search for live Okta or other external tenants.
- Compliance restore evidence beyond the local synthetic rehearsal.
- Production support procedures, custody, ticket binding, and post-use review.

Any future production support workflow must add an accepted authorization
boundary, trusted support identity source, ticket or case binding, provider
audit-search contract, immutable archive evidence, restore evidence, and
post-use review procedure before making broader audit-readiness claims.

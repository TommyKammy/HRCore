# MVP-A Onboarding Traceability Closeout

This closeout records PoC-depth evidence for issue #174. The runtime verifier is
`verifyMvpAOnboardingCorrelationTrace`. The bounded inspection API is
`GET /audit/mvp-a/onboarding-correlations/{correlationId}`.

## Evidence Covered

- Root `transaction_request.correlation_id` anchors one MVP-A onboarding hire.
- Approval and apply `audit_event` rows must use the same root correlation ID.
- `lifecycle_event` must link to the correlated hire request and persisted
  effective date.
- `onboarding_apply_job_attempt` rows are included when the future-date worker
  path produced job evidence.
- Okta projection is represented through deterministic mock writeback evidence
  linked to the applied onboarding payload.
- `writeback_event`, `writeback_provider_refresh`, and
  `writeback_work_email_conflict` evidence is pulled only from directly linked
  work email records for the correlated onboarding subject.
- The trace verifier returns the MVP-A onboarding evidence authorization gate
  before exposing onboarding request, person, employment, assignment,
  lifecycle, apply-job attempt, audit, mock Okta projection, or work_email
  evidence.
- The inspection API returns a summarized trace only: request metadata, linked
  approval/apply audit rows, lifecycle ID, apply-job attempt count, writeback
  event ID, provider refresh ID, conflict ID, and the deferred production gate
  list. It does not expose raw payloads or unrestricted audit browsing.

## Representative Paths

- Success: submitted request, approval, apply, mock Okta projection,
  `work_email` writeback, provider refresh, lifecycle event, and audit events.
- Partial success: HR Core apply remains completed when Okta projection fails
  retryably; no writeback evidence is inferred.
- Writeback conflict: manual `work_email` override keeps conflict evidence
  linked to the deterministic writeback event.
- Retry/idempotency: existing onboarding tests cover same-correlation request,
  decision, apply, worker run, writeback, and provider refresh retries.
- Provider failure: mock Okta retryable failure is traceable without pretending
  downstream writeback happened.
- API fail-closed: `GET /audit/mvp-a/onboarding-correlations/{correlationId}`
  returns conflict evidence errors instead of a partial success when required
  provider refresh or conflict evidence is missing.

## P2A-02 Gates

The MVP-A trace is not a production-like readiness claim. These gates remain for
P2A-02 or later before real-data use:

- WORM / S3 Object Lock audit immutability and archive evidence.
- broad audit search UI for production support and review.
- production backup readiness beyond the local synthetic backup / restore rehearsal.
- production field-level RBAC and data-scope enforcement beyond the bounded
  MVP-A onboarding evidence authorization gate.
- export controls for raw payloads, CSV output, download logs, and watermark or
  manifest traceability.
- real Okta tenant credentials, tenant binding, webhook custody, and provider
  audit search.

## Verification

- Focused reproduction: `npm test -- --test-name-pattern="MVP-A onboarding trace"`
  first failed because `src/mvp-a-onboarding-traceability.ts` did not exist.
- Closeout verifier coverage now exercises success, partial provider failure,
  writeback conflict, missing apply evidence, and this gate list.
- The MVP-A onboarding evidence authorization gate is documented in
  [MVP-A Onboarding Evidence Authorization Gate](mvp-a-onboarding-evidence-authorization-gate.md).
- Focused API gate coverage:
  `npm test -- --test-name-pattern "bounded onboarding evidence"`.
- The local synthetic backup / restore rehearsal gate is documented in
  [MVP-A Onboarding Backup / Restore Rehearsal Gate](mvp-a-onboarding-backup-restore-rehearsal-gate.md).

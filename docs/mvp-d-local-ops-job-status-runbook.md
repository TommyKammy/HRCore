# MVP-D Local Ops Job Status Runbook

This runbook records the bounded local evidence surface for MVP-D CSV import and onboarding apply job status. It is synthetic-only evidence for review and supportability checks; it is not production operations readiness.

## Local Evidence

- CSV import status is read from `csv_import_job` and `csv_import_row_outcome` by explicit correlation id.
- Onboarding apply status is read from `onboarding_apply_job_run` and matching `onboarding_apply_job_attempt` rows by explicit worker correlation id.
- Operator decisions for failed local CSV jobs require an actor, reason, decision correlation id, timestamp, and the current evidence version.
- Broad audit search and production-only DLQ actions fail closed.

## Non-Goals

This runbook does not introduce a production scheduler, production queue, production DLQ, incident workflow, on-call process, SLO/SLA, backup/restore operation, retention/deletion runtime, live IdP operation, or live-provider readiness claim.

Use repo-relative verification such as `npm run verify:pre-pr` from `<hrcore-repo-root>`.

# P2X Cross-Flow Audit and Correlation Lookup Map

Issue: #350
Part of: #347
Depends on: #349
Review scope: bounded local lookup evidence for MVP-A/B/C/D only.
Review mode: repository-owned reviewer map for synthetic or explicitly approved
non-production evidence. This map is not project-owner, HR operator, legal,
privacy, security, data-owner, production operations, support-console, live
provider audit, compliance archive, or two-key approval.

## Boundary

- bounded local audit/correlation lookup: Allowed.
- HR practical-use ready: Blocked.
- production-like ready: Blocked.
- production audit readiness: Blocked.
- production audit immutability: Blocked.
- broad audit search: Blocked.
- compliance archive: Blocked.
- live provider audit: Blocked.
- support-console custody: Blocked.

Use this map with `docs/p2x-local-bounded-operator-runbook.md` and
`docs/p2x-synthetic-practical-use-rehearsal-checklist.md`. Start from the
direct flow evidence and the anchored correlation id named by the focused
verifier. Do not infer linkage from issue names, branch names, comments, local
path shape, sibling rows, same-parent lineage, forwarded headers, placeholder
credentials, or nearby planning metadata.

## Lookup Map

| Flow                          | Authoritative bounded audit or correlation evidence path                                                                                                                                   | Expected lookup key shape                                                                                                                                                                                                                                             | Missing or failed-path expectation                                                                                                                                                    | Separate stronger-readiness blockers                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MVP-A onboarding              | `docs/mvp-a-onboarding-traceability-closeout.md`; `src/mvp-a-onboarding-traceability.test.ts`; route `GET /audit/mvp-a/onboarding-correlations/:correlationId`; `audit_event` direct links | One synthetic onboarding root correlation id bound to the `transaction_request`, approval audit, apply audit, apply job attempt, mock provider projection, writeback/conflict evidence where applicable, actor, subject, and tenant/environment.                      | Missing correlation, mismatched request owner, missing approval/apply/job/writeback evidence, or unavailable trace database must fail closed at the trace verifier or route boundary. | Production audit immutability, WORM/Object Lock, broad audit search, compliance archive, live provider audit, support-console custody, legal/privacy approval, and two-key approval. |
| MVP-B transfer                | `docs/mvp-b-transfer-traceability-closeout.md`; `src/mvp-b-transfer-traceability.test.ts`; `verifyMvpBTransferCorrelationTrace`                                                            | One synthetic transfer root correlation id bound to the transfer `transaction_request`, approval audit, apply audit, future-date worker job attempt, assignment history, mock Okta projection, actor, subject, and tenant/environment.                                | Missing approval, apply, job attempt, canonical lifecycle, assignment history, or directly rooted projection evidence must fail closed without pulling sibling transfer evidence.     | Production authorization/RLS, live Okta tenant mutation, production audit archive, support-console authority, legal/privacy approval, and real-data transfer custody.                |
| MVP-C termination             | `docs/mvp-c-termination-traceability-closeout.md`; `src/mvp-c-termination-traceability.test.ts`; `verifyMvpCTerminationCorrelationTrace`                                                   | One synthetic termination root correlation id bound to the termination `transaction_request`, approval audit, apply audit, future-date worker job attempt, ended employment, ended assignment, mock disable/group projection, actor, subject, and tenant/environment. | Missing canonical approval/apply audit, lifecycle, worker attempt, ended employment, ended assignment, or rooted projection evidence must fail closed at the trace verifier.          | Retention/deletion runtime, legal hold/anonymization custody, production audit immutability, live provider operation, legal/privacy approval, and real employee termination custody. |
| MVP-D CSV import/export guard | `docs/mvp-d-csv-import-contract.md`; `docs/mvp-d-p2d-01-readiness-review-closeout.md`; `src/mvp-d-csv-ops-dlq-traceability.test.ts`; CSV import/export guard tests                         | One bounded CSV job correlation id with row ids, row outcome correlation ids, denied export evidence, actor/reviewer context where recorded, row subject binding, tenant/environment, and current evidence version.                                                   | Unsupported columns, regulated identifiers, unrestricted raw payload aliases, broad export requests, missing row evidence, or mixed accepted/rejected row evidence must stay blocked. | Broad CSV export, raw payload access, production download log, production audit archive, live provider audit, support-console custody, legal/privacy approval, and two-key approval. |
| MVP-D local Ops job status    | `docs/mvp-d-local-ops-job-status-runbook.md`; `src/local-ops-job-status.test.ts`; explicit workflow plus correlation id lookup against local synthetic job evidence                        | Explicit workflow and job correlation id, local job id or row id where applicable, operator actor/reason where recorded, subject binding, tenant/environment, and current evidence version.                                                                           | Missing workflow, missing correlation id, stale evidence version, broad audit lookup, or mismatched row/job evidence must fail closed without synthesizing local Ops status.          | Production queue/DLQ runtime, production scheduler, production operations authority, incident workflow, support-console custody, and compliance archive.                             |
| MVP-D DLQ decisions           | `docs/mvp-d-local-ops-job-status-runbook.md`; `src/local-ops-job-status.test.ts`; `local_ops_failure_decision` plus linked `audit_event` evidence                                          | Job correlation id plus decision correlation id, failed row id, local failure/job id, operator actor, reason, subject binding, tenant/environment, retry count where applicable, linked audit event id, and current evidence version.                                 | Missing reason, stale evidence, duplicate replay, unsupported retry count, orphan audit event, post-close decision, or partial durable write must fail closed and leave state clean.  | Production queue/DLQ action custody, production replay/rollback authority, support-console custody, production audit immutability, compliance archive, and legal/privacy approval.   |

## Field Lookup Checklist

| Field                   | Bounded lookup expectation                                                                                                                                           | Fail-closed condition                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| correlation id          | Use the root or directly linked operation correlation id asserted by the focused verifier for the exact flow under review.                                           | Missing, stale, sibling, same-parent, branch-derived, issue-derived, or broadly searched correlation id.                                                                   |
| request id              | Use the directly linked `transaction_request` id for MVP-A/B/C, or the CSV job/request evidence named by the MVP-D verifier.                                         | Request inferred from naming convention, nearby row, display text, or untrusted issue body.                                                                                |
| job id                  | Use the apply job attempt, future-date worker attempt, CSV import job, local Ops job, or failed-row job evidence that is directly rooted in the flow correlation.    | Missing job evidence, job evidence rooted in a different correlation, stale Ops/DLQ evidence version, or production queue/DLQ action.                                      |
| actor                   | Use the synthetic reviewer, local operator, approver, worker id, or system actor recorded by the direct audit or decision evidence.                                  | Placeholder actor, forwarded user header, raw client-supplied identity, TODO actor, fake approval, or omitted actor where the flow requires one.                           |
| subject                 | Use the directly linked person, transaction request, assignment, employment, lifecycle event, CSV row, failure, or provider mock subject from the anchored record.   | Subject inferred from name, sibling row, same-parent lineage, comment, nearby metadata, or unrelated projection.                                                           |
| tenant/environment      | Use the repository-owned synthetic tenant/environment or explicit non-production binding asserted by the flow.                                                       | Production tenant, live provider tenant, client-supplied tenant hint, mismatched flow tenant, missing environment, or inferred environment from path shape.                |
| failed-path expectation | Prove the existing verifier or guard rejects missing, malformed, stale, unsupported, mismatched, orphaned, or mixed-snapshot evidence and keeps durable state clean. | Treating an exception, error string, operator note, or convenience projection as enough when a partial durable write, orphan record, or half-restored state could survive. |

## Local Review Procedure

1. Read this lookup map, then the relevant row in
   `docs/p2x-local-bounded-operator-runbook.md`.
2. Run the focused verifier named by the flow before broad verification.
3. Resolve only direct evidence from the authoritative root correlation or
   workflow/correlation pair. Keep request, job, actor, subject,
   tenant/environment, and evidence-version fields tied to the same bounded
   record.
4. For failed paths, verify the durable state remained clean after rejection.
   Do not stop at proving an exception was raised.
5. Use `docs/p2x-synthetic-practical-use-rehearsal-checklist.md` for the
   synthetic rehearsal evidence fields and cleanup expectations.

## Focused Command

```sh
npm test -- --test-name-pattern "P2X cross-flow audit and correlation lookup map"
```

Full pre-PR verification remains:

```sh
npm run verify:pre-pr
```

These commands are repo-relative. This map does not require production
credentials, live IdP tenant configuration, cloud accounts, production database
access, queue/DLQ runtime integration, support-console sessions, or
workstation-local absolute paths.

## Non-Expansion Confirmation

No runtime workflow behavior, migration, API surface, broad audit search,
production audit immutability, WORM/Object Lock, compliance archive, live
provider audit, support-console custody, legal/privacy approval, production
queue, production DLQ, retention/deletion runtime, readiness upgrade, HR
practical-use readiness, or production-like readiness surface is introduced by
this lookup map.

- No real employee data.
- No live IdP/Okta.
- No unrestricted raw payload.
- No broad CSV export.
- No production queue/DLQ.
- No retention/deletion runtime.
- No two-key Accepted claim.
- No HR practical-use readiness.
- No production-like readiness surface.

## Closeout Boundary

Issue #350 can close when this lookup map, its focused guard, and
`npm run verify:pre-pr` pass. The result is a bounded local audit/correlation
lookup map only, not HR practical-use readiness, not production audit readiness,
and not production-like readiness.

# P2Y WebUI Practical UAT Package

Issue: #394
Part of: #388
Depends on: #391, #392, #393
Review scope: browser-only UAT package for bounded HRCore workflows using
synthetic examples or non-production examples with a separate explicit
authorization record only.
Review mode: repository-owned practical UAT guidance. This package is not
project-owner, HR operator, legal, privacy, security, data-owner, operational,
architecture, production authorization, two-key, go-live, HR practical-use
readiness, or production-like readiness approval.

## Package Boundary

- bounded browser UAT package: Allowed.
- synthetic/non-production UAT data pack: Allowed.
- browser-only practical-use candidate assessment: Allowed.
- real employee UAT data: Blocked.
- production UAT: Blocked.
- live IdP/Okta/provider operation: Blocked.
- production credentials: Blocked.
- production authorization/RLS: Blocked.
- production audit immutability: Blocked.
- unrestricted raw payload: Blocked.
- broad CSV export: Blocked.
- production queue/DLQ: Blocked.
- retention runtime and deletion runtime: Blocked.
- legal signoff and privacy signoff: Blocked.
- two-key approval: Blocked.
- go-live approval: Blocked.
- production-like readiness: Blocked.

UAT candidates must use only repo-owned synthetic examples or a
non-production dataset with a separate explicit authorization record identified
outside this package.

Do not use real employee data, live provider tenants, production credentials,
production queues, production DLQs, unrestricted raw payloads, broad exports,
retention runtime, deletion runtime, support-console authority, or
workstation-local absolute paths.

This package supports HR practical-use candidate assessment only. It does not
replace project-owner, HR operator, legal, privacy, security, data-owner,
operational, architecture, production authorization, or two-key signoff.

## Synthetic/Non-Production UAT Data Pack

The synthetic/non-production UAT data pack is usable for this bounded package
when each row below is represented by repo-owned fixtures, focused verifier
output, or non-production examples that carry a separate authorization and
provenance record.

| Data item              | Required shape                                                                                                | Must stay blocked                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| onboarding candidate   | Synthetic person, offer, department, manager, work email expectation, tenant/environment, and correlation id. | Real employee onboarding data, payroll or benefit data, regulated identifiers, live-provider subjects.                     |
| transfer candidate     | Synthetic existing person, current assignment, target assignment, effective date, approver, and correlation.  | Production reassignment custody, inferred organization lineage, unsupported effective-date calendars.                      |
| termination candidate  | Synthetic employment and assignment records, termination date, approver, mock disable expectation.            | Real termination custody, legal hold, anonymization, retention runtime, deletion runtime, live-provider disable operation. |
| CSV/Ops/DLQ candidate  | Synthetic CSV rows with accepted, rejected, failed, retry, replay, ignore, and close examples.                | Production queue actions, queue dumps, broad CSV export, raw payload aliases, production scheduler or DLQ operation.       |
| support review subject | One direct synthetic request, row, failure, or audit subject plus reason, actor, evidence version.            | Support-console custody, broad audit search, live provider audit lookup, placeholder reasons, fake approvals.              |
| audit review subject   | One direct workflow/correlation pair with linked request, decision, apply, provider mock, row, or job data.   | Sibling lineage, mixed-snapshot stitching, production audit archive, WORM/Object Lock, compliance archive claims.          |

## Browser UAT Scenarios

| Scenario       | Browser task                                                                                                                   | Expected UI audit/correlation evidence                                                                                                                                      | Fail-closed or blocked result                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| onboarding     | HR operator creates, validates, submits, and reviews one bounded new-hire request; approver records a decision.                | actor, reason, tenant/environment, subject binding, request id, decision id, apply/job evidence, mock provider evidence, correlation id, evidence version, cleanup status.  | Missing actor, tenant, approval, direct subject, apply evidence, or correlation blocks completion and leaves no partial durable state.          |
| transfer       | HR operator drafts and submits an assignment change; approver reviews current and target assignment impact.                    | actor, tenant/environment, subject binding, current assignment, target assignment, decision audit, worker attempt, correlation id, evidence version, cleanup status.        | Sibling assignment inference, stale evidence, unsupported effective date, or mismatched subject blocks the scenario.                            |
| termination    | HR operator submits bounded termination; approver reviews end date and mock provider impact.                                   | actor, tenant/environment, subject binding, employment id, assignment id, decision audit, worker attempt, mock disable/group evidence, correlation id, cleanup status.      | Real employee termination custody, retention/deletion action, live-provider disable, or orphan lifecycle write stays blocked.                   |
| CSV/Ops/DLQ    | HR operator runs CSV dry-run/apply examples; HR Ops reviews local failed rows and records retry/replay/ignore/close decisions. | actor, reason, tenant/environment, row subject binding, CSV job id, row outcome, current evidence version, DLQ decision audit, correlation id, cleanup status.              | Unsupported columns, regulated identifiers, broad export, stale evidence, production queue/DLQ action, or duplicate replay blocks the scenario. |
| support review | HR Ops/support reviews one explicit bounded subject and records a reasoned review.                                             | actor, reason, tenant/environment, subject binding, allowed evidence scope, evidence version, support review id, correlation id, cleanup status.                            | Placeholder reason, forwarded identity, inferred subject, raw payload disclosure, or support-console authority claim blocks the review.         |
| audit review   | Reviewer starts from the direct workflow/correlation pair and inspects only directly linked bounded evidence.                  | actor or reviewer context, tenant/environment, workflow, subject binding, direct correlation id, evidence version, linked request/job/row/decision records, cleanup status. | Broad audit search, sibling lineage, mixed-snapshot read, production audit archive, or WORM/Object Lock claim blocks the review.                |

## Acceptance Checklist

Each UAT scenario record should use the same outcome fields so unresolved work
is triaged without overclaiming readiness.

| Field            | Meaning                                                                                                          | Required entry                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| completed        | The browser-only task finished with bounded synthetic evidence or separately authorized non-production evidence. | Yes or no, plus the direct workflow/correlation id.                                                        |
| blocked          | A missing prerequisite, fail-closed guard, or out-of-scope surface prevented completion.                         | Yes or no, plus the blocking prerequisite or guard name.                                                   |
| workaround       | The candidate used an acceptable bounded manual step without changing the evidence boundary.                     | Short repo-relative description, or none.                                                                  |
| defect           | The UI, server guard, evidence assembly, or documentation behaved incorrectly inside scope.                      | Issue link or defect note with reproduction steps and expected bounded evidence.                           |
| post-UAT backlog | The finding is useful but outside this bounded package or requires later approval/prerequisites.                 | Backlog note with the blocked approval, runtime, data, provider, authorization, audit, Ops, or legal lane. |

Do not mark a scenario completed from screenshots, issue text, branch names,
path shape, placeholder credentials, forwarded identity headers, or display
summaries alone. Completion requires the authoritative bounded record and the
direct correlation evidence named by the scenario.

## Issue Triage Guidance

| Triage class | Use when                                                                                                                                                                                                                                           | Handling rule                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| blocker      | Browser UAT cannot complete a scoped scenario, the guard allows a prohibited surface, or durable failed-path state is dirty.                                                                                                                       | Stop the scenario, keep the guard in place, record the exact missing prerequisite or defect, and fix before claiming scenario completion. |
| must-fix     | Scenario completion is possible only with confusing UI copy, missing evidence labels, weak non-production wording, or a narrow workaround.                                                                                                         | File a focused follow-up tied to the scenario and evidence field; do not promote readiness beyond the bounded UAT result.                 |
| post-UAT     | The request needs real data, live provider operation, production authorization/RLS, production audit immutability, production queue/DLQ, retention runtime, deletion runtime, legal signoff, privacy signoff, two-key signoff, or go-live signoff. | Record it as out of scope for this package and link the required prerequisite lane before any stronger claim.                             |

## User Operation Runbook

This runbook is written for non-engineer UAT candidates. Run commands only from
the repository root when a focused verifier is needed.

1. Daily operation: open the WebUI, select the bounded/non-production persona,
   confirm the scenario names and synthetic/non-production data pack, then work
   from the scenario queue rather than global employee search.
2. Approval: use the approval inbox or scenario detail to approve, return,
   reject, or cancel only the directly selected synthetic request. Confirm the
   actor, tenant/environment, subject binding, and correlation id shown in the
   UI before recording the decision.
3. Support review: start from one direct workflow/correlation pair or failed
   row, review the allowed evidence fields only, record a concrete reason, and
   reject placeholder approvals, forwarded identity hints, or inferred subjects.
4. DLQ handling: for local synthetic failures, compare the current evidence
   version and row subject before retry, replay, ignore, or close. If evidence
   is stale or the action points to production queue/DLQ operation, stop and
   mark the scenario blocked.
5. Audit review: inspect only the directly linked request, job, row, decision,
   provider mock, writeback, and support-review evidence for the correlation.
   Do not broaden to sibling records or broad audit search.

Representative focused checks remain repo-relative:

```sh
npm test -- --test-name-pattern "P2Y WebUI practical UAT package"
npm test -- --test-name-pattern "MVP-A onboarding trace"
npm test -- --test-name-pattern "MVP-B transfer evidence is traceable"
npm test -- --test-name-pattern "MVP-C termination evidence is traceable"
npm test -- --test-name-pattern "MVP-D CSV/Ops/DLQ traceability verifier"
```

If supervisor configuration is required by a local tool, use documented
placeholders or environment variables such as `CODEX_SUPERVISOR_CONFIG`,
`<supervisor-config-path>`, and `<codex-supervisor-root>`.

## Verification Commands

Focused reproduction before this package:

```sh
npm test -- --test-name-pattern "P2Y WebUI practical UAT package"
```

The focused guard failed because
`docs/p2y-webui-practical-uat-package.md` was missing.

Focused verification after this package:

```sh
npm test -- --test-name-pattern "P2Y WebUI practical UAT package"
```

Final verification:

```sh
npm run verify:pre-pr
```

## No Surface Expansion Confirmation

No product behavior, migration, API surface, live provider operation,
production credential use, production authorization/RLS, production audit
immutability, unrestricted raw payload, broad CSV export, production
queue/DLQ, retention runtime, deletion runtime, legal signoff, privacy
signoff, two-key signoff, go-live signoff, HR practical-use readiness, or
production-like readiness surface is introduced by this UAT package.

- No real employee data.
- No live IdP/Okta.
- No production authorization/RLS.
- No unrestricted raw payload.
- No broad CSV export.
- No production queue/DLQ.
- No retention/deletion runtime.
- No legal/privacy approval.
- No two-key approval.
- No go-live approval.
- No production-like readiness.

## Closeout Boundary

Issue #394 can close when this WebUI practical UAT package, the focused guard,
policy coverage, and `npm run verify:pre-pr` pass. The result is bounded UAT
package evidence only, not HR practical-use readiness and not production-like
readiness.

# P2X Synthetic Practical-Use Rehearsal Checklist

Issue: #349
Part of: #347
Depends on: #348
Review scope: synthetic or explicitly approved non-production rehearsal only.
Review mode: repository-owned checklist for a local reviewer. This checklist is
not project-owner, HR operator, legal, privacy, security, data-owner,
production operations, production ticket binding, real employee mutation
custody, or two-key approval.

## Checklist Boundary

- bounded synthetic practical-use rehearsal: Allowed.
- HR practical-use ready: Blocked.
- production-like ready: Blocked.
- real employee data: Blocked.
- live IdP/Okta operation: Blocked.
- production queue/DLQ ready: Blocked.
- retention/deletion runtime ready: Blocked.

All examples must be repo-owned synthetic examples or explicitly approved
non-production examples. Do not use real employee data, live provider tenants,
production credentials, production queues, production DLQs, broad exports,
retention/deletion runtime, support-console authority, or workstation-local
absolute paths.

This checklist starts from `docs/p2x-local-bounded-operator-runbook.md`,
`docs/mvp-abcd-bounded-evidence-inventory.md`, and
`docs/p2x-production-like-blocker-matrix.md`. It does not infer readiness from
issue names, branch names, comments, local path shape, forwarded headers,
placeholder secrets, or nearby planning metadata. Missing provenance, scope,
actor, subject, tenant/environment, correlation, evidence-version, or cleanup
signals keep the rehearsal blocked for that step.

## Evidence Fields

Each completed step should leave reviewer-inspectable evidence with these
fields, either in the focused verifier output, the direct closeout evidence, or
the authoritative local synthetic record asserted by the test:

| Field              | Expected bounded value                                                                                       | Fail-closed condition                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| actor              | Synthetic reviewer or bounded local operator id recorded by the tested flow.                                 | Placeholder actor, forwarded user header, inferred identity, or missing actor.                                                      |
| reason             | Concrete local rehearsal reason, such as `synthetic transfer rehearsal` or `reviewed synthetic failure`.     | Empty reason, TODO text, fake approval, or reason unrelated to the current synthetic subject.                                       |
| subject binding    | Direct person, transaction request, CSV row, job, failure, or provider mock subject id from the same record. | Subject inferred from name, sibling row, issue title, branch, or same-parent lineage.                                               |
| tenant/environment | Repo-owned synthetic tenant/environment for the exact flow under review.                                     | Production tenant, live provider tenant, mismatched flow tenant, or client-supplied tenant hint without trusted binding.            |
| correlation id     | One root or directly linked operation correlation id asserted by the focused verifier.                       | Broad audit search, sibling correlation, stale retry correlation, or missing operation linkage.                                     |
| evidence version   | Current evidence version, row version, or directly asserted current record marker for the flow.              | Stale local Ops/DLQ version, mixed-snapshot output, or projection that disagrees with the authoritative lifecycle record.           |
| cleanup status     | Repo-relative cleanup expectation and no-orphan or no-partial-write evidence where a failed path is tested.  | Leftover local database artifact presented as evidence, orphan write, half-restored state, duplicate replay, or stale DLQ decision. |

## Rehearsal Checklist

| Step                          | Local rehearsal action                                                                                                                                          | Expected evidence                                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| onboarding                    | Create or review one bounded MVP-A onboarding request from the canonical closeout and run the focused onboarding trace check.                                   | Request creation, approval, apply, provider mock projection, writeback where applicable, audit lookup, actor, reason, subject binding, tenant/environment, correlation id, evidence version, failed-path evidence, and cleanup status stay tied to one synthetic onboarding correlation. |
| transfer                      | Create or review one bounded MVP-B transfer request and run the focused transfer trace check.                                                                   | Request creation, approval, apply, provider mock projection, audit lookup, actor, reason, assignment subject binding, tenant/environment, correlation id, evidence version, failed-path evidence, and cleanup status stay tied to the synthetic transfer record.                         |
| termination                   | Create or review one bounded MVP-C termination request and run the focused termination trace check.                                                             | Request creation, approval, apply, provider mock projection, audit lookup, actor, reason, employment or assignment subject binding, tenant/environment, correlation id, evidence version, failed-path evidence, and cleanup status stay tied to the synthetic termination record.        |
| CSV import/export denial      | Run bounded MVP-D CSV dry-run and apply checks, then inspect denied broad or raw export evidence.                                                               | CSV/Ops/DLQ evidence shows accepted or rejected synthetic rows, denied unrestricted raw payload and broad CSV export attempts, actor, reason, row subject binding, tenant/environment, correlation id, evidence version, failed-path evidence, and cleanup status.                       |
| local Ops job status          | Review local Ops job status only through the documented focused verifier and explicit workflow/correlation lookup.                                              | Local job status, latest authoritative job or row outcome, actor or reviewer context, reason where applicable, subject binding, tenant/environment, correlation id, evidence version, failed-path evidence, and cleanup status are directly linked.                                      |
| DLQ retry/replay/ignore/close | Rehearse local retry, replay, ignore, and close decisions only against synthetic failed-row evidence with the current evidence version.                         | DLQ decision evidence records actor, reason, failure subject binding, tenant/environment, correlation id, current evidence version, durable no-orphan or no-partial-write failed-path evidence, and cleanup status. Production queue/DLQ actions remain blocked.                         |
| audit lookup                  | Resolve each flow from the direct root or operation correlation id named by the focused verifier.                                                               | Audit lookup returns only directly linked request, lifecycle, job, provider mock, writeback where applicable, CSV/Ops/DLQ, and decision records for the anchored synthetic subject. Broad search, sibling lineage, and mixed-snapshot stitching stay rejected.                           |
| failed paths                  | For each scenario, exercise at least one missing, malformed, stale, unsupported, or mismatched evidence path already covered by the focused guard for the flow. | Failure evidence proves the system blocked at the enforcement boundary and that durable state stayed clean after rejection. An exception, validation message, or returned error alone is not enough if a partial write could survive.                                                    |
| cleanup                       | After failed-path rehearsal, rerun the focused check that proves the relevant record set is still clean and current.                                            | Cleanup status is repo-relative and synthetic: focused command name, evidence owner, correlation id shape, and no orphan record, partial durable write, half-restored state, duplicate replay, stale evidence decision, production artifact, or workstation-local absolute path.         |

## Focused Command Map

Use the commands below from the repository root. They are examples of focused
local reproduction, not production runbooks:

```sh
npm test -- --test-name-pattern "MVP-A onboarding trace"
npm test -- --test-name-pattern "MVP-B transfer evidence is traceable"
npm test -- --test-name-pattern "MVP-C termination evidence is traceable"
npm test -- --test-name-pattern "MVP-D CSV dry-run"
npm test -- --test-name-pattern "MVP-D CSV apply"
npm test -- --test-name-pattern "MVP-D bounded synthetic CSV export"
npm test -- --test-name-pattern "MVP-D local ops job status"
npm test -- --test-name-pattern "MVP-D CSV/Ops/DLQ traceability verifier"
npm test -- --test-name-pattern "MVP-D local ops failure decisions"
```

If a local tool needs external configuration, use documented placeholders such
as `<supervisor-config-path>` or documented environment variables such as
`CODEX_SUPERVISOR_CONFIG`. This checklist does not require production
credentials, live IdP tenant configuration, cloud accounts, provider secrets,
production database access, queue/DLQ runtime integration, or a support-console
session.

## Preserved Evidence Boundaries

This checklist preserves the P2A/P2B/P2C/P2D accepted evidence boundaries and
the P2X-01 blocker matrix.

- MVP-A remains bounded to synthetic or explicitly approved non-production
  onboarding evidence. Real employee data, broad employee search, unrestricted
  raw payload, live provider operation, production audit archive, and
  production support process are blocked.
- MVP-B remains bounded to synthetic transfer assignment evidence and
  deterministic mock provider projection. Production authorization,
  production RLS, real-data transfer custody, and live-provider mutation are
  blocked.
- MVP-C remains bounded to synthetic termination evidence and deterministic
  mock disable or group-removal projection. Retention/deletion runtime,
  legal-hold, anonymization, production audit immutability, and real employee
  termination custody are blocked.
- MVP-D remains bounded to synthetic CSV import/apply, denied export, local
  Ops, and local DLQ decision evidence. Broad CSV export, production queue/DLQ,
  production scheduler, incident workflow, and support-console authority are
  blocked.
- P2X blocker rows for real employee data, live Okta/provider operation,
  production authorization/RLS, production audit immutability, raw payload and
  CSV export, production scheduler/queue/DLQ, production ops, legal/privacy
  runtime, retention/deletion, and future-extension surfaces remain open.

## Verification Commands

Focused reproduction before this checklist:

```sh
npm test -- --test-name-pattern "P2X synthetic practical-use rehearsal checklist"
```

The focused guard failed because
`docs/p2x-synthetic-practical-use-rehearsal-checklist.md` was missing.

Focused verification after this checklist:

```sh
npm test -- --test-name-pattern "P2X synthetic practical-use rehearsal checklist"
```

Final verification:

```sh
npm run verify:pre-pr
```

The final command covers TypeScript build, policy-as-code scanning, tests,
formatting, dependency audit, and Drizzle migration/config checks.

## No Surface Expansion Confirmation

No runtime workflow behavior, migration, API surface, production support
process, production ticket binding, real employee mutation custody, production
authorization, legal/privacy approval, production queue, production DLQ,
retention/deletion runtime, support-console authority, live-provider operation,
readiness upgrade, HR practical-use readiness, or production-like readiness
surface is introduced by this checklist.

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

Issue #349 can close when this checklist, its focused guard, and
`npm run verify:pre-pr` pass. The result is a bounded synthetic practical-use
rehearsal checklist for local review only, not HR practical-use readiness and
not production-like readiness.

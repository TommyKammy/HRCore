# P2X Local Bounded Operator Runbook

Issue: #348
Part of: #347
Depends on: #336
Review scope: local bounded review of the completed MVP-A/B/C/D suite with synthetic or explicitly approved non-production evidence only.
Review mode: repository-owned operator rehearsal guidance. This runbook is not
project-owner, HR operator, legal, privacy, security, data-owner, production
operations, or two-key approval.

## Runbook Boundary

- bounded/non-production local review: Allowed.
- HR practical-use ready: Blocked.
- production-like ready: Blocked.
- real employee data: Blocked.
- live IdP/Okta operation: Blocked.
- production queue/DLQ ready: Blocked.
- retention/deletion runtime ready: Blocked.

Use this runbook only from a clean local checkout with repo-owned fixtures or an
explicit non-production evidence approval recorded outside this repository.
Every review step must stay anchored to the direct closeout, verifier, and
correlation evidence for the flow under review. Do not infer readiness from
issue names, branch names, comments, sibling records, forwarded headers,
operator notes, placeholder credentials, or local path shape.

## Canonical Flow Review Map

| Flow                          | Canonical closeout or contract                                                                                                                                        | Focused local check                                                         | Expected evidence shape                                                                                                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP-A onboarding              | `docs/mvp-a-p2a-03-practical-use-readiness-review-closeout.md`; `docs/mvp-a-onboarding-traceability-closeout.md`; `docs/mvp-a-onboarding-non-production-data-gate.md` | `npm test -- --test-name-pattern "MVP-A onboarding trace"`                  | One synthetic onboarding root correlation id with request, approval, apply, job, mock-provider projection, writeback or conflict evidence, and directly linked audit records. Missing or mismatched evidence must fail closed.                       |
| MVP-B transfer                | `docs/mvp-b-p2b-01-readiness-review-closeout.md`; `docs/mvp-b-transfer-traceability-closeout.md`                                                                      | `npm test -- --test-name-pattern "MVP-B transfer evidence is traceable"`    | One synthetic transfer root correlation id with request, approval audit, assignment-change lifecycle, apply audit, worker attempt, assignment history, and deterministic mock Okta profile or group projection evidence.                             |
| MVP-C termination             | `docs/mvp-c-p2c-01-readiness-review-closeout.md`; `docs/mvp-c-termination-traceability-closeout.md`                                                                   | `npm test -- --test-name-pattern "MVP-C termination evidence is traceable"` | One synthetic termination root correlation id with request, approval audit, termination lifecycle, apply audit, ended employment, ended assignment, worker attempt, and deterministic mock Okta disable or non-authoritative group-removal evidence. |
| MVP-D CSV import/export guard | `docs/mvp-d-p2d-01-readiness-review-closeout.md`; `docs/mvp-d-csv-import-contract.md`; `docs/mvp-a-onboarding-pii-export-gate.md`                                     | `npm test -- --test-name-pattern "MVP-D bounded synthetic CSV export"`      | Bounded synthetic lifecycle CSV dry-run and apply evidence, row-level accepted or rejected outcomes, denied raw or broad export evidence, and no unrestricted raw payload or regulated column acceptance.                                            |
| MVP-D local Ops job status    | `docs/mvp-d-local-ops-job-status-runbook.md`; `docs/mvp-d-p2d-01-readiness-review-closeout.md`                                                                        | `npm test -- --test-name-pattern "MVP-D local ops job status"`              | Explicit workflow and correlation id lookup against local synthetic CSV import or onboarding job evidence, with current evidence version and no broad audit search.                                                                                  |
| MVP-D DLQ decisions           | `docs/mvp-d-local-ops-job-status-runbook.md`; `docs/mvp-d-csv-import-contract.md`                                                                                     | `npm test -- --test-name-pattern "MVP-D local ops failure decisions"`       | Reasoned local retry, replay, ignore, or close decision evidence tied to a failed synthetic row and current evidence version. Production-only DLQ actions and stale evidence must fail closed.                                                       |
| audit/correlation             | `docs/mvp-abcd-bounded-evidence-inventory.md`; each flow traceability closeout                                                                                        | `npm test -- --test-name-pattern "trace"`                                   | Directly linked request, lifecycle, job, provider mock, writeback where applicable, and audit records read from one authoritative synthetic correlation boundary.                                                                                    |

## Local Review Steps

1. Confirm the checkout is on the issue branch and dependencies match the
   committed lockfile:

   ```sh
   git status --short --branch
   npm ci
   ```

2. Read the canonical closeout for the flow and confirm the review is bounded to
   synthetic or explicitly approved non-production evidence.
3. Run the focused local check from the table above before broad verification.
4. Inspect only the evidence shape asserted by the focused verifier. Use
   correlation ids, tenant/environment fields, actor ids, evidence versions, and
   durable row outcomes as authoritative signals.
5. If the focused check passes, run the full local pre-PR command from the repo
   root:

   ```sh
   npm run verify:pre-pr
   ```

## Command Shapes

Focused reproduction for this runbook guard:

```sh
npm test -- --test-name-pattern "P2X local bounded operator runbook"
```

Representative flow checks:

```sh
npm test -- --test-name-pattern "MVP-A onboarding trace"
npm test -- --test-name-pattern "MVP-B transfer evidence is traceable"
npm test -- --test-name-pattern "MVP-C termination evidence is traceable"
npm test -- --test-name-pattern "MVP-D CSV/Ops/DLQ traceability verifier"
npm test -- --test-name-pattern "MVP-D local ops failure decisions"
```

Full verification:

```sh
npm run verify:pre-pr
```

Use documented environment variables only when a local tool explicitly requires
them. For example, use `<supervisor-config-path>`, `<codex-supervisor-root>`,
or documented repo-relative commands instead of workstation-local absolute
paths. This runbook does not require production credentials, live IdP tenant
configuration, production database access, cloud accounts, support-console
authority, or queue/DLQ runtime integration.

## Failed-Path Review Expectations

- Missing request, approval, apply, job, provider mock, writeback, audit, CSV
  row, Ops, or DLQ evidence must stay rejected at the focused verifier boundary.
- Placeholder actors, fake secrets, TODO approvals, unsigned tokens, forwarded
  identity headers, and inferred tenant or environment bindings are not valid
  evidence.
- Unsupported CSV columns, regulated identifiers, raw payload aliases, broad
  export requests, live-provider fields, production queue actions, and
  retention/deletion requests must fail before durable success evidence.
- Failed CSV row and local Ops decisions must prove durable state remained
  consistent after rejection. Do not stop at an exception or error response when
  a partial write could survive.
- Mixed-snapshot review output is not acceptable. If a review would stitch
  records from different committed states, reject the result or rerun from one
  clean committed snapshot.

## Cleanup Expectations

- Treat local database files, generated `dist/` output, and local test artifacts
  as disposable review byproducts unless they are explicitly committed source.
- Do not commit generated local databases, real employee data, approval
  screenshots, provider secrets, raw exports, queue dumps, or workstation-local
  absolute paths.
- After failed-path rehearsal, rerun the focused check that proves no orphan
  record, partial durable write, half-restored state, duplicate replay, or stale
  evidence decision remains.
- Keep cleanup evidence repo-relative: command name, focused test name,
  correlation id shape, and expected synthetic fixture owner are enough for this
  bounded runbook.

## No Surface Expansion Confirmation

No real employee data, No live IdP/Okta, No unrestricted raw payload, No broad
CSV export, No production queue/DLQ, No retention/deletion runtime, No two-key
Accepted claim, No HR practical-use readiness, and No production-like readiness
surface is introduced by this runbook.

## Closeout Boundary

Issue #348 can close when this runbook, its focused guard, and
`npm run verify:pre-pr` pass. The result is local bounded operator review
guidance only, not HR practical-use readiness and not production-like readiness.

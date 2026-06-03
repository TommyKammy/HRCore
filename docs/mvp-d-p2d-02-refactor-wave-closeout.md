# MVP-D P2D-02 Refactor Wave Closeout

Issue: #329
Part of: #323
Depends on: #328

Review scope: independent closeout for the P2D-02 CSV/Ops/DLQ
maintainability refactor wave after child issues #324 through #328. The GitHub
child issues were implemented by merged PRs #330 through #334.

Review mode: repository-owned closeout. This document records the refactor
review result, completed helper and test-boundary splits, verification
commands, residual refactor risks, and unchanged readiness boundaries. It does
not authorize any broader product readiness claim.

## Readiness Verdict

- bounded/non-production MVP-D CSV/Ops/DLQ evidence: unchanged.
- HR practical-use ready: Blocked.
- production-like ready: Blocked.
- real employee data: Blocked.
- live Okta tenant operation: Blocked.
- production queue/DLQ ready: Blocked.
- retention/deletion runtime ready: Blocked.

P2D-02 was a behavior-preserving maintainability refactor wave. It did not
change the accepted bounded/non-production evidence boundary from P2D-01, and it
did not close the separate HR practical-use, real-data, live-provider,
production authorization/RLS, production audit, unrestricted raw export,
production queue/DLQ, production ops, legal/privacy, retention/deletion, or
two-key blockers.

P0-R05 (#11), P0-R06 (#12), and P0-R08 (#14) remain owner-acknowledged defer /
production-like blocked. Issue #240 records owner acknowledgement for
stronger-gate deferral only. Owner acknowledgement is not Accepted approval.

## Reviewed Refactor Artifacts

| Refactor target                                             | Child issue and PR | Reviewed artifacts                                                                                                                                                                                | Closeout result                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV import contract / parser / validation helper split      | #324, PR #330      | `src/csv-import-contract.ts`, `src/csv-import-contract-helpers.ts`, `src/csv-import-contract.test.ts`                                                                                             | CSV parsing, header validation, row validation, dry-run diff shaping, and fingerprint helpers now have focused ownership while unsupported raw payload, regulated, real-data, live-provider, retention/deletion, and extension fields fail closed. |
| CSV import apply / persistence / idempotency boundary split | #325, PR #331      | `src/csv-import-apply.ts`, `src/csv-import-apply-ids.ts`, `src/csv-import-apply-persistence.ts`, `src/csv-import-apply-types.ts`, `src/csv-import-contract.ts`, `src/csv-import-contract.test.ts` | Apply orchestration, deterministic ids, persistence writes, idempotency decisions, row outcome mapping, and failure reason formatting are separated without changing dry-run/apply/idempotency behavior.                                           |
| bounded CSV export policy / audit helper split              | #326, PR #332      | `src/csv-export-policy.ts`, `src/csv-export-policy.test.ts`, `docs/mvp-a-onboarding-pii-export-gate.md`, `docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md`      | Export surface classification, policy evaluation, denied-surface reporting, CSV serialization, and audit evidence helpers are clearer while raw payload, regulated, real-data, broad, duplicate, and unsupported surfaces still fail closed.       |
| local Ops job status / failure decision boundary split      | #327, PR #333      | `src/local-ops-job-status.ts`, `src/local-ops-job-status.test.ts`, `docs/mvp-d-local-ops-job-status-runbook.md`                                                                                   | Local job presentation status, evidence-version formatting, failure-decision descriptions, operator decisions, and source status checks now have explicit helper boundaries while remaining synthetic/local-only.                                  |
| CSV/Ops/DLQ traceability verifier / test helper split       | #328, PR #334      | `src/mvp-d-csv-ops-dlq-traceability.ts`, `src/mvp-d-csv-ops-dlq-traceability.test.ts`, `src/csv-import-contract.test.ts`, `src/csv-export-policy.test.ts`, `src/local-ops-job-status.test.ts`     | Traceability fixture setup, required DLQ decision verification, denied export guard evidence, and fail-closed mutation cases are easier to inspect while complete CSV/Ops/DLQ correlation evidence remains required.                               |

All P2D-02 implementation child issues #324, #325, #326, #327, and #328 are
closed.

## Behavior and Boundary Review

No behavior drift, API drift, migration drift, policy weakening, or
readiness-claim broadening was accepted in this closeout.

- Public facade: `src/csv-import-contract.ts` remains the stable dry-run and
  apply import surface. The child PRs moved ownership behind that facade rather
  than changing caller-visible CSV import behavior.
- CSV import contract boundary: bounded synthetic lifecycle rows still require
  the exact template version and repo-owned synthetic tenant environment.
  Unsupported raw payload, regulated, real-data, live-provider,
  retention/deletion, and future-extension columns still fail closed.
- CSV import apply boundary: apply still consumes a current exact dry-run result
  for the same CSV input, rejects rejected-row dry-runs, records deterministic
  job and row outcome evidence, preserves idempotent retries, and avoids partial
  lifecycle writes on row-level failures.
- CSV export boundary: the export surface remains synthetic-only and permission
  gated. Raw payload, regulated data, real employee data, broad export,
  duplicate fields, unsupported row keys, and production-like export surfaces
  fail closed before durable download audit evidence.
- Local Ops and DLQ boundary: status and failure decisions remain bounded to
  local synthetic CSV/import and onboarding apply evidence. Operator and failure
  decisions still require actor, reason, decision correlation, current evidence
  version, supported source state, and matching audit evidence. This is not
  production scheduler, production queue, incident workflow, SLO/SLA, on-call,
  support-console custody, or production operations readiness.
- Traceability boundary: the MVP-D trace still requires direct dry-run accepted
  and rejected rows, persisted import job and row outcomes, denied export guard
  evidence, local Ops status, operator action evidence, and complete retry,
  replay, ignore, and close DLQ decision evidence. Missing or mismatched linked
  evidence fails closed instead of inferring success from sibling records.
- Readiness boundaries: P2D-02 does not advance HR practical-use readiness,
  real employee data readiness, live-provider readiness, production
  authorization/RLS, production audit immutability, unrestricted raw export,
  production queue/DLQ, production ops, legal/privacy, retention/deletion,
  two-key acceptance, or production-like readiness.

## Verification Commands

Focused reproduction before closeout:

```sh
npm test -- --test-name-pattern "P2D-02 refactor wave closeout"
```

Initial focused result: failed because
`docs/mvp-d-p2d-02-refactor-wave-closeout.md` was missing.

Focused verification after closeout:

```sh
npm test -- --test-name-pattern "P2D-02 refactor wave closeout"
```

Final full verification command:

```sh
npm run verify:pre-pr
```

The final command covers TypeScript build, MVP-A policy-as-code, tests,
formatting, dependency audit, and Drizzle migration/config checks.

## Deferred Low-Priority Surfaces

These files and areas are deferred rather than forced into this closeout issue:

- Broad repository, ADR, and readiness guard tests remain shared because they
  protect cross-phase governance and closeout documentation surfaces.
- Compatibility facades remain intentionally stable. Removing or narrowing
  exports should wait until downstream imports are proven unused in a separate
  review.
- Route, OpenAPI, README, and wizard cleanup should only be done when a later
  issue defines a narrow behavior, ownership, or discoverability reason.

## Residual Refactor Debt

These items do not block P2D-02 because they do not affect current behavior or
readiness boundaries, but they remain useful future cleanup candidates:

- `src/csv-import-apply.ts` and `src/csv-import-apply-persistence.ts` remain
  nontrivial orchestration and SQL boundaries. Future splits should preserve
  exact dry-run matching, idempotent row evidence, savepoint rollback, and
  no-partial-lifecycle-write behavior.
- `src/local-ops-job-status.ts` remains a dense local operations boundary.
  Future extraction should keep source evidence, evidence-version comparisons,
  final rechecks, insert-race handling, and decision audit writes explicit.
- `src/mvp-d-csv-ops-dlq-traceability.test.ts` still carries the end-to-end
  scenario because it protects direct CSV/Ops/DLQ evidence linkage. Further
  helper extraction should keep production-like blockers visible in assertion
  names and fail-closed mutation cases.
- Production-like work remains outside this wave. Real employee data, live
  Okta, production authorization/RLS, immutable audit, unrestricted raw export,
  production queue/DLQ, production ops, legal/privacy, retention/deletion, and
  two-key acceptance still require separate accepted evidence.

## Final Verdict

P2D-02 can close as behavior-preserving maintainability hardening after
`npm run verify:pre-pr` passes for this closeout branch.

The refactor wave completed the intended CSV import contract, CSV import apply,
bounded CSV export, local Ops, DLQ decision, traceability, and closeout guard
splits without accepting behavior changes, migrations, public API drift, policy
weakening, or broader readiness claims. Any stronger HR practical-use,
real-data, live-provider, unrestricted export, production queue/DLQ, production
ops, retention/deletion, two-key, or production-like claim still requires its
own accepted follow-up evidence and review.

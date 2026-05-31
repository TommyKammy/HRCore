# MVP-A P2A-04 Refactor Wave Closeout

Issue: #217
Part of: #210
Depends on: #216

Review scope: independent closeout for the P2A-04 refactor wave after child
issues #211 through #216. The GitHub child issues were implemented by merged
PRs #218 through #223.

Review mode: repository-owned closeout. This document records the refactor
review result, final file ownership, verification commands, residual cleanup
risks, and unchanged readiness boundaries. It does not authorize any broader
product readiness claim.

## Readiness Verdict

- bounded/non-production MVP-A onboarding E2E: unchanged.
- HR practical-use ready: Blocked.
- production-like ready: Blocked.

P2A-04 was a maintainability refactor wave. It did not change the accepted
bounded/non-production evidence boundary from P2A-02 or P2A-03, and it did not
close the separate HR practical-use, real-data, live-provider, production audit,
backup, export, or production operations blockers.

## Reviewed Refactor Artifacts

| Refactor target                           | Child issue and PR | Reviewed artifacts                                                                                                                                                                                                                                                                                                                                                                              | Closeout result                                                                                                                                                                                                                                                     |
| ----------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fastify app route modules                 | #211, PR #218      | `src/app.ts`, `src/routes/onboarding.ts`, `src/routes/mvp-a-onboarding-audit.ts`, `src/routes/mvp-a-onboarding-support-review.ts`, `src/routes/mvp-a-onboarding-trace-response.ts`, `src/routes/onboarding-wizard-view.ts`, `src/routes/writeback.ts`, `src/routes/http-helpers.ts`, `src/app.test.ts`                                                                                          | Route registration now lives in focused modules while `buildApp` remains the composition entry point. Existing status codes, response shapes, authorization checks, and OpenAPI-serving behavior remain covered by app tests.                                       |
| onboarding transaction request boundaries | #212, PR #219      | `src/onboarding-transaction-request.ts`, `src/onboarding-transaction-request-contract.ts`, `src/onboarding-transaction-request-persistence.ts`, `src/onboarding-transaction-request-approval.ts`, `src/onboarding-transaction-request-apply.ts`, `src/onboarding-transaction-request-worker.ts`, `src/onboarding-transaction-request-internal.ts`, `src/onboarding-transaction-request.test.ts` | The public compatibility facade remains available while contract, persistence, approval, apply, worker, and internal implementation ownership is split. Idempotency, retry, audit evidence, SQL behavior, and fail-closed tests remain in place.                    |
| Okta writeback integration                | #213, PR #220      | `src/onboarding-okta-writeback-integration.ts`, `src/onboarding-transaction-request.ts`, `src/onboarding-transaction-request-apply.ts`, `src/okta-mastering-adapter.test.ts`, `src/writeback-ingest.test.ts`                                                                                                                                                                                    | Mock-first Okta projection and work_email writeback orchestration moved outside the core transaction module. Real Okta tenant operation, provider credentials, webhook custody, and production provider readiness stay blocked.                                     |
| policy-as-code CI helpers                 | #214, PR #221      | `src/mvp-a-policy-as-code-ci.ts`, `src/mvp-a-policy-as-code-gates.ts`, `src/mvp-a-policy-as-code-repository.ts`, `src/mvp-a-policy-as-code-repository-surfaces.ts`, `src/mvp-a-policy-as-code-openapi.ts`, `src/mvp-a-policy-as-code-fixture-seed.ts`, `src/mvp-a-policy-as-code-documentation.ts`, `src/mvp-a-policy-as-code-types.ts`, `src/mvp-a-policy-as-code-ci.test.ts`                  | Policy entry points remain stable while gate, repository, OpenAPI, fixture/seed, documentation, and type helpers own focused checks. R08, raw/export, prohibited payload, and non-production data guardrails remain enforced.                                       |
| onboarding traceability verifier          | #215, PR #222      | `src/mvp-a-onboarding-traceability.ts`, `src/mvp-a-onboarding-traceability-types.ts`, `src/mvp-a-onboarding-traceability-row-guards.ts`, `src/mvp-a-onboarding-traceability-db-reads.ts`, `src/mvp-a-onboarding-traceability-binding-evidence.ts`, `src/mvp-a-onboarding-traceability-assembly.ts`, `src/mvp-a-onboarding-traceability.test.ts`                                                 | Public verifier imports remain available while row typing, row guards, DB reads, binding evidence, and trace assembly are separated. Direct-link trace requirements, fail-closed evidence checks, and bounded audit-search behavior remain covered.                 |
| shared onboarding test helpers            | #216, PR #223      | `src/test-helpers/database.ts`, `src/test-helpers/onboarding.ts`, `src/app.test.ts`, `src/synthetic-hire.test.ts`, `src/writeback-ingest.test.ts`, `src/repository-guards.test.ts`                                                                                                                                                                                                              | Repeated database setup, audit headers, worker correlations, and apply-job evidence fixtures moved to shared helpers. The large-test guard now requires those helpers, and the wave did not remove negative or fail-closed scenarios for file-size reduction alone. |

## Behavior and Boundary Review

No behavior drift, API drift, policy weakening, or readiness-claim broadening was
accepted in this closeout.

- App routes: `buildApp` still registers health, OpenAPI, provisioning, MVP-A
  onboarding audit, support review, onboarding transaction, and writeback
  routes. The route modules keep the existing error mapping and fail-closed
  behavior visible at the HTTP boundary.
- Onboarding boundaries: the compatibility facade keeps existing imports stable.
  The split internal modules preserve request validation, draft/submit
  persistence, decision state transitions, approved apply, future-date worker,
  idempotency, retry, rollback, and audit evidence behavior.
- Okta/writeback integration: integration ownership is separate from core
  onboarding persistence and apply logic. Mock-first behavior remains the only
  accepted provider behavior; placeholder credentials or real provider hints do
  not authorize live use.
- Policy-as-code: the refactor changed helper ownership, not policy outcomes.
  Existing positive and negative tests still exercise prohibited schema,
  migration, OpenAPI, fixture, seed, documentation, raw/export, R08, and
  non-production data surfaces.
- Traceability: the public verifier remains anchored to one explicit
  correlation and directly linked evidence. The split does not broaden audit
  search, raw payload exposure, sibling lineage, or production audit semantics.
- Test helpers: shared helpers reduce repetition without changing assertion
  strength. Repository guards now enforce continued use of those helpers for
  large onboarding/app tests.

## Verification Commands

Focused reproduction before closeout:

```sh
npm test -- --test-name-pattern "P2A-04 refactor wave closeout"
```

Initial focused result: failed because
`docs/mvp-a-p2a-04-refactor-wave-closeout.md` was missing.

Focused verification after closeout:

```sh
npm test -- --test-name-pattern "P2A-04 refactor wave closeout"
```

Final full verification command:

```sh
npm run verify:pre-pr
```

## Residual Refactor Debt

These items do not block P2A-04 because they do not affect current behavior or
safety, but they remain useful future-wave cleanup candidates:

- Some extracted modules are still large because they preserve cohesive runtime
  behavior and fail-closed logic. Further splitting should be driven by a narrow
  ownership or testability need, not line count alone.
- The compatibility facades intentionally keep import stability after the wave.
  A later cleanup can remove unused facade exports only after downstream imports
  are confirmed to have moved.
- Policy-as-code remains repository-owned guard code, not a full policy parser,
  OPA/Rego engine, runtime authorization engine, or production policy
  deployment.
- The traceability API remains a bounded same-correlation inspection surface.
  Broad audit search, archive/search UX, compliance-grade immutability, and
  production provider audit search stay out of scope.
- Shared test helpers should continue to avoid raw workstation-local absolute
  path literals and should keep fixture data synthetic or explicitly
  non-production.

## Final Verdict

P2A-04 can close as behavior-preserving maintainability hardening after
`npm run verify:pre-pr` passes for this closeout branch.

The refactor wave completed the intended app routes, onboarding boundaries,
Okta/writeback integration, policy-as-code, traceability, and test helper
ownership splits without accepting a regression or broadening readiness claims.
Any stronger HR practical-use or production-like claim still requires its own
accepted follow-up evidence and review.

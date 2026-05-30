# MVP-A P2A-03 Practical-Use Readiness Review Closeout

Issue: #204
Part of: #199
Depends on: #203
Review scope: P2A-03 practical-use readiness evidence after the P2A-02
bounded/non-production closeout and the #203 non-production data handling gate.
Review mode: independent repository closeout. This closeout records repo-owned
evidence only; it does not replace project-owner, legal, privacy, security, or
two-key approval.

## Readiness Verdict

- bounded/non-production MVP-A onboarding E2E: Go.
- HR practical-use ready: Blocked.
- production-like ready: Blocked.

HRCore can claim a bounded MVP-A onboarding path for synthetic or explicitly
approved non-production evidence only. HRCore cannot claim practical HR
operation, real personnel data use, live Okta tenant operation, production
audit immutability, production backup readiness, raw payload viewing,
CSV/export, support-console operations, DLQ/replay, legal/privacy acceptance, or
production-like readiness from the current P2A-03 evidence.

## Reviewed Artifacts

| Review area               | Artifact evidence                                                                                                                                                                                                                                                                                       | Review result                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2A-02 blocker review     | `docs/mvp-a-p2a-02-independent-review-closeout.md`; `docs/mvp-a-onboarding-go-no-go-checklist.md`; `docs/mvp-a-onboarding-traceability-closeout.md`; `docs/mvp-a-onboarding-backup-restore-rehearsal-gate.md`                                                                                           | P2A-02 accepted bounded/non-production evidence but explicitly left HR practical-use and production-like readiness blocked. Those blockers are still authoritative.                                                                      |
| P2A-03 follow-up evidence | `docs/mvp-a-onboarding-evidence-authorization-gate.md`; `docs/mvp-a-onboarding-support-review-workflow.md`; `docs/mvp-a-onboarding-non-production-data-gate.md`; `src/mvp-a-onboarding-evidence-authorization.ts`; `src/mvp-a-onboarding-non-production-data-gate.ts`; `src/mvp-a-policy-as-code-ci.ts` | P2A-03 strengthened bounded evidence access, support review, actor/subject/tenant binding, and non-production data handling. It did not supply the missing legal, privacy, real-data, live-provider, or production operations approvals. |
| MVP-A Go/No-Go checklist  | `docs/mvp-a-go-no-go.md`; `docs/mvp-a-onboarding-go-no-go-checklist.md`; `docs/mvp-a-go-no-go-scope.md`; `docs/mvp-a-go-no-go-future-wave-readiness.md`                                                                                                                                                 | The only current Go claim remains bounded/non-production MVP-A onboarding E2E. Practical-use-ready and production-like-ready remain No-go until follow-up placeholders are resolved with accepted evidence.                              |
| ADR 0000                  | `docs/adr/0000-adr-process.md`; `src/repository-guards.test.ts`                                                                                                                                                                                                                                         | Final approval authority remains with the project owner and required human or two-key reviewers. Issue text, repo tests, and proposed ADR anchors are not legal/privacy/two-key approval.                                                |
| ADR 0002                  | `docs/adr/0002-policy-as-code-ci-strategy.md`; `src/mvp-a-policy-as-code-ci.ts`; `src/mvp-a-policy-as-code-ci.test.ts`                                                                                                                                                                                  | Current policy-as-code checks cover the bounded repository surfaces. They are not a full parser, OPA/Rego engine, runtime authorization engine, or production policy deployment.                                                         |
| ADR 0003                  | `docs/adr/0003-mvp-a-core-stability-contract.md`; `src/persistence/schema.ts`; `drizzle/`                                                                                                                                                                                                               | No P2A-03 child evidence requires a stronger core-stability or irreversible migration claim. Raw/export, regulated-data, and future-extension schema surfaces remain blocked.                                                            |
| ADR 0011                  | `docs/adr/0011-data-scope-policy-dsl-rls-boundary.md`; `docs/mvp-a-onboarding-evidence-authorization-gate.md`; `src/mvp-a-onboarding-evidence-authorization.ts`                                                                                                                                         | Bounded evidence classifications and synthetic actor/subject/tenant checks exist. Enterprise RBAC, PostgreSQL RLS source-of-truth, tenant roles, and real-data authorization remain follow-up work.                                      |
| ADR 0014                  | `docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md`; `docs/mvp-a-onboarding-pii-export-gate.md`; `src/mvp-a-onboarding-pii-export-gate.ts`                                                                                                                              | Raw payload viewing, CSV/export, download, watermark/manifest, and download-log surfaces remain closed.                                                                                                                                  |
| ADR 0020                  | `docs/adr/0020-r08-prohibited-column-payload-policy-boundary.md`; `src/mvp-a-policy-as-code-ci.ts`; `src/repository-guards.test.ts`                                                                                                                                                                     | R08 prohibited column and payload guardrails remain in place for current repository evidence. No broad prohibited payload, raw, export, or regulated-data surface is accepted.                                                           |

## No Silent Surface Openings

The P2A-03 follow-up wave does not silently open any of these surfaces:

- real-data processing: blocked by `mvp_a_onboarding_non_production_data_handling_v1`
  unless a later accepted evidence package supplies real legal/privacy and
  data-owner approval.
- live-provider operation: blocked by the mock-first Okta contract and the
  absence of authoritative tenant binding, trusted credentials, webhook custody,
  secret rotation, and provider audit search evidence.
- broad audit search: blocked by the bounded same-correlation evidence API and
  support-review workflow; production support search remains separate follow-up
  work.
- raw payload viewing: blocked by the closed PII/export gate and ADR 0014.
- CSV/export: blocked by the closed PII/export gate and ADR 0014.
- production operations: blocked for support console, DLQ, replay, monitoring,
  alerting, production backup, production restore, WORM/Object Lock,
  hash-chain/archive, and production incident procedures.

## Verification Commands

Focused reproduction before closeout:

```sh
npm test -- --test-name-pattern "P2A-03 practical-use"
```

The focused guard failed because
`docs/mvp-a-p2a-03-practical-use-readiness-review-closeout.md` was missing.

Focused verification after closeout:

```sh
npm test -- --test-name-pattern "P2A-03 practical-use"
npm run policy:mvp-a
```

Final verification:

```sh
npm run verify:pre-pr
```

The final command covers TypeScript build, MVP-A policy-as-code, tests,
formatting, dependency audit, and Drizzle migration/config checks.

## Residual Blockers

| Blocker                          | Current follow-up reference                    | Required evidence before any stronger claim                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| real Okta tenant binding         | `<follow-up-provider-binding>`                 | Explicit tenant binding, trusted credential source, webhook custody, secret rotation, provider audit search, and no reliance on branch names, issue text, comments, or fixtures.              |
| production audit immutability    | `<follow-up-production-audit-immutability>`    | Accepted WORM/Object Lock or equivalent immutable audit design, hash-chain/archive evidence, retention posture, compliance restore evidence, and required two-key acceptance.                 |
| raw/export and masking launch    | `<follow-up-pii-masking-export>`               | Legal/privacy approval, field classification, redaction and masking profile, separate raw-view and export permissions, template allowlists, watermark or manifest, and download-log evidence. |
| production backup readiness      | `<follow-up-production-backup-readiness>`      | RTO/RPO, point-in-time recovery, cross-region restore if required, secrets recovery, snapshot consistency, and all-or-nothing restore evidence.                                               |
| ops, DLQ, replay, and support    | `<follow-up-operations-dlq-replay>`            | Support console boundary, DLQ and replay authorization, monitoring, alerting, failed-path cleanup, ticket/custody binding, and post-use review procedures.                                    |
| legal/privacy/two-key acceptance | `<follow-up-legal-privacy-two-key-acceptance>` | Named project-owner, legal, privacy, data-owner, maintainer, and counter-approver evidence where ADR 0000 requires two-key handling.                                                          |
| production-like readiness        | `<follow-up-production-like-readiness-review>` | Separate readiness review proving all production-like gates above and explicitly approving the stronger claim.                                                                                |

## Final Approval Boundary

This independent review does not grant final approval authority. The project
owner and required human or two-key reviewers remain the only authorities that
can accept practical-use, real-data, live-provider, legal/privacy, or
production-like readiness. Until those approvals and follow-up evidence exist,
the final gate result is bounded/non-production Go for MVP-A onboarding E2E
only.

## Closeout

P2A-03 can close as an independent practical-use readiness review with a
bounded/non-production-only verdict. Practical-use readiness and
production-like readiness remain blocked.

# MVP-A P2A-02 Independent Review Closeout

Issue: #191
Part of: #184
Depends on: #190
Review scope: MVP-A onboarding P2A-01 implementation evidence and P2A-02 gate
evidence after policy-as-code strengthening.
Review mode: independent repository closeout in a separate issue branch from
the implementation children. This closeout records repo-owned evidence only; it
does not replace maintainer, legal, privacy, security, or two-key approval.

## Readiness Verdict

- bounded/non-production MVP-A onboarding E2E: Go, limited to synthetic or
  explicitly approved non-production evidence.
- HR practical-use ready: Blocked.
- production-like ready: Blocked.

MVP-A remains bounded/non-production only. The repository evidence is strong
enough to review the synthetic onboarding path, but it is not an approval for
practical HR operations, real personnel data, live Okta tenants, production
audit guarantees, CSV/export, raw payload access, or legal/two-key acceptance.

## Reviewed Artifacts

| Review area                     | Artifact evidence                                                                                                                                                                                         | Review result                                                                                                                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| design and scope                | `docs/mvp-a-go-no-go.md`, `docs/mvp-a-onboarding-go-no-go-checklist.md`, ADR 0000, ADR 0002, ADR 0003, ADR 0020                                                                                           | The scope remains synthetic and bounded. Stronger readiness is explicitly blocked.                                                                                                                                          |
| P2A-01 implementation evidence  | issues #175-#182 as referenced by `docs/mvp-a-onboarding-go-no-go-checklist.md`; `src/onboarding-transaction-request.ts`; `src/synthetic-hire.ts`; `src/writeback-ingest.ts`; `src/persistence/schema.ts` | The onboarding request, approval, apply, future-date job, mock provider, writeback, refresh, and conflict path have repo-owned implementation and tests.                                                                    |
| P2A-02 traceability             | `docs/mvp-a-onboarding-traceability-closeout.md`; `src/mvp-a-onboarding-traceability.ts`; `GET /audit/mvp-a/onboarding-correlations/{correlationId}`                                                      | Directly linked correlation evidence exists for the bounded onboarding path without broad audit search or raw payload exposure.                                                                                             |
| authorization and data scope    | `docs/mvp-a-onboarding-evidence-authorization-gate.md`; `src/mvp-a-onboarding-evidence-authorization.ts`                                                                                                  | Field-scope and data-scope classifications are explicit for bounded evidence. Enterprise RBAC, RLS, tenant roles, and production authorization remain blocked by #11-class follow-up work.                                  |
| audit and backup                | `docs/mvp-a-onboarding-backup-restore-rehearsal-gate.md`; `src/mvp-a-onboarding-backup-restore-rehearsal.ts`; `src/mvp-a-onboarding-traceability.ts`                                                      | Local synthetic backup/restore rehearsal and bounded audit trace exist. WORM/Object Lock, hash-chain, archive, and production restore evidence remain blocked by #12-class follow-up work.                                  |
| privacy, export, and R08        | `docs/mvp-a-onboarding-pii-export-gate.md`; `docs/adr/0020-r08-prohibited-column-payload-policy-boundary.md`; `src/mvp-a-onboarding-pii-export-gate.ts`; `src/mvp-a-policy-as-code-ci.ts`                 | Raw payload viewing, CSV/export, download, regulated-data, and generic escape-hatch surfaces remain closed. Wider raw/export work remains blocked by #14-class follow-up work.                                              |
| policy-as-code                  | `src/mvp-a-policy-as-code-ci.test.ts`; `src/repository-guards.test.ts`; `npm run policy:mvp-a`; `npm run verify:pre-pr`                                                                                   | Current executable coverage checks the gate shape, Drizzle schema columns, committed migration column names, onboarding OpenAPI surfaces, and documentation guardrails. It does not claim a full parser or OPA/Rego engine. |
| Obsidian Phase2A progress notes | `docs/text-merge-pass-closeout.md` progress-note references and `docs/mvp-a-onboarding-go-no-go-checklist.md`                                                                                             | Repo-owned closeout references are consistent with the text-merge process: Obsidian progress notes are locator context, while repository docs and executable checks are the authoritative review evidence.                  |

## R08 and Core-Stability Evidence

- R08 prohibited surface: clean in current repo evidence. The focused
  `policy:mvp-a` command passed and checked current gate configuration, Drizzle schema
  columns, committed migration column names, and MVP-A onboarding OpenAPI routes
  and schemas.
- Core-stability boundary: clean in current repo evidence. ADR 0003 remains the
  schema and migration-shape authority, and the P2A-02 review did not introduce
  migrations, new core tables, raw payload storage, generic metadata escape
  hatches, or Future Extension runtime schema.
- Migration check: clean in current repo evidence. `npm run db:check` is part
  of `npm run verify:pre-pr` and passed in the final verification run.

## Verification Commands

Focused reproduction before closeout:

```sh
npm run policy:mvp-a
npm run build
```

Final verification:

```sh
npm run verify:pre-pr
```

The final command covers TypeScript build, MVP-A policy-as-code, tests,
formatting, dependency audit, and Drizzle migration/config checks.

## Residual Risks and Required Follow-Ups

| Residual risk                                                                                            | Blocking reference                                                             | Required next evidence                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| production authorization, actor/subject/tenant binding, field-level RBAC, and data-scope enforcement     | #11-class authorization and data-scope follow-up                               | Accepted authorization design plus service/runtime enforcement evidence.                                                                                           |
| production audit immutability and compliance-grade restore evidence                                      | #12-class audit immutability follow-up                                         | WORM/Object Lock or equivalent immutable audit design, hash-chain/archive evidence, and production restore evidence.                                               |
| raw payload viewing, CSV/export, download logs, watermark or manifest, masking, and real-data processing | #14-class raw/export/prohibited-payload follow-up                              | Legal/privacy approval, two-key acceptance where required, separate raw/export permissions, allowlists, masking, watermark or manifest, and download-log evidence. |
| real Okta tenant and live provider operation                                                             | provider-binding follow-up from `docs/mvp-a-onboarding-go-no-go-checklist.md`  | Explicit tenant binding, trusted credential source, webhook custody, secret rotation, and provider audit search evidence.                                          |
| production backup readiness                                                                              | production-backup follow-up from `docs/mvp-a-onboarding-go-no-go-checklist.md` | RTO/RPO, point-in-time recovery, cross-region expectations if required, secrets recovery, and all-or-nothing restore evidence.                                     |
| practical HR operator workflow                                                                           | practical-use follow-up from `docs/mvp-a-onboarding-go-no-go-checklist.md`     | HR workflow controls, support procedures, accepted non-production or real-data handling basis, and independent human review.                                       |

## Implementation and Design Mismatches

No mismatch blocks the bounded/non-production MVP-A review claim. The following
stronger claims remain mismatched with the current implementation and are not
waived:

- Claiming HR practical-use readiness would conflict with unresolved
  authorization and data-scope enforcement evidence in #11-class follow-up work.
- Claiming production-like audit readiness would conflict with unresolved
  WORM/Object Lock, hash-chain, archive, and compliance restore evidence in
  #12-class follow-up work.
- Claiming raw payload, CSV/export, download, masking, or real-data processing
  readiness would conflict with unresolved #14-class raw/export and prohibited
  payload evidence.
- Claiming live Okta readiness would conflict with the current mock-first
  provider contract and the provider-binding follow-up listed in the final
  onboarding checklist.

## Closeout

P2A-02 can close for bounded/non-production MVP-A onboarding review evidence
after `npm run verify:pre-pr` passes. Anything stronger than
bounded/non-production remains blocked until the follow-up issues above provide
accepted evidence and, where required, independent human or two-key approval.

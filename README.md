# HRCore

Open-source HR core system for identity-driven employee lifecycle management, onboarding workflows, approvals, audit trails, and HR-to-IdP automation.

This repository is currently at the baseline seed stage. It provides the minimum Fastify, Drizzle, and OpenAPI-first structure needed for later phases without implementing Phase 1 HR business workflows.

The initial backend stack decision is recorded in [ADR 0001: Initial Backend Stack](docs/adr/0001-initial-backend-stack.md). Fastify and Drizzle are the frozen PoC/MVP-A baseline unless a later accepted ADR supersedes that decision. The initial policy-as-code CI strategy is recorded in [ADR 0002: Policy-as-Code CI Strategy](docs/adr/0002-policy-as-code-ci-strategy.md). The MVP-A core stability contract is recorded in [ADR 0003: MVP-A Core Stability Contract](docs/adr/0003-mvp-a-core-stability-contract.md). The MVP-A agent cost-control boundary is recorded in [ADR 0004: Agent Execution Cost Cap and Automatic Stop Conditions](docs/adr/0004-agent-execution-cost-cap.md). The Proposed My Number non-storage boundary is recorded in [ADR 0005: My Number and Specific Personal Information Scope Boundary](docs/adr/0005-my-number-scope-boundary.md). The Proposed APPI processing-purpose and DSAR handling boundary is recorded in [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](docs/adr/0006-appi-processing-purpose-dsar-boundary.md). The Proposed sensitive personal information non-storage boundary is recorded in [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](docs/adr/0007-sensitive-personal-information-boundary.md). Issue execution ownership is defined in [Run-Mode Governance](docs/run-modes.md).
The Proposed leave of absence, childcare leave, and reduced working hours MVP-A/v1 boundary is recorded in [ADR 0008: Leave of Absence, Childcare Leave, and Reduced Working Hours MVP-A/v1 Handling Boundary](docs/adr/0008-leave-work-arrangement-boundary.md).
The Proposed retiree data retention period and physical deletion exception boundary is recorded in [ADR 0009: Retiree Data Retention Period and Physical Deletion Exception Boundary](docs/adr/0009-retiree-retention-physical-deletion-boundary.md).
The Proposed break-glass access and emergency local account MVP-A/v1 boundary is recorded in [ADR 0010: Break-Glass Access and Emergency Local Account MVP-A/v1 Boundary](docs/adr/0010-break-glass-emergency-access-boundary.md).
The Proposed data-scope policy DSL and PostgreSQL RLS MVP-A/v1 boundary is recorded in [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](docs/adr/0011-data-scope-policy-dsl-rls-boundary.md).
The Proposed audit event hash chain, WORM, and S3 Object Lock MVP-A/v1 boundary is recorded in [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](docs/adr/0012-audit-event-hash-chain-worm-object-lock-boundary.md).
The Proposed requester-equals-approver prevention DB, service, and verifier boundary is recorded in [ADR 0013: Requester-Equals-Approver Prevention DB, Service, and Verifier Boundary](docs/adr/0013-self-approval-prevention-boundary.md).
The Proposed raw payload and CSV export redaction, watermark, and download log boundary is recorded in [ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary](docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md).
The Proposed My Number and Specific Personal Information external-reference and separate-schema boundary is recorded in [ADR 0015: My Number and Specific Personal Information External Reference and Separate Schema Boundary](docs/adr/0015-my-number-external-reference-separate-schema-boundary.md).
The Proposed sensitive personal information privacy-classification, consent, and processing-purpose extension boundary is recorded in [ADR 0016: Sensitive Personal Information Privacy Classification, Consent, and Processing-Purpose Extension Boundary](docs/adr/0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary.md).
The Proposed employment-status-period and work-arrangement-period extension boundary is recorded in [ADR 0017: Employment Status and Work Arrangement Extension Boundary](docs/adr/0017-employment-status-work-arrangement-extension-boundary.md).
The Proposed retiree retention, anonymization, deletion-job, and retention-log extension boundary is recorded in [ADR 0018: Retiree Retention, Anonymization, Deletion Job, and Retention Log Extension Boundary](docs/adr/0018-retiree-retention-anonymization-deletion-job-retention-log-extension-boundary.md).
The Proposed legal-entity, timezone, business-calendar, and future-date apply worker extension boundary is recorded in [ADR 0019: Legal Entity Timezone and Business Calendar Extension Boundary](docs/adr/0019-legal-entity-timezone-business-calendar-extension-boundary.md).
The Proposed R08 prohibited column and prohibited payload policy boundary is recorded in [ADR 0020: R08 Prohibited Column and Payload Policy Boundary](docs/adr/0020-r08-prohibited-column-payload-policy-boundary.md).
Planning-note body merge procedure is defined in [Text-Merge Pass Procedure](docs/text-merge-pass.md).
The #82 text-merge evidence record is [Text-Merge Pass Closeout](docs/text-merge-pass-closeout.md).
Epic closeout review is defined in [Epic Completion Review](docs/epic-completion-review.md).
The Phase 1 Okta mastering PoC connection mode is defined in [Okta PoC Connection Contract](docs/okta-poc-connection-contract.md).
The MVP-A Go/No-Go scope boundary is defined in [MVP-A Go/No-Go Scope Boundary](docs/mvp-a-go-no-go-scope.md).
The post-MVP-A later-wave Ready boundary is defined in [Post-MVP-A Future Wave Readiness](docs/mvp-a-go-no-go-future-wave-readiness.md).
The final MVP-A Go/No-Go recommendation is recorded in [MVP-A Go/No-Go Decision](docs/mvp-a-go-no-go.md).
The MVP-A onboarding traceability closeout is recorded in [MVP-A Onboarding Traceability Closeout](docs/mvp-a-onboarding-traceability-closeout.md).
The bounded MVP-A onboarding evidence authorization gate is recorded in [MVP-A Onboarding Evidence Authorization Gate](docs/mvp-a-onboarding-evidence-authorization-gate.md).
The MVP-A onboarding PII masking, raw payload, and CSV/export closed gate is recorded in [MVP-A Onboarding PII Masking and Export Gate](docs/mvp-a-onboarding-pii-export-gate.md).
The MVP-A onboarding non-production data handling gate is recorded in [MVP-A Onboarding Non-Production Data Handling Gate](docs/mvp-a-onboarding-non-production-data-gate.md).
The MVP-A onboarding local synthetic backup / restore rehearsal gate is recorded in [MVP-A Onboarding Backup / Restore Rehearsal Gate](docs/mvp-a-onboarding-backup-restore-rehearsal-gate.md).
The final bounded/non-production MVP-A onboarding gate review checklist is recorded in [MVP-A Onboarding Go/No-Go Checklist](docs/mvp-a-onboarding-go-no-go-checklist.md).
The final P2A-02 independent implementation review closeout is recorded in [MVP-A P2A-02 Independent Review Closeout](docs/mvp-a-p2a-02-independent-review-closeout.md).
The final P2A-03 practical-use readiness review closeout is recorded in [MVP-A P2A-03 Practical-Use Readiness Review Closeout](docs/mvp-a-p2a-03-practical-use-readiness-review-closeout.md).
The final P2A-04 behavior-preserving refactor wave closeout is recorded in [MVP-A P2A-04 Refactor Wave Closeout](docs/mvp-a-p2a-04-refactor-wave-closeout.md).

## Baseline structure

- `src/app.ts` builds the Fastify application.
- `src/server.ts` starts the local HTTP server.
- `src/app.test.ts` contains the initial smoke tests.
- `openapi/hrcore.openapi.json` is the baseline OpenAPI contract source.
- `src/persistence/schema.ts` is the Drizzle schema entry point for later issues.
- `drizzle/` is the Drizzle migration output directory.
- `drizzle.config.ts` is a local Drizzle Kit configuration that defaults to a local SQLite file under `.local/`.
- `npm run db:check` runs the committed Drizzle Kit CLI against the local migration configuration.
- `docs/adr/0000-adr-process.md` defines ADR numbering, approver metadata, two-key handling, and precedence rules.
- `docs/adr/template.md` is the template for future ADRs.
- `docs/adr/0005-my-number-scope-boundary.md` records the Proposed MVP-A/v1 non-storage boundary for My Number and Specific Personal Information.
- `docs/adr/0006-appi-processing-purpose-dsar-boundary.md` records the Proposed APPI processing-purpose and DSAR handling boundary.
- `docs/adr/0007-sensitive-personal-information-boundary.md` records the Proposed MVP-A/v1 non-storage and no-escape-hatch boundary for sensitive personal information.
- `docs/adr/0008-leave-work-arrangement-boundary.md` records the Proposed MVP-A/v1 boundary for leave of absence, childcare leave, and reduced working hours.
- `docs/adr/0009-retiree-retention-physical-deletion-boundary.md` records the Proposed MVP-A/v1 boundary for retiree data retention periods and physical deletion exceptions.
- `docs/adr/0010-break-glass-emergency-access-boundary.md` records the Proposed MVP-A/v1 boundary for break-glass access and emergency local accounts.
- `docs/adr/0011-data-scope-policy-dsl-rls-boundary.md` records the Proposed MVP-A/v1 boundary for data-scope policy DSL handling and PostgreSQL RLS source-of-truth deferral.
- `docs/adr/0012-audit-event-hash-chain-worm-object-lock-boundary.md` records the Proposed MVP-A/v1 boundary for audit event hash-chain handling and WORM/S3 Object Lock deferral.
- `docs/adr/0013-self-approval-prevention-boundary.md` records the Proposed MVP-A/v1 boundary for requester-equals-approver prevention across service-authoritative runtime enforcement, database supporting guards, and verifier coverage.
- `docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md` records the Proposed MVP-A/v1 boundary for raw payload and CSV export redaction, watermark/traceability, and download-log/audit evidence.
- `docs/adr/0015-my-number-external-reference-separate-schema-boundary.md` records the Proposed future extension anchor for My Number and Specific Personal Information external references, vault references, separate schemas, separate services, and reference-only integration.
- `docs/adr/0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary.md` records the Proposed future extension anchor for sensitive personal information privacy classification, consent or lawful-handling basis, processing purpose, masking/redaction profile, export permission, audit evidence, and data-scope interaction.
- `docs/adr/0017-employment-status-work-arrangement-extension-boundary.md` records the Proposed future extension anchor for employment status periods, work arrangement periods, lifecycle-event linkage, primary/multiple handling, overlap constraints, correction/backdate handling, audit evidence, and privacy boundaries.
- `docs/adr/0018-retiree-retention-anonymization-deletion-job-retention-log-extension-boundary.md` records the Proposed future extension anchor for retiree retention policy, anonymization requests, deletion requests, legal hold, retention exceptions, system `retention_action_log`, human `audit_event`, shared `correlation_id` evidence, and no-runtime implementation boundaries.
- `docs/adr/0019-legal-entity-timezone-business-calendar-extension-boundary.md` records the Proposed future extension anchor for legal-entity timezone resolution, business-calendar ownership, future-date apply worker boundaries, audit evidence, replay/correction semantics, fail-closed defaults, and no-runtime implementation boundaries.
- `docs/adr/0020-r08-prohibited-column-payload-policy-boundary.md` records the Proposed R08 prohibited column and payload policy boundary, including the concrete prohibited list, repository guard baseline, and deferred parser/full-engine boundary.
- `docs/run-modes.md` defines the `run-mode/*` taxonomy and issue-label hygiene rules.
- `docs/text-merge-pass.md` defines the documentation text-merge procedure used
  by the later #82 pass.
- `docs/text-merge-pass-closeout.md` records the #82 text-merge pass evidence.
- `docs/okta-poc-connection-contract.md` records the mock-first Phase 1 Okta
  mastering PoC contract, local-only real tenant binding placeholders, and
  minimum synthetic user fixture shape.
- `docs/mvp-a-go-no-go-scope.md` records the MVP-A onboarding scope,
  exclusions, P0 gate classification, and real-data or production-like runtime
  blockers for the Go/No-Go package.
- `docs/mvp-a-go-no-go-future-wave-readiness.md` records the separate Ready
  conditions for MVP-B transfer, MVP-C termination, and MVP-D CSV/Ops/DLQ so
  later waves remain gated after MVP-A.
- `docs/mvp-a-go-no-go.md` records the final Conditional Go recommendation,
  residual risk classification, next Phase 2A issue wave, and gates that remain
  closed before production-like, real-data, live-provider, export, operational,
  or later-wave use.
- `docs/mvp-a-onboarding-traceability-closeout.md` records the MVP-A
  onboarding correlation trace evidence and P2A-02 production-like gates.
- `docs/mvp-a-onboarding-evidence-authorization-gate.md` records the bounded
  MVP-A field-level and data-scope classification gate for onboarding evidence.
- `docs/mvp-a-onboarding-pii-export-gate.md` records the MVP-A onboarding PII
  masking, raw payload, and CSV/export closed gate plus the remaining two-key
  ADR, masking, export-permission, watermark, download-log, and real-data
  dependencies.
- `docs/mvp-a-onboarding-non-production-data-gate.md` records the MVP-A
  onboarding non-production data handling gate, accepted evidence shapes,
  masking expectations, prohibited payload/API/fixture/seed drift checks, and
  the remaining #203 legal/privacy, data-owner, and two-key approval blockers.
- `docs/mvp-a-onboarding-backup-restore-rehearsal-gate.md` records the local
  synthetic backup / restore rehearsal gate, restored correlation verification,
  failed-restore rollback behavior, and remaining production backup-readiness
  gaps.
- `docs/mvp-a-onboarding-go-no-go-checklist.md` records the final
  bounded/non-production MVP-A onboarding Go/No-Go checklist, stronger-readiness
  blockers, and follow-up placeholders before practical-use or production-like
  claims.
- `docs/mvp-a-p2a-02-independent-review-closeout.md` records the independent
  MVP-A P2A-02 implementation review, R08/core-stability evidence, verification
  commands, residual risks, and bounded/non-production readiness verdict.
- `docs/mvp-a-p2a-03-practical-use-readiness-review-closeout.md` records the
  independent P2A-03 practical-use readiness review, verification commands,
  residual blockers, and bounded/non-production-only verdict after the
  non-production data handling follow-up wave.
- `docs/mvp-a-p2a-04-refactor-wave-closeout.md` records the independent P2A-04
  refactor wave review, completed module ownership splits, verification
  commands, residual cleanup risks, and behavior-preserving maintainability
  verdict.

## Local verification

Install dependencies from a clean checkout using the committed lockfile:

```sh
npm ci
```

Run the canonical local pre-PR verification command:

```sh
npm run verify:pre-pr
```

This is the repo-owned contract for supervised PR readiness before GitHub Actions
and branch protection are added in issue #64. It runs:

- TypeScript build: `npm run build`
- Smoke tests: `npm test`
- Formatting check: `npm run format:check`
- Dependency audit: `npm run audit`
- Drizzle migration/config check: `npm run db:check`

The command does not require provider credentials, a production database, cloud
accounts, HR provider services, or workstation-local paths. `npm run audit`
uses the configured npm registry for vulnerability data, so the canonical
command is not an offline-only check. The Drizzle check uses the local SQLite
default from `drizzle.config.ts` unless `DATABASE_URL` is set.

The individual checks remain available for focused local reproduction:

```sh
npm run build
npm test
npm run format:check
npm run audit
npm run db:check
```

Start the local server:

```sh
npm run dev
```

The smoke baseline exposes `GET /health` and `GET /openapi.json`. It does not require provider credentials, a production database, or any external service.

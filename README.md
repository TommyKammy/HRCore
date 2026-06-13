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
The current solo-maintainer / owner-acknowledged governance posture for Proposed two-key ADR anchors is recorded in [Solo-Maintainer Governance Posture](docs/solo-maintainer-governance.md).
The final solo-maintainer governance closeout is recorded in [P0-GOV-01 Solo-Maintainer Governance Closeout](docs/p0-gov-01-solo-maintainer-governance-closeout.md).
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
The bounded synthetic MVP-B transfer assignment apply behavior and deferred P0-R03/R08 gates are recorded in [MVP-B Transfer Assignment Apply Boundary](docs/mvp-b-transfer-assignment-apply-boundary.md).
The final P2A-02 independent implementation review closeout is recorded in [MVP-A P2A-02 Independent Review Closeout](docs/mvp-a-p2a-02-independent-review-closeout.md).
The final P2A-03 practical-use readiness review closeout is recorded in [MVP-A P2A-03 Practical-Use Readiness Review Closeout](docs/mvp-a-p2a-03-practical-use-readiness-review-closeout.md).
The final P2A-04 behavior-preserving refactor wave closeout is recorded in [MVP-A P2A-04 Refactor Wave Closeout](docs/mvp-a-p2a-04-refactor-wave-closeout.md).
The final P2A-05 high / medium priority behavior-preserving refactor wave closeout is recorded in [MVP-A P2A-05 Refactor Wave Closeout](docs/mvp-a-p2a-05-refactor-wave-closeout.md).
The final P2B-01 bounded/non-production MVP-B transfer readiness review closeout is recorded in [MVP-B P2B-01 Readiness Review Closeout](docs/mvp-b-p2b-01-readiness-review-closeout.md).
The final P2B-02 behavior-preserving transfer refactor wave closeout is recorded in [MVP-B P2B-02 Refactor Wave Closeout](docs/mvp-b-p2b-02-refactor-wave-closeout.md).
The final P2C-01 bounded/non-production MVP-C termination readiness review closeout is recorded in [MVP-C P2C-01 Readiness Review Closeout](docs/mvp-c-p2c-01-readiness-review-closeout.md).
The final P2C-02 behavior-preserving termination refactor wave closeout is recorded in [MVP-C P2C-02 Refactor Wave Closeout](docs/mvp-c-p2c-02-refactor-wave-closeout.md).
The bounded dry-run-only MVP-D CSV import contract is recorded in [MVP-D CSV Import Contract](docs/mvp-d-csv-import-contract.md).
The final P2D-01 bounded/non-production MVP-D CSV/Ops/DLQ readiness review closeout is recorded in [MVP-D P2D-01 Readiness Review Closeout](docs/mvp-d-p2d-01-readiness-review-closeout.md).
The final P2D-02 behavior-preserving MVP-D CSV/Ops/DLQ refactor wave closeout is recorded in [MVP-D P2D-02 Refactor Wave Closeout](docs/mvp-d-p2d-02-refactor-wave-closeout.md).
The P2X bounded/non-production HR practical-use gap assessment is recorded in [P2X HR Practical-Use Gap Assessment](docs/p2x-hr-practical-use-gap-assessment.md).
The P2X production-like blocker ledger is recorded in [P2X Production-Like Blocker Matrix](docs/p2x-production-like-blocker-matrix.md).
The P2X solo-maintainer governance boundary review is recorded in [P2X Solo-Maintainer Governance Boundary Review](docs/p2x-solo-maintainer-governance-boundary-review.md).
The final P2X-01 cross-suite closeout and next-wave recommendation is recorded in [P2X-01 Next-Wave Recommendation Closeout](docs/p2x-01-next-wave-recommendation-closeout.md).
The P2X local bounded operator review procedure is recorded in [P2X Local Bounded Operator Runbook](docs/p2x-local-bounded-operator-runbook.md).
The P2X synthetic practical-use rehearsal checklist is recorded in [P2X Synthetic Practical-Use Rehearsal Checklist](docs/p2x-synthetic-practical-use-rehearsal-checklist.md).
The P2X cross-flow audit and correlation lookup map is recorded in [P2X Cross-Flow Audit and Correlation Lookup Map](docs/p2x-cross-flow-audit-correlation-lookup-map.md).
The P2X synthetic test-data governance note is recorded in [P2X Synthetic Test-Data Governance](docs/p2x-synthetic-test-data-governance.md).
The final P2X-02 bounded practical-use follow-up closeout is recorded in [P2X-02 Bounded Practical-Use Follow-Up Closeout](docs/p2x-02-bounded-practical-use-follow-up-closeout.md).
The P2X-03 closeout stale wording and reference classification inventory is recorded in [P2X-03 Closeout Reference Inventory](docs/p2x-closeout-reference-inventory.md).
The final P2X-03 bounded closeout synchronization verdict is recorded in [P2X-03 Bounded Closeout Synchronization Independent Closeout](docs/p2x-03-bounded-closeout-synchronization-closeout.md).
The P2X-04 real data and legal/privacy prerequisite lane is recorded in [P2X-04 Real Data Legal Privacy Prerequisite Lane](docs/p2x-04-real-data-legal-privacy-prerequisite-lane.md).
The P2X-04 live provider custody and credential prerequisite lane is recorded in [P2X-04 Live Provider Custody Credential Prerequisite Lane](docs/p2x-04-live-provider-custody-credential-prerequisite-lane.md).
The P2X-04 production authorization and RLS prerequisite lane is recorded in [P2X-04 Production Authorization RLS Prerequisite Lane](docs/p2x-04-production-authorization-rls-prerequisite-lane.md).
The P2X-04 production audit immutability prerequisite lane is recorded in [P2X-04 Production Audit Immutability Prerequisite Lane](docs/p2x-04-production-audit-immutability-prerequisite-lane.md).
The P2X-04 raw payload and CSV export prerequisite lane is recorded in [P2X-04 Raw Payload CSV Export Prerequisite Lane](docs/p2x-04-raw-payload-csv-export-prerequisite-lane.md).
The P2X-04 production queue/DLQ and Ops prerequisite lane is recorded in [P2X-04 Production Queue DLQ Ops Prerequisite Lane](docs/p2x-04-production-queue-dlq-ops-prerequisite-lane.md).
The P2X-04 retention/deletion and future-extension prerequisite lane is recorded in [P2X-04 Retention Deletion Future Extension Prerequisite Lane](docs/p2x-04-retention-deletion-future-extension-prerequisite-lane.md).
The final P2X-04 production-like prerequisite decomposition closeout is recorded in [P2X-04 Production-Like Prerequisite Decomposition Independent Closeout](docs/p2x-04-production-like-prerequisite-decomposition-closeout.md).
The P2Y-00 WebUI practical-use planning and authorization map is recorded in [P2Y-00 WebUI Practical-Use Scope and Authorization Gate](docs/p2y-00-webui-practical-use-scope-authorization-gate.md).

Current P2X bounded status: P2X-02 is completed and Accepted as bounded
practical-use follow-up evidence only. The completed P2X-02 evidence set is the
closeout, local bounded operator runbook, synthetic practical-use rehearsal
checklist, cross-flow audit/correlation lookup map, and synthetic test-data
governance note. HR practical-use readiness and production-like readiness remain
blocked; next-wave references must keep bounded closeout synchronization /
narrow cleanup separate from production-like prerequisites, governance/two-key
evidence, and any later bounded practical-use extension. P2X-04 is completed as
a prerequisite decomposition closeout only. It keeps real-data use, live
provider custody, production authorization/RLS, production audit immutability,
raw payload and CSV export expansion, production queue/DLQ and Ops,
retention/deletion runtime, future-extension readiness, legal/privacy approval,
two-key approval, HR practical-use readiness, and production-like readiness
blocked.
The P2X-04 provider-custody prerequisite lane records missing evidence only. It
keeps live IdP/Okta operation, live provider traffic, provider credential
custody, webhook runtime custody, HR practical-use readiness, and
production-like readiness blocked.
The P2X-04 production authorization/RLS prerequisite lane records missing
evidence only. It keeps production RBAC authority, PostgreSQL RLS source of
truth, trusted proxy identity, support-console authority, HR practical-use
readiness, and production-like readiness blocked.
The P2X-04 production audit immutability prerequisite lane records missing
evidence only. It keeps WORM/Object Lock custody, compliance archive procedure,
broad audit search, support-console authority, HR practical-use readiness, and
production-like readiness blocked.
The P2X-04 raw payload and CSV export prerequisite lane records missing
evidence only. It keeps raw-view/export permissions, redaction or masking,
template allowlists, watermark or manifest evidence, download-log evidence,
broad CSV/export expansion, HR practical-use readiness, and production-like
readiness blocked.

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
- `docs/solo-maintainer-governance.md` records the solo-maintainer /
  owner-acknowledged governance posture for Proposed two-key ADR anchors and
  stronger-readiness blockers.
- `docs/p0-gov-01-solo-maintainer-governance-closeout.md` records the final
  P0-GOV-01 closeout posture: #11, #12, and #14 remain
  owner-acknowledged defer / production-like blocked until genuine independent
  or two-key authority is recorded.
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
- `docs/mvp-b-transfer-assignment-apply-boundary.md` records the bounded
  synthetic MVP-B transfer assignment apply behavior, deterministic assignment
  history evidence, collision guard, and deferred P0-R03/R08 production-grade
  constraints.
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
- `docs/mvp-a-p2a-05-refactor-wave-closeout.md` records the independent P2A-05
  high / medium priority refactor wave review, completed module ownership
  splits, verification commands, deferred low-priority surfaces, residual
  cleanup risks, and behavior-preserving maintainability verdict.
- `docs/mvp-b-p2b-01-readiness-review-closeout.md` records the independent
  P2B-01 bounded/non-production MVP-B transfer readiness review, child issue
  evidence, verification commands, residual stronger-readiness blockers, and
  blocked production-like verdict.
- `docs/mvp-b-p2b-02-refactor-wave-closeout.md` records the independent P2B-02
  transfer refactor wave review, completed module ownership splits,
  verification commands, residual cleanup risks, and behavior-preserving
  maintainability verdict.
- `docs/mvp-c-p2c-01-readiness-review-closeout.md` records the independent
  P2C-01 bounded/non-production MVP-C termination readiness review, child issue
  evidence, verification commands, residual stronger-readiness blockers,
  retention/deletion blockers, and blocked production-like verdict.
- `docs/mvp-c-p2c-02-refactor-wave-closeout.md` records the independent P2C-02
  termination refactor wave review, completed module ownership splits,
  verification commands, residual cleanup risks, and behavior-preserving
  maintainability verdict.
- `docs/mvp-d-csv-import-contract.md` records the bounded/non-production
  MVP-D CSV template, dry-run-only diff behavior, and fail-closed prohibited
  field boundary.
- `docs/mvp-d-p2d-01-readiness-review-closeout.md` records the independent
  P2D-01 bounded/non-production MVP-D CSV/Ops/DLQ readiness review, child issue
  evidence, verification commands, residual stronger-readiness blockers, and
  blocked production-like verdict.
- `docs/p2x-production-like-blocker-matrix.md` records the P2X
  production-like blocker ledger for real-data operation, live Okta/provider
  operation, production authorization/RLS, audit immutability, raw payload and
  CSV export, production scheduler/queue/DLQ, production ops, legal/privacy
  runtime, retention/deletion, future-extension surfaces, and required
  follow-up decision evidence.
- [P2X-04 Production Queue DLQ Ops Prerequisite Lane](docs/p2x-04-production-queue-dlq-ops-prerequisite-lane.md)
  records the production queue/DLQ and Ops prerequisite lane for scheduler
  ownership, queue/DLQ ownership, replay authorization, retry guardrails,
  monitoring, alerting, support-console custody, incident workflow, ticket
  binding, SLO/SLA, backup/restore, release/rollback, and post-use review
  evidence while keeping production operations and production-like readiness
  blocked.
- [P2X-04 Retention Deletion Future Extension Prerequisite Lane](docs/p2x-04-retention-deletion-future-extension-prerequisite-lane.md)
  records the retention/deletion and future-extension prerequisite lane for
  Accepted-status ADR evidence requirements, jurisdiction/legal-entity
  applicability, anonymization/hard-delete/legal-hold behavior, deletion-job
  custody, retention log, restore cleanup, no-orphan tests, extension scope
  records, migration/runtime authorization, and negative no-escape-hatch tests
  while keeping retention/deletion runtime and future-extension readiness
  blocked.
- [P2X-04 Production-Like Prerequisite Decomposition Independent Closeout](docs/p2x-04-production-like-prerequisite-decomposition-closeout.md)
  records the final independent closeout for P2X-04 after #372 through #378,
  accepts the wave as prerequisite decomposition evidence only, and keeps every
  production-like, HR practical-use, two-key, legal/privacy, real-data,
  live-provider, raw/export, queue/DLQ, retention/deletion, and future-extension
  readiness surface blocked.
- `docs/p2x-solo-maintainer-governance-boundary-review.md` records the P2X
  solo-maintainer governance boundary review for #11/#12/#14 and #240,
  preserving owner-acknowledged defer rather than Accepted two-key approval.
- `docs/p2x-01-next-wave-recommendation-closeout.md` records the final P2X-01
  cross-suite assessment verdict and historical safest bounded practical-use
  follow-up recommendation. After P2X-02, cite that recommendation as completed
  bounded follow-up evidence only, with later next-wave options kept separate.
- `docs/p2x-local-bounded-operator-runbook.md` records the P2X local bounded
  operator review map for synthetic or explicitly approved non-production
  MVP-A/B/C/D evidence, failed-path checks, cleanup expectations, and
  repo-relative verification commands.
- `docs/p2x-synthetic-practical-use-rehearsal-checklist.md` records the P2X
  synthetic practical-use rehearsal checklist for onboarding, transfer,
  termination, CSV/Ops/DLQ, audit lookup, failed-path, and cleanup evidence
  while keeping HR practical-use and production-like readiness blocked.
- `docs/p2x-cross-flow-audit-correlation-lookup-map.md` records the P2X
  cross-flow bounded audit and correlation lookup map for onboarding, transfer,
  termination, CSV import/export guard, local Ops job status, and DLQ
  decisions while keeping production audit readiness and production-like
  readiness blocked.
- `docs/p2x-closeout-reference-inventory.md` records the P2X-03 reference
  inventory for P2X-01/P2X-02, stale next-wave wording scan, recommended narrow
  cleanup, and blocked HR practical-use or production-like readiness boundary.
- P2X bounded status synchronization keeps the completed P2X-02 closeout and
  child artifacts discoverable while preserving the separate lanes for bounded
  closeout synchronization / narrow cleanup, production-like prerequisites,
  governance/two-key evidence, and bounded practical-use extension.
- P2X-03 bounded closeout synchronization is Accepted as narrow cleanup only;
  HR practical-use readiness and production-like readiness remain blocked.

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

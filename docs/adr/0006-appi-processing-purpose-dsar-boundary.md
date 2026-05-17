# ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary

## Status

Proposed

## Date

2026-05-17

## Decision owners

- Author: TommyKammy
- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.
- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.
- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.

## Depends on ADRs

- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)
- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)
- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)
- [ADR 0005: My Number and Specific Personal Information Scope Boundary](0005-my-number-scope-boundary.md)
- [Run-Mode Governance](../run-modes.md)

## Context

HRCore is still before PoC and MVP-A implementation. Before personal-data
processing surfaces expand through HR workflows, IdP provisioning, audit
evidence, support operations, provider adapters, or future AI surfaces, the
repository needs a durable privacy decision boundary for APPI processing
purposes and DSAR-style request handling.

ADR 0000 classifies unclear legal, privacy, data retention, auditability,
production operation, external provider trust, and compliance evidence decisions
as fail-closed two-key decisions. This ADR affects legal/privacy posture,
compliance evidence, data retention, auditability, external provider trust, and
future implementation boundaries. It therefore cannot become Accepted until the
ADR 0000 two-key metadata is complete.

ADR 0002 defines policy-as-code as the repository-owned verification strategy,
ADR 0003 prohibits hard-delete for core HR entities unless a later Accepted ADR
explicitly supersedes that rule, ADR 0005 keeps My Number and Specific Personal
Information outside HRCore core tables, and Run-Mode Governance keeps
legal/privacy decisions in the two-key lane.

The relevant planning notes already keep legal/privacy choices as decision
gates before implementation. The reviewed note paths for this issue are
`01_企画・構想/04_スコープ定義.md`, `04_データ・API/10_ER案.md`,
`04_データ・API/13_フィールドカタログ.md`, and
`05_実行計画/07_プロジェクト計画・ロードマップ.md`. They align with this
ADR because they identify HR, IdP, audit, provider, and future AI surfaces as
planning targets while leaving legal/privacy policy to dedicated decisions.

## Decision

HRCore must not add new personal-data processing surfaces unless the processing
purpose, request owner, audit evidence, and allowed data classes are documented
in an Accepted ADR or explicitly deferred by a Proposed two-key ADR.

The minimum repository planning categories for processing purposes are:

- HR administration/onboarding.
- IdP provisioning/writeback.
- audit/compliance evidence.
- support/operations.
- future analytics/AI as a later gate, not an MVP-A production processing
  purpose.

For each category, future implementation work must identify the owner of the
request or processing surface, the data classes allowed for that purpose, the
audit evidence that proves the purpose boundary, and any explicitly deferred
legal/privacy question. Missing purpose, ownership, evidence, or allowed-data
classification must fail closed.

DSAR-style request handling is a repository boundary, not an autonomous-agent
workflow. Future request handling must identify an accountable human owner,
request intake, identity verification outside autonomous agents, response
evidence, and request categories that HRCore must not silently ignore:
disclosure/access, correction, use suspension, deletion/erasure, and
retention/legal-hold conflict handling.

Deletion/erasure handling must not weaken ADR 0003 hard-delete restrictions.
Until a later Accepted ADR explicitly supersedes ADR 0003, DSAR-style
deletion/erasure handling must treat core HR entity physical deletion as
blocked or deferred when it conflicts with hard-delete restrictions, audit
requirements, retention requirements, or legal holds. Unresolved retention and
physical deletion exception rules remain deferred to #70.

AWS, Okta, Entra, SmartHR, Bedrock, and future providers require explicit
provider/privacy classification evidence before production use or real PII
processing. Required evidence must at least identify the provider, processing
purpose category, allowed data classes, integration owner, audit evidence,
environment boundary, and whether the provider may receive real PII. This ADR
defines the classification evidence required but does not decide production
vendor contracts.

Sensitive personal information details remain deferred to #68. Retention and
physical deletion exceptions remain deferred to #70. Privacy classification,
consent, and processing-purpose extension architecture remain deferred to #84.
Concrete policy-as-code prohibited payload rules remain deferred to #88.

Actual legal interpretation, statutory deadline commitments, counsel sign-off,
privacy notices, contractual wording, and production privacy operations remain
human/two-key responsibilities.

This ADR stays Proposed until ADR 0000 two-key evidence is complete: a named
Approver, a named independent Counter-approver, and a recorded Time-locked
review window. Placeholder approvers, role-only labels, TODOs, or the same
person serving as author, approver, and counter-approver are not sufficient for
Accepted status.

This ADR does not implement legal workflow screens, database migrations, OpenAPI
endpoints, DTOs, UI workflows, production jobs, provider integrations,
production secrets, external service dependencies, APPI/DSAR operational
procedures beyond this ADR boundary, or Phase 1 HR workflows.

## Consequences

- PoC and MVP-A implementation work must point personal-data processing changes
  to this ADR or a later Accepted superseding ADR instead of treating planning
  text or issue bodies as the privacy source of truth.
- Repository guard coverage can catch removal or weakening of this APPI/DSAR
  boundary before broader implementation work starts.
- Future implementation issues can use the processing-purpose categories and
  DSAR request categories as conceptual anchors, but they must not create schema,
  API, UI, provider, job, or production privacy-operation surfaces until their
  own issue and ADR boundaries allow it.
- This Proposed ADR records the intended boundary but does not become active
  Accepted repository policy until the ADR 0000 two-key approval metadata is
  complete.

## Supersedes

None

## Superseded by

None

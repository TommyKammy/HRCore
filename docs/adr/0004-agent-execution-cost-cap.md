# ADR 0004: Agent Execution Cost Cap and Automatic Stop Conditions

## Status

Accepted

## Date

2026-05-17

## Decision owners

- Author: TommyKammy
- Approver: TommyKammy
- Counter-approver: Not required because this decision documents MVP-A agent cost-control boundaries and stop criteria without enabling autonomous execution, adding production operations, changing security, identity, authorization, tenant boundaries, auditability, data retention, backup or restore semantics, external provider trust, irreversible migration shape, or compliance evidence.
- Time-locked review window: Not required because this decision does not require two-key handling.

## Depends on ADRs

- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)
- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)
- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)

## Context

HRCore uses Codex App and `codex-supervisor` to advance repository work before
MVP-A. That automation can consume local agent time, model budget, GitHub
Actions minutes, and reviewer attention. The repository therefore needs a
durable cost-control boundary before broader autonomous execution expands.

The current issue records the ADR and repository guard coverage only. It must
not introduce a billing provider integration, cost dashboard implementation,
cloud service dependency, provider mock, LocalStack or development AWS choice,
policy-as-code engine, Future Extension payload rule, production secret, legal
or privacy scope decision, or Phase 1 HR workflow.

## Decision

The MVP-A monthly agent execution budget is `JPY 30,000` for Codex App and
`codex-supervisor` driven repository work combined.

Broader autonomous execution must remain blocked if this value is replaced with
an unset placeholder, blank value, TODO, sample value, or operator-local note.
Changing the monthly cap requires a later Accepted ADR or a repository-owned
operator policy that explicitly references this ADR.

Agent execution must pause or stop when any of these conditions is observed:

- budget exhaustion or projected month-end overrun;
- repeated failed attempts on the same issue or verification target;
- repeated same blocker, including the same failing command, review gate,
  missing prerequisite, permission error, or unresolved dependency;
- failed local verification, including `npm run verify:pre-pr`, focused tests,
  or required build checks for the current issue;
- review-thread stalls, unresolved configured-bot comments, missing
  current-head review signal, or conversation-resolution blockers;
- unexpected external-service dependency, credential requirement, production
  database requirement, provider account requirement, cloud account
  requirement, or workstation-local path assumption;
- suspicious scope expansion beyond the issue boundary, including full
  dashboards, provider mocks, LocalStack or development AWS decisions,
  policy-engine implementation, Future Extension payload rules, legal/privacy
  decisions, production secrets, external services, or Phase 1 HR workflows in
  issues that did not authorize them.

When a stop or pause condition fires, the agent must preserve the local state
needed for review, update the issue journal or PR evidence with the observed
blocker, and avoid inferring success from partial progress. If the stop
condition is budget-related, the next execution requires an operator decision
or a later executable budget-control mechanism before resuming broad autonomous
work.

GitHub Actions concurrency reduces duplicate CI spend but does not replace
`npm run verify:pre-pr`. CI concurrency may cancel superseded runs for the same
branch or pull request, but it must not weaken the canonical local verification
gate, the required `verify-pre-pr` status check, current-head review
expectations, unresolved review-thread handling, or branch protection.

Branch protection must continue to require `verify-pre-pr` and conversation
resolution. Cost control is not a reason to bypass required CI, skip local
verification, suppress review gates, or merge with unresolved review comments.
When cost and verification conflict, the repository must pause execution rather
than weaken the required gate.

Cost dashboard work is advisory until a later Accepted ADR or implementation
issue makes it executable. During MVP-A, acceptable advisory dashboard inputs
include issue journal summaries, PR closeout evidence, GitHub Actions run
counts, canceled run counts, model or agent spend exports supplied by the
operator, and a monthly budget ledger or dashboard snapshot maintained outside
this repository.

Minimum closeout evidence for cost-related operator review includes:

- the exact local verification command and result;
- the issue or PR identifier;
- the ADR or policy path that governed the cost boundary;
- whether a stop or pause condition occurred;
- the reason execution continued after any stop condition, if it continued;
- GitHub Actions run outcome or concurrency cancellation notes when CI ran;
- monthly budget ledger or dashboard snapshot reference when available;
- confirmation that no full budget dashboard, billing integration, provider
  mock, LocalStack or development AWS decision, policy-as-code engine, Future
  Extension payload rule, legal or privacy scope decision, production secret,
  external service dependency, or Phase 1 HR workflow was added by the issue.

This issue records documentation and guard-test commitments only. Later issues
must implement executable budget checks, stop hooks, or dashboard integration
before treating these commitments as runtime enforcement. Until then, agent
operators and repository guard tests enforce discoverability and scope
discipline, while `verify-pre-pr`, branch protection, and review gates continue
to enforce repository readiness.

This ADR does not implement a full budget dashboard, billing integration,
provider mock, LocalStack or development AWS decision, policy-as-code engine,
Future Extension payload rule, legal or privacy scope decision, production
secret, external service dependency, or Phase 1 HR workflow.

## Consequences

- MVP-A automation has a concrete monthly budget cap before broader autonomous
  execution expands.
- Stop and pause conditions are explicit enough for issue journals, PR
  closeout, and later executable hooks to use without relying on issue-body
  inference.
- GitHub Actions concurrency can reduce duplicate spend while leaving
  `verify-pre-pr`, branch protection, and review expectations intact.
- Repository guard tests fail if this ADR or its core cost-control commitments
  disappear.
- Runtime enforcement, dashboard integration, and billing-provider integration
  remain future work instead of being partially implemented by this issue.

## Supersedes

None

## Superseded by

None

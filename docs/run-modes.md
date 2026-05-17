# Run-Mode Governance

This document defines the repository-owned run-mode taxonomy for HRCore issues.
Every Epic and Child issue must carry exactly one `run-mode/*` label before the
issue can be treated as execution-ready or complete. If an issue cannot be
safely labeled in the current pass, leave a concrete issue comment or follow-up
issue that records the ambiguity, owner, and next decision needed.

## Labels

Use `run-mode/agent` only for work an agent can complete without changing
governance, repository settings, production behavior, legal/privacy position,
security posture, data retention, auditability, or authoritative data shape.
Typical examples are mechanical formatting, narrow documentation pointers,
non-sensitive repository guard coverage, and read-only issue audits. The agent
still runs the required local verification and obeys ADR 0004 stop conditions.

Use `run-mode/human` for work whose output is primarily a human decision or
operator action and where an agent can only prepare evidence. Typical examples
are GitHub/settings changes that must be applied in the GitHub UI, business
scope choices that require accountable product ownership, legal counsel review,
contractual commitments, and production operations performed outside the
repository.

Use `run-mode/hybrid` for work where an agent may draft, implement, test, or
prepare evidence, but a human maintainer remains responsible for approval before
the result becomes repository policy or operational truth. Typical examples are
documentation-only ADR work that does not trigger ADR 0000 two-key handling,
ordinary code changes, provider-mock planning, LocalStack or development AWS
planning, CI or pull request template changes, policy-as-code strategy
documentation, and independent implementation review after an Epic completes.

Use `run-mode/two-key` for work that requires ADR 0000 two-key governance before
the decision is accepted or treated as complete. This includes legal/privacy
decisions, security-sensitive changes, production-impacting changes, tenant or
authorization boundary changes, auditability changes, data retention,
backup/restore semantics, external provider trust, irreversible migration shape,
and compliance evidence. When the classification is unclear, fail closed and use
`run-mode/two-key` until a repository-owned decision lowers the mode.

## Decision Criteria

Choose the most restrictive applicable mode:

1. If ADR 0000 requires a `Counter-approver` and `Time-locked review window`,
   use `run-mode/two-key`.
2. If the work changes production operations, security, legal/privacy,
   compliance evidence, data retention, backup/restore semantics, auditability,
   provider trust, tenant boundaries, authorization, or irreversible data shape,
   use `run-mode/two-key` unless an Accepted ADR explicitly narrows the boundary.
3. If the work must be performed manually by a repository operator or accountable
   non-agent owner, use `run-mode/human`.
4. If the agent can draft or implement the work but a maintainer must approve the
   result, use `run-mode/hybrid`.
5. Use `run-mode/agent` only when none of the higher-control cases apply.

Examples:

| Work type                                                      | Default run mode                      | Reason                                               |
| -------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| documentation-only ADR work without sensitive boundary changes | `run-mode/hybrid`                     | agent may draft, maintainer accepts                  |
| ordinary code changes covered by local tests and review        | `run-mode/hybrid`                     | agent may implement, maintainer reviews              |
| GitHub/settings changes                                        | `run-mode/human` or `run-mode/hybrid` | agent may document; operator applies settings        |
| legal/privacy decisions                                        | `run-mode/two-key`                    | ADR 0000 sensitive decision class                    |
| security-sensitive changes                                     | `run-mode/two-key`                    | ADR 0000 sensitive decision class                    |
| production-impacting changes                                   | `run-mode/two-key`                    | production operations require independent approval   |
| independent implementation review                              | `run-mode/hybrid`                     | agent can prepare evidence; human accepts completion |

## Governance Interactions

ADR 0000 controls two-key classification. A `run-mode/two-key` issue must not be
accepted only by the author or normal approver: the decision needs an independent
`Counter-approver` and a recorded `Time-locked review window`. Run-mode labels do
not weaken ADR 0000. If the ADR metadata and issue label disagree, fail closed,
repair the drift, and keep the more restrictive gate until the authoritative
record is corrected.

ADR 0004 cost-control stop conditions apply to every run mode. A lower run mode
does not allow an agent to continue through budget exhaustion, repeated failures,
failed local verification, review-thread stalls, unexpected external-service
dependencies, or suspicious scope expansion. When a stop condition fires, record
the blocker and pause rather than bypassing verification or review.

The current-head Codex review remains required where `codex-supervisor` is the
review gate. Run-mode labels describe who may execute or approve the work; they
do not replace current-head review, unresolved review-thread handling, or the
local `npm run verify:pre-pr` contract.

The branch protection policy remains authoritative for merge readiness. Run-mode labels do
not bypass the required `verify-pre-pr` status check, conversation resolution,
administrator enforcement, or later multi-maintainer review settings.

The Epic completion review is separate from child issue completion. An Epic labeled
`run-mode/hybrid` or `run-mode/two-key` still needs its documented completion
review before the Epic can be treated as done. Closing child issues is evidence,
not automatic Epic acceptance.

## Label Hygiene

Every Epic and Child issue must carry exactly one `run-mode/*` label. Multiple
run-mode labels are conflicting metadata and must be repaired before supervised
execution continues.

If a safe label cannot be assigned from current authoritative information, do
not guess from title shape alone. Record an explicit follow-up exception in the
issue with the missing signal, the safest provisional gate, and the owner who
can resolve it. The follow-up must be resolved before the issue is treated as
execution-ready.

Run-mode labels are issue-governance metadata. They do not authorize legal or
privacy policy, security controls, Future Extension schema decisions, provider
mocks, LocalStack or development AWS decisions, cost dashboard enforcement,
policy-as-code engine work, production secrets, external services, or Phase 1 HR
workflow implementation unless the issue scope and accepted repository decisions
also authorize that work.

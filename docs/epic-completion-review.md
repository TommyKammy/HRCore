# Epic Completion Review

Epic completion review is the repository-owned independent implementation
review that runs after an Epic's child issues finish and before the Epic is
accepted as complete. For this procedure, child issue closure is evidence for the review, not
automatic Epic acceptance.

## Required Trigger

Run this review when all of these signals are true:

- all intended child issues for the Epic are closed or explicitly deferred;
- merged PRs are present on `origin/main`;
- the parent Epic still needs completion acceptance; and
- no ADR, run-mode, branch-protection, review-thread, or local verification gate
  is still blocking the Epic from being reviewed.

If any child issue is deferred, the deferment must be explicit in the Epic or PR
closeout evidence and must state the owner, reason, and follow-up condition. A
missing child issue, unclear deferment, or stale PR reference blocks Epic
acceptance until repaired.

## Required Inputs

The reviewer must inspect and record evidence for:

- the parent Epic issue;
- the child issue list, including closed and explicitly deferred children;
- merged PRs for the Epic and confirmation that their commits are on
  `origin/main`;
- closeout evidence from child issues and implementation PRs;
- acceptance criteria from the parent Epic and children;
- local verification, including the exact command and result;
- current-head Codex Connector review signals for the merged PRs;
- unresolved review threads, including confirmation that none remain blocking;
- ADR and run-mode records, including ADR 0000 and the active `run-mode/*`
  labels;
- scope exclusions from the Epic and child issues; and
- explicit follow-up exceptions that remain after implementation.

The review must start from authoritative repository and GitHub state. Summaries,
badges, timeline text, generated handoffs, or issue prose can help locate
evidence, but they do not override the child issue set, merged PR state, ADRs,
run-mode governance, branch protection, review-thread state, or local
verification results.

## Output Format

Record the Epic completion review in the Epic closeout comment or other
repository-owned closeout record using this format:

```md
## Epic Completion Review

- Verdict: Accepted | Not accepted | Accepted with non-blocking follow-ups
- Blocking findings:
- Non-blocking follow-ups:
- Evidence links:
- Verification command and result:
- Epic acceptance recommendation:
```

`Verdict` is the reviewer's implementation-review result. `Epic acceptance
recommendation` must explicitly say whether the maintainer should accept or not
accept the Epic as complete. If the verdict is not accepted, list the blocking
findings and the next issue, PR, or operator action required before another
review.

## Reviewer Independence

In the current HRCore single-maintainer setup, this review does not require a
second write-access reviewer. The independent reviewer can be a separate Codex
review pass or implementation review pass, but it must not be the same
implementation attempt blindly self-accepting its own work.

The independent pass must reread the Epic, child issue set, merged PRs,
verification evidence, review signals, and governance records before making the
acceptance recommendation. Reusing implementation notes is allowed as evidence
only when the reviewer verifies the cited state directly.

When HRCore later enters multi-maintainer mode, branch protection and CODEOWNERS
may add a real second write-access approval requirement. That later setting can
strengthen this procedure, but single-maintainer mode must not invent a second
write-access reviewer requirement that would deadlock ordinary PRs.

## Governance Interactions

ADR 0000 two-key handling is still authoritative. If Epic completion would
accept a legal/privacy decision, security control, identity or authorization
boundary, tenant boundary, auditability change, data retention decision,
backup/restore semantic, production operation, external provider trust decision,
irreversible migration shape, or compliance evidence, the required ADR metadata,
counter-approval, and time-locked review window must already be present. Missing
two-key evidence blocks Epic acceptance.

ADR 0004 stop conditions still apply. Budget exhaustion, repeated failed
verification, repeated same blockers, missing current-head review, unresolved
review-thread stalls, unexpected external-service dependencies, credential
requirements, or suspicious scope expansion must be recorded as blockers instead
of being treated as completed work.

Branch protection remains the merge-readiness authority. Epic completion review
does not weaken the required `verify-pre-pr` status check, conversation
resolution, administrator enforcement, or future multi-maintainer review rules.

Current-head Codex Connector review remains part of the evidence set for
supervised development. A merged child PR with missing or stale current-head
review evidence can support implementation history, but the Epic review must
call out the missing signal and decide whether it is blocking under the active
repository policy.

Run-mode governance remains active for Epics and children. A lower
`run-mode/*` label does not bypass ADR 0000, ADR 0004, local verification,
branch protection, current-head Codex review, or unresolved review-thread
handling. Conflicting or missing run-mode labels must be repaired or recorded as
an explicit follow-up exception before acceptance.

The PR Child Issue Review Checklist verifies each child issue and PR closeout.
Epic completion review consumes that evidence, but it is a separate final review
of the Epic-level acceptance criteria, child issue set, deferred scope, and
remaining follow-ups.

## Scope Boundaries

This procedure does not implement legal/privacy policy, security controls,
Future Extension schema decisions, provider mocks, LocalStack or development AWS
decisions, cost dashboard enforcement, a full policy-as-code engine, production
secrets, external services, GitHub branch-protection setting changes, or Phase 1
HR workflow implementation.

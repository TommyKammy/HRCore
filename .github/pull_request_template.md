## Scope

- Part of issue:
- Child issue:
- Out-of-scope items confirmed:

## Child Issue Review Checklist

- [ ] Linked child issue:
- [ ] Parent Epic:
- [ ] Acceptance criteria coverage:
- [ ] Local verification:
- [ ] Closeout evidence:
- [ ] Unresolved follow-ups:
- [ ] Scope creep check: no unauthorized Phase 1 HR workflow implementation and
      no out-of-scope legal/privacy policy, security control, Future Extension
      schema decision, provider mock, LocalStack/dev AWS decision,
      cost-dashboard enforcement, policy-as-code engine, production secret,
      external service dependency, or GitHub branch-protection setting change.
- [ ] Phase 0 boundary: repository template, guard, ADR, governance, and
      verification work stays separate from Phase 1 HR workflow implementation.
- [ ] Run-mode label consistency: the linked child issue and parent Epic use the
      intended `run-mode/*` label, and the label does not bypass ADR 0000,
      ADR 0004, branch protection, current-head Codex review, or unresolved
      review-thread handling.
- [ ] ADR 0000 two-key handling: two-key decision classes remain blocked unless
      the required ADR metadata, counter-approval, and time-locked review window
      are present.
- [ ] Current-head Codex Connector review:
- [ ] Unresolved review threads:
- [ ] Epic completion review separation: child issue closure is evidence for
      Epic completion review, not automatic Epic acceptance.

## Verification

- [ ] `npm run verify:pre-pr`
- [ ] No provider mocks, LocalStack/dev AWS decision, stack-freeze ADR, issue-lint implementation, or Phase 1 HR workflow implementation added.

## Review Gate

- [ ] Required CI status check `verify-pre-pr` is expected to pass.
- [ ] Single-maintainer mode is active unless CODEOWNERS names at least two real
      write-access maintainers.
- [ ] Single-maintainer mode keeps active CODEOWNERS rules, CODEOWNERS review,
      and latest-push approval disabled to avoid a merge deadlock.
- [ ] Codex Connector current-head review and unresolved review threads are the
      required compensating review gate in single-maintainer mode.

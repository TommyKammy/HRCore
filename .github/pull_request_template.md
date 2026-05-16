## Scope

- Part of issue:
- Child issue:
- Out-of-scope items confirmed:

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

## Scope

- Part of issue:
- Child issue:
- Out-of-scope items confirmed:

## Verification

- [ ] `npm run verify:pre-pr`
- [ ] No provider mocks, LocalStack/dev AWS decision, stack-freeze ADR, issue-lint implementation, or Phase 1 HR workflow implementation added.

## Review Gate

- [ ] Required CI status check `verify-pre-pr` is expected to pass.
- [ ] CODEOWNERS review is required before merge.
- [ ] Branch protection with CODEOWNERS review and last-push approval will only
      be enabled after CODEOWNERS names at least two real write-access
      maintainers.
- [ ] Approval is from a reviewer who did not author or push the latest commit under review.

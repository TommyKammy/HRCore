# Main Branch Protection

This repository-owned policy defines the required protection for `main`. The
settings are applied by a repository operator because branch protection is not
fully enforced by files committed in a pull request.

## Required GitHub Actions Check

- Workflow: `CI`
- Required status check: `verify-pre-pr`
- Check contract: the workflow installs dependencies with `npm ci` and runs the
  canonical local readiness command, `npm run verify:pre-pr`.
- Target: pull requests into `main`.

## Required Review Policy

Configure `main` so every merge requires:

- A pull request before merging.
- At least one approving review.
- Stale approval dismissal when new commits are pushed.
- Review from Code Owners using `.github/CODEOWNERS`.
- Approval of the most recent reviewable push by someone other than the person
  who pushed it. This prevents the latest commit author or pusher from satisfying
  the review gate with self-approval.
- Passing required status check `verify-pre-pr` before merge.
- Conversation resolution before merge.

Do not relax these settings for provider mocks, LocalStack/dev AWS setup,
stack-freeze ADR work, issue-lint implementation, or Phase 1 HR workflow work.
Those scopes belong to separate issues.

## Operator Checklist

Apply the branch protection after this PR is merged or after the workflow status
check has appeared at least once for the repository:

```sh
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/TommyKammy/HRCore/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["verify-pre-pr"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "required_conversation_resolution": true
}
JSON
```

If applying through the GitHub UI, configure `Settings -> Branches -> Branch
protection rules -> main` with the setting names listed in the required review
policy above. Keep the required status check name exactly `verify-pre-pr`.

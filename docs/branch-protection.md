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

## Single-Maintainer Protection Policy

HRCore currently runs in single-maintainer mode. In this mode, GitHub cannot
technically enforce both Code Owner review and latest-push self-approval
prevention without creating a merge deadlock for PRs authored or pushed by the
sole maintainer.

Configure `main` so every merge requires:

- Passing required status check `verify-pre-pr` before merge.
- Strict required status checks so branches must be up to date before merge.
- Conversation resolution before merge.
- Branch protection enforcement for administrators.

Do not enable these settings in single-maintainer mode:

- `require_code_owner_reviews`
- `require_last_push_approval`
- required approving review count above `0`

Compensating controls in single-maintainer mode:

- `codex-supervisor` must continue to gate PRs on the current-head Codex
  Connector review signal and unresolved review threads.
- Every PR must include the issue link, verification evidence, and scope guard
  checklist from `.github/pull_request_template.md`.
- Epic completion must receive a separate implementation review before the epic
  is treated as done.
- Branch protection must still require the `verify-pre-pr` status check and
  conversation resolution.

## Multi-Maintainer Review Policy

Use this stricter policy only after adding a second real write-access maintainer
or team to the repository and to `.github/CODEOWNERS`.

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

## Second Code Owner Prerequisite

Do not enable `require_code_owner_reviews` together with
`require_last_push_approval` while `.github/CODEOWNERS` names only
`@TommyKammy`. That combination can deadlock PRs authored or last pushed by the
sole Code Owner, because the latest pusher cannot satisfy the required approval.

Before applying the protection rule below, a repository operator must:

1. Invite a second maintainer with write access to `TommyKammy/HRCore`.
2. Update `.github/CODEOWNERS` so the repository-wide rule names both real
   write-access maintainers, for example:

   ```text
   * @TommyKammy @<second-write-access-maintainer>
   ```

3. Confirm the second owner is a real GitHub user or team with write access. Do
   not use a placeholder, bot without approval authority, or account that cannot
   approve pull requests.

## Operator Checklist

Apply the single-maintainer branch protection after this PR is merged or after
the workflow status check has appeared at least once for the repository:

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
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_conversation_resolution": true
}
JSON
```

If applying through the GitHub UI, configure `Settings -> Branches -> Branch
protection rules -> main` with the setting names listed in the
single-maintainer protection policy above. Keep the required status check name
exactly `verify-pre-pr`.

After the second Code Owner prerequisite is complete, update this rule to the
multi-maintainer review policy by setting:

```json
{
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1,
    "require_last_push_approval": true
  }
}
```

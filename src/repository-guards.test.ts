import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const readRepoFile = (path: string): Promise<string> =>
  readFile(join(process.cwd(), path), "utf8");

test("GitHub Actions CI runs the canonical pre-PR verification command", async () => {
  const workflow = await readRepoFile(".github/workflows/ci.yml");

  assert.match(workflow, /^name: CI$/m);
  assert.match(workflow, /^\s+pull_request:$/m);
  assert.match(workflow, /^\s+merge_group:$/m);
  assert.match(workflow, /^\s+verify-pre-pr:$/m);
  assert.match(workflow, /^\s+node-version: "22"$/m);
  assert.match(workflow, /^\s+run: npm ci$/m);
  assert.match(workflow, /^\s+run: npm run verify:pre-pr$/m);
});

test("repository-owned review policy supports single-maintainer protection", async () => {
  const [codeowners, branchProtection, pullRequestTemplate] = await Promise.all(
    [
      readRepoFile(".github/CODEOWNERS"),
      readRepoFile("docs/branch-protection.md"),
      readRepoFile(".github/pull_request_template.md"),
    ],
  );

  const repositoryWideOwnershipRule = codeowners
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.startsWith("* "));

  assert.ok(
    repositoryWideOwnershipRule,
    "missing repository-wide CODEOWNERS rule",
  );
  assert.match(repositoryWideOwnershipRule, /(?:^|\s)@TommyKammy(?:\s|$)/u);
  assert.doesNotMatch(
    repositoryWideOwnershipRule,
    /<second-write-access-maintainer>/u,
    "active CODEOWNERS rule must not contain placeholder owners",
  );

  for (const requiredPolicyText of [
    "Required status check: `verify-pre-pr`",
    "HRCore currently runs in single-maintainer mode.",
    "Do not enable these settings in single-maintainer mode:",
    "`require_code_owner_reviews`",
    "`require_last_push_approval`",
    "required approving review count above `0`",
    "`codex-supervisor` must continue to gate PRs on the current-head Codex\n  Connector review signal and unresolved review threads.",
    '"required_pull_request_reviews": null',
    "Do not enable `require_code_owner_reviews` together with\n`require_last_push_approval` while `.github/CODEOWNERS` names only\n`@TommyKammy`.",
    "* @TommyKammy @<second-write-access-maintainer>",
    "Confirm the second owner is a real GitHub user or team with write access.",
    "Do\n   not use a placeholder, bot without approval authority, or account that cannot\n   approve pull requests.",
    '"require_code_owner_reviews": true',
    '"require_last_push_approval": true',
    '"required_approving_review_count": 1',
    '"contexts": ["verify-pre-pr"]',
  ]) {
    assert.ok(
      branchProtection.includes(requiredPolicyText),
      `missing branch protection policy text: ${requiredPolicyText}`,
    );
  }

  for (const requiredTemplateText of [
    "`npm run verify:pre-pr`",
    "Required CI status check `verify-pre-pr` is expected to pass.",
    "Single-maintainer mode is active unless CODEOWNERS names at least two real\n      write-access maintainers.",
    "Single-maintainer mode keeps CODEOWNERS review and latest-push approval\n      disabled to avoid a merge deadlock.",
    "Codex Connector current-head review and unresolved review threads are the\n      required compensating review gate in single-maintainer mode.",
  ]) {
    assert.ok(
      pullRequestTemplate.includes(requiredTemplateText),
      `missing PR template checklist text: ${requiredTemplateText}`,
    );
  }
});

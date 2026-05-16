import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readRepoFile = (path: string): Promise<string> =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("GitHub Actions CI runs the canonical pre-PR verification command", async () => {
  const workflow = await readRepoFile(".github/workflows/ci.yml");

  assert.match(workflow, /^name: CI$/m);
  assert.match(workflow, /^\s+pull_request:$/m);
  assert.match(workflow, /^\s+verify-pre-pr:$/m);
  assert.match(workflow, /^\s+node-version: "22"$/m);
  assert.match(workflow, /^\s+run: npm ci$/m);
  assert.match(workflow, /^\s+run: npm run verify:pre-pr$/m);
});

test("repository-owned review policy requires CODEOWNERS and anti-self-approval gates", async () => {
  const [codeowners, branchProtection, pullRequestTemplate] = await Promise.all(
    [
      readRepoFile(".github/CODEOWNERS"),
      readRepoFile("docs/branch-protection.md"),
      readRepoFile(".github/pull_request_template.md"),
    ],
  );

  assert.match(codeowners, /^\* @TommyKammy$/m);

  for (const requiredPolicyText of [
    "Required status check: `verify-pre-pr`",
    "At least one approving review.",
    "Stale approval dismissal when new commits are pushed.",
    "Review from Code Owners using `.github/CODEOWNERS`.",
    "Approval of the most recent reviewable push by someone other than the person\n  who pushed it.",
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
    "CODEOWNERS review is required before merge.",
    "Approval is from a reviewer who did not author or push the latest commit under review.",
  ]) {
    assert.ok(
      pullRequestTemplate.includes(requiredTemplateText),
      `missing PR template checklist text: ${requiredTemplateText}`,
    );
  }
});

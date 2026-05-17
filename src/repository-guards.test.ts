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

  const activeRepositoryWideOwnershipRule = codeowners
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.startsWith("* "));

  assert.equal(
    activeRepositoryWideOwnershipRule,
    undefined,
    "single-maintainer mode must not declare an active repository-wide CODEOWNERS rule",
  );
  assert.match(
    codeowners,
    /^# \* @TommyKammy @<second-write-access-maintainer-or-team>$/m,
  );

  for (const requiredPolicyText of [
    "Required status check: `verify-pre-pr`",
    "HRCore currently runs in single-maintainer mode.",
    "Do not enable these settings in single-maintainer mode:",
    "`require_code_owner_reviews`",
    "`require_last_push_approval`",
    "required approving review count above `0`",
    "`.github/CODEOWNERS` must not declare an active repository-wide sole-owner\n  rule.",
    "`codex-supervisor` must continue to gate PRs on the current-head Codex\n  Connector review signal and unresolved review threads.",
    '"required_pull_request_reviews": null',
    "Do not enable `require_code_owner_reviews` together with\n`require_last_push_approval` while `.github/CODEOWNERS` has no active\nmulti-maintainer rule or names only `@TommyKammy`.",
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
    "Single-maintainer mode keeps active CODEOWNERS rules, CODEOWNERS review,\n      and latest-push approval disabled to avoid a merge deadlock.",
    "Codex Connector current-head review and unresolved review threads are the\n      required compensating review gate in single-maintainer mode.",
  ]) {
    assert.ok(
      pullRequestTemplate.includes(requiredTemplateText),
      `missing PR template checklist text: ${requiredTemplateText}`,
    );
  }
});

test("initial backend stack decision freezes Fastify and Drizzle", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile("docs/adr/0001-initial-backend-stack.md"),
    readRepoFile("README.md"),
  ]);

  for (const requiredAdrText of [
    "# ADR 0001: Initial Backend Stack",
    "## Status\n\nAccepted",
    "## Date\n\n2026-05-16",
    "- Author: TommyKammy",
    "- Approver: TommyKammy",
    "- Counter-approver: Not required because this decision freezes the initial application framework and ORM/migration baseline without changing security, identity, authorization, tenant boundaries, auditability, data retention, production operations, provider trust, compliance evidence, or irreversible data shape.",
    "- Time-locked review window: Not required because this decision does not require two-key handling.",
    "## Depends on ADRs\n\nNone",
    "HRCore selects Fastify as the initial backend framework for PoC and MVP-A readiness.",
    "HRCore selects Drizzle as the initial ORM and migration baseline for PoC and MVP-A readiness.",
    "NestJS is deferred for the initial baseline.",
    "Prisma is deferred for the initial baseline.",
    "NestJS or Prisma may replace the selected baseline only through a later Accepted ADR that explicitly supersedes this ADR.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      adr.includes(requiredAdrText),
      `missing stack ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^- (Author|Approver):\s*<[^>]+>\s*$/m,
    "accepted ADR decision owners must be named, not placeholders",
  );

  assert.match(
    readme,
    /\[ADR 0001: Initial Backend Stack\]\(docs\/adr\/0001-initial-backend-stack\.md\)/,
  );
});

test("ADR template and process define governance metadata and precedence", async () => {
  const [template, process] = await Promise.all([
    readRepoFile("docs/adr/template.md"),
    readRepoFile("docs/adr/0000-adr-process.md"),
  ]);

  for (const requiredTemplateText of [
    "## Depends on ADRs",
    "None",
    "- Author:",
    "- Approver:",
    "- Counter-approver: Not required because <reason>, or <name>",
    "- Time-locked review window: Not required because <reason>, or <start> to <end>",
  ]) {
    assert.ok(
      template.includes(requiredTemplateText),
      `missing ADR template governance text: ${requiredTemplateText}`,
    );
  }

  assert.doesNotMatch(
    template,
    /^- Approver:\s*<[^>]+>\s*$/m,
    "ADR template must not model Accepted ADR metadata with an unresolved approver placeholder",
  );

  for (const requiredProcessText of [
    "Every ADR must include a `Depends on ADRs` section.",
    "Use `None` when the ADR has no ADR dependencies.",
    "Accepted ADRs must name an `Approver`.",
    "Counter-approver",
    "Time-locked review window",
    "Two-key handling is required for decisions that affect security, identity, authorization, tenant boundaries, auditability, data retention, backup or restore semantics, production operations, external provider trust, irreversible migration shape, or compliance evidence.",
    "newer Accepted ADRs supersede older Accepted ADRs",
    "Accepted ADRs override README text, issue bodies, planning notes, generated docs, local scripts, and implementation comments",
    "executable code and tests remain authoritative for observed runtime behavior",
  ]) {
    assert.ok(
      process.includes(requiredProcessText),
      `missing ADR process governance text: ${requiredProcessText}`,
    );
  }
});

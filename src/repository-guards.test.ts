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

test("policy-as-code CI strategy decision defines inspection surfaces and rule families", async () => {
  const adr = await readRepoFile("docs/adr/0002-policy-as-code-ci-strategy.md");

  for (const requiredAdrText of [
    "# ADR 0002: Policy-as-Code CI Strategy",
    "## Status\n\nAccepted",
    "- Author: TommyKammy",
    "- Approver: TommyKammy",
    "- Counter-approver: Not required because this baseline defines documented CI inspection strategy and repository guard discoverability without enabling, weakening, or bypassing runtime security, identity, authorization, tenant boundaries, auditability, data retention, production operations, external provider trust, irreversible migration shape, or compliance evidence.",
    "- Time-locked review window: Not required because this decision does not require two-key handling.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0001: Initial Backend Stack](0001-initial-backend-stack.md)",
    "`*.sql`",
    "`migrations/*`",
    "`src/**/*.ts`",
    "OpenAPI schema files",
    "PR diffs",
    "prohibited columns",
    "PII raw payload persistence",
    "export permission checks",
    "Regex checks are acceptable only for narrow lexical sentinels",
    "SQL parsing is required before CI treats SQL or migration structure as authoritative.",
    "ORM metadata inspection is required before CI treats Drizzle schema shape as authoritative.",
    "OpenAPI schema inspection is required before CI treats request, response, or export contract shape as authoritative.",
    "PR-diff-aware checks are required before CI limits findings to changed lines or new exposures.",
    "OPA/Rego is deferred until the first cross-surface policy needs shared rule evaluation.",
    "This ADR does not implement the #88 Future Extension prohibited payload rule set.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      adr.includes(requiredAdrText),
      `missing policy-as-code ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^- (Author|Approver|Counter-approver):\s*<[^>]+>\s*$/m,
    "accepted policy ADR decision owners must be named, not placeholders",
  );
});

test("MVP-A core stability contract defines stable identifiers and migration reservations", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile("docs/adr/0003-mvp-a-core-stability-contract.md"),
    readRepoFile("README.md"),
  ]);

  for (const requiredAdrText of [
    "# ADR 0003: MVP-A Core Stability Contract",
    "## Status\n\nAccepted",
    "- Author: TommyKammy",
    "- Approver: TommyKammy",
    "- Counter-approver: Not required because this contract freezes baseline schema and migration compatibility rules without changing live security, identity, authorization, tenant boundaries, auditability, data retention, backup or restore semantics, production operations, external provider trust, or compliance evidence.",
    "- Time-locked review window: Not required because this decision does not require two-key handling.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0001: Initial Backend Stack](0001-initial-backend-stack.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)",
    "All primary keys for core HR entities must use UUID values.",
    "Stable entity identifiers must not be changed in place.",
    "`entity_type` values must use `SCREAMING_SNAKE_CASE`.",
    "Hard-delete is prohibited for core HR entities unless a later Accepted ADR explicitly supersedes this rule.",
    "Existing enum values must not be redefined with a different meaning.",
    "Table or column renames must keep an alias, compatibility view, compatibility column, API translation layer, or documented migration bridge until dependent code and data have moved to the new name.",
    "Migration numbers `0001-0099` are reserved for core work.",
    "Migration numbers `0200+` are reserved for extension work.",
    "These invariants are policy-as-code rule commitments under ADR 0002.",
    "This ADR does not implement a full policy engine, OPA/Rego policy, broad data-model migration, Future Extension payload rule set, legal or privacy scope decision, provider mock, LocalStack or development AWS decision, agent cost-cap control, production secret, external service dependency, or Phase 1 HR workflow.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      adr.includes(requiredAdrText),
      `missing MVP-A core stability ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^- (Author|Approver|Counter-approver):\s*<[^>]+>\s*$/m,
    "accepted core stability ADR decision owners must be named, not placeholders",
  );

  assert.match(
    readme,
    /\[ADR 0003: MVP-A Core Stability Contract\]\(docs\/adr\/0003-mvp-a-core-stability-contract\.md\)/,
  );
});

test("agent execution cost-cap ADR defines MVP-A stop conditions and evidence", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile("docs/adr/0004-agent-execution-cost-cap.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0004: Agent Execution Cost Cap and Automatic Stop Conditions",
    "## Status\n\nAccepted",
    "- Author: TommyKammy",
    "- Approver: TommyKammy",
    "- Counter-approver: Not required because this decision documents MVP-A agent cost-control boundaries and stop criteria without enabling autonomous execution, adding production operations, changing security, identity, authorization, tenant boundaries, auditability, data retention, backup or restore semantics, external provider trust, irreversible migration shape, or compliance evidence.",
    "- Time-locked review window: Not required because this decision does not require two-key handling.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)",
    "The MVP-A monthly agent execution budget is `JPY 30,000` for Codex App and `codex-supervisor` driven repository work combined.",
    "Broader autonomous execution must remain blocked if this value is replaced with an unset placeholder, blank value, TODO, sample value, or operator-local note.",
    "budget exhaustion or projected month-end overrun",
    "repeated failed attempts",
    "repeated same blocker",
    "failed local verification",
    "review-thread stalls",
    "unexpected external-service dependency",
    "suspicious scope expansion beyond the issue boundary",
    "GitHub Actions concurrency reduces duplicate CI spend but does not replace `npm run verify:pre-pr`",
    "Branch protection must continue to require `verify-pre-pr` and conversation resolution",
    "Cost dashboard work is advisory until a later Accepted ADR or implementation issue makes it executable",
    "closeout evidence",
    "monthly budget ledger or dashboard snapshot",
    "This issue records documentation and guard-test commitments only.",
    "Later issues must implement executable budget checks, stop hooks, or dashboard integration before treating these commitments as runtime enforcement.",
    "This ADR does not implement a full budget dashboard, billing integration, provider mock, LocalStack or development AWS decision, policy-as-code engine, Future Extension payload rule, legal or privacy scope decision, production secret, external service dependency, or Phase 1 HR workflow.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing agent cost-cap ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^- (Author|Approver|Counter-approver):\s*<[^>]+>\s*$/m,
    "accepted cost-cap ADR decision owners must be named, not placeholders",
  );

  assert.match(
    readme,
    /\[ADR 0004: Agent Execution Cost Cap and Automatic Stop Conditions\]\(docs\/adr\/0004-agent-execution-cost-cap\.md\)/,
  );
});

test("run-mode governance defines taxonomy and issue-label expectations", async () => {
  const [runModes, readme] = await Promise.all([
    readRepoFile("docs/run-modes.md"),
    readRepoFile("README.md"),
  ]);

  for (const requiredText of [
    "# Run-Mode Governance",
    "`run-mode/agent`",
    "`run-mode/human`",
    "`run-mode/hybrid`",
    "`run-mode/two-key`",
    "documentation-only ADR work",
    "code changes",
    "GitHub/settings changes",
    "legal/privacy decisions",
    "security-sensitive changes",
    "production-impacting changes",
    "independent implementation review",
    "ADR 0000",
    "Counter-approver",
    "Time-locked review window",
    "ADR 0004",
    "cost-control stop conditions",
    "current-head Codex review",
    "branch protection",
    "Epic completion review",
    "Every Epic and Child issue must carry exactly one `run-mode/*` label",
    "explicit follow-up exception",
  ]) {
    assert.ok(
      runModes.includes(requiredText),
      `missing run-mode governance text: ${requiredText}`,
    );
  }

  assert.match(readme, /\[Run-Mode Governance\]\(docs\/run-modes\.md\)/);
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

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

test("runtime node:sqlite usage keeps the supported Node engine floor aligned", async () => {
  const [
    packageJsonText,
    packageLockJsonText,
    localSqliteSource,
    serverSource,
  ] = await Promise.all([
    readRepoFile("package.json"),
    readRepoFile("package-lock.json"),
    readRepoFile("src/local-sqlite.ts"),
    readRepoFile("src/server.ts"),
  ]);
  const packageJson = JSON.parse(packageJsonText) as {
    engines?: { node?: string };
  };
  const packageLockJson = JSON.parse(packageLockJsonText) as {
    packages?: { ""?: { engines?: { node?: string } } };
  };

  assert.match(localSqliteSource, /import\("node:sqlite"\)/u);
  assert.match(serverSource, /openLocalSyntheticWritebackDatabase/u);
  assert.equal(packageJson.engines?.node, ">=22.5.0");
  assert.equal(packageLockJson.packages?.[""]?.engines?.node, ">=22.5.0");
});

test("large onboarding tests use focused boundary files and shared helpers", async () => {
  const onboardingBoundaryTestPaths = [
    "src/onboarding-transaction-request-apply.test.ts",
    "src/onboarding-transaction-request-contract.test.ts",
    "src/onboarding-transaction-request-decision.test.ts",
    "src/onboarding-transaction-request-persistence.test.ts",
    "src/onboarding-transaction-request-worker.test.ts",
    "src/onboarding-transaction-request-writeback-retry.test.ts",
  ] as const;
  const [
    appTestSource,
    onboardingBoundaryTestSources,
    traceabilityTestSource,
    syntheticHireTestSource,
    writebackTestSource,
    databaseHelpers,
    onboardingHelpers,
  ] = await Promise.all([
    readRepoFile("src/app.test.ts"),
    Promise.all(onboardingBoundaryTestPaths.map((path) => readRepoFile(path))),
    readRepoFile("src/mvp-a-onboarding-traceability.test.ts"),
    readRepoFile("src/synthetic-hire.test.ts"),
    readRepoFile("src/writeback-ingest.test.ts"),
    readRepoFile("src/test-helpers/database.ts"),
    readRepoFile("src/test-helpers/onboarding.ts"),
  ]);

  assert.match(databaseHelpers, /export const openSchemaBackedDatabase/u);
  assert.match(databaseHelpers, /export const readCommittedMigrationSql/u);
  assert.match(onboardingHelpers, /export const workerAttemptCorrelationId/u);
  assert.match(
    onboardingHelpers,
    /export function recordSyntheticOnboardingApplyJobAttempt/u,
  );

  for (const [path, source] of [
    ...onboardingBoundaryTestPaths.map(
      (path, index) => [path, onboardingBoundaryTestSources[index]] as const,
    ),
    ["src/mvp-a-onboarding-traceability.test.ts", traceabilityTestSource],
    ["src/synthetic-hire.test.ts", syntheticHireTestSource],
    ["src/writeback-ingest.test.ts", writebackTestSource],
  ] as const) {
    assert.match(
      source,
      /from "\.\/test-helpers\/database\.js"/u,
      `${path} must import schema-backed database helpers`,
    );
    assert.doesNotMatch(
      source,
      /const openSchemaBackedDatabase = async/u,
      `${path} must not carry a local schema database helper copy`,
    );
    assert.doesNotMatch(
      source,
      /const readCommittedMigrationSql = async/u,
      `${path} must not carry a local migration SQL reader copy`,
    );
  }

  for (const [path, source] of [
    ...onboardingBoundaryTestPaths.map(
      (path, index) => [path, onboardingBoundaryTestSources[index]] as const,
    ),
    ["src/mvp-a-onboarding-traceability.test.ts", traceabilityTestSource],
  ] as const) {
    assert.match(
      source,
      /from "\.\/test-helpers\/onboarding\.js"/u,
      `${path} must import onboarding helper fixtures`,
    );
    assert.doesNotMatch(
      source,
      /const workerAttemptCorrelationId = \(/u,
      `${path} must not carry a local worker correlation helper copy`,
    );
  }

  assert.match(appTestSource, /from "\.\/test-helpers\/onboarding\.js"/u);
  assert.doesNotMatch(appTestSource, /const mvpAOnboardingAuditHeaders =/u);
  assert.doesNotMatch(
    appTestSource,
    /function recordSyntheticOnboardingApplyJobAttempt/u,
  );
});

test("synthetic work email writeback ingest stays split by responsibility", async () => {
  const modulePaths = [
    "src/writeback-ingest.ts",
    "src/writeback-ingest-types.ts",
    "src/writeback-ingest-input.ts",
    "src/writeback-ingest-provider-refresh.ts",
    "src/writeback-ingest-conflict-resolution.ts",
    "src/writeback-ingest-conflict-evidence.ts",
    "src/writeback-ingest-ids.ts",
    "src/writeback-ingest-sql.ts",
    "src/writeback-ingest-row-guards.ts",
    "src/writeback-ingest-validation.ts",
  ] as const;
  const sources = Object.fromEntries(
    await Promise.all(
      modulePaths.map(async (path) => [path, await readRepoFile(path)]),
    ),
  ) as Record<(typeof modulePaths)[number], string>;

  assert.match(sources["src/writeback-ingest.ts"], /export \{[\s\S]*\} from/u);
  assert.doesNotMatch(
    sources["src/writeback-ingest.ts"],
    /db\.prepare|SAVEPOINT|ROLLBACK TO SAVEPOINT/u,
    "public writeback ingest module must remain a stable export surface",
  );

  assert.match(
    sources["src/writeback-ingest-input.ts"],
    /export function ingestSyntheticWorkEmailWriteback/u,
  );
  assert.match(
    sources["src/writeback-ingest-provider-refresh.ts"],
    /export function refreshSyntheticWorkEmailFromProvider/u,
  );
  assert.match(
    sources["src/writeback-ingest-conflict-resolution.ts"],
    /export function resolveSyntheticWorkEmailConflict/u,
  );
  assert.match(
    sources["src/writeback-ingest-validation.ts"],
    /export function parseSyntheticWorkEmailWritebackInput/u,
  );
  assert.match(
    sources["src/writeback-ingest-validation.ts"],
    /export function parseSyntheticWorkEmailProviderRefreshInput/u,
  );
  assert.match(
    sources["src/writeback-ingest-validation.ts"],
    /export function parseSyntheticWorkEmailConflictResolutionInput/u,
  );
  assert.match(
    sources["src/writeback-ingest-sql.ts"],
    /export function insertSyntheticWorkEmailWritebackEvent/u,
  );
  assert.match(
    sources["src/writeback-ingest-sql.ts"],
    /export function rollbackNamedSavepoint/u,
  );
  assert.match(
    sources["src/writeback-ingest-row-guards.ts"],
    /export function isWritebackEventRefreshRow/u,
  );
  assert.match(
    sources["src/writeback-ingest-conflict-evidence.ts"],
    /export function createSyntheticWorkEmailConflictEvidence/u,
  );
  assert.match(
    sources["src/writeback-ingest-ids.ts"],
    /export function createSyntheticWorkEmailProviderRefreshId/u,
  );
});

test("synthetic hire behavior stays split by responsibility", async () => {
  const modulePaths = [
    "src/synthetic-hire.ts",
    "src/synthetic-hire-types.ts",
    "src/synthetic-hire-fixtures.ts",
    "src/synthetic-hire-validation.ts",
    "src/synthetic-hire-persistence.ts",
    "src/synthetic-hire-apply.ts",
    "src/synthetic-hire-future-date.ts",
  ] as const;
  const testPaths = [
    "src/synthetic-hire.test.ts",
    "src/synthetic-hire-request-persistence.test.ts",
    "src/synthetic-hire-apply.test.ts",
    "src/synthetic-hire-future-date.test.ts",
    "src/synthetic-hire-validation.test.ts",
  ] as const;
  const sources = Object.fromEntries(
    await Promise.all(
      [...modulePaths, ...testPaths].map(async (path) => [
        path,
        await readRepoFile(path),
      ]),
    ),
  ) as Record<
    (typeof modulePaths)[number] | (typeof testPaths)[number],
    string
  >;

  assert.match(sources["src/synthetic-hire.ts"], /export \* from/u);
  assert.doesNotMatch(
    sources["src/synthetic-hire.ts"],
    /db\.prepare|SAVEPOINT|ROLLBACK TO SAVEPOINT/u,
    "public synthetic hire module must remain a stable export surface",
  );
  assert.match(
    sources["src/synthetic-hire-fixtures.ts"],
    /export function createSyntheticHireFixture/u,
  );
  assert.match(
    sources["src/synthetic-hire-validation.ts"],
    /export function validateApplySyntheticHireRequest/u,
  );
  assert.match(
    sources["src/synthetic-hire-persistence.ts"],
    /export function saveSyntheticHireRequest/u,
  );
  assert.match(
    sources["src/synthetic-hire-apply.ts"],
    /export function applySyntheticHireRequest/u,
  );
  assert.match(
    sources["src/synthetic-hire-future-date.ts"],
    /export function applySyntheticFutureDateHireJob/u,
  );

  for (const path of testPaths) {
    assert.match(
      sources[path],
      /from "\.\/test-helpers\/database\.js"/u,
      `${path} must import schema-backed database helpers`,
    );
  }
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

test("pull request template preserves child issue review checklist", async () => {
  const pullRequestTemplate = await readRepoFile(
    ".github/pull_request_template.md",
  );

  for (const requiredTemplateText of [
    "## Child Issue Review Checklist",
    "Linked child issue:",
    "Parent Epic:",
    "Acceptance criteria coverage:",
    "Local verification:",
    "Closeout evidence:",
    "Unresolved follow-ups:",
    "Scope creep check:",
    "Phase 0 boundary:",
    "Run-mode label consistency:",
    "ADR 0000 two-key handling:",
    "Current-head Codex Connector review:",
    "Unresolved review threads:",
    "Epic completion review separation:",
  ]) {
    assert.ok(
      pullRequestTemplate.includes(requiredTemplateText),
      `missing child issue checklist text: ${requiredTemplateText}`,
    );
  }
});

test("Epic completion review procedure remains documented and discoverable", async () => {
  const [procedure, readme] = await Promise.all([
    readRepoFile("docs/epic-completion-review.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedProcedure = procedure.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# Epic Completion Review",
    "child issue closure is evidence",
    "not automatic Epic acceptance",
    "all intended child issues",
    "closed or explicitly deferred",
    "merged PRs are present on `origin/main`",
    "parent Epic issue",
    "child issue list",
    "merged PRs",
    "closeout evidence",
    "acceptance criteria",
    "local verification",
    "current-head Codex Connector review",
    "unresolved review threads",
    "ADR and run-mode records",
    "scope exclusions",
    "follow-up exceptions",
    "Verdict",
    "Blocking findings",
    "Non-blocking follow-ups",
    "Evidence links",
    "Verification command and result",
    "Epic acceptance recommendation",
    "separate Codex review pass",
    "must not be the same implementation attempt blindly self-accepting",
    "ADR 0000",
    "ADR 0004",
    "branch protection",
    "run-mode governance",
    "Child Issue Review Checklist",
  ]) {
    assert.ok(
      normalizedProcedure.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing Epic completion review procedure text: ${requiredText}`,
    );
  }

  assert.match(
    readme,
    /\[Epic Completion Review\]\(docs\/epic-completion-review\.md\)/,
  );
});

test("text-merge pass procedure remains documented and discoverable", async () => {
  const [procedure, readme] = await Promise.all([
    readRepoFile("docs/text-merge-pass.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedProcedure = procedure.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# Text-Merge Pass Procedure",
    "#82 performs the actual document-body merge work",
    "executable code and tests",
    "Accepted ADRs",
    "repository process docs",
    "Obsidian planning notes",
    "issue bodies",
    "generated notes",
    "Accepted ADRs take precedence over conflicting planning text",
    "repair the conflict",
    "record an explicit follow-up",
    "Trailing correction and review sections",
    "merge validated content into the relevant body text",
    "replace the trailing block with a stable ADR or repository-document reference",
    "concept and scope notes",
    "ER and data-model notes",
    "DDL and schema notes",
    "API and OpenAPI notes",
    "field catalog notes",
    "automation and supervisor strategy notes",
    "governance and review notes",
    "Future Extension architecture notes",
    "source note path",
    "decision/source authority used",
    "change summary",
    "unresolved follow-ups",
    "whether human approval is needed",
    "new legal, privacy, or security decision",
    "Future Extension schema decision",
    "unresolved ADR conflict",
    "missing owner or evidence for a two-key decision",
    "Phase 1 HR workflow scope",
    "ADR 0000",
    "ADR 0004",
    "run-mode governance",
    "Child Issue Review Checklist",
    "Epic completion review",
  ]) {
    assert.ok(
      normalizedProcedure.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing text-merge pass procedure text: ${requiredText}`,
    );
  }

  assert.match(
    readme,
    /\[Text-Merge Pass Procedure\]\(docs\/text-merge-pass\.md\)/,
  );
});

test("text-merge pass closeout remains documented and covers target classes", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile("docs/text-merge-pass-closeout.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# Text-Merge Pass Closeout",
    "Obsidian vault path:",
    "Run mode:",
    "human approval",
    "source note path",
    "decision/source authority used",
    "change summary",
    "unresolved follow-ups",
    "Concept and scope",
    "Governance and stakeholder",
    "Architecture and automation",
    "ER and data model",
    "Field catalog",
    "API and OpenAPI",
    "DDL and schema",
    "Execution planning",
    "Review and governance source notes",
    "Progress notes",
    "Deferred or stopped items",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing text-merge closeout evidence text: ${requiredText}`,
    );
  }

  assert.match(
    readme,
    /\[Text-Merge Pass Closeout\]\(docs\/text-merge-pass-closeout\.md\)/,
  );
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

test("My Number scope ADR preserves the MVP-A non-storage boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile("docs/adr/0005-my-number-scope-boundary.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0005: My Number and Specific Personal Information Scope Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0004: Agent Execution Cost Cap and Automatic Stop Conditions](0004-agent-execution-cost-cap.md)",
    "MVP-A and v1 must not store My Number or Specific Personal Information in HRCore core tables.",
    "`my_number`",
    "`individual_number`",
    "`specific_personal_information`",
    "OpenAPI contracts",
    "request or response DTOs",
    "seed data",
    "fixtures",
    "logs",
    "raw provider payload storage",
    "CSV export surfaces",
    "migration examples",
    "must not persist, expose, export, log, seed, fixture, or hide My Number or Specific Personal Information",
    "JSON",
    "note",
    "memo",
    "attachment",
    "raw payload",
    "audit fields",
    "Existing external systems remain the system of record",
    "future support requires a later Accepted two-key ADR",
    "external system, external vault, separate schema, separate service, or reference-only integration",
    "Detailed external-reference and separate-schema design is deferred to R08",
    "#83",
    "#88",
    "This ADR does not implement product features, database migrations, external vault integration, legal workflow screens, APPI or DSAR policy, R08 schema design, full policy-as-code enforcement, production secrets, external services, or Phase 1 HR workflows.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing My Number scope ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "My Number scope ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0005: My Number and Specific Personal Information Scope Boundary\]\(docs\/adr\/0005-my-number-scope-boundary\.md\)/,
  );
});

test("APPI processing-purpose and DSAR ADR preserves the privacy boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile("docs/adr/0006-appi-processing-purpose-dsar-boundary.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0005: My Number and Specific Personal Information Scope Boundary](0005-my-number-scope-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "HRCore must not add new personal-data processing surfaces unless the processing purpose, request owner, audit evidence, and allowed data classes are documented in an Accepted ADR or explicitly deferred by a Proposed two-key ADR.",
    "HR administration/onboarding",
    "IdP provisioning/writeback",
    "audit/compliance evidence",
    "support/operations",
    "future analytics/AI",
    "accountable human owner",
    "request intake",
    "identity verification outside autonomous agents",
    "response evidence",
    "disclosure/access",
    "correction",
    "use suspension",
    "deletion/erasure",
    "retention/legal-hold conflict handling",
    "Deletion/erasure handling must not weaken ADR 0003 hard-delete restrictions",
    "#70",
    "AWS",
    "Okta",
    "Entra",
    "SmartHR",
    "Bedrock",
    "future providers",
    "provider/privacy classification evidence",
    "This ADR defines the classification evidence required but does not decide production vendor contracts.",
    "#68",
    "#84",
    "#88",
    "Actual legal interpretation, statutory deadline commitments, counsel sign-off, privacy notices, contractual wording, and production privacy operations remain human/two-key responsibilities.",
    "This ADR does not implement legal workflow screens, database migrations, OpenAPI endpoints, DTOs, UI workflows, production jobs, provider integrations, production secrets, external service dependencies, APPI/DSAR operational procedures beyond this ADR boundary, or Phase 1 HR workflows.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing APPI/DSAR ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "APPI/DSAR ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary\]\(docs\/adr\/0006-appi-processing-purpose-dsar-boundary\.md\)/,
  );
});

test("sensitive personal information ADR preserves the MVP-A non-storage boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile("docs/adr/0007-sensitive-personal-information-boundary.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0005: My Number and Specific Personal Information Scope Boundary](0005-my-number-scope-boundary.md)\n- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "HRCore MVP-A and v1 must not store, expose, export, seed, fixture, log, or hide sensitive personal information",
    "core tables",
    "APIs",
    "DTOs",
    "raw provider payload storage",
    "CSV export surfaces",
    "audit payloads",
    "JSON",
    "notes",
    "memos",
    "attachments",
    "migration examples",
    "health/medical information",
    "disability information",
    "labor union membership",
    "harassment or disciplinary investigation records",
    "family origin/permanent domicile-style attributes",
    "equivalent local category that requires stricter consent, purpose, masking, audit, or access handling",
    "future support requires a later Accepted two-key ADR",
    "processing purpose",
    "consent or lawful handling basis",
    "field-level classification",
    "masking",
    "export permission",
    "audit evidence",
    "retention/deletion behavior",
    "accountable human owner",
    "`person.pii_level_code`",
    "generic PII flag alone is not sufficient",
    "`jsonb`",
    "`metadata`",
    "`note`",
    "`memo`",
    "`raw_payload`",
    "`audit_event`",
    "attachment blobs",
    "fixtures",
    "seed data",
    "`privacy_classification_rule`",
    "`privacy_consent`",
    "`processing_purpose`",
    "field-level mask policy",
    "export permission",
    "conceptual/deferred anchors",
    "#70",
    "#84",
    "#88",
    "This ADR does not implement sensitive-data fields, consent flows, production privacy operations, schema changes, legal workflow screens, OpenAPI endpoints, DTOs, UI workflows, provider integrations, privacy jobs, production secrets, external service dependencies, or Phase 1 HR workflow implementation.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing sensitive personal information ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "sensitive personal information ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0007: Sensitive Personal Information Classification and MVP-A\/v1 Handling Boundary\]\(docs\/adr\/0007-sensitive-personal-information-boundary\.md\)/,
  );
});

test("leave and work-arrangement ADR preserves the MVP-A boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile("docs/adr/0008-leave-work-arrangement-boundary.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0008: Leave of Absence, Childcare Leave, and Reduced Working Hours MVP-A/v1 Handling Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0005: My Number and Specific Personal Information Scope Boundary](0005-my-number-scope-boundary.md)\n- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)\n- [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](0007-sensitive-personal-information-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "HRCore MVP-A and v1 may model only the generic, non-sensitive employment or work-arrangement state needed for initial HR core onboarding, assignment, or IdP/writeback readiness.",
    "must not implement full leave-of-absence, childcare leave, reduced-hours, payroll, benefit, statutory deadline, eligibility, entitlement, medical/caregiving reason, disability, harassment, disciplinary, union, or detailed labor-case management workflows",
    "Any future support for leave of absence, childcare leave, or reduced working hours requires a later Accepted two-key ADR",
    "labor/legal purpose",
    "processing purpose",
    "sensitive-personal-information classification",
    "consent or lawful handling basis",
    "field-level masking",
    "export permission",
    "audit evidence",
    "retention/deletion behavior",
    "payroll/benefit boundary",
    "accountable human owner",
    "`employment_status`, `work_arrangement`, `lifecycle_event`, or a generic event/status flag alone is not sufficient",
    "Generic escape hatches must not be used to store detailed leave reasons, medical/caregiving facts, childcare facts beyond the approved boundary, disability facts, harassment or disciplinary investigation facts, union activity, or equivalent sensitive labor/privacy data.",
    "`jsonb`",
    "`metadata`",
    "`note`",
    "`memo`",
    "`raw_payload`",
    "`audit_event`",
    "attachment blobs",
    "CSV export columns",
    "fixtures",
    "seed data",
    "logs",
    "migration examples",
    "`employment_status`",
    "`work_arrangement`",
    "`lifecycle_event`",
    "`leave_case`",
    "`leave_reason`",
    "effective-dated work pattern",
    "conceptual/deferred anchors",
    "#85",
    "#84",
    "#88",
    "#70",
    "This ADR does not implement leave product behavior, database migrations, OpenAPI endpoints, DTOs, approval UI, payroll/benefit logic, provider integrations, privacy jobs, production secrets, external service dependencies, legal/labor operational procedures beyond this ADR boundary, or Phase 1 HR workflow implementation.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing leave/work-arrangement ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "leave/work-arrangement ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0008: Leave of Absence, Childcare Leave, and Reduced Working Hours MVP-A\/v1 Handling Boundary\]\(docs\/adr\/0008-leave-work-arrangement-boundary\.md\)/,
  );
});

test("retiree retention ADR preserves the MVP-A retention and physical deletion boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile(
      "docs/adr/0009-retiree-retention-physical-deletion-boundary.md",
    ),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0009: Retiree Data Retention Period and Physical Deletion Exception Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0005: My Number and Specific Personal Information Scope Boundary](0005-my-number-scope-boundary.md)\n- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)\n- [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](0007-sensitive-personal-information-boundary.md)\n- [ADR 0008: Leave of Absence, Childcare Leave, and Reduced Working Hours MVP-A/v1 Handling Boundary](0008-leave-work-arrangement-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "HRCore MVP-A and v1 must not encode production statutory retention periods, automatic purge schedules, anonymization schedules, physical deletion exceptions, legal-hold rules, payroll/benefit retention rules, or deletion approval workflows as executable behavior.",
    "ADR 0003 hard-delete restrictions remain in force for core HR entities unless a later Accepted two-key ADR explicitly supersedes or narrows them.",
    "Retired employee records may remain logically inactive or ended for MVP-A and v1 only where needed for initial HR core history, assignment, IdP/writeback readiness, auditability, and rollback-safe operation.",
    "Any future retention, anonymization, deletion, or physical deletion exception support requires a later Accepted two-key ADR",
    "legal basis",
    "retention period source",
    "jurisdiction/legal-entity applicability",
    "data category classification",
    "legal hold behavior",
    "deletion/anonymization trigger",
    "audit evidence",
    "rollback/recovery boundary",
    "approval authority",
    "accountable human owner",
    "`employment_status`, `termination_date`, `lifecycle_event`, `deleted_at`, `retention_until`, or a generic retention flag alone is not sufficient",
    "Generic escape hatches must not be used to hide retiree retention exceptions, legal hold state, deletion requests, anonymization state, or sensitive/legal retention facts.",
    "`jsonb`",
    "`metadata`",
    "`note`",
    "`memo`",
    "`raw_payload`",
    "`audit_event`",
    "attachment blobs",
    "CSV export columns",
    "fixtures",
    "seed data",
    "logs",
    "migration examples",
    "`retention_policy`",
    "`retention_action_log`",
    "`legal_hold`",
    "`deletion_request`",
    "`anonymization_event`",
    "`retention_until`",
    "`physical_delete_exception`",
    "conceptual/deferred anchors",
    "#86",
    "#84",
    "#88",
    "#85",
    "This ADR does not implement retention product behavior, database migrations, OpenAPI endpoints, DTOs, deletion/anonymization jobs, legal workflow screens, payroll/benefit retention logic, provider integrations, privacy jobs, production secrets, external service dependencies, production data-retention operations, or Phase 1 HR workflow implementation.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing retiree retention ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "retiree retention ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0009: Retiree Data Retention Period and Physical Deletion Exception Boundary\]\(docs\/adr\/0009-retiree-retention-physical-deletion-boundary\.md\)/,
  );
});

test("break-glass ADR preserves the MVP-A emergency access boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile("docs/adr/0010-break-glass-emergency-access-boundary.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0010: Break-Glass Access and Emergency Local Account MVP-A/v1 Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0004: Agent Execution Cost Cap and Automatic Stop Conditions](0004-agent-execution-cost-cap.md)\n- [Run-Mode Governance](../run-modes.md)",
    "HRCore MVP-A and v1 must not implement real emergency local accounts, hard-coded credentials, seed credentials, shared passwords, secret material, local bypass endpoints, unaudited administrator elevation, IdP bypass logic, or production break-glass runbooks as executable behavior.",
    "Any future emergency access support requires a later Accepted two-key ADR",
    "account count",
    "custody model",
    "credential storage location/classification",
    "MFA or equivalent compensating control",
    "activation criteria",
    "approval authority",
    "time limit",
    "revocation/rotation",
    "least-privilege scope",
    "network/source restrictions",
    "audit evidence",
    "alerting",
    "post-use review",
    "test cadence",
    "accountable human owner",
    "Break-glass access must be fail-closed by default",
    "absence of an Accepted ADR, named custodians, auditable activation evidence, and rotation/revocation procedure must block production emergency-access implementation",
    "`is_admin`",
    "`role=admin`",
    "local account flag",
    "environment variable",
    "seed user",
    "fixture user",
    "operator note",
    "Generic escape hatches must not be used to hide credentials, break-glass activation state, bypass decisions, emergency access approvals, or post-use review evidence.",
    "`jsonb`",
    "`metadata`",
    "`note`",
    "`memo`",
    "`raw_payload`",
    "`audit_event`",
    "attachment blobs",
    "CSV export columns",
    "fixtures",
    "seed data",
    "logs",
    "migration examples",
    "`.env` examples",
    "README snippets",
    "`break_glass_account`",
    "`emergency_access_request`",
    "`emergency_access_approval`",
    "`emergency_access_session`",
    "`credential_custody_record`",
    "`activation_evidence`",
    "`post_use_review`",
    "conceptual/deferred anchors",
    "#72",
    "#73",
    "#74",
    "#75",
    "#88",
    "This ADR does not implement emergency account product behavior, authentication code, IdP configuration, local bypass endpoints, seed credentials, `.env` secrets, database migrations, OpenAPI endpoints, DTOs, UI workflows, provider integrations, background jobs, production secrets, external service dependencies, production operations, or Phase 1 HR workflow implementation.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing break-glass ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "break-glass ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0010: Break-Glass Access and Emergency Local Account MVP-A\/v1 Boundary\]\(docs\/adr\/0010-break-glass-emergency-access-boundary\.md\)/,
  );
});

test("data-scope policy ADR preserves the MVP-A DSL and RLS boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile("docs/adr/0011-data-scope-policy-dsl-rls-boundary.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0004: Agent Execution Cost Cap and Automatic Stop Conditions](0004-agent-execution-cost-cap.md)\n- [ADR 0010: Break-Glass Access and Emergency Local Account MVP-A/v1 Boundary](0010-break-glass-emergency-access-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "HRCore MVP-A and v1 must not treat arbitrary `condition_jsonb`, free-form JSON, raw SQL fragments, user-authored expressions, tenant-supplied code, unchecked metadata, note or memo text, CSV columns, raw payloads, audit-event payloads, fixtures, seed data, logs, migration examples, `.env` examples, README snippets, or similar untyped surfaces as authorization policy.",
    "HRCore MVP-A and v1 should use a constrained, allowlisted, application-owned data-scope DSL as the planning baseline for `data_scope_policy.condition_jsonb`.",
    "PostgreSQL RLS must not be the MVP-A authorization source of truth until a later Accepted two-key ADR",
    "tenancy/session context",
    "connection-pool behavior",
    "migration/rollback semantics",
    "admin, batch, and job behavior",
    "bypass prevention",
    "test strategy",
    "operational debugging procedures",
    "RLS may remain a future defense-in-depth option",
    "application, service, and query-layer authorization remains required",
    "Data-scope checks must fail closed by default",
    "unknown scope type",
    "unknown operator",
    "unsupported field",
    "invalid schema version",
    "empty policy where a policy is required",
    "missing actor context",
    "missing legal-entity or department context",
    "parser error",
    "policy-evaluation error",
    "`is_admin`",
    "local admin flag",
    "role assignment",
    "UI route permission",
    "raw JSON blob",
    "operator comment",
    "scope dimensions",
    "operators",
    "subject or actor context",
    "target entity context",
    "legal entity",
    "department or organization",
    "employment or assignment relationship",
    "effective-date handling",
    "field or PII class",
    "export, raw-view, and audit-view capability markers",
    "schema versioning",
    "`data_scope_policy`",
    "`condition_jsonb`",
    "`data_scope_condition`",
    "`scope_dimension`",
    "`scope_operator`",
    "`actor_context`",
    "`target_context`",
    "`field_scope`",
    "`export_scope`",
    "`raw_payload_scope`",
    "`audit_log_scope`",
    "`policy_schema_version`",
    "`policy_evaluation_result`",
    "conceptual/deferred anchors",
    "#73",
    "#74",
    "#75",
    "#88",
    "Phase 2A",
    "This ADR stays Proposed until ADR 0000 two-key evidence is complete",
    "This ADR does not implement authorization runtime behavior, SQL migrations, RLS policies, query builders, APIs, DTOs, UI workflows, CSV export behavior, raw payload viewers, audit-log viewers, policy engines, OPA/Rego rules, production secrets, external service dependencies, production operations, or Phase 1 HR workflow implementation.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing data-scope policy ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "data-scope policy ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A\/v1 Boundary\]\(docs\/adr\/0011-data-scope-policy-dsl-rls-boundary\.md\)/,
  );
});

test("audit immutability ADR preserves the MVP-A hash-chain and WORM deferral boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile(
      "docs/adr/0012-audit-event-hash-chain-worm-object-lock-boundary.md",
    ),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0004: Agent Execution Cost Cap and Automatic Stop Conditions](0004-agent-execution-cost-cap.md)\n- [ADR 0010: Break-Glass Access and Emergency Local Account MVP-A/v1 Boundary](0010-break-glass-emergency-access-boundary.md)\n- [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](0011-data-scope-policy-dsl-rls-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "HRCore MVP-A and v1 must not claim audit immutability from an ordinary mutable database row, application log, CSV export, raw payload, metadata blob, note or memo text, fixture, seed data, migration comment, README snippet, or operator note alone.",
    "HRCore MVP-A and v1 should use append-only `audit_event` plus hash-chain and tamper-evidence semantics as the planning baseline for repository and application design.",
    "WORM storage, S3 Object Lock, external archive buckets, retention lock mode, legal hold, cross-account storage, replication, and production immutable evidence export must not be treated as implemented or selected until a later Accepted two-key ADR defines the production storage/provider boundary.",
    "S3 Object Lock may remain a future production-grade immutable archive option",
    "append-only audit behavior, canonical event hashing, chain verification, and tamper-evidence checks remain required design expectations",
    "Audit immutability checks must fail closed by default once implementation is authorized",
    "missing previous hash",
    "missing event hash",
    "unsupported hash algorithm",
    "non-canonical payload",
    "duplicate or skipped chain sequence",
    "broken chain",
    "changed historical payload",
    "missing actor, source, or correlation context",
    "clock rollback",
    "verification error",
    "`updated_at`",
    "`metadata_jsonb`",
    "`is_admin`",
    "object-storage path alone is not sufficient",
    "`audit_event`",
    "`previous_hash`",
    "`event_hash`",
    "`hash_algorithm`",
    "`canonical_event_payload`",
    "`audit_chain_scope`",
    "`audit_chain_sequence`",
    "`audit_chain_checkpoint`",
    "`audit_chain_verification_result`",
    "`external_audit_archive`",
    "`object_lock_retention`",
    "`legal_hold`",
    "`archive_manifest`",
    "`archive_evidence_uri`",
    "conceptual/deferred anchors",
    "#74",
    "#75",
    "#88",
    "#86",
    "Phase 2A",
    "This ADR stays Proposed until ADR 0000 two-key evidence is complete",
    "This ADR does not implement audit runtime behavior, database migrations, hash-chain code, WORM or S3 configuration, object storage integration, retention jobs, APIs, DTOs, UI workflows, export behavior, redaction behavior, policy engines, production secrets, external service dependencies, production operations, or Phase 1 HR workflow implementation.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing audit immutability ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "audit immutability ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A\/v1 Boundary\]\(docs\/adr\/0012-audit-event-hash-chain-worm-object-lock-boundary\.md\)/,
  );
});

test("self-approval prevention ADR preserves the MVP-A DB service verifier boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile("docs/adr/0013-self-approval-prevention-boundary.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0013: Requester-Equals-Approver Prevention DB, Service, and Verifier Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0004: Agent Execution Cost Cap and Automatic Stop Conditions](0004-agent-execution-cost-cap.md)\n- [ADR 0010: Break-Glass Access and Emergency Local Account MVP-A/v1 Boundary](0010-break-glass-emergency-access-boundary.md)\n- [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](0011-data-scope-policy-dsl-rls-boundary.md)\n- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "HRCore MVP-A and v1 must not allow the same effective actor to both submit or request and approve the same business transaction.",
    "The service or application approval command path is the authoritative enforcement point",
    "effective actor",
    "delegated approval context",
    "break-glass context",
    "role assignment",
    "request state",
    "workflow transition",
    "Database constraints are required as supporting fail-closed guards",
    "resolved user on an approval step or action",
    "DB constraints alone are not sufficient",
    "role-based approvers",
    "delegated approvers",
    "future routing rules",
    "break-glass review",
    "multi-step workflows",
    "Verifier and policy-as-code coverage is required",
    "schema, service, API, fixture, seed, and test changes",
    "verifier checks alone are not sufficient runtime enforcement",
    "Approval actions must fail closed once implementation is authorized",
    "missing, ambiguous, stale, mutable through an untyped surface, or unverifiable",
    "requester identity",
    "approver identity",
    "approval step binding",
    "transaction or request binding",
    "audit correlation",
    "`is_admin`",
    "HR role membership",
    "break-glass account",
    "operator comment",
    "`jsonb`",
    "`metadata`",
    "`note`",
    "`memo`",
    "`raw_payload`",
    "CSV row",
    "audit log entry alone must not be accepted as proof",
    "Break-glass and emergency access do not bypass the separation-of-duties rule",
    "later Accepted two-key ADR",
    "`transaction_request.submitter_user_id`",
    "`approval_step.approver_user_id`",
    "`approval_action.actor_user_id`",
    "`effective_actor_user_id`",
    "`delegated_actor_user_id`",
    "`approval_policy`",
    "`separation_of_duties_policy`",
    "`self_approval_violation`",
    "`approval_verification_result`",
    "`break_glass_context`",
    "`correlation_id`",
    "`audit_event`",
    "conceptual/deferred anchors",
    "#75",
    "#88",
    "#86",
    "Phase 2A",
    "This ADR stays Proposed until ADR 0000 two-key evidence is complete",
    "This ADR does not implement approval runtime behavior, database migrations, SQL constraints, triggers, service code, verifier code, APIs, DTOs, UI workflows, notification behavior, seed data, fixtures, production operations, or Phase 1 HR workflow implementation.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing self-approval ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "self-approval prevention ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0013: Requester-Equals-Approver Prevention DB, Service, and Verifier Boundary\]\(docs\/adr\/0013-self-approval-prevention-boundary\.md\)/,
  );
});

test("raw payload and CSV export ADR preserves redaction watermark download-log boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile(
      "docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md",
    ),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0004: Agent Execution Cost Cap and Automatic Stop Conditions](0004-agent-execution-cost-cap.md)\n- [ADR 0005: My Number and Specific Personal Information Scope Boundary](0005-my-number-scope-boundary.md)\n- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)\n- [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](0007-sensitive-personal-information-boundary.md)\n- [ADR 0010: Break-Glass Access and Emergency Local Account MVP-A/v1 Boundary](0010-break-glass-emergency-access-boundary.md)\n- [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](0011-data-scope-policy-dsl-rls-boundary.md)\n- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)\n- [ADR 0013: Requester-Equals-Approver Prevention DB, Service, and Verifier Boundary](0013-self-approval-prevention-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "HRCore MVP-A and v1 must treat raw payload viewing and CSV export as separate high-risk data-exfiltration surfaces",
    "not ordinary screen viewing or generic admin operations",
    "Raw provider, import, and export payloads are default-deny for viewing and download",
    "minimized or redacted before persistence, display, export, or download",
    "later Accepted two-key ADR",
    "CSV export requires explicit export permission",
    "separate from screen access, field access, raw-view access, audit-log access, HR role membership, and generic admin access",
    "data-scope filtering",
    "field classification",
    "redaction or masking rules",
    "export-template allowlists",
    "purpose and request ownership",
    "audit correlation",
    "watermark or equivalent traceability marker",
    "actor, timestamp, export job, request or correlation ID, template or scope, and redaction profile",
    "absence of traceability must fail closed",
    "durable audit evidence",
    "effective actor or delegation",
    "source surface",
    "row or object count",
    "watermark or manifest ID",
    "`is_admin`",
    "HR role membership",
    "break-glass account",
    "operator comment",
    "`jsonb`",
    "`metadata`",
    "`note`",
    "`memo`",
    "`raw_payload`",
    "CSV row",
    "audit log entry alone is not sufficient",
    "Break-glass and emergency access do not bypass raw-payload redaction, export permission, watermark, or download-log requirements",
    "Approval and self-approval boundaries from ADR 0013 do not authorize data export by themselves",
    "`export_permission`",
    "`raw_payload_view_permission`",
    "`audit_log_view_permission`",
    "`redaction_profile`",
    "`masking_rule`",
    "`export_template`",
    "`export_job`",
    "`export_file_manifest`",
    "`watermark_token`",
    "`download_log`",
    "`raw_payload_access_log`",
    "`export_download_log`",
    "`data_scope_policy`",
    "`pii_classification`",
    "`purpose_code`",
    "`request_owner`",
    "`correlation_id`",
    "`audit_event`",
    "conceptual/deferred anchors",
    "#88",
    "#86",
    "PII masking implementation",
    "Phase 2D",
    "This ADR stays Proposed until ADR 0000 two-key evidence is complete",
    "This ADR does not implement raw payload viewers, CSV export runtime behavior, export jobs, database migrations, SQL constraints, service code, verifier code, watermark generation, redaction logic, APIs, DTOs, UI workflows, file storage, production operations, or Phase 1 HR workflow implementation.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing raw payload/CSV export ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "raw payload/CSV export ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary\]\(docs\/adr\/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary\.md\)/,
  );
});

test("My Number extension-anchor ADR preserves external-reference and separate-schema boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile(
      "docs/adr/0015-my-number-external-reference-separate-schema-boundary.md",
    ),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0015: My Number and Specific Personal Information External Reference and Separate Schema Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0005: My Number and Specific Personal Information Scope Boundary](0005-my-number-scope-boundary.md)\n- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)\n- [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](0007-sensitive-personal-information-boundary.md)\n- [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](0011-data-scope-policy-dsl-rls-boundary.md)\n- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)\n- [ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary](0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "MVP-A and v1 core HR tables must not store My Number or Specific Personal Information",
    "must not hide My Number or Specific Personal Information in generic JSON, metadata, notes, raw provider payloads, audit payloads, logs, fixtures, seeds, attachments, or CSV exports",
    "future support must be loosely coupled from core HR tables",
    "external system of record",
    "external vault",
    "separate schema",
    "separate service",
    "reference-only integration",
    "opaque external reference",
    "must never be the raw My Number value",
    "purpose binding",
    "authorization",
    "audit evidence",
    "redaction",
    "download, export, and logging restrictions",
    "cross-schema or cross-service ownership boundary",
    "Resolving a reference must fail closed",
    "This ADR does not implement runtime features, database migrations, API endpoints, UI workflows, provider adapters, vault integration, secret handling, export jobs, retention jobs, or policy-as-code parser rules.",
    "This ADR stays Proposed until ADR 0000 two-key evidence is complete",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing My Number extension-anchor ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "My Number extension-anchor ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0015: My Number and Specific Personal Information External Reference and Separate Schema Boundary\]\(docs\/adr\/0015-my-number-external-reference-separate-schema-boundary\.md\)/,
  );
});

test("sensitive personal information extension-anchor ADR preserves privacy classification consent and purpose boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile(
      "docs/adr/0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary.md",
    ),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0016: Sensitive Personal Information Privacy Classification, Consent, and Processing-Purpose Extension Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)\n- [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](0007-sensitive-personal-information-boundary.md)\n- [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](0011-data-scope-policy-dsl-rls-boundary.md)\n- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)\n- [ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary](0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md)\n- [ADR 0015: My Number and Specific Personal Information External Reference and Separate Schema Boundary](0015-my-number-external-reference-separate-schema-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "MVP-A and v1 must not store, expose, export, seed, fixture, log, or hide sensitive personal information in core tables, APIs, DTOs, raw provider payloads, audit payloads, JSON, notes, memos, attachments, CSV exports, fixtures, seeds, logs, or migration examples",
    "privacy classification",
    "consent or lawful-handling basis",
    "processing purpose",
    "masking/redaction profile",
    "export permission",
    "audit evidence",
    "data-scope interaction",
    "loosely coupled extension",
    "must not authorize display, export, logging, download, persistence, provider replay, fixture generation, seed generation, CSV generation, attachment generation, audit-payload expansion, or migration generation",
    "generic classification flag",
    "consent metadata",
    "purpose text",
    "`jsonb`",
    "`metadata`",
    "`note`",
    "`memo`",
    "`raw_payload`",
    "`audit_event`",
    "concrete schema names",
    "Concrete schema, migrations, API shape, UI workflow, consent capture, DSAR operations, provider integration, retention jobs, and policy-as-code enforcement are deferred to later implementation issues or later Accepted ADRs.",
    "This ADR stays Proposed until ADR 0000 two-key evidence is complete",
    "This ADR does not implement runtime features, migrations, OpenAPI endpoints, DTOs, UI workflows, consent flows, provider integrations, privacy jobs, production secrets, external services, or policy-as-code parser rules.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing sensitive personal information extension ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "sensitive personal information extension ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0016: Sensitive Personal Information Privacy Classification, Consent, and Processing-Purpose Extension Boundary\]\(docs\/adr\/0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary\.md\)/,
  );
});

test("employment status and work-arrangement extension-anchor ADR preserves generation and period-overlap boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile(
      "docs/adr/0017-employment-status-work-arrangement-extension-boundary.md",
    ),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0017: Employment Status and Work Arrangement Extension Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)\n- [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](0007-sensitive-personal-information-boundary.md)\n- [ADR 0008: Leave of Absence, Childcare Leave, and Reduced Working Hours MVP-A/v1 Handling Boundary](0008-leave-work-arrangement-boundary.md)\n- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)\n- [ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary](0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md)\n- [ADR 0016: Sensitive Personal Information Privacy Classification, Consent, and Processing-Purpose Extension Boundary](0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "future support for leave of absence, childcare leave, reduced working hours, and similar work arrangements",
    "`employment_status_period`",
    "`work_arrangement_period`",
    "`lifecycle_event`",
    "lifecycle events are evidentiary triggers or derivation inputs, not the mutable source of truth for an active period",
    "employment status has one primary effective period per person and legal entity at a point in time",
    "multiple simultaneous work arrangements may exist only when each arrangement type and purpose is explicitly classified",
    "overlapping periods must be rejected unless a later Accepted ADR defines a deterministic resolution rule",
    "correction and backdate handling must preserve audit evidence",
    "Concrete schema, migrations, API shape, UI workflow, payroll/benefit behavior, provider integration, privacy jobs, retention jobs, and policy-as-code enforcement are deferred to later implementation issues or later Accepted ADRs.",
    "This ADR stays Proposed until ADR 0000 two-key evidence is complete",
    "This ADR does not implement runtime features, migrations, OpenAPI endpoints, DTOs, UI workflows, approval flows, payroll/benefit logic, provider integrations, privacy jobs, production secrets, external services, or policy-as-code parser rules.",
    "ADR 0008's MVP-A/v1 leave and work-arrangement boundary remains intact",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing employment status/work-arrangement extension ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "employment status/work-arrangement extension ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0017: Employment Status and Work Arrangement Extension Boundary\]\(docs\/adr\/0017-employment-status-work-arrangement-extension-boundary\.md\)/,
  );
});

test("retiree retention extension-anchor ADR preserves action-log audit-event and no-runtime boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile(
      "docs/adr/0018-retiree-retention-anonymization-deletion-job-retention-log-extension-boundary.md",
    ),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0018: Retiree Retention, Anonymization, Deletion Job, and Retention Log Extension Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)\n- [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](0007-sensitive-personal-information-boundary.md)\n- [ADR 0009: Retiree Data Retention Period and Physical Deletion Exception Boundary](0009-retiree-retention-physical-deletion-boundary.md)\n- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)\n- [ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary](0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md)\n- [ADR 0016: Sensitive Personal Information Privacy Classification, Consent, and Processing-Purpose Extension Boundary](0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary.md)\n- [ADR 0017: Employment Status and Work Arrangement Extension Boundary](0017-employment-status-work-arrangement-extension-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "ADR 0009's MVP-A/v1 retiree retention and physical deletion exception boundary remains intact",
    "`retention_policy`",
    "`anonymization_request`",
    "`deletion_request`",
    "`legal_hold`",
    "`retention_exception`",
    "`retention_action_log`",
    "`audit_event`",
    "`correlation_id`",
    "system-generated retention actions must be recorded in `retention_action_log`",
    "human operations must be recorded in `audit_event`",
    "When one workflow includes both system retention actions and human operations, the records must share a `correlation_id`",
    "Retention-action evidence is not a substitute for human audit evidence",
    "human audit evidence is not a substitute for system retention-action evidence",
    "Concrete schema, migrations, API shape, UI workflow, deletion/anonymization jobs, legal workflow, payroll/benefit retention behavior, provider integration, production operations, and policy-as-code enforcement are deferred to later implementation issues or later Accepted ADRs.",
    "This ADR stays Proposed until ADR 0000 two-key evidence is complete",
    "This ADR does not implement runtime features, migrations, OpenAPI endpoints, DTOs, UI workflows, deletion/anonymization jobs, legal workflow screens, payroll/benefit retention logic, provider integrations, production secrets, external services, or policy-as-code parser rules.",
    "ADR 0009's retiree retention and physical deletion exception boundary remains intact",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing retiree retention extension ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "retiree retention extension ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0018: Retiree Retention, Anonymization, Deletion Job, and Retention Log Extension Boundary\]\(docs\/adr\/0018-retiree-retention-anonymization-deletion-job-retention-log-extension-boundary\.md\)/,
  );
});

test("legal entity timezone and business-calendar extension-anchor ADR preserves future-date worker boundary", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile(
      "docs/adr/0019-legal-entity-timezone-business-calendar-extension-boundary.md",
    ),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0019: Legal Entity Timezone and Business Calendar Extension Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](0011-data-scope-policy-dsl-rls-boundary.md)\n- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)\n- [ADR 0017: Employment Status and Work Arrangement Extension Boundary](0017-employment-status-work-arrangement-extension-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "`legal_entity`",
    "`timezone_resolver`",
    "`business_calendar`",
    "`future_date_apply_worker`",
    "Future-date processing must not hard-code `Asia/Tokyo` as the universal runtime authority",
    "Timezone and business-calendar authority must be resolved through an explicit `legal_entity` or configured owner boundary",
    "Missing timezone authority, missing business-calendar authority, ambiguous legal-entity ownership, or unresolved calendar version must fail closed",
    "Future-date apply worker behavior is a design boundary only",
    "Audit evidence must bind the scheduled action, legal entity, timezone source, business-calendar source, effective date, worker identity, replay or correction reason, outcome, and `correlation_id`",
    "Replay and correction must not recompute historical outcomes from a changed timezone or calendar without preserving the original authority and a corrected replacement record",
    "Concrete schema, migrations, API shape, UI workflow, worker implementation, calendar library, calendar provider, provider integration, production operations, and policy-as-code enforcement are deferred to later implementation issues or later Accepted ADRs.",
    "This ADR stays Proposed until ADR 0000 two-key evidence is complete",
    "This ADR does not implement runtime features, migrations, OpenAPI endpoints, DTOs, UI workflows, future-date workers, calendar libraries, provider integrations, production secrets, external services, or policy-as-code parser rules.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing legal entity/timezone/business-calendar extension ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "legal entity/timezone/business-calendar extension ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0019: Legal Entity Timezone and Business Calendar Extension Boundary\]\(docs\/adr\/0019-legal-entity-timezone-business-calendar-extension-boundary\.md\)/,
  );
});

test("R08 prohibited column and payload policy boundary remains documented and discoverable", async () => {
  const [adr, readme] = await Promise.all([
    readRepoFile(
      "docs/adr/0020-r08-prohibited-column-payload-policy-boundary.md",
    ),
    readRepoFile("README.md"),
  ]);
  const normalizedAdr = adr.replace(/\s+/gu, " ").trim();

  for (const requiredAdrText of [
    "# ADR 0020: R08 Prohibited Column and Payload Policy Boundary",
    "## Status\n\nProposed",
    "- Author: TommyKammy",
    "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
    "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
    "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    "## Depends on ADRs\n\n- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)\n- [ADR 0002: Policy-as-Code CI Strategy](0002-policy-as-code-ci-strategy.md)\n- [ADR 0003: MVP-A Core Stability Contract](0003-mvp-a-core-stability-contract.md)\n- [ADR 0005: My Number and Specific Personal Information Scope Boundary](0005-my-number-scope-boundary.md)\n- [ADR 0006: APPI Processing-Purpose and DSAR Handling Boundary](0006-appi-processing-purpose-dsar-boundary.md)\n- [ADR 0007: Sensitive Personal Information Classification and MVP-A/v1 Handling Boundary](0007-sensitive-personal-information-boundary.md)\n- [ADR 0008: Leave of Absence, Childcare Leave, and Reduced Working Hours MVP-A/v1 Handling Boundary](0008-leave-work-arrangement-boundary.md)\n- [ADR 0009: Retiree Data Retention Period and Physical Deletion Exception Boundary](0009-retiree-retention-physical-deletion-boundary.md)\n- [ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary](0011-data-scope-policy-dsl-rls-boundary.md)\n- [ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary](0012-audit-event-hash-chain-worm-object-lock-boundary.md)\n- [ADR 0014: Raw Payload and CSV Export Redaction, Watermark, and Download Log Boundary](0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md)\n- [ADR 0015: My Number and Specific Personal Information External Reference and Separate Schema Boundary](0015-my-number-external-reference-separate-schema-boundary.md)\n- [ADR 0016: Sensitive Personal Information Privacy Classification, Consent, and Processing-Purpose Extension Boundary](0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary.md)\n- [ADR 0017: Employment Status and Work Arrangement Extension Boundary](0017-employment-status-work-arrangement-extension-boundary.md)\n- [ADR 0018: Retiree Retention, Anonymization, Deletion Job, and Retention Log Extension Boundary](0018-retiree-retention-anonymization-deletion-job-retention-log-extension-boundary.md)\n- [ADR 0019: Legal Entity Timezone and Business Calendar Extension Boundary](0019-legal-entity-timezone-business-calendar-extension-boundary.md)\n- [Run-Mode Governance](../run-modes.md)",
    "R08 prohibited list",
    "Number Act data",
    "My Number",
    "Specific Personal Information",
    "sensitive personal information",
    "privacy classification",
    "consent or lawful-handling basis",
    "processing purpose",
    "leave of absence",
    "childcare leave",
    "reduced working hours",
    "medical or caregiving reason",
    "retiree retention",
    "retention exception",
    "legal hold",
    "deletion request",
    "anonymization request",
    "raw provider payloads",
    "CSV exports",
    "audit payload expansion",
    "generic JSON",
    "`jsonb`",
    "`metadata`",
    "`note`",
    "`memo`",
    "fixtures",
    "seeds",
    "logs",
    "attachments",
    "migration examples",
    "OpenAPI contracts",
    "DTOs",
    "repository guard / documented policy baseline",
    "Regex or lexical checks are acceptable only for narrow sentinels",
    "SQL parsers, TypeScript AST analyzers, OpenAPI schema analyzers, PR-diff engines, and OPA/Rego remain deferred",
    "must not claim full policy-as-code enforcement",
    "This ADR stays Proposed until ADR 0000 two-key evidence is complete",
    "This ADR does not implement runtime features, migrations, OpenAPI endpoints, DTOs, UI workflows, provider integrations, production secrets, external services, Phase 1 HR workflows, SQL parsers, TypeScript AST analyzers, OPA/Rego rules, PR-diff engines, or broad runtime policy enforcement.",
    "## Supersedes\n\nNone",
    "## Superseded by\n\nNone",
  ]) {
    assert.ok(
      normalizedAdr.includes(requiredAdrText.replace(/\s+/gu, " ").trim()),
      `missing R08 prohibited policy ADR text: ${requiredAdrText}`,
    );
  }

  assert.doesNotMatch(
    adr,
    /^## Status\s+Accepted$/m,
    "R08 prohibited policy ADR must remain Proposed until two-key evidence is complete",
  );

  assert.match(
    readme,
    /\[ADR 0020: R08 Prohibited Column and Payload Policy Boundary\]\(docs\/adr\/0020-r08-prohibited-column-payload-policy-boundary\.md\)/,
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

test("Okta PoC connection contract keeps Phase 1 mock-first and synthetic", async () => {
  const [contract, readme] = await Promise.all([
    readRepoFile("docs/okta-poc-connection-contract.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedContract = contract.replace(/\s+/gu, " ").trim();
  for (const requiredText of [
    "# Okta PoC Connection Contract",
    "The runnable PoC default is mock-first.",
    "codex-supervisor and local pre-PR verification must run without a live Okta tenant, provider credentials, protected personnel data, or an external service dependency.",
    "Only synthetic or sanitized identity lifecycle data may be used in committed fixtures, examples, tests, and documentation.",
    "Real Okta verification tenant binding is operator-local only.",
    "must be supplied through local environment variables or local-only untracked configuration",
    "`HRCORE_<provider>_BASE_URL`",
    "`HRCORE_<provider>_CLIENT_ID`",
    "`HRCORE_<provider>_CLIENT_SECRET`",
    "Do not commit tenant URLs, credential values, bearer-token values, exported tenant metadata, `.env` files, or live personnel records.",
    "Minimum synthetic Okta user fixture shape",
    "`externalId`",
    "`employeeNumber`",
    "`email`",
    "`displayName`",
    "`givenName`",
    "`familyName`",
    "`status`",
    "`departmentCode`",
    "`managerExternalId`",
    "`effectiveAt`",
    "create",
    "update",
    "disable",
    "Minimum synthetic Okta group projection scope",
    "`groupKey`",
    "`externalId`",
    "`displayName`",
    "`purpose`",
    "`effectiveAt`",
    "`replace_user_groups`",
    "fails closed when a projection references a group key outside the predeclared synthetic group set",
    "Group projection in this PoC is not authorization.",
    "It does not implement RBAC, data-scope policy evaluation, approval routing, entitlements, group creation, group deletion, group hierarchy, group rules, production Okta group management, real tenant group sync, or database-backed tenant group state.",
    "ADR 0011 and ADR 0013 remain Proposed anchors for later authorization and approval boundaries only.",
    "This contract does not implement the Okta adapter, OpenAPI endpoints, database migrations, production secret handling, protected-data handling paths, or provider writeback runtime behavior.",
    "ADR 0005 through ADR 0020 remain Proposed unless their own files contain completed ADR 0000 two-key evidence.",
  ]) {
    assert.ok(
      normalizedContract.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing Okta PoC contract text: ${requiredText}`,
    );
  }

  assert.doesNotMatch(
    contract,
    /https:\/\/[^<\s)]+\.okta(?:preview)?\.com/u,
    "Okta PoC contract must not commit a concrete tenant URL",
  );
  assert.doesNotMatch(
    contract,
    /^## Status\s+Accepted$/m,
    "Okta PoC contract must not claim Proposed ADRs are Accepted",
  );
  assert.match(
    readme,
    /\[Okta PoC Connection Contract\]\(docs\/okta-poc-connection-contract\.md\)/,
  );
});

test("MVP-A Go/No-Go scope keeps onboarding boundary and deferred gates explicit", async () => {
  const [scope, readme] = await Promise.all([
    readRepoFile("docs/mvp-a-go-no-go-scope.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedScope = scope.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-A Go/No-Go Scope Boundary",
    "Status: Proposed for Go/No-Go package review.",
    "Part of: #157.",
    "Depends on: #158.",
    "minimum HRCore person, employment, assignment, contact-point, transaction-request, lifecycle-event, and audit evidence",
    "Mock-first Okta mastering behavior",
    "MVP-B transfer workflows",
    "MVP-C termination workflows",
    "MVP-D CSV/Ops/DLQ",
    "Production legal, labor, privacy, retention, consent, DSAR, My Number, Specific Personal Information, sensitive personal information",
    "Real provider commitments not proven by PoC",
    "Phase 2A implementation issue creation from this child",
    "MVP-A Go must not imply that MVP-B, MVP-C, or MVP-D are ready",
    "P0-R05 / #11 data-scope and authorization boundary",
    "Conditional-go control",
    "Real-data or production-like use requires an accepted authorization and data-scope gate",
    "P0-R06 / #12 audit immutability and production evidence boundary",
    "must not claim WORM, S3 Object Lock, hash-chain production immutability, or external archive readiness",
    "P0-R08 / #14 raw payload, CSV export, prohibited payload, and extension boundary",
    "Pre-MVP-A real-data blocker; later-wave implementation gate for CSV/Ops/DLQ",
    "accepted redaction, export permission, watermark or traceability, download-log, and prohibited-payload controls",
    "Required Before Real-Data Or Production-Like Runtime Use",
    "Missing, placeholder, malformed, or partially trusted evidence",
    "blocks production-like use",
    "must remain loosely coupled from core MVP-A onboarding",
    "Core MVP-A tables, DTOs, fixtures, logs, metadata, notes, raw payloads, audit payloads, and CSV surfaces must not become escape hatches",
  ]) {
    assert.ok(
      normalizedScope.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing MVP-A scope text: ${requiredText}`,
    );
  }

  assert.match(
    readme,
    /\[MVP-A Go\/No-Go Scope Boundary\]\(docs\/mvp-a-go-no-go-scope\.md\)/,
  );
});

test("post-MVP-A future wave readiness gates MVP-B/C/D separately", async () => {
  const [readiness, readme] = await Promise.all([
    readRepoFile("docs/mvp-a-go-no-go-future-wave-readiness.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedReadiness = readiness.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# Post-MVP-A Future Wave Readiness",
    "Status: Proposed for future-wave readiness review.",
    "Part of: #157.",
    "Depends on: #159.",
    "An MVP-A Go decision does not approve MVP-B, MVP-C, or MVP-D.",
    "MVP-B Transfer Ready Conditions",
    "transfer request, transfer approval, authoritative effective-date handling, assignment change, provider projection, writeback, conflict handling, and audit correlation",
    "MVP-C Termination Ready Conditions",
    "termination request, approval, effective-date handling, offboarding, deprovisioning, retention or legal-hold classification, post-termination access, and audit correlation",
    "MVP-D CSV/Ops/DLQ Ready Conditions",
    "raw-payload viewing, CSV export, export download, operational dead-letter queues, replay handling, support console behavior, watermark or manifest traceability, and download-log evidence",
    "Reusable Phase 1 PoC Evidence",
    "Wave-Specific Evidence That Must Be Newly Produced",
    "legal, labor, privacy, retention, consent, DSAR, My Number, Specific Personal Information, and sensitive personal information scope",
    "authorization, data-scope, audit immutability, raw-payload, CSV export, and prohibited-payload gates",
    "extension architecture",
    "operational evidence",
    "Later implementation issues for Phase 2B, Phase 2C, or Phase 2D must remain unopened or not-ready from this child",
  ]) {
    assert.ok(
      normalizedReadiness.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing future-wave readiness text: ${requiredText}`,
    );
  }

  assert.match(
    readme,
    /\[Post-MVP-A Future Wave Readiness\]\(docs\/mvp-a-go-no-go-future-wave-readiness\.md\)/,
  );
});

test("MVP-A Go/No-Go final decision classifies residual risks and next wave", async () => {
  const [decision, readme] = await Promise.all([
    readRepoFile("docs/mvp-a-go-no-go.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedDecision = decision.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-A Go/No-Go Decision",
    "Final recommendation: Conditional Go",
    "starting Phase 2A MVP-A onboarding issues",
    "does not authorize production use",
    "does not authorize real employee data",
    "does not authorize live provider traffic",
    "Blocker",
    "Conditional-go follow-up",
    "Backlog",
    "No MVP-A onboarding blocker remains at PoC depth",
    "P0-R05 / #11 authorization and data-scope enforcement",
    "P0-R06 / #12 production audit immutability",
    "P0-R08 / #14 raw payload, CSV export, prohibited payload, and extension controls",
    "MVP-B transfer readiness",
    "MVP-C termination readiness",
    "MVP-D CSV/Ops/DLQ readiness",
    "Next Issue Wave",
    "EPIC-P2A-MVP-A Onboarding Materialization",
    "P2A-01 Onboarding request intake and authoritative subject binding",
    "P2A-02 Idempotent onboarding lifecycle application and retry evidence",
    "P2A-03 Mock-first provider projection and work_email writeback integration",
    "P2A-04 Onboarding conflict resolution and direct correlation trace",
    "P2A-05 MVP-A onboarding closeout, gates, and non-production verification",
    "Gates That Must Remain Closed",
    "production-like runtime",
    "real-data",
  ]) {
    assert.ok(
      normalizedDecision.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing MVP-A final decision text: ${requiredText}`,
    );
  }

  assert.match(
    readme,
    /\[MVP-A Go\/No-Go Decision\]\(docs\/mvp-a-go-no-go\.md\)/,
  );
});

test("MVP-A onboarding Go/No-Go checklist separates bounded and stronger readiness", async () => {
  const [checklist, readme] = await Promise.all([
    readRepoFile("docs/mvp-a-onboarding-go-no-go-checklist.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedChecklist = checklist.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-A Onboarding Go/No-Go Checklist",
    "Status: Ready for final gate review.",
    "Part of: #184.",
    "Depends on: #188.",
    "This checklist does not approve production go-live",
    "Readiness Classification",
    "bounded/non-production",
    "practical-use-ready",
    "production-like-ready",
    "No-go until unblocked",
    "no-go",
    "P2A-01 implementation evidence",
    "issues #175-#182",
    "authorization and data-scope gate",
    "PII masking, raw payload, and CSV/export gate",
    "audit search gate",
    "backup / restore rehearsal",
    "policy-as-code gate",
    "independent review gate",
    "Bounded MVP-A E2E",
    "HR practical-use readiness",
    "Production-like readiness",
    "No-Go blockers",
    "Follow-Up Issues Before Stronger Than Bounded",
    "legal/two-key approvals",
    "real Okta tenant operation",
    "real personnel data",
    "CSV/export launch",
    "`npm run verify:pre-pr`",
  ]) {
    assert.ok(
      normalizedChecklist.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing MVP-A onboarding Go/No-Go checklist text: ${requiredText}`,
    );
  }

  assert.ok(
    !normalizedChecklist.includes("No-go until blocked"),
    "MVP-A onboarding Go/No-Go checklist must not invert blocker wording",
  );

  assert.match(
    readme,
    /\[MVP-A Onboarding Go\/No-Go Checklist\]\(docs\/mvp-a-onboarding-go-no-go-checklist\.md\)/,
  );
});

test("MVP-A P2A-02 independent review closeout records bounded readiness", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile("docs/mvp-a-p2a-02-independent-review-closeout.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-A P2A-02 Independent Review Closeout",
    "Issue: #191",
    "Part of: #184",
    "Depends on: #190",
    "Readiness Verdict",
    "bounded/non-production MVP-A onboarding E2E: Go",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "Reviewed Artifacts",
    "P2A-01 implementation evidence",
    "P2A-02 traceability",
    "authorization and data scope",
    "audit and backup",
    "privacy, export, and R08",
    "policy-as-code",
    "Obsidian Phase2A progress notes",
    "R08 and Core-Stability Evidence",
    "R08 prohibited surface: clean in current repo evidence",
    "Core-stability boundary: clean in current repo evidence",
    "Migration check: clean in current repo evidence",
    "Verification Commands",
    "npm run policy:mvp-a",
    "npm run verify:pre-pr",
    "Residual Risks and Required Follow-Ups",
    "#11-class authorization and data-scope follow-up",
    "#12-class audit immutability follow-up",
    "#14-class raw/export/prohibited-payload follow-up",
    "Implementation and Design Mismatches",
    "No mismatch blocks the bounded/non-production MVP-A review claim",
    "Closeout",
    "P2A-02 can close for bounded/non-production MVP-A onboarding review evidence",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2A-02 independent review closeout text: ${requiredText}`,
    );
  }

  assert.match(
    readme,
    /\[MVP-A P2A-02 Independent Review Closeout\]\(docs\/mvp-a-p2a-02-independent-review-closeout\.md\)/,
  );
});

test("MVP-A P2A-03 practical-use readiness review closeout keeps stronger gates blocked", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile(
      "docs/mvp-a-p2a-03-practical-use-readiness-review-closeout.md",
    ),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-A P2A-03 Practical-Use Readiness Review Closeout",
    "Issue: #204",
    "Part of: #199",
    "Depends on: #203",
    "Readiness Verdict",
    "bounded/non-production MVP-A onboarding E2E: Go",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "Reviewed Artifacts",
    "P2A-02 blocker review",
    "P2A-03 follow-up evidence",
    "MVP-A Go/No-Go checklist",
    "ADR 0000",
    "ADR 0002",
    "ADR 0003",
    "ADR 0011",
    "ADR 0014",
    "ADR 0020",
    "No Silent Surface Openings",
    "real-data",
    "live-provider",
    "broad audit search",
    "raw payload",
    "CSV/export",
    "production operations",
    "Verification Commands",
    "npm run policy:mvp-a",
    "npm run verify:pre-pr",
    "Residual Blockers",
    "<follow-up-provider-binding>",
    "<follow-up-production-audit-immutability>",
    "<follow-up-pii-masking-export>",
    "<follow-up-production-backup-readiness>",
    "<follow-up-operations-dlq-replay>",
    "<follow-up-legal-privacy-two-key-acceptance>",
    "Final Approval Boundary",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2A-03 practical-use readiness closeout text: ${requiredText}`,
    );
  }

  assert.match(
    readme,
    /\[MVP-A P2A-03 Practical-Use Readiness Review Closeout\]\(docs\/mvp-a-p2a-03-practical-use-readiness-review-closeout\.md\)/,
  );
});

test("MVP-A P2A-04 refactor wave closeout records behavior-preserving review", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile("docs/mvp-a-p2a-04-refactor-wave-closeout.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-A P2A-04 Refactor Wave Closeout",
    "Issue: #217",
    "Part of: #210",
    "Depends on: #216",
    "Readiness Verdict",
    "bounded/non-production MVP-A onboarding E2E: unchanged",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "Reviewed Refactor Artifacts",
    "Fastify app route modules",
    "onboarding transaction request boundaries",
    "Okta writeback integration",
    "policy-as-code CI helpers",
    "onboarding traceability verifier",
    "shared onboarding test helpers",
    "Behavior and Boundary Review",
    "No behavior drift, API drift, policy weakening, or readiness-claim broadening was accepted",
    "Verification Commands",
    "npm run verify:pre-pr",
    "Residual Refactor Debt",
    "Final Verdict",
    "P2A-04 can close as behavior-preserving maintainability hardening",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2A-04 refactor wave closeout text: ${requiredText}`,
    );
  }

  assert.match(
    readme,
    /\[MVP-A P2A-04 Refactor Wave Closeout\]\(docs\/mvp-a-p2a-04-refactor-wave-closeout\.md\)/,
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

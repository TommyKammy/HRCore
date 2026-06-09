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

test("MVP-B transfer transaction request facade stays split by responsibility", async () => {
  const modulePaths = [
    "src/transfer-transaction-request.ts",
    "src/transfer-transaction-request-contract.ts",
    "src/transfer-transaction-request-persistence.ts",
    "src/transfer-transaction-request-decision.ts",
    "src/transfer-transaction-request-apply.ts",
    "src/transfer-okta-projection-integration.ts",
    "src/transfer-transaction-request-worker.ts",
  ] as const;
  const sources = Object.fromEntries(
    await Promise.all(
      modulePaths.map(async (path) => [path, await readRepoFile(path)]),
    ),
  ) as Record<(typeof modulePaths)[number], string>;

  assert.match(
    sources["src/transfer-transaction-request.ts"],
    /from "\.\/transfer-transaction-request-persistence\.js"/u,
  );
  assert.match(
    sources["src/transfer-transaction-request.ts"],
    /from "\.\/transfer-transaction-request-decision\.js"/u,
  );
  assert.doesNotMatch(
    sources["src/transfer-transaction-request.ts"],
    /export function saveTransferTransactionRequest/u,
    "public transfer facade must not own transfer persistence runtime",
  );
  assert.doesNotMatch(
    sources["src/transfer-transaction-request.ts"],
    /export function decideTransferTransactionRequest/u,
    "public transfer facade must not own transfer decision runtime",
  );
  assert.doesNotMatch(
    sources["src/transfer-transaction-request.ts"],
    /export function applyApprovedTransferTransactionRequest/u,
    "public transfer facade must not own approved transfer apply runtime",
  );
  assert.doesNotMatch(
    sources["src/transfer-transaction-request.ts"],
    /export function applyDueTransferTransactionRequests/u,
    "public transfer facade must not own due-transfer worker runtime",
  );
  assert.doesNotMatch(
    sources["src/transfer-transaction-request.ts"],
    /transfer_transaction_request_(?:persistence|edit|decision|apply)/u,
    "public transfer facade must not carry persistence, decision, or apply savepoint names",
  );
  assert.match(
    sources["src/transfer-transaction-request.ts"],
    /from "\.\/transfer-okta-projection-integration\.js"/u,
  );

  assert.match(
    sources["src/transfer-transaction-request-persistence.ts"],
    /export function saveTransferTransactionRequest/u,
  );
  assert.match(
    sources["src/transfer-transaction-request-decision.ts"],
    /export function decideTransferTransactionRequest/u,
  );
  assert.match(
    sources["src/transfer-transaction-request-apply.ts"],
    /export function applyApprovedTransferTransactionRequest/u,
  );
  assert.doesNotMatch(
    sources["src/transfer-transaction-request-apply.ts"],
    /okta-mastering-adapter|OktaTransferProjectionImpactEvidence|applyApprovedTransferTransactionRequestWithOktaProjection|buildMvpBTransferOktaUserProjection|projectGroups/u,
    "core transfer apply module must not own mock Okta projection integration",
  );
  assert.match(
    sources["src/transfer-okta-projection-integration.ts"],
    /export async function applyApprovedTransferTransactionRequestWithOktaProjection/u,
  );
  assert.match(
    sources["src/transfer-okta-projection-integration.ts"],
    /authoritativeForRbac:\s*false/u,
    "transfer Okta projection integration must keep group impact non-authoritative for RBAC",
  );
  assert.match(
    sources["src/transfer-transaction-request-worker.ts"],
    /export function applyDueTransferTransactionRequests/u,
  );
  assert.match(
    sources["src/transfer-transaction-request-contract.ts"],
    /export function parseTransferTransactionRequestInput/u,
  );
});

test("MVP-B transfer traceability verifier stays split by responsibility", async () => {
  const modulePaths = [
    "src/transfer-transaction-request.ts",
    "src/transfer-traceability-assembly.ts",
    "src/transfer-traceability-db-reads.ts",
    "src/transfer-traceability-production-gates.ts",
    "src/transfer-traceability-types.ts",
  ] as const;
  const sources = Object.fromEntries(
    await Promise.all(
      modulePaths.map(async (path) => [path, await readRepoFile(path)]),
    ),
  ) as Record<(typeof modulePaths)[number], string>;

  assert.match(
    sources["src/transfer-transaction-request.ts"],
    /from "\.\/transfer-traceability-assembly\.js"/u,
  );
  assert.match(
    sources["src/transfer-transaction-request.ts"],
    /from "\.\/transfer-traceability-types\.js"/u,
  );
  assert.doesNotMatch(
    sources["src/transfer-transaction-request.ts"],
    /export function verifyMvpBTransferCorrelationTrace/u,
    "public transfer facade must not own transfer trace assembly runtime",
  );
  assert.doesNotMatch(
    sources["src/transfer-transaction-request.ts"],
    /class MvpBTransferCorrelationTraceError/u,
    "public transfer facade must not own transfer trace error types",
  );
  assert.doesNotMatch(
    sources["src/transfer-transaction-request.ts"],
    /remainingMvpBTransferProductionReadinessGates/u,
    "public transfer facade must not own production gate wording constants",
  );

  assert.match(
    sources["src/transfer-traceability-assembly.ts"],
    /export function verifyMvpBTransferCorrelationTrace/u,
  );
  assert.match(
    sources["src/transfer-traceability-assembly.ts"],
    /assertTransferTraceBindings/u,
  );
  assert.match(
    sources["src/transfer-traceability-db-reads.ts"],
    /readTransferTraceRequestByCorrelationId/u,
  );
  assert.match(
    sources["src/transfer-traceability-production-gates.ts"],
    /owner-acknowledged defer/u,
  );
  assert.match(
    sources["src/transfer-traceability-types.ts"],
    /export class MvpBTransferCorrelationTraceError/u,
  );
});

test("MVP-C termination traceability verifier stays split by responsibility", async () => {
  const modulePaths = [
    "src/termination-transaction-request.ts",
    "src/termination-traceability-assembly.ts",
    "src/termination-traceability-db-reads.ts",
    "src/termination-traceability-production-gates.ts",
    "src/termination-traceability-types.ts",
  ] as const;
  const sources = Object.fromEntries(
    await Promise.all(
      modulePaths.map(async (path) => [path, await readRepoFile(path)]),
    ),
  ) as Record<(typeof modulePaths)[number], string>;

  assert.match(
    sources["src/termination-transaction-request.ts"],
    /from "\.\/termination-traceability-assembly\.js"/u,
  );
  assert.match(
    sources["src/termination-transaction-request.ts"],
    /from "\.\/termination-traceability-types\.js"/u,
  );
  assert.doesNotMatch(
    sources["src/termination-transaction-request.ts"],
    /export function verifyMvpCTerminationCorrelationTrace/u,
    "public termination facade must not own termination trace assembly runtime",
  );
  assert.doesNotMatch(
    sources["src/termination-transaction-request.ts"],
    /class MvpCTerminationCorrelationTraceError/u,
    "public termination facade must not own termination trace error types",
  );
  assert.doesNotMatch(
    sources["src/termination-transaction-request.ts"],
    /remainingMvpCTerminationProductionReadinessGates/u,
    "public termination facade must not own production gate wording constants",
  );

  assert.match(
    sources["src/termination-traceability-assembly.ts"],
    /export function verifyMvpCTerminationCorrelationTrace/u,
  );
  assert.match(
    sources["src/termination-traceability-assembly.ts"],
    /assertTerminationTraceBindings/u,
  );
  assert.match(
    sources["src/termination-traceability-db-reads.ts"],
    /readTerminationTraceRequestByCorrelationId/u,
  );
  assert.match(
    sources["src/termination-traceability-production-gates.ts"],
    /owner-acknowledged defer/u,
  );
  assert.match(
    sources["src/termination-traceability-types.ts"],
    /export class MvpCTerminationCorrelationTraceError/u,
  );
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

test("solo-maintainer governance note keeps two-key ADRs as Proposed anchors", async () => {
  const [governanceNote, readme, p2a03Closeout] = await Promise.all([
    readRepoFile("docs/solo-maintainer-governance.md"),
    readRepoFile("README.md"),
    readRepoFile(
      "docs/mvp-a-p2a-03-practical-use-readiness-review-closeout.md",
    ),
  ]);
  const normalizedGovernanceNote = governanceNote.replace(/\s+/gu, " ").trim();
  const normalizedP2a03Closeout = p2a03Closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# Solo-Maintainer Governance Posture",
    "HRCore currently operates in a solo-maintainer / owner-acknowledged development model.",
    "Owner acknowledgement is not an independent second key.",
    "ADR 0011",
    "ADR 0012",
    "ADR 0014",
    "do not satisfy the original ADR 0000 two-key acceptance semantics",
    "must not be described as Accepted",
    "may remain Proposed design anchors for bounded non-production development",
    "Production-like readiness remains blocked for real employee data, live IdP/Okta tenant operation, production audit immutability, raw payload viewing, CSV/export, production backup, DLQ/ops, legal/privacy runtime, and related stronger-readiness claims.",
    "No third-party legal, security, privacy, operator, or independent maintainer approval is recorded by this note.",
  ]) {
    assert.ok(
      normalizedGovernanceNote.includes(
        requiredText.replace(/\s+/gu, " ").trim(),
      ),
      `missing solo-maintainer governance text: ${requiredText}`,
    );
  }

  assert.doesNotMatch(
    governanceNote,
    /ADR 00(?:11|12|14)[\s\S]{0,80}## Status\s+Accepted/u,
    "solo-maintainer governance must not mark two-key ADRs as Accepted",
  );
  assert.match(
    readme,
    /\[Solo-Maintainer Governance Posture\]\(docs\/solo-maintainer-governance\.md\)/,
  );
  assert.ok(
    normalizedP2a03Closeout.includes("Solo-Maintainer Governance Posture"),
    "P2A-03 closeout must cross-link the solo-maintainer governance note",
  );
});

test("solo-maintainer governance closeout preserves owner-acknowledged defer posture", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile("docs/p0-gov-01-solo-maintainer-governance-closeout.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# P0-GOV-01 Solo-Maintainer Governance Closeout",
    "Issue: #244",
    "Part of: #240",
    "Depends on: #243",
    "Final Posture",
    "#241, #242, and #243 are complete",
    "P0-R05 (#11), P0-R06 (#12), and P0-R08 (#14) remain owner-acknowledged defer",
    "not Accepted under the original ADR 0000 two-key semantics",
    "Owner acknowledgement is not independent legal, security, privacy, operator, or second-maintainer approval.",
    "Bounded/non-production MVP-A continuation remains allowed",
    "Production-like readiness remains blocked",
    "Gates Covered",
    "#11 / P0-R05",
    "#12 / P0-R06",
    "#14 / P0-R08",
    "Future Promotion Condition",
    "real independent legal/security/operator review",
    "equivalent documented authority",
    "named Approver",
    "independent Counter-approver",
    "completed ADR 0000 review-window evidence",
    "Closeout Boundary",
    "does not claim that independent review occurred",
    "does not convert owner acknowledgement into production-like approval",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P0-GOV-01 closeout text: ${requiredText}`,
    );
  }

  assert.doesNotMatch(
    closeout,
    /P0-R0(?:5|6|8)[\s\S]{0,120}\b(?:is|are|as|status:)\s+Accepted\b/u,
    "P0-GOV-01 closeout must not promote P0-R05/R06/R08 to Accepted",
  );
  assert.match(
    readme,
    /\[P0-GOV-01 Solo-Maintainer Governance Closeout\]\(docs\/p0-gov-01-solo-maintainer-governance-closeout\.md\)/,
  );
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

test("MVP-A P2A-05 refactor wave closeout records behavior-preserving review", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile("docs/mvp-a-p2a-05-refactor-wave-closeout.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-A P2A-05 Refactor Wave Closeout",
    "Issue: #232",
    "Part of: #225",
    "Depends on: #231",
    "Readiness Verdict",
    "bounded/non-production MVP-A onboarding E2E: unchanged",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "Reviewed Refactor Artifacts",
    "onboarding transaction helper split",
    "onboarding transaction runtime split",
    "onboarding transaction test split",
    "synthetic work_email writeback ingest split",
    "synthetic hire source and test split",
    "Okta/writeback integration and mock adapter split",
    "Behavior and Boundary Review",
    "No behavior drift, API drift, policy weakening, or readiness-claim broadening was accepted",
    "Verification Commands",
    "npm run verify:pre-pr",
    "Residual Refactor Debt",
    "Final Verdict",
    "P2A-05 can close as behavior-preserving maintainability hardening",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2A-05 refactor wave closeout text: ${requiredText}`,
    );
  }

  assert.ok(
    !normalizedCloseout.includes("src/onboarding-transaction-request.test.ts"),
    "P2A-05 closeout must not cite the removed monolithic onboarding transaction test file",
  );

  assert.match(
    readme,
    /\[MVP-A P2A-05 Refactor Wave Closeout\]\(docs\/mvp-a-p2a-05-refactor-wave-closeout\.md\)/,
  );
});

test("MVP-B P2B-01 readiness review closeout keeps production gates blocked", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile("docs/mvp-b-p2b-01-readiness-review-closeout.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-B P2B-01 Readiness Review Closeout",
    "Issue: #256",
    "Part of: #248",
    "Depends on: #255",
    "Readiness Verdict",
    "bounded/non-production MVP-B transfer E2E: Go",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "real employee data: Blocked",
    "live Okta tenant operation: Blocked",
    "Reviewed Artifacts",
    "#249 transfer transaction_request schema / validation",
    "#250 transfer approval / return / reject / cancel flow",
    "#251 effective-dated assignment update and collision guard",
    "#252 transfer wizard / API bounded surface",
    "#253 future-date transfer apply worker",
    "#254 mock Okta group/profile projection impact",
    "#255 transfer audit / correlation trace closeout",
    "No Silent Surface Openings",
    "real employee data",
    "live Okta",
    "production authorization/RLS",
    "audit immutability",
    "raw/export",
    "backup",
    "ops/DLQ",
    "legal/privacy",
    "two-key acceptance",
    "Verification Commands",
    "npm run verify:pre-pr",
    "Residual Blockers",
    "<follow-up-real-employee-data-readiness>",
    "<follow-up-live-okta-provider-readiness>",
    "<follow-up-production-authorization-rls>",
    "<follow-up-production-audit-immutability>",
    "<follow-up-raw-export-readiness>",
    "<follow-up-production-backup-readiness>",
    "<follow-up-operations-dlq-replay>",
    "<follow-up-legal-privacy-two-key-acceptance>",
    "Owner acknowledgement is not Accepted two-key approval.",
    "Closeout",
    "P2B-01 can close for bounded/non-production MVP-B transfer review evidence",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2B-01 readiness closeout text: ${requiredText}`,
    );
  }

  assert.doesNotMatch(
    closeout,
    /#240[\s\S]{0,160}\bis\s+Accepted two-key approval\b/u,
    "P2B-01 closeout must not convert #240 owner acknowledgement into Accepted two-key approval",
  );
  assert.doesNotMatch(
    closeout,
    /`src\/transfer-transaction-request-contract\.ts`/u,
    "P2B-01 closeout must not cite nonexistent transfer contract implementation modules",
  );
  assert.doesNotMatch(
    closeout,
    /`src\/onboarding-okta-writeback-integration\.ts`/u,
    "P2B-01 closeout transfer projection evidence must not cite the onboarding writeback module",
  );
  assert.match(
    closeout,
    /`src\/transfer-transaction-request\.ts`\s+`applyApprovedTransferTransactionRequestWithOktaProjection`/u,
    "P2B-01 closeout must cite the transfer projection implementation symbol",
  );

  assert.match(
    readme,
    /\[MVP-B P2B-01 Readiness Review Closeout\]\(docs\/mvp-b-p2b-01-readiness-review-closeout\.md\)/,
  );
});

test("MVP-B P2B-02 refactor wave closeout records behavior-preserving review", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile("docs/mvp-b-p2b-02-refactor-wave-closeout.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-B P2B-02 Refactor Wave Closeout",
    "Issue: #271",
    "Part of: #265",
    "Depends on: #270",
    "Readiness Verdict",
    "bounded/non-production MVP-B transfer E2E: unchanged",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "real employee data: Blocked",
    "live Okta tenant operation: Blocked",
    "Reviewed Refactor Artifacts",
    "transfer contract parser / validation helper split",
    "transfer persistence / decision runtime split",
    "transfer apply / future-date worker runtime split",
    "transfer mock Okta projection boundary split",
    "transfer traceability verifier / tests split",
    "Behavior and Boundary Review",
    "No behavior drift, API drift, migration drift, policy weakening, or readiness-claim broadening was accepted",
    "Verification Commands",
    "npm run verify:pre-pr",
    "Residual Refactor Debt",
    "Final Verdict",
    "P2B-02 can close as behavior-preserving maintainability hardening",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2B-02 refactor wave closeout text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "HR practical-use ready: Go",
    "production-like ready: Go",
    "real employee data: Go",
    "live Okta tenant operation: Go",
    "Accepted two-key approval",
  ]) {
    assert.ok(
      !normalizedCloseout.includes(forbiddenText),
      `P2B-02 closeout must not broaden readiness with: ${forbiddenText}`,
    );
  }

  assert.match(
    readme,
    /\[MVP-B P2B-02 Refactor Wave Closeout\]\(docs\/mvp-b-p2b-02-refactor-wave-closeout\.md\)/,
  );
});

test("MVP-C P2C-01 readiness review closeout keeps stronger gates blocked", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile("docs/mvp-c-p2c-01-readiness-review-closeout.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-C P2C-01 Readiness Review Closeout",
    "Issue: #286",
    "Part of: #278",
    "Depends on: #285",
    "Readiness Verdict",
    "bounded/non-production MVP-C termination E2E: Go",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "real employee data: Blocked",
    "live Okta tenant operation: Blocked",
    "retention/deletion runtime ready: Blocked",
    "Reviewed Artifacts",
    "#279 termination transaction_request schema / validation",
    "#280 termination approval / return / reject / cancel flow",
    "#281 effective-dated employment / assignment termination apply",
    "#282 termination wizard / API bounded surface",
    "#283 future-date termination apply worker",
    "#284 mock Okta disable / group removal projection impact",
    "#285 termination audit / correlation trace closeout",
    "Owner acknowledgement is not Accepted two-key approval.",
    "Issue #14 / R08 retention, anonymization, hard delete, legal hold, and deletion job surfaces remain blocked",
    "No Silent Surface Openings",
    "real employee data",
    "live Okta",
    "production authorization/RLS",
    "audit immutability",
    "raw/export",
    "backup",
    "ops/DLQ",
    "legal/privacy",
    "retention/deletion",
    "two-key acceptance",
    "Verification Commands",
    "npm run verify:pre-pr",
    "Residual Blockers",
    "<follow-up-real-employee-data-readiness>",
    "<follow-up-live-okta-provider-readiness>",
    "<follow-up-production-authorization-rls>",
    "<follow-up-production-audit-immutability>",
    "<follow-up-raw-export-readiness>",
    "<follow-up-production-backup-readiness>",
    "<follow-up-operations-dlq-replay>",
    "<follow-up-legal-privacy-acceptance>",
    "<follow-up-retention-deletion-readiness>",
    "<follow-up-two-key-acceptance>",
    "Issue #278 can close only after #286 is complete or explicitly deferred.",
    "P2C-01 can close for bounded/non-production MVP-C termination review evidence",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2C-01 readiness closeout text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "HR practical-use ready: Go",
    "production-like ready: Go",
    "real employee data: Go",
    "live Okta tenant operation: Go",
    "retention/deletion runtime ready: Go",
    "retention/deletion readiness: Go",
  ]) {
    assert.ok(
      !normalizedCloseout.includes(forbiddenText),
      `P2C-01 closeout must not promote stronger readiness: ${forbiddenText}`,
    );
  }

  assert.doesNotMatch(
    closeout,
    /#240[\s\S]{0,160}\bis\s+Accepted two-key approval\b/u,
    "P2C-01 closeout must not convert #240 owner acknowledgement into Accepted two-key approval",
  );
  assert.match(
    closeout,
    /`src\/termination-transaction-request\.ts`\s+`applyApprovedTerminationTransactionRequestWithOktaProjection`/u,
    "P2C-01 closeout must cite the termination projection implementation symbol",
  );
  assert.match(
    readme,
    /\[MVP-C P2C-01 Readiness Review Closeout\]\(docs\/mvp-c-p2c-01-readiness-review-closeout\.md\)/,
  );
});

test("MVP-C P2C-02 refactor wave closeout records behavior-preserving review", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile("docs/mvp-c-p2c-02-refactor-wave-closeout.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-C P2C-02 Refactor Wave Closeout",
    "Issue: #301",
    "Part of: #295",
    "Depends on: #300",
    "Readiness Verdict",
    "bounded/non-production MVP-C termination E2E: unchanged",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "real employee data: Blocked",
    "live Okta tenant operation: Blocked",
    "retention/deletion runtime ready: Blocked",
    "Reviewed Refactor Artifacts",
    "termination contract / persistence helper split",
    "termination decision runtime / test boundary split",
    "termination apply runtime / retry guard split",
    "termination worker / mock Okta projection boundary split",
    "termination traceability verifier / tests split",
    "Behavior and Boundary Review",
    "No behavior drift, API drift, migration drift, policy weakening, or readiness-claim broadening was accepted",
    "Verification Commands",
    "npm run verify:pre-pr",
    "Residual Refactor Debt",
    "Final Verdict",
    "P2C-02 can close as behavior-preserving maintainability hardening",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2C-02 refactor wave closeout text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "HR practical-use ready: Go",
    "production-like ready: Go",
    "real employee data: Go",
    "live Okta tenant operation: Go",
    "retention/deletion runtime ready: Go",
    "retention/deletion readiness: Go",
    "Accepted two-key approval",
  ]) {
    assert.ok(
      !normalizedCloseout.includes(forbiddenText),
      `P2C-02 closeout must not broaden readiness with: ${forbiddenText}`,
    );
  }

  assert.match(
    readme,
    /\[MVP-C P2C-02 Refactor Wave Closeout\]\(docs\/mvp-c-p2c-02-refactor-wave-closeout\.md\)/,
  );
});

test("MVP-D P2D-01 readiness review closeout keeps CSV/Ops/DLQ bounded", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile("docs/mvp-d-p2d-01-readiness-review-closeout.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-D P2D-01 Readiness Review Closeout",
    "Issue: #315",
    "Part of: #308",
    "Depends on: #314",
    "Readiness Verdict",
    "bounded/non-production MVP-D CSV/Ops/DLQ evidence: Go",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "real employee data: Blocked",
    "live Okta tenant operation: Blocked",
    "production queue/DLQ ready: Blocked",
    "retention/deletion runtime ready: Blocked",
    "Reviewed Artifacts",
    "#309 CSV import contract / validation / dry-run",
    "#310 CSV import apply / idempotency / failure handling",
    "#311 bounded CSV export policy gate / no raw payload guard",
    "#312 Ops job status / operator evidence / runbook boundary",
    "#313 DLQ model / retry / replay guard",
    "#314 CSV/Ops/DLQ traceability verifier / tests",
    "P0-R05 (#11), P0-R06 (#12), and P0-R08 (#14) remain owner-acknowledged defer / production-like blocked",
    "Owner acknowledgement is not Accepted two-key approval.",
    "No Silent Surface Openings",
    "real employee data",
    "live Okta",
    "production authorization/RLS",
    "audit immutability",
    "raw/export",
    "production queue/DLQ",
    "production ops",
    "legal/privacy",
    "retention/deletion",
    "two-key acceptance",
    "Verification Commands",
    "npm run verify:pre-pr",
    "Residual Blockers",
    "<follow-up-real-employee-data-readiness>",
    "<follow-up-live-okta-provider-readiness>",
    "<follow-up-production-authorization-rls>",
    "<follow-up-production-audit-immutability>",
    "<follow-up-raw-export-readiness>",
    "<follow-up-production-operations-dlq>",
    "<follow-up-legal-privacy-acceptance>",
    "<follow-up-retention-deletion-readiness>",
    "<follow-up-two-key-acceptance>",
    "Issue #308 can close after #315 is complete and the epic comment records this bounded verdict.",
    "P2D-01 can close for bounded/non-production MVP-D CSV/Ops/DLQ review evidence",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2D-01 readiness closeout text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "HR practical-use ready: Go",
    "production-like ready: Go",
    "real employee data: Go",
    "live Okta tenant operation: Go",
    "production queue/DLQ ready: Go",
    "retention/deletion runtime ready: Go",
    "unrestricted raw payload/export ready: Go",
  ]) {
    assert.ok(
      !normalizedCloseout.includes(forbiddenText),
      `P2D-01 closeout must not promote stronger readiness: ${forbiddenText}`,
    );
  }

  assert.doesNotMatch(
    closeout,
    /#240[\s\S]{0,160}\bis\s+Accepted two-key approval\b/u,
    "P2D-01 closeout must not convert #240 owner acknowledgement into Accepted two-key approval",
  );
  assert.match(
    readme,
    /\[MVP-D P2D-01 Readiness Review Closeout\]\(docs\/mvp-d-p2d-01-readiness-review-closeout\.md\)/,
  );
});

test("P2X practical-use gap assessment preserves bounded and stronger-readiness separation", async () => {
  const [assessment, readme] = await Promise.all([
    readRepoFile("docs/p2x-hr-practical-use-gap-assessment.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedAssessment = assessment.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# P2X HR Practical-Use Gap Assessment",
    "Issue: #338",
    "Part of: #336",
    "Depends on: #337",
    "Review scope: bounded/non-production practical-use gaps after the MVP-A/B/C/D evidence inventory",
    "Assessment Boundary",
    "bounded/non-production practical-use follow-up: Allowed",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "real employee data: Blocked",
    "live Okta tenant operation: Blocked",
    "production queue/DLQ ready: Blocked",
    "retention/deletion runtime ready: Blocked",
    "Evidence Anchors Reviewed",
    "docs/mvp-abcd-bounded-evidence-inventory.md",
    "docs/mvp-a-p2a-03-practical-use-readiness-review-closeout.md",
    "docs/mvp-d-p2d-01-readiness-review-closeout.md",
    "Bounded Practical-Use Gaps",
    "operator workflow",
    "support evidence",
    "audit lookup",
    "CSV/Ops/DLQ usability",
    "non-production data handling",
    "test data governance",
    "local runbook completeness",
    "Stronger-Readiness Blockers Kept Separate",
    "No Surface Expansion Confirmation",
    "No real employee data",
    "No live IdP/Okta",
    "No unrestricted raw payload",
    "No broad CSV export",
    "No production queue/DLQ",
    "No retention/deletion runtime",
    "No two-key Accepted claim",
    "No production-like readiness",
    "Verification Commands",
    'npm test -- --test-name-pattern "P2X practical-use gap assessment"',
    "npm run verify:pre-pr",
  ]) {
    assert.ok(
      normalizedAssessment.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X practical-use gap assessment text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "HR practical-use ready: Go",
    "production-like ready: Go",
    "real employee data: Go",
    "live Okta tenant operation: Go",
    "production queue/DLQ ready: Go",
    "retention/deletion runtime ready: Go",
    "is Accepted two-key approval",
  ]) {
    assert.ok(
      !normalizedAssessment.includes(forbiddenText),
      `P2X assessment must not promote stronger readiness: ${forbiddenText}`,
    );
  }

  assert.match(
    readme,
    /\[P2X HR Practical-Use Gap Assessment\]\(docs\/p2x-hr-practical-use-gap-assessment\.md\)/,
  );
});

test("P2X solo-maintainer governance boundary review keeps remaining gates blocked", async () => {
  const [review, readme] = await Promise.all([
    readRepoFile("docs/p2x-solo-maintainer-governance-boundary-review.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedReview = review.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# P2X Solo-Maintainer Governance Boundary Review",
    "Issue: #340",
    "Part of: #336",
    "Depends on: #339",
    "Review scope: remaining #11/#12/#14 stronger-readiness gates after the P2X production-like blocker matrix",
    "Governance Boundary",
    "owner acknowledgement: repository-owner acknowledgement of bounded, non-production continuation and explicit deferral",
    "owner acknowledgement is not Accepted two-key approval",
    "#240 records the solo-maintainer governance posture and closeout only",
    "P0-R05 / #11: Open; owner-acknowledged defer",
    "P0-R06 / #12: Open; owner-acknowledged defer",
    "P0-R08 / #14: Open; owner-acknowledged defer",
    "ADR 0011: Proposed",
    "ADR 0012: Proposed",
    "ADR 0014: Proposed",
    "Minimum Evidence Before Stronger Claims",
    "named Approver",
    "independent Counter-approver",
    "completed ADR 0000 review-window evidence",
    "real independent legal/security/operator review",
    "Production-Like Readiness Verdict",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "No Surface Expansion Confirmation",
    "No real employee data",
    "No live IdP/Okta",
    "No unrestricted raw payload",
    "No broad CSV export",
    "No production queue/DLQ",
    "No retention/deletion runtime",
    "No two-key Accepted claim",
    "No production-like readiness surface",
    "Verification Commands",
    'npm test -- --test-name-pattern "P2X solo-maintainer governance boundary review"',
    "npm run verify:pre-pr",
  ]) {
    assert.ok(
      normalizedReview.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X governance boundary review text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "HR practical-use ready: Go",
    "production-like ready: Go",
    "real employee data: Go",
    "live Okta tenant operation: Go",
    "is Accepted two-key approval",
  ]) {
    assert.ok(
      !normalizedReview.includes(forbiddenText),
      `P2X governance review must not promote stronger readiness: ${forbiddenText}`,
    );
  }

  assert.doesNotMatch(
    review,
    /#240[\s\S]{0,180}\bis\s+Accepted two-key approval\b/u,
    "P2X governance review must not convert #240 owner acknowledgement into Accepted two-key approval",
  );
  assert.match(
    readme,
    /\[P2X Solo-Maintainer Governance Boundary Review\]\(docs\/p2x-solo-maintainer-governance-boundary-review\.md\)/,
  );
});

test("P2X final closeout recommends the next bounded wave without stronger-readiness overclaim", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile("docs/p2x-01-next-wave-recommendation-closeout.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# P2X-01 Next-Wave Recommendation Closeout",
    "Issue: #341",
    "Part of: #336",
    "Depends on: #340",
    "Final verdict: Accepted as cross-suite assessment only",
    "Stronger-readiness claims remain blocked",
    "Child Output Review",
    "#337",
    "#338",
    "#339",
    "#340",
    "Safest next runnable wave: bounded practical-use follow-up",
    "Alternative 1: production-like prerequisite wave",
    "Alternative 2: governance/two-key evidence wave",
    "Alternative 3: narrow cleanup wave",
    "Recommended first child",
    "local bounded operator runbook",
    "Residual Risks",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "real employee data: Blocked",
    "live Okta tenant operation: Blocked",
    "production queue/DLQ ready: Blocked",
    "retention/deletion runtime ready: Blocked",
    "Verification Commands",
    'npm test -- --test-name-pattern "P2X final closeout"',
    "npm run verify:pre-pr",
    "No Surface Expansion Confirmation",
    "No real employee data",
    "No live IdP/Okta",
    "No unrestricted raw payload",
    "No broad CSV export",
    "No production queue/DLQ",
    "No retention/deletion runtime",
    "No two-key Accepted claim",
    "No production-like readiness surface",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X final closeout text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "HR practical-use ready: Go",
    "production-like ready: Go",
    "real employee data: Go",
    "live Okta tenant operation: Go",
    "production queue/DLQ ready: Go",
    "retention/deletion runtime ready: Go",
    "is Accepted two-key approval",
  ]) {
    assert.ok(
      !normalizedCloseout.includes(forbiddenText),
      `P2X final closeout must not promote stronger readiness: ${forbiddenText}`,
    );
  }

  assert.doesNotMatch(
    closeout,
    /(?:\/Users\/|C:\\Users\\)/u,
    "P2X final closeout must not include workstation-local absolute paths",
  );
  assert.match(
    readme,
    /\[P2X-01 Next-Wave Recommendation Closeout\]\(docs\/p2x-01-next-wave-recommendation-closeout\.md\)/,
  );
});

test("P2X local bounded operator runbook stays scoped to synthetic local review", async () => {
  const [runbook, readme] = await Promise.all([
    readRepoFile("docs/p2x-local-bounded-operator-runbook.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedRunbook = runbook.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# P2X Local Bounded Operator Runbook",
    "Issue: #348",
    "Part of: #347",
    "Depends on: #336",
    "Review scope: local bounded review of the completed MVP-A/B/C/D suite with synthetic or explicitly approved non-production evidence only",
    "Runbook Boundary",
    "bounded/non-production local review: Allowed",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "real employee data: Blocked",
    "live IdP/Okta operation: Blocked",
    "production queue/DLQ ready: Blocked",
    "retention/deletion runtime ready: Blocked",
    "Canonical Flow Review Map",
    "MVP-A onboarding",
    "MVP-B transfer",
    "MVP-C termination",
    "MVP-D CSV import/export guard",
    "MVP-D local Ops job status",
    "MVP-D DLQ decisions",
    "audit/correlation",
    "Failed-Path Review Expectations",
    "Cleanup Expectations",
    "Command Shapes",
    "npm run verify:pre-pr",
    'npm test -- --test-name-pattern "P2X local bounded operator runbook"',
    'npm test -- --test-name-pattern "MVP-D CSV dry-run"',
    'npm test -- --test-name-pattern "MVP-D CSV apply"',
    'npm test -- --test-name-pattern "MVP-D bounded synthetic CSV export"',
    'npm test -- --test-name-pattern "MVP-D local ops job status"',
    "No Surface Expansion Confirmation",
    "No real employee data",
    "No live IdP/Okta",
    "No unrestricted raw payload",
    "No broad CSV export",
    "No production queue/DLQ",
    "No retention/deletion runtime",
    "No two-key Accepted claim",
    "No HR practical-use readiness",
    "No production-like readiness surface",
  ]) {
    assert.ok(
      normalizedRunbook.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X local bounded operator runbook text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "HR practical-use ready: Go",
    "production-like ready: Go",
    "real employee data: Go",
    "live IdP/Okta operation: Go",
    "production queue/DLQ ready: Go",
    "retention/deletion runtime ready: Go",
    "is Accepted two-key approval",
    "support console authority",
  ]) {
    assert.ok(
      !normalizedRunbook.includes(forbiddenText),
      `P2X local runbook must not promote stronger readiness: ${forbiddenText}`,
    );
  }

  assert.doesNotMatch(
    runbook,
    /(?:\/Users\/|C:\\Users\\)/u,
    "P2X local runbook must not include workstation-local absolute paths",
  );
  assert.match(
    readme,
    /\[P2X Local Bounded Operator Runbook\]\(docs\/p2x-local-bounded-operator-runbook\.md\)/,
  );
});

test("P2X synthetic practical-use rehearsal checklist stays bounded and synthetic", async () => {
  const [checklist, readme] = await Promise.all([
    readRepoFile("docs/p2x-synthetic-practical-use-rehearsal-checklist.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedChecklist = checklist.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# P2X Synthetic Practical-Use Rehearsal Checklist",
    "Issue: #349",
    "Part of: #347",
    "Depends on: #348",
    "Review scope: synthetic or explicitly approved non-production rehearsal only",
    "Checklist Boundary",
    "bounded synthetic practical-use rehearsal: Allowed",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "real employee data: Blocked",
    "live IdP/Okta operation: Blocked",
    "production queue/DLQ ready: Blocked",
    "retention/deletion runtime ready: Blocked",
    "Evidence Fields",
    "actor",
    "reason",
    "subject binding",
    "tenant/environment",
    "correlation id",
    "evidence version",
    "cleanup status",
    "Rehearsal Checklist",
    "onboarding",
    "transfer",
    "termination",
    "CSV import/export denial",
    "local Ops job status",
    "DLQ retry/replay/ignore/close",
    "audit lookup",
    "failed paths",
    "cleanup",
    "provider mock projection",
    "writeback where applicable",
    "CSV/Ops/DLQ evidence",
    "Preserved Evidence Boundaries",
    "P2A/P2B/P2C/P2D accepted evidence boundaries",
    "P2X-01 blocker matrix",
    "Verification Commands",
    'npm test -- --test-name-pattern "P2X synthetic practical-use rehearsal checklist"',
    "npm run verify:pre-pr",
    "No Surface Expansion Confirmation",
    "No real employee data",
    "No live IdP/Okta",
    "No unrestricted raw payload",
    "No broad CSV export",
    "No production queue/DLQ",
    "No retention/deletion runtime",
    "No two-key Accepted claim",
    "No HR practical-use readiness",
    "No production-like readiness surface",
  ]) {
    assert.ok(
      normalizedChecklist.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X synthetic rehearsal checklist text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "HR practical-use ready: Go",
    "production-like ready: Go",
    "real employee data: Go",
    "live IdP/Okta operation: Go",
    "production queue/DLQ ready: Go",
    "retention/deletion runtime ready: Go",
    "is Accepted two-key approval",
    "support console authority: Go",
    "support-console authority: Go",
    "production ticket binding: Go",
  ]) {
    assert.ok(
      !normalizedChecklist.includes(forbiddenText),
      `P2X synthetic rehearsal checklist must not promote stronger readiness: ${forbiddenText}`,
    );
  }

  assert.doesNotMatch(
    checklist,
    /(?:\/Users\/|C:\\Users\\)/u,
    "P2X synthetic rehearsal checklist must not include workstation-local absolute paths",
  );
  assert.match(
    readme,
    /\[P2X Synthetic Practical-Use Rehearsal Checklist\]\(docs\/p2x-synthetic-practical-use-rehearsal-checklist\.md\)/,
  );
});

test("P2X synthetic test-data governance note blocks real-data and runtime expansion", async () => {
  const [governanceNote, readme] = await Promise.all([
    readRepoFile("docs/p2x-synthetic-test-data-governance.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedGovernanceNote = governanceNote.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# P2X Synthetic Test-Data Governance",
    "Issue: #351",
    "Part of: #347",
    "Depends on: #350",
    "Review scope: synthetic or explicitly approved non-production test-data governance for bounded MVP-A/B/C/D rehearsal only",
    "Data Governance Boundary",
    "bounded synthetic test data: Allowed",
    "explicitly approved non-production examples: Allowed",
    "approval placeholders: Blocked",
    "real employee data: Blocked",
    "live tenant data: Blocked",
    "production credentials: Blocked",
    "regulated identifiers: Blocked",
    "sensitive personal information: Blocked",
    "raw payloads: Blocked",
    "retention/deletion runtime ready: Blocked",
    "Allowed Synthetic Fixture Shape",
    "fixture name",
    "scenario intent",
    "evidence owner",
    "source classification",
    "allowed fields",
    "prohibited aliases",
    "cleanup evidence",
    "Approval Placeholder Rejection",
    "Cleanup Expectations",
    "docs/p2x-local-bounded-operator-runbook.md",
    "docs/p2x-synthetic-practical-use-rehearsal-checklist.md",
    "docs/p2x-cross-flow-audit-correlation-lookup-map.md",
    'npm test -- --test-name-pattern "P2X synthetic test-data governance"',
    "npm run verify:pre-pr",
    "No Surface Expansion Confirmation",
    "No real employee data",
    "No live IdP/Okta",
    "No unrestricted raw payload",
    "No broad CSV export",
    "No production queue/DLQ",
    "No retention/deletion runtime",
    "No two-key Accepted claim",
    "No HR practical-use readiness",
    "No production-like readiness surface",
  ]) {
    assert.ok(
      normalizedGovernanceNote.includes(
        requiredText.replace(/\s+/gu, " ").trim(),
      ),
      `missing P2X synthetic test-data governance text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "HR practical-use ready: Go",
    "production-like ready: Go",
    "real employee data: Go",
    "live tenant data: Go",
    "production credentials: Go",
    "regulated identifiers: Go",
    "sensitive personal information: Go",
    "raw payloads: Go",
    "retention/deletion runtime ready: Go",
    "is Accepted two-key approval",
    "approval placeholder accepted",
    "approval placeholder may authorize",
  ]) {
    assert.ok(
      !normalizedGovernanceNote.includes(forbiddenText),
      `P2X synthetic test-data governance must not promote stronger readiness: ${forbiddenText}`,
    );
  }

  assert.doesNotMatch(
    governanceNote,
    /(?:\/Users\/|C:\\Users\\)/u,
    "P2X synthetic test-data governance must not include workstation-local absolute paths",
  );
  assert.match(
    readme,
    /\[P2X Synthetic Test-Data Governance\]\(docs\/p2x-synthetic-test-data-governance\.md\)/,
  );
});

test("P2X-02 independent closeout accepts bounded follow-up without readiness overclaim", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile("docs/p2x-02-bounded-practical-use-follow-up-closeout.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# P2X-02 Bounded Practical-Use Follow-Up Closeout",
    "Issue: #353",
    "Part of: #347",
    "Depends on: #352",
    "Final verdict: Accepted as bounded practical-use follow-up evidence only",
    "HR practical-use readiness remains blocked",
    "production-like readiness remains blocked",
    "Child Output Review",
    "#348",
    "#349",
    "#350",
    "#351",
    "#352",
    "Guard Coverage Review",
    "bounded practical-use follow-up: Accepted",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "real employee data: Blocked",
    "live IdP/Okta operation: Blocked",
    "production queue/DLQ ready: Blocked",
    "retention/deletion runtime ready: Blocked",
    "Next Safest Wave",
    "Recommended next wave: bounded closeout synchronization and narrow cleanup",
    "Alternative 1: production-like prerequisite wave",
    "Alternative 2: governance/two-key evidence wave",
    "Alternative 3: bounded practical-use follow-up extension",
    "Verification Commands",
    'npm test -- --test-name-pattern "P2X-02 independent closeout"',
    "npm run verify:pre-pr",
    "No Surface Expansion Confirmation",
    "No real employee data",
    "No live IdP/Okta",
    "No unrestricted raw payload",
    "No broad CSV export",
    "No production queue/DLQ",
    "No retention/deletion runtime",
    "No two-key Accepted claim",
    "No HR practical-use readiness",
    "No production-like readiness surface",
    "Epic Update Boundary",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X-02 closeout text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "HR practical-use ready: Go",
    "production-like ready: Go",
    "real employee data: Go",
    "live IdP/Okta operation: Go",
    "production queue/DLQ ready: Go",
    "retention/deletion runtime ready: Go",
    "is Accepted two-key approval",
    "real employee data approved",
    "live-provider ready",
  ]) {
    assert.ok(
      !normalizedCloseout.includes(forbiddenText),
      `P2X-02 closeout must not promote stronger readiness: ${forbiddenText}`,
    );
  }

  assert.doesNotMatch(
    closeout,
    /(?:\/Users\/|C:\\Users\\)/u,
    "P2X-02 closeout must not include workstation-local absolute paths",
  );
  assert.match(
    readme,
    /\[P2X-02 Bounded Practical-Use Follow-Up Closeout\]\(docs\/p2x-02-bounded-practical-use-follow-up-closeout\.md\)/,
  );
});

test("P2X closeout reference inventory preserves the accepted bounded cleanup boundary", async () => {
  const [inventory, readme] = await Promise.all([
    readRepoFile("docs/p2x-closeout-reference-inventory.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedInventory = inventory.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# P2X-03 Closeout Reference Inventory",
    "Issue: #361",
    "Part of: #360",
    "Depends on: #347",
    "Inventory Boundary",
    "P2X-02 accepted boundary: bounded practical-use follow-up evidence only",
    "HR practical-use readiness: Blocked",
    "production-like readiness: Blocked",
    "Reference Classification",
    "docs/p2x-01-next-wave-recommendation-closeout.md",
    "docs/p2x-02-bounded-practical-use-follow-up-closeout.md",
    "docs/p2x-local-bounded-operator-runbook.md",
    "docs/p2x-synthetic-practical-use-rehearsal-checklist.md",
    "docs/p2x-cross-flow-audit-correlation-lookup-map.md",
    "docs/p2x-synthetic-test-data-governance.md",
    "src/mvp-a-policy-as-code-ci.ts",
    "src/mvp-a-policy-as-code-documentation.ts",
    "current",
    "stale",
    "Recommended Follow-Up Edits",
    "Completed policy-as-code loading and P2X overclaim scanning for the P2X-02 closeout and this inventory",
    "Completed the focused repository guard for this inventory",
    "No Surface Expansion Confirmation",
    "No real employee data",
    "No live IdP/Okta",
    "No unrestricted raw payload",
    "No broad CSV export",
    "No production queue/DLQ",
    "No retention/deletion runtime",
    "No two-key Accepted claim",
    "No HR practical-use readiness",
    "No production-like readiness surface",
    "Verification Commands",
    'npm test -- --test-name-pattern "P2X closeout reference inventory"',
    "npm run verify:pre-pr",
  ]) {
    assert.ok(
      normalizedInventory.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X closeout reference inventory text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "HR practical-use ready: Go",
    "production-like ready: Go",
    "real employee data: Go",
    "live IdP/Okta operation: Go",
    "production queue/DLQ ready: Go",
    "retention/deletion runtime ready: Go",
    "is Accepted two-key approval",
    "P2X-02 accepts HR practical-use readiness",
    "P2X-02 accepts production-like readiness",
  ]) {
    assert.ok(
      !normalizedInventory.includes(forbiddenText),
      `P2X reference inventory must not promote stronger readiness: ${forbiddenText}`,
    );
  }

  assert.doesNotMatch(
    inventory,
    /(?:\/Users\/|C:\\Users\\)/u,
    "P2X reference inventory must not include workstation-local absolute paths",
  );
  assert.match(
    readme,
    /\[P2X-03 Closeout Reference Inventory\]\(docs\/p2x-closeout-reference-inventory\.md\)/,
  );
});

test("P2X README and planning references preserve bounded status synchronization", async () => {
  const [readme, p2x01Closeout, inventory] = await Promise.all([
    readRepoFile("README.md"),
    readRepoFile("docs/p2x-01-next-wave-recommendation-closeout.md"),
    readRepoFile("docs/p2x-closeout-reference-inventory.md"),
  ]);
  const combinedText = [readme, p2x01Closeout, inventory]
    .join("\n")
    .replace(/\s+/gu, " ")
    .trim();

  for (const requiredText of [
    "Current P2X bounded status: P2X-02 is completed and Accepted as bounded practical-use follow-up evidence only",
    "The completed P2X-02 evidence set is the closeout, local bounded operator runbook, synthetic practical-use rehearsal checklist, cross-flow audit/correlation lookup map, and synthetic test-data governance note",
    "HR practical-use readiness and production-like readiness remain blocked",
    "next-wave references must keep bounded closeout synchronization / narrow cleanup separate from production-like prerequisites, governance/two-key evidence, and any later bounded practical-use extension",
    "After P2X-02, cite that recommendation as completed bounded follow-up evidence only",
    "P2X-02 later completed the bounded practical-use follow-up wave recommended by this P2X-01 closeout",
    "Current next-wave wording must keep these lanes separate",
    "bounded closeout synchronization / narrow cleanup",
    "production-like prerequisites",
    "governance/two-key evidence",
    "bounded practical-use extension",
    "docs/p2x-02-bounded-practical-use-follow-up-closeout.md",
    "docs/p2x-local-bounded-operator-runbook.md",
    "docs/p2x-synthetic-practical-use-rehearsal-checklist.md",
    "docs/p2x-cross-flow-audit-correlation-lookup-map.md",
    "docs/p2x-synthetic-test-data-governance.md",
    "Completed the README and P2X-01 planning reference bounded status synchronization in #362",
    "This status synchronization preserves the blocked boundary",
    "HR practical-use readiness: Blocked",
    "real employee data use: Blocked",
    "live-provider operation: Blocked",
    "production queue/DLQ operation: Blocked",
    "retention/deletion runtime: Blocked",
    "production-like readiness",
    "two-key acceptance",
  ]) {
    assert.ok(
      combinedText.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X bounded status sync text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "P2X-02 accepts HR practical-use readiness",
    "P2X-02 accepts production-like readiness",
    "HR practical-use readiness: Go",
    "production-like readiness: Go",
    "real employee data: Go",
    "live IdP/Okta operation: Go",
    "production queue/DLQ ready: Go",
    "retention/deletion runtime ready: Go",
    "two-key acceptance: Go",
  ]) {
    assert.ok(
      !combinedText.includes(forbiddenText),
      `P2X bounded status sync must not promote stronger readiness: ${forbiddenText}`,
    );
  }
});

test("P2X guard and policy references cover synchronized artifact cleanup", async () => {
  const [inventory, policyCi, policyCiTest] = await Promise.all([
    readRepoFile("docs/p2x-closeout-reference-inventory.md"),
    readRepoFile("src/mvp-a-policy-as-code-documentation.ts"),
    readRepoFile("src/mvp-a-policy-as-code-ci.test.ts"),
  ]);
  const normalizedInventory = inventory.replace(/\s+/gu, " ").trim();
  const normalizedPolicyCi = policyCi.replace(/\s+/gu, " ").trim();
  const normalizedPolicyCiTest = policyCiTest.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "Completed the guard and policy-as-code reference cleanup in #363",
    "README is also a policy-as-code monitored P2X synchronization artifact",
    "Policy-as-code now loads README, the P2X-02 closeout, and this inventory path alongside the P2X bounded follow-up artifacts",
  ]) {
    assert.ok(
      normalizedInventory.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X guard/policy cleanup inventory reference: ${requiredText}`,
    );
  }

  for (const requiredText of [
    "extractReadmeP2XBoundedStatusSection",
    "Current P2X bounded status:",
    "README P2X bounded status synchronization must be scanned by policy-as-code",
    "P2X bounded practical-use artifacts must not claim stronger readiness or prohibited production/data surfaces",
  ]) {
    assert.ok(
      normalizedPolicyCi.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X guard/policy cleanup policy reference: ${requiredText}`,
    );
  }

  for (const requiredText of [
    "expected README P2X bounded status synchronization to be scanned by policy-as-code",
    "README.md",
    "docs/p2x-01-next-wave-recommendation-closeout.md",
    "docs/p2x-02-bounded-practical-use-follow-up-closeout.md",
    "docs/p2x-hr-practical-use-gap-assessment.md",
    "docs/p2x-local-bounded-operator-runbook.md",
    "docs/p2x-synthetic-practical-use-rehearsal-checklist.md",
    "docs/p2x-cross-flow-audit-correlation-lookup-map.md",
    "docs/p2x-synthetic-test-data-governance.md",
    "docs/p2x-closeout-reference-inventory.md",
    "HR practical-use readiness: Go",
    "production-like readiness: Go",
    "real employee data is approved",
    "live IdP/Okta operation is enabled",
    "production queue/DLQ ready: Go",
    "retention/deletion runtime ready: Go",
    "two-key acceptance is approved",
    "HR practical-use readiness",
    "production-like readiness",
    "real employee data readiness",
    "live IdP/Okta readiness",
    "production queue/DLQ readiness",
    "retention/deletion runtime readiness",
    "two-key Accepted approval",
  ]) {
    assert.ok(
      normalizedPolicyCiTest.includes(
        requiredText.replace(/\s+/gu, " ").trim(),
      ),
      `missing P2X guard/policy cleanup test reference: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "runtime behavior is introduced by this cleanup",
    "provider integration is introduced by this cleanup",
    "export behavior is introduced by this cleanup",
    "queue/DLQ behavior is introduced by this cleanup",
    "retention/deletion behavior is introduced by this cleanup",
  ]) {
    assert.ok(
      !inventory.includes(forbiddenText),
      `P2X guard/policy cleanup must stay documentation-only: ${forbiddenText}`,
    );
  }
});

test("P2X-03 independent closeout accepts bounded synchronization only", async () => {
  const [closeout, readme, policyCi, policyDocs, policyCiTest] =
    await Promise.all([
      readRepoFile("docs/p2x-03-bounded-closeout-synchronization-closeout.md"),
      readRepoFile("README.md"),
      readRepoFile("src/mvp-a-policy-as-code-ci.ts"),
      readRepoFile("src/mvp-a-policy-as-code-documentation.ts"),
      readRepoFile("src/mvp-a-policy-as-code-ci.test.ts"),
    ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();
  const combinedPolicyText = [policyCi, policyDocs, policyCiTest]
    .join("\n")
    .replace(/\s+/gu, " ")
    .trim();

  for (const requiredText of [
    "# P2X-03 Bounded Closeout Synchronization Independent Closeout",
    "Issue: #364",
    "Part of: #360",
    "Depends on: #363",
    "Final verdict: Accepted as bounded closeout synchronization / narrow cleanup only",
    "P2X-02 remains accepted only as bounded practical-use follow-up evidence",
    "It does not accept HR practical-use readiness",
    "It does not accept production-like readiness",
    "Child Output Review",
    "#361",
    "#362",
    "#363",
    "docs/p2x-closeout-reference-inventory.md",
    "docs/p2x-01-next-wave-recommendation-closeout.md",
    "src/mvp-a-policy-as-code-documentation.ts",
    "src/mvp-a-policy-as-code-ci.test.ts",
    "Guard Coverage Review",
    "bounded closeout synchronization / narrow cleanup: Accepted",
    "HR practical-use readiness: Blocked",
    "production-like readiness: Blocked",
    "real employee data use: Blocked",
    "live IdP/Okta operation: Blocked",
    "production queue/DLQ operation: Blocked",
    "retention/deletion runtime: Blocked",
    "two-key acceptance: Blocked",
    "Recommended next wave: EPIC-P2X-04 production-like prerequisite decomposition",
    "Alternative 1: governance/two-key evidence wave",
    "Alternative 2: bounded practical-use extension",
    "Alternative 3: no immediate follow-up",
    'npm test -- --test-name-pattern "P2X-03 independent closeout"',
    "npm run verify:pre-pr",
    "No Surface Expansion Confirmation",
    "Epic #360 can be updated for bounded closeout synchronization / narrow cleanup only",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X-03 independent closeout text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "P2X-03 accepts HR practical-use readiness",
    "P2X-03 accepts production-like readiness",
    "HR practical-use readiness: Go",
    "production-like readiness: Go",
    "real employee data: Go",
    "live IdP/Okta operation: Go",
    "production queue/DLQ ready: Go",
    "retention/deletion runtime ready: Go",
    "two-key acceptance: Go",
  ]) {
    assert.ok(
      !normalizedCloseout.includes(forbiddenText),
      `P2X-03 independent closeout must not promote stronger readiness: ${forbiddenText}`,
    );
  }

  assert.match(
    readme,
    /\[P2X-03 Bounded Closeout Synchronization Independent Closeout\]\(docs\/p2x-03-bounded-closeout-synchronization-closeout\.md\)/,
  );
  assert.ok(
    combinedPolicyText.includes(
      "docs/p2x-03-bounded-closeout-synchronization-closeout.md",
    ),
    "P2X-03 independent closeout must be scanned by policy-as-code",
  );
  assert.doesNotMatch(
    closeout,
    /(?:\/Users\/|C:\\Users\\)/u,
    "P2X-03 independent closeout must not include workstation-local absolute paths",
  );
});

test("P2X-04 real data prerequisite lane keeps approval blockers explicit", async () => {
  const [lane, readme, policyCi, policyDocs, policyCiTest] = await Promise.all([
    readRepoFile("docs/p2x-04-real-data-legal-privacy-prerequisite-lane.md"),
    readRepoFile("README.md"),
    readRepoFile("src/mvp-a-policy-as-code-ci.ts"),
    readRepoFile("src/mvp-a-policy-as-code-documentation.ts"),
    readRepoFile("src/mvp-a-policy-as-code-ci.test.ts"),
  ]);
  const normalizedLane = lane.replace(/\s+/gu, " ").trim();
  const combinedPolicyText = [policyCi, policyDocs, policyCiTest]
    .join("\n")
    .replace(/\s+/gu, " ")
    .trim();

  for (const requiredText of [
    "# P2X-04 Real Data Legal Privacy Prerequisite Lane",
    "Issue: #372",
    "Part of: #371",
    "Final verdict: Blocked prerequisite lane",
    "It does not approve a personnel data processing path",
    "It does not approve legal/privacy runtime use",
    "It does not accept HR practical-use readiness",
    "It does not accept production-like readiness",
    "Current repository evidence remains synthetic or explicitly non-production only",
    "docs/mvp-abcd-bounded-evidence-inventory.md",
    "docs/p2x-hr-practical-use-gap-assessment.md",
    "docs/p2x-production-like-blocker-matrix.md",
    "docs/adr/0006-appi-processing-purpose-dsar-boundary.md",
    "docs/adr/0007-sensitive-personal-information-boundary.md",
    "docs/adr/0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary.md",
    "named legal/privacy basis",
    "named data-owner approval",
    "processing-purpose record",
    "data classification",
    "masking or minimization profile",
    "custody record",
    "transition plan for any future non-production-to-protected-data movement",
    "separate owner approval record for that transition plan",
    "negative fail-closed evidence",
    "real employee data processing: Blocked",
    "legal/privacy runtime approval: Blocked",
    "data-owner approval: Blocked",
    "production-like data processing: Blocked",
    "payroll/benefit data use: Blocked",
    "regulated identifier use: Blocked",
    "sensitive personal information use: Blocked",
    "live tenant data: Blocked",
    "raw payload access: Blocked",
    "broad CSV/export expansion: Blocked",
    "retention/deletion runtime: Blocked",
    "HR practical-use readiness: Blocked",
    "production-like readiness: Blocked",
    "two-key approval: Blocked",
    'npm test -- --test-name-pattern "P2X-04 real data prerequisite lane"',
    "npm run verify:pre-pr",
    "No Surface Expansion Confirmation",
    "Epic #371 can treat this child as complete only for real employee data and legal/privacy prerequisite decomposition",
    "Future records must separately supply owner evidence before changing that status",
  ]) {
    assert.ok(
      normalizedLane.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X-04 real data prerequisite lane text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "real employee data processing: Go",
    "legal/privacy runtime approval: Go",
    "data-owner approval: Go",
    "HR practical-use readiness: Go",
    "production-like readiness: Go",
    "real employee data is ready",
    "legal/privacy approval is ready",
  ]) {
    assert.ok(
      !normalizedLane.includes(forbiddenText),
      `P2X-04 real data prerequisite lane must not promote readiness: ${forbiddenText}`,
    );
  }

  assert.match(
    readme,
    /\[P2X-04 Real Data Legal Privacy Prerequisite Lane\]\(docs\/p2x-04-real-data-legal-privacy-prerequisite-lane\.md\)/,
  );
  assert.ok(
    combinedPolicyText.includes(
      "docs/p2x-04-real-data-legal-privacy-prerequisite-lane.md",
    ),
    "P2X-04 real data prerequisite lane must be scanned by policy-as-code",
  );
  assert.doesNotMatch(
    lane,
    /(?:\/Users\/|C:\\Users\\)/u,
    "P2X-04 real data prerequisite lane must not include workstation-local absolute paths",
  );
});

test("P2X-04 live provider prerequisite lane keeps custody blockers explicit", async () => {
  const [lane, readme, policyCi, policyDocs, policyCiTest] = await Promise.all([
    readRepoFile(
      "docs/p2x-04-live-provider-custody-credential-prerequisite-lane.md",
    ),
    readRepoFile("README.md"),
    readRepoFile("src/mvp-a-policy-as-code-ci.ts"),
    readRepoFile("src/mvp-a-policy-as-code-documentation.ts"),
    readRepoFile("src/mvp-a-policy-as-code-ci.test.ts"),
  ]);
  const normalizedLane = lane.replace(/\s+/gu, " ").trim();
  const combinedPolicyText = [policyCi, policyDocs, policyCiTest]
    .join("\n")
    .replace(/\s+/gu, " ")
    .trim();

  for (const requiredText of [
    "# P2X-04 Live Provider Custody Credential Prerequisite Lane",
    "Issue: #373",
    "Part of: #371",
    "Final verdict: Blocked prerequisite lane",
    "It does not authorize live provider traffic",
    "It does not approve provider credentials",
    "It does not accept HR practical-use readiness",
    "It does not accept production-like readiness",
    "Current repository evidence remains mock-first, synthetic, and explicitly non-production only",
    "docs/okta-poc-connection-contract.md",
    "docs/mvp-a-onboarding-traceability-closeout.md",
    "docs/mvp-b-transfer-traceability-closeout.md",
    "docs/mvp-c-termination-traceability-closeout.md",
    "docs/p2x-hr-practical-use-gap-assessment.md",
    "docs/p2x-production-like-blocker-matrix.md",
    "named tenant binding",
    "trusted credential source",
    "secret rotation and revocation plan",
    "webhook custody boundary",
    "provider audit search evidence",
    "provider error and retry custody record",
    "placeholder credentials",
    "live IdP/Okta operation: Blocked",
    "live provider traffic: Blocked",
    "live tenant binding: Blocked",
    "provider credential custody: Blocked",
    "production credential use: Blocked",
    "webhook runtime custody: Blocked",
    "provider audit search: Blocked",
    "provider retry/error custody: Blocked",
    "provider rollback behavior: Blocked",
    "HR practical-use readiness: Blocked",
    "production-like readiness: Blocked",
    "two-key approval: Blocked",
    'npm test -- --test-name-pattern "P2X-04 live provider prerequisite lane"',
    "npm run verify:pre-pr",
    "No Surface Expansion Confirmation",
    "Epic #371 can treat this child as complete only for live provider custody and credential prerequisite decomposition",
    "Future records must separately supply owner evidence before changing that status",
  ]) {
    assert.ok(
      normalizedLane.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X-04 live provider prerequisite lane text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "live IdP/Okta operation: Go",
    "live provider traffic: Go",
    "provider credential custody: Go",
    "production credential use: Go",
    "webhook runtime custody: Go",
    "HR practical-use readiness: Go",
    "production-like readiness: Go",
    "live provider traffic is approved",
    "provider credentials are approved",
  ]) {
    assert.ok(
      !normalizedLane.includes(forbiddenText),
      `P2X-04 live provider prerequisite lane must not promote readiness: ${forbiddenText}`,
    );
  }

  assert.match(
    readme,
    /\[P2X-04 Live Provider Custody Credential Prerequisite Lane\]\(docs\/p2x-04-live-provider-custody-credential-prerequisite-lane\.md\)/,
  );
  assert.ok(
    combinedPolicyText.includes(
      "docs/p2x-04-live-provider-custody-credential-prerequisite-lane.md",
    ),
    "P2X-04 live provider prerequisite lane must be scanned by policy-as-code",
  );
  assert.doesNotMatch(
    lane,
    /(?:\/Users\/|C:\\Users\\|https:\/\/[^/\s]+\.okta\.com|client_secret|api_token|OKTA_)/iu,
    "P2X-04 live provider prerequisite lane must not include workstation-local or live credential material",
  );
});

test("P2X-04 production authorization RLS prerequisite lane keeps authority blockers explicit", async () => {
  const [lane, readme, policyCi, policyDocs, policyCiTest] = await Promise.all([
    readRepoFile(
      "docs/p2x-04-production-authorization-rls-prerequisite-lane.md",
    ),
    readRepoFile("README.md"),
    readRepoFile("src/mvp-a-policy-as-code-ci.ts"),
    readRepoFile("src/mvp-a-policy-as-code-documentation.ts"),
    readRepoFile("src/mvp-a-policy-as-code-ci.test.ts"),
  ]);
  const normalizedLane = lane.replace(/\s+/gu, " ").trim();
  const combinedPolicyText = [policyCi, policyDocs, policyCiTest]
    .join("\n")
    .replace(/\s+/gu, " ")
    .trim();

  for (const requiredText of [
    "# P2X-04 Production Authorization RLS Prerequisite Lane",
    "Issue: #374",
    "Part of: #371",
    "Final verdict: Blocked prerequisite lane",
    "It does not approve production RBAC",
    "It does not accept PostgreSQL RLS as source of truth",
    "It does not accept HR practical-use readiness",
    "It does not accept production-like readiness",
    "Current repository evidence remains bounded, synthetic, and explicitly non-production only",
    "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md",
    "docs/mvp-a-onboarding-evidence-authorization-gate.md",
    "src/mvp-a-onboarding-evidence-authorization.ts",
    "docs/mvp-a-go-no-go-scope.md",
    "docs/p2x-hr-practical-use-gap-assessment.md",
    "docs/p2x-production-like-blocker-matrix.md",
    "docs/p2x-solo-maintainer-governance-boundary-review.md",
    "accepted authorization/data-scope design",
    "actor/role/tenant binding evidence",
    "trusted proxy identity boundary",
    "PostgreSQL RLS source-of-truth decision",
    "query-layer and service-layer enforcement evidence",
    "negative enforcement tests",
    "mixed-boundary fail-closed evidence",
    "production authorization/RLS: Blocked",
    "production RBAC authority: Blocked",
    "PostgreSQL RLS source of truth: Blocked",
    "authorization/data-scope design acceptance: Blocked",
    "actor/role/tenant binding: Blocked",
    "trusted proxy identity boundary: Blocked",
    "query-layer enforcement: Blocked",
    "service-layer enforcement: Blocked",
    "negative enforcement tests: Blocked",
    "mixed-boundary fail-closed evidence: Blocked",
    "support-console authority: Blocked",
    "HR practical-use readiness: Blocked",
    "production-like readiness: Blocked",
    "two-key approval: Blocked",
    'npm test -- --test-name-pattern "P2X-04 production authorization RLS prerequisite lane"',
    "npm run verify:pre-pr",
    "No Surface Expansion Confirmation",
    "Epic #371 can treat this child as complete only for production authorization/RLS prerequisite decomposition",
    "Future records must separately supply owner evidence before changing that status",
  ]) {
    assert.ok(
      normalizedLane.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X-04 production authorization/RLS prerequisite lane text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "production authorization/RLS: Go",
    "production RBAC authority: Go",
    "PostgreSQL RLS source of truth: Go",
    "authorization/data-scope design acceptance: Go",
    "actor/role/tenant binding: Go",
    "trusted proxy identity boundary: Go",
    "support-console authority: Go",
    "HR practical-use readiness: Go",
    "production-like readiness: Go",
    "production authorization/RLS is approved",
    "Production RBAC authority is ready",
  ]) {
    assert.ok(
      !normalizedLane.includes(forbiddenText),
      `P2X-04 production authorization/RLS prerequisite lane must not promote readiness: ${forbiddenText}`,
    );
  }

  assert.match(
    readme,
    /\[P2X-04 Production Authorization RLS Prerequisite Lane\]\(docs\/p2x-04-production-authorization-rls-prerequisite-lane\.md\)/,
  );
  assert.ok(
    combinedPolicyText.includes(
      "docs/p2x-04-production-authorization-rls-prerequisite-lane.md",
    ),
    "P2X-04 production authorization/RLS prerequisite lane must be scanned by policy-as-code",
  );
  assert.doesNotMatch(
    lane,
    /(?:\/Users\/|C:\\Users\\|CREATE\s+POLICY|ALTER\s+TABLE|ENABLE\s+ROW\s+LEVEL\s+SECURITY|jwt_secret|client_secret|api_token)/iu,
    "P2X-04 production authorization/RLS prerequisite lane must not include workstation-local paths, SQL policy implementation, or credential material",
  );
});

test("P2X-04 production audit immutability prerequisite lane keeps archive blockers explicit", async () => {
  const [lane, readme, policyCi, policyDocs, policyCiTest] = await Promise.all([
    readRepoFile(
      "docs/p2x-04-production-audit-immutability-prerequisite-lane.md",
    ),
    readRepoFile("README.md"),
    readRepoFile("src/mvp-a-policy-as-code-ci.ts"),
    readRepoFile("src/mvp-a-policy-as-code-documentation.ts"),
    readRepoFile("src/mvp-a-policy-as-code-ci.test.ts"),
  ]);
  const normalizedLane = lane.replace(/\s+/gu, " ").trim();
  const combinedPolicyText = [policyCi, policyDocs, policyCiTest]
    .join("\n")
    .replace(/\s+/gu, " ")
    .trim();

  for (const requiredText of [
    "# P2X-04 Production Audit Immutability Prerequisite Lane",
    "Issue: #375",
    "Part of: #371",
    "Final verdict: Blocked prerequisite lane",
    "It does not approve production audit immutability",
    "It does not approve WORM/Object Lock custody",
    "It does not accept HR practical-use readiness",
    "It does not accept production-like readiness",
    "Current repository evidence remains local, mutable, bounded, and explicitly non-production only",
    "docs/adr/0012-audit-event-hash-chain-worm-object-lock-boundary.md",
    "docs/adr/0000-adr-process.md",
    "docs/mvp-a-onboarding-traceability-closeout.md",
    "docs/mvp-b-transfer-traceability-closeout.md",
    "docs/mvp-c-termination-traceability-closeout.md",
    "docs/p2x-cross-flow-audit-correlation-lookup-map.md",
    "docs/p2x-production-like-blocker-matrix.md",
    "docs/p2x-solo-maintainer-governance-boundary-review.md",
    "accepted hash-chain/archive design",
    "WORM/Object Lock or equivalent custody decision",
    "retention posture",
    "restore evidence",
    "tamper-evidence verification",
    "compliance archive procedure",
    "ADR 0000 metadata",
    "production audit immutability: Blocked",
    "production audit readiness: Blocked",
    "production audit archive: Blocked",
    "hash-chain/archive design acceptance: Blocked",
    "WORM/Object Lock custody: Blocked",
    "compliance archive procedure: Blocked",
    "audit retention posture: Blocked",
    "restore evidence: Blocked",
    "tamper-evidence verification: Blocked",
    "broad audit search: Blocked",
    "production support audit search: Blocked",
    "support-console authority: Blocked",
    "HR practical-use readiness: Blocked",
    "production-like readiness: Blocked",
    "two-key approval: Blocked",
    'npm test -- --test-name-pattern "P2X-04 production audit immutability prerequisite lane"',
    "npm run verify:pre-pr",
    "No Surface Expansion Confirmation",
    "Epic #371 can treat this child as complete only for production audit immutability prerequisite decomposition",
    "Future records must separately supply owner evidence before changing that status",
  ]) {
    assert.ok(
      normalizedLane.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X-04 production audit immutability prerequisite lane text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "production audit immutability: Go",
    "production audit readiness: Go",
    "production audit archive: Go",
    "- accepted hash-chain/archive design naming event identity and production audit archive is approved",
    "- accepted hash-chain/archive design naming event identity is accepted",
    "hash-chain/archive design acceptance: Go",
    "accepted audit retention posture",
    "accepted restore evidence",
    "accepted tamper-evidence verification",
    "audit retention posture: Go",
    "retention posture: Go",
    "restore evidence: Go",
    "restore procedure: Go",
    "restore operation is approved",
    "tamper-evidence verification: Go",
    "tamper-evidence verifier is ready",
    "hash-chain runtime: Go",
    "WORM/Object Lock custody: Go",
    "compliance archive procedure: Go",
    "external archive bucket is approved",
    "retention mode: Go",
    "broad audit search: Go",
    "production support audit search: Go",
    "support-console authority: Go",
    "HR practical-use readiness: Go",
    "production-like readiness: Go",
    "production audit immutability is accepted",
    "hash-chain/archive design is accepted",
    "audit retention posture is approved",
    "restore evidence is complete",
    "tamper-evidence verification is ready",
    "WORM/Object Lock custody is ready",
  ]) {
    assert.ok(
      !normalizedLane.includes(forbiddenText),
      `P2X-04 production audit immutability prerequisite lane must not promote readiness: ${forbiddenText}`,
    );
  }

  assert.match(
    readme,
    /\[P2X-04 Production Audit Immutability Prerequisite Lane\]\(docs\/p2x-04-production-audit-immutability-prerequisite-lane\.md\)/,
  );
  assert.ok(
    combinedPolicyText.includes(
      "docs/p2x-04-production-audit-immutability-prerequisite-lane.md",
    ),
    "P2X-04 production audit immutability prerequisite lane must be scanned by policy-as-code",
  );
  assert.doesNotMatch(
    lane,
    /(?:\/Users\/|C:\\Users\\|CREATE\s+BUCKET|aws\s+s3api|ObjectLockEnabledForBucket|access_key|secret_access_key|api_token)/iu,
    "P2X-04 production audit immutability prerequisite lane must not include workstation-local paths, storage implementation commands, or credential material",
  );
});

test("P2X-04 raw payload CSV export prerequisite lane keeps export blockers explicit", async () => {
  const [lane, readme, policyCi, policyDocs, policyCiTest] = await Promise.all([
    readRepoFile("docs/p2x-04-raw-payload-csv-export-prerequisite-lane.md"),
    readRepoFile("README.md"),
    readRepoFile("src/mvp-a-policy-as-code-ci.ts"),
    readRepoFile("src/mvp-a-policy-as-code-documentation.ts"),
    readRepoFile("src/mvp-a-policy-as-code-ci.test.ts"),
  ]);
  const normalizedLane = lane.replace(/\s+/gu, " ").trim();
  const combinedPolicyText = [policyCi, policyDocs, policyCiTest]
    .join("\n")
    .replace(/\s+/gu, " ")
    .trim();

  for (const requiredText of [
    "# P2X-04 Raw Payload CSV Export Prerequisite Lane",
    "Issue: #376",
    "Part of: #371",
    "Final verdict: Blocked prerequisite lane",
    "It does not approve raw payload viewing",
    "It does not approve broad CSV export",
    "It does not accept HR practical-use readiness",
    "It does not accept production-like readiness",
    "Current repository evidence remains bounded, synthetic, narrow-template, and explicitly non-production only",
    "docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md",
    "docs/mvp-a-onboarding-pii-export-gate.md",
    "docs/mvp-d-csv-import-contract.md",
    "docs/mvp-d-p2d-01-readiness-review-closeout.md",
    "docs/mvp-d-p2d-02-refactor-wave-closeout.md",
    "docs/p2x-hr-practical-use-gap-assessment.md",
    "docs/p2x-production-like-blocker-matrix.md",
    "docs/p2x-solo-maintainer-governance-boundary-review.md",
    "raw-view/export permission model",
    "redaction or masking profile",
    "template allowlist",
    "watermark or manifest design",
    "download-log evidence",
    "legal/privacy and data-owner approval record",
    "prohibited-payload controls",
    "negative broad-export tests",
    "unrestricted raw payload: Blocked",
    "raw payload viewing: Blocked",
    "raw payload download: Blocked",
    "raw-view/export permissions: Blocked",
    "broad CSV export: Blocked",
    "broad CSV/export expansion: Blocked",
    "export download: Blocked",
    "export permission runtime: Blocked",
    "redaction or masking profile: Blocked",
    "template allowlist: Blocked",
    "watermark or manifest: Blocked",
    "download-log evidence: Blocked",
    "legal/privacy runtime approval: Blocked",
    "data-owner approval: Blocked",
    "prohibited-payload controls: Blocked",
    "negative broad-export tests: Blocked",
    "HR practical-use readiness: Blocked",
    "production-like readiness: Blocked",
    "two-key approval: Blocked",
    'npm test -- --test-name-pattern "P2X-04 raw payload CSV export prerequisite lane"',
    "npm run verify:pre-pr",
    "No Surface Expansion Confirmation",
    "Epic #371 can scope this child to raw payload and broad CSV/export prerequisite decomposition only",
    "Future records must separately supply owner evidence before changing that status",
  ]) {
    assert.ok(
      normalizedLane.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X-04 raw payload CSV export prerequisite lane text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "unrestricted raw payload: Go",
    "raw payload viewing: Go",
    "raw payload download: Go",
    "raw-view/export permissions: Go",
    "export permission is approved",
    "export-permission is approved",
    "broad CSV export: Go",
    "broad CSV/export expansion: Go",
    "CSV export is approved",
    "CSV export: Go",
    "export download: Go",
    "export permission runtime: Go",
    "redaction and masking profile is approved",
    "redaction or masking profile: Go",
    "export template is approved",
    "export templates are ready",
    "template allowlist: Go",
    "watermark or manifest: Go",
    "watermark/manifest is ready",
    "download-log evidence: Go",
    "download log evidence is complete",
    "legal approval is approved",
    "legal/privacy runtime approval: Go",
    "data-owner approval: Go",
    "prohibited-payload controls: Go",
    "negative broad-export tests: Go",
    "HR practical-use readiness: Go",
    "production-like readiness: Go",
    "raw payload viewing is approved",
    "broad CSV export is approved",
    "CSV/export is enabled",
    "download-log evidence is complete",
    "redaction or masking profile is approved",
  ]) {
    assert.ok(
      !normalizedLane.includes(forbiddenText),
      `P2X-04 raw payload CSV export prerequisite lane must not promote readiness: ${forbiddenText}`,
    );
  }

  assert.match(
    readme,
    /\[P2X-04 Raw Payload CSV Export Prerequisite Lane\]\(docs\/p2x-04-raw-payload-csv-export-prerequisite-lane\.md\)/,
  );
  assert.ok(
    combinedPolicyText.includes(
      "docs/p2x-04-raw-payload-csv-export-prerequisite-lane.md",
    ),
    "P2X-04 raw payload CSV export prerequisite lane must be scanned by policy-as-code",
  );
  assert.doesNotMatch(
    lane,
    /(?:\/Users\/|C:\\Users\\|CREATE\s+EXPORT|COPY\s+.*TO|SELECT\s+\*\s+FROM|aws\s+s3|access_key|secret_access_key|api_token)/iu,
    "P2X-04 raw payload CSV export prerequisite lane must not include workstation-local paths, export implementation commands, or credential material",
  );
});

test("P2X-04 production queue DLQ Ops prerequisite lane keeps Ops blockers explicit", async () => {
  const [lane, readme, policyCi, policyDocs, policyCiTest] = await Promise.all([
    readRepoFile("docs/p2x-04-production-queue-dlq-ops-prerequisite-lane.md"),
    readRepoFile("README.md"),
    readRepoFile("src/mvp-a-policy-as-code-ci.ts"),
    readRepoFile("src/mvp-a-policy-as-code-documentation.ts"),
    readRepoFile("src/mvp-a-policy-as-code-ci.test.ts"),
  ]);
  const normalizedLane = lane.replace(/\s+/gu, " ").trim();
  const combinedPolicyText = [policyCi, policyDocs, policyCiTest]
    .join("\n")
    .replace(/\s+/gu, " ")
    .trim();

  for (const requiredText of [
    "# P2X-04 Production Queue DLQ Ops Prerequisite Lane",
    "Issue: #377",
    "Part of: #371",
    "Final verdict: Blocked prerequisite lane",
    "It does not approve production queue/DLQ readiness",
    "It does not approve production Ops readiness",
    "It does not accept HR practical-use readiness",
    "It does not accept production-like readiness",
    "Current repository evidence remains local, synthetic, bounded, and explicitly non-production only",
    "docs/mvp-d-local-ops-job-status-runbook.md",
    "docs/mvp-d-p2d-01-readiness-review-closeout.md",
    "docs/mvp-d-p2d-02-refactor-wave-closeout.md",
    "docs/p2x-cross-flow-audit-correlation-lookup-map.md",
    "docs/p2x-local-bounded-operator-runbook.md",
    "docs/p2x-production-like-blocker-matrix.md",
    "scheduler ownership",
    "queue and DLQ ownership",
    "replay authorization",
    "retry guardrails",
    "monitoring and alerting",
    "support-console custody",
    "incident workflow",
    "ticket binding",
    "SLO/SLA",
    "backup/restore operation",
    "release/rollback procedure",
    "post-use review",
    "production scheduler: Blocked",
    "production queue/DLQ: Blocked",
    "production queue/DLQ readiness: Blocked",
    "production DLQ runtime: Blocked",
    "production replay authority: Blocked",
    "replay authorization: Blocked",
    "retry guardrails: Blocked",
    "monitoring and alerting: Blocked",
    "support-console custody: Blocked",
    "incident workflow: Blocked",
    "ticket binding: Blocked",
    "SLO/SLA: Blocked",
    "backup/restore operation: Blocked",
    "release/rollback procedure: Blocked",
    "post-use review: Blocked",
    "production Ops readiness: Blocked",
    "HR practical-use readiness: Blocked",
    "production-like readiness: Blocked",
    "two-key approval: Blocked",
    'npm test -- --test-name-pattern "P2X-04 production queue DLQ Ops prerequisite lane"',
    "npm run verify:pre-pr",
    "No Surface Expansion Confirmation",
    "Epic #371 can scope this child to production queue/DLQ and production Ops prerequisite decomposition only",
    "Future records must separately supply owner evidence before changing that status",
  ]) {
    assert.ok(
      normalizedLane.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X-04 production queue DLQ Ops prerequisite lane text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "production scheduler: Go",
    "production queue/DLQ ready: Go",
    "production queue/DLQ readiness: Go",
    "production DLQ runtime is enabled",
    "production replay authority is approved",
    "scheduler ownership is approved",
    "queue and DLQ ownership is approved",
    "replay authorization is approved",
    "retry guardrails are complete",
    "monitoring and alerting is ready",
    "support-console custody is approved",
    "incident workflow is ready",
    "ticket binding is approved",
    "SLO/SLA is ready",
    "backup/restore operation is approved",
    "release/rollback procedure is ready",
    "post-use review is complete",
    "production Ops readiness: Go",
    "production operations authority is approved",
    "HR practical-use readiness: Go",
    "production-like readiness: Go",
  ]) {
    assert.ok(
      !normalizedLane
        .toLocaleLowerCase()
        .includes(forbiddenText.toLocaleLowerCase()),
      `P2X-04 production queue DLQ Ops prerequisite lane must not promote readiness: ${forbiddenText}`,
    );
  }

  assert.match(
    readme,
    /\[P2X-04 Production Queue DLQ Ops Prerequisite Lane\]\(docs\/p2x-04-production-queue-dlq-ops-prerequisite-lane\.md\)/,
  );
  assert.ok(
    combinedPolicyText.includes(
      "docs/p2x-04-production-queue-dlq-ops-prerequisite-lane.md",
    ),
    "P2X-04 production queue DLQ Ops prerequisite lane must be scanned by policy-as-code",
  );
  for (const guardText of [
    "Scheduler ownership is approved.",
    "Replay authorization is approved.",
    "Monitoring and alerting is ready.",
    "Support-console custody is approved.",
    "SLO/SLA is ready.",
    "Release/rollback procedure is ready.",
  ]) {
    assert.ok(
      combinedPolicyText.includes(guardText),
      `P2X-04 production queue DLQ Ops policy fixture must cover: ${guardText}`,
    );
  }
  assert.doesNotMatch(
    lane,
    /(?:\/Users\/|C:\\Users\\|CREATE\s+QUEUE|CREATE\s+DLQ|aws\s+sqs|kubectl|pagerduty|access_key|secret_access_key|api_token)/iu,
    "P2X-04 production queue DLQ Ops prerequisite lane must not include workstation-local paths, Ops implementation commands, or credential material",
  );
});

test("P2X-04 retention deletion future-extension prerequisite lane keeps blockers explicit", async () => {
  const [lane, readme, policyCi, policyDocs, policyCiTest] = await Promise.all([
    readRepoFile(
      "docs/p2x-04-retention-deletion-future-extension-prerequisite-lane.md",
    ),
    readRepoFile("README.md"),
    readRepoFile("src/mvp-a-policy-as-code-ci.ts"),
    readRepoFile("src/mvp-a-policy-as-code-documentation.ts"),
    readRepoFile("src/mvp-a-policy-as-code-ci.test.ts"),
  ]);
  const normalizedLane = lane.replace(/\s+/gu, " ").trim();
  const combinedPolicyText = [policyCi, policyDocs, policyCiTest]
    .join("\n")
    .replace(/\s+/gu, " ")
    .trim();

  for (const requiredText of [
    "# P2X-04 Retention Deletion Future Extension Prerequisite Lane",
    "Issue: #378",
    "Part of: #371",
    "Final verdict: Blocked prerequisite lane",
    "It does not approve retention/deletion runtime",
    "It does not approve future-extension runtime",
    "It does not accept HR practical-use readiness",
    "It does not accept production-like readiness",
    "Current repository evidence remains design-only, Proposed, bounded, and explicitly non-production only",
    "docs/adr/0009-retiree-retention-physical-deletion-boundary.md",
    "docs/adr/0015-my-number-external-reference-separate-schema-boundary.md",
    "docs/adr/0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary.md",
    "docs/adr/0017-employment-status-work-arrangement-extension-boundary.md",
    "docs/adr/0018-retiree-retention-anonymization-deletion-job-retention-log-extension-boundary.md",
    "docs/adr/0019-legal-entity-timezone-business-calendar-extension-boundary.md",
    "docs/adr/0020-r08-prohibited-column-payload-policy-boundary.md",
    "docs/mvp-c-p2c-01-readiness-review-closeout.md",
    "docs/mvp-c-p2c-02-refactor-wave-closeout.md",
    "docs/p2x-production-like-blocker-matrix.md",
    "retention/deletion ADR evidence",
    "jurisdiction and legal-entity applicability",
    "anonymization, hard-delete, and legal-hold behavior",
    "deletion-job custody",
    "retention log evidence",
    "restore cleanup evidence",
    "no-orphan tests",
    "extension scope records",
    "migration/runtime authorization",
    "negative no-escape-hatch tests",
    "retention/deletion runtime: Blocked",
    "retention/deletion jobs: Blocked",
    "retention/deletion requests: Blocked",
    "anonymization job: Blocked",
    "hard-delete job: Blocked",
    "legal-hold workflow: Blocked",
    "deletion-job custody: Blocked",
    "retention log runtime: Blocked",
    "restore cleanup: Blocked",
    "no-orphan tests: Blocked",
    "jurisdiction/legal-entity applicability: Blocked",
    "future-extension runtime: Blocked",
    "future-extension readiness: Blocked",
    "extension scope records: Blocked",
    "migration/runtime authorization: Blocked",
    "negative no-escape-hatch tests: Blocked",
    "legal/privacy approval: Blocked",
    "HR practical-use readiness: Blocked",
    "production-like readiness: Blocked",
    "two-key approval: Blocked",
    'npm test -- --test-name-pattern "P2X-04 retention deletion future-extension prerequisite lane"',
    "npm run verify:pre-pr",
    "No Surface Expansion Confirmation",
    "Epic #371 can scope this child to retention/deletion and future-extension prerequisite decomposition only",
    "Future records must separately supply owner evidence before changing that status",
  ]) {
    assert.ok(
      normalizedLane.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2X-04 retention deletion future-extension prerequisite lane text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "retention/deletion runtime ready: Go",
    "retention-deletion runtime is ready",
    "retention deletion runtime is ready",
    "retention/deletion jobs are enabled",
    "retention/deletion requests are approved",
    "retention/deletion ADR evidence is approved",
    "anonymization job is ready",
    "hard-delete job is enabled",
    "deletion job is enabled",
    "physical deletion exception is approved",
    "physical deletion path is enabled",
    "retention exception handling is approved",
    "legal-hold workflow is approved",
    "deletion-job custody is approved",
    "retention log runtime is ready",
    "retention-log runtime is ready",
    "restore cleanup is complete",
    "restore cleanup is completed",
    "no-orphan tests are complete",
    "no-orphan tests are completed",
    "jurisdiction/legal-entity applicability is approved",
    "jurisdiction and legal-entity applicability is approved",
    "future-extension runtime is ready",
    "future-extension readiness: Go",
    "future-extension schema is approved",
    "future-extension API is enabled",
    "extension scope records are complete",
    "privacy-classification runtime is approved",
    "consent runtime is approved",
    "employment-status runtime is ready",
    "work-arrangement runtime is approved",
    "future-date worker authority is approved",
    "future-date apply worker is approved",
    "future-date processing is enabled",
    "timezone source is approved",
    "business-calendar runtime is ready",
    "My Number external reference is approved",
    "My Number separate schema is approved",
    "My Number vault reference is approved",
    "parser/full-engine is approved",
    "parser/validator enforcement is approved",
    "migration/runtime authorization is approved",
    "schema/API/runtime authorization is approved",
    "negative no-escape-hatch tests are complete",
    "prohibited-payload runtime is enabled",
    "HR practical-use readiness: Go",
    "production-like readiness: Go",
  ]) {
    assert.ok(
      !normalizedLane
        .toLocaleLowerCase()
        .includes(forbiddenText.toLocaleLowerCase()),
      `P2X-04 retention deletion future-extension prerequisite lane must not promote readiness: ${forbiddenText}`,
    );
  }

  assert.match(
    readme,
    /\[P2X-04 Retention Deletion Future Extension Prerequisite Lane\]\(docs\/p2x-04-retention-deletion-future-extension-prerequisite-lane\.md\)/,
  );
  assert.ok(
    combinedPolicyText.includes(
      "docs/p2x-04-retention-deletion-future-extension-prerequisite-lane.md",
    ),
    "P2X-04 retention deletion future-extension prerequisite lane must be scanned by policy-as-code",
  );
  for (const guardText of [
    "Retention/deletion ADR evidence is approved.",
    "Retention-deletion runtime is ready.",
    "Hard-delete job is enabled.",
    "Physical deletion path is enabled.",
    "Retention exception handling is approved.",
    "No-orphan tests are completed.",
    "Jurisdiction and legal-entity applicability is approved.",
    "Retention-log runtime is ready.",
    "Consent runtime is approved.",
    "Employment-status runtime is ready.",
    "Future-date worker authority is approved.",
    "Future-date apply worker is approved.",
    "Timezone source is approved.",
    "Business-calendar runtime is ready.",
    "My Number external reference is approved.",
    "Parser/full-engine is approved.",
    "Future-extension schema is approved.",
    "Migration/runtime authorization is approved.",
    "Negative no-escape-hatch tests are complete.",
  ]) {
    assert.ok(
      combinedPolicyText.includes(guardText),
      `P2X-04 retention deletion future-extension policy fixture must cover: ${guardText}`,
    );
  }
  assert.doesNotMatch(
    lane,
    /(?:\/Users\/|C:\\Users\\|CREATE\s+TABLE|ALTER\s+TABLE|DELETE\s+FROM|UPDATE\s+.*SET|kubectl|aws\s+s3|access_key|secret_access_key|api_token)/iu,
    "P2X-04 retention deletion future-extension prerequisite lane must not include workstation-local paths, implementation commands, or credential material",
  );
});

test("MVP-D P2D-02 refactor wave closeout records behavior-preserving review", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile("docs/mvp-d-p2d-02-refactor-wave-closeout.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-D P2D-02 Refactor Wave Closeout",
    "Issue: #329",
    "Part of: #323",
    "Depends on: #328",
    "Readiness Verdict",
    "bounded/non-production MVP-D CSV/Ops/DLQ evidence: unchanged",
    "HR practical-use ready: Blocked",
    "production-like ready: Blocked",
    "real employee data: Blocked",
    "live Okta tenant operation: Blocked",
    "production queue/DLQ ready: Blocked",
    "retention/deletion runtime ready: Blocked",
    "Reviewed Refactor Artifacts",
    "CSV import contract / parser / validation helper split",
    "CSV import apply / persistence / idempotency boundary split",
    "bounded CSV export policy / audit helper split",
    "local Ops job status / failure decision boundary split",
    "CSV/Ops/DLQ traceability verifier / test helper split",
    "Behavior and Boundary Review",
    "No behavior drift, API drift, migration drift, policy weakening, or readiness-claim broadening was accepted",
    "P0-R05 (#11), P0-R06 (#12), and P0-R08 (#14) remain owner-acknowledged defer / production-like blocked",
    "Verification Commands",
    "npm run verify:pre-pr",
    "Residual Refactor Debt",
    "Final Verdict",
    "P2D-02 can close as behavior-preserving maintainability hardening",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2D-02 refactor wave closeout text: ${requiredText}`,
    );
  }

  for (const forbiddenText of [
    "HR practical-use ready: Go",
    "production-like ready: Go",
    "real employee data: Go",
    "live Okta tenant operation: Go",
    "production queue/DLQ ready: Go",
    "retention/deletion runtime ready: Go",
    "unrestricted raw payload/export ready: Go",
    "Accepted two-key approval",
  ]) {
    assert.ok(
      !normalizedCloseout.includes(forbiddenText),
      `P2D-02 closeout must not broaden readiness with: ${forbiddenText}`,
    );
  }

  assert.match(
    readme,
    /\[MVP-D P2D-02 Refactor Wave Closeout\]\(docs\/mvp-d-p2d-02-refactor-wave-closeout\.md\)/,
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

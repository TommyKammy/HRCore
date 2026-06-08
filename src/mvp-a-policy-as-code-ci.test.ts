import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { text, sqliteTable } from "drizzle-orm/sqlite-core";

import {
  checkMvpAPolicyAsCode,
  loadCurrentMvpAPolicyAsCodeInputs,
  mvpAPolicyAsCodeDocumentationPaths,
  type MvpAPolicyAsCodeInputs,
} from "./mvp-a-policy-as-code-ci.js";

async function writeMinimalPolicyInputRepository(
  cwd: string,
  documentationPaths: readonly string[] = mvpAPolicyAsCodeDocumentationPaths,
): Promise<void> {
  await mkdir(join(cwd, "drizzle"), { recursive: true });
  await mkdir(join(cwd, "openapi"), { recursive: true });
  await writeFile(join(cwd, "drizzle", "0000_fixture.sql"), "");
  await writeFile(
    join(cwd, "openapi", "hrcore.openapi.json"),
    JSON.stringify({
      paths: {
        "/onboarding/new-hire": {
          get: {
            operationId: "getOnboardingNewHire",
          },
        },
      },
    }),
  );

  for (const documentationPath of documentationPaths) {
    await mkdir(join(cwd, dirname(documentationPath)), { recursive: true });
    await writeFile(
      join(cwd, documentationPath),
      `fixture policy docs for ${documentationPath}`,
    );
  }
}

test("MVP-A policy-as-code exposes focused helper entry points", async () => {
  const openApiModulePath = "./mvp-a-policy-as-code-openapi.js";
  const repositoryModulePath = "./mvp-a-policy-as-code-repository.js";
  const repositorySurfacesModulePath =
    "./mvp-a-policy-as-code-repository-surfaces.js";
  const gateModulePath = "./mvp-a-policy-as-code-gates.js";
  const fixtureSeedModulePath = "./mvp-a-policy-as-code-fixture-seed.js";
  const documentationModulePath = "./mvp-a-policy-as-code-documentation.js";

  const openApiHelpers = (await import(openApiModulePath)) as Record<
    string,
    unknown
  >;
  const repositoryHelpers = (await import(repositoryModulePath)) as Record<
    string,
    unknown
  >;
  const repositorySurfaceHelpers = (await import(
    repositorySurfacesModulePath
  )) as Record<string, unknown>;
  const gateHelpers = (await import(gateModulePath)) as Record<string, unknown>;
  const fixtureSeedHelpers = (await import(fixtureSeedModulePath)) as Record<
    string,
    unknown
  >;
  const documentationHelpers = (await import(
    documentationModulePath
  )) as Record<string, unknown>;

  assert.equal(
    typeof openApiHelpers.collectOpenApiOperationSurfaces,
    "function",
  );
  assert.equal(
    typeof openApiHelpers.collectOpenApiSchemaPropertyNamesFromValue,
    "function",
  );
  assert.equal(typeof repositoryHelpers.readRepoTextFilesByPath, "function");
  assert.equal(
    typeof repositoryHelpers.readDiscoveredFixtureSeedTextByPath,
    "function",
  );
  assert.equal(
    typeof repositorySurfaceHelpers.collectSchemaFindings,
    "function",
  );
  assert.equal(
    typeof repositorySurfaceHelpers.collectMigrationFindings,
    "function",
  );
  assert.equal(typeof gateHelpers.collectGateFindings, "function");
  assert.equal(
    typeof fixtureSeedHelpers.collectFixtureSeedFindings,
    "function",
  );
  assert.equal(
    typeof documentationHelpers.collectDocumentationFindings,
    "function",
  );
  assert.ok(
    mvpAPolicyAsCodeDocumentationPaths.includes(
      "docs/p0-gov-01-solo-maintainer-governance-closeout.md",
    ),
    "expected P0-GOV-01 closeout to be scanned by policy-as-code",
  );
  assert.ok(
    mvpAPolicyAsCodeDocumentationPaths.includes("README.md"),
    "expected README P2X bounded status synchronization to be scanned by policy-as-code",
  );
  for (const path of [
    "docs/p2x-01-next-wave-recommendation-closeout.md",
    "docs/p2x-02-bounded-practical-use-follow-up-closeout.md",
    "docs/p2x-hr-practical-use-gap-assessment.md",
    "docs/p2x-local-bounded-operator-runbook.md",
    "docs/p2x-synthetic-practical-use-rehearsal-checklist.md",
    "docs/p2x-cross-flow-audit-correlation-lookup-map.md",
    "docs/p2x-synthetic-test-data-governance.md",
    "docs/p2x-closeout-reference-inventory.md",
    "docs/p2x-03-bounded-closeout-synchronization-closeout.md",
    "docs/p2x-04-real-data-legal-privacy-prerequisite-lane.md",
    "docs/p2x-04-live-provider-custody-credential-prerequisite-lane.md",
    "docs/p2x-04-production-authorization-rls-prerequisite-lane.md",
  ] as const) {
    assert.ok(
      mvpAPolicyAsCodeDocumentationPaths.includes(path),
      `expected ${path} to be scanned by policy-as-code`,
    );
  }
  assert.deepEqual(
    mvpAPolicyAsCodeDocumentationPaths.filter((path) =>
      path.startsWith("docs/adr/"),
    ),
    [
      "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md",
      "docs/adr/0012-audit-event-hash-chain-worm-object-lock-boundary.md",
      "docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md",
    ],
  );
});

test("MVP-A policy-as-code gate passes for current repository surfaces", async () => {
  assert.deepEqual(
    checkMvpAPolicyAsCode(await loadCurrentMvpAPolicyAsCodeInputs()),
    [],
  );
});

test("MVP-A policy-as-code gate fails closed for prohibited schema and migration columns", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const fixtureInputs: MvpAPolicyAsCodeInputs = {
    ...inputs,
    schemaTables: [
      sqliteTable("fixture_onboarding", {
        id: text("id").primaryKey(),
        rawPayload: text("raw_payload"),
      }),
    ],
    migrationSqlByPath: new Map([
      [
        "drizzle/fixture.sql",
        [
          "CREATE TABLE `fixture_onboarding` (`id` text PRIMARY KEY, `csv_export` text);",
          "ALTER TABLE `fixture_onboarding` ADD `raw_payload` text;",
        ].join("\n"),
      ],
    ]),
    openApiContract: {
      paths: {
        "/onboarding/new-hire": {
          get: {
            operationId: "getOnboardingNewHire",
          },
        },
      },
    },
  };

  const findings = checkMvpAPolicyAsCode(fixtureInputs);

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "schema" &&
        finding.subject === "fixture_onboarding.raw_payload",
    ),
    "expected schema raw_payload column to fail the policy gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "migration" &&
        finding.subject === "fixture_onboarding.csv_export",
    ),
    "expected migration csv_export column to fail the policy gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "migration" &&
        finding.subject === "fixture_onboarding.raw_payload",
    ),
    "expected ALTER migration raw_payload column to fail the policy gate",
  );
});

test("MVP-A policy-as-code gate fails closed for non-production data drift", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    migrationSqlByPath: new Map([
      [
        "drizzle/fixture-non-production.sql",
        "CREATE TABLE `fixture_onboarding` (`id` text PRIMARY KEY, `production_like_data` text);",
      ],
    ]),
    openApiContract: {
      paths: {
        "/onboarding/new-hire": {
          get: {
            operationId: "getOnboardingNewHire",
            responses: {
              200: {
                description: "Blocked fixture",
                content: {
                  "application/json": {
                    schema: {
                      properties: {
                        unmaskedEmail: {
                          type: "string",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    fixtureSeedTextByPath: new Map([
      ["src/fixture-seed.ts", "const fixtureName = 'real employee';"],
    ]),
    documentationTextByPath: new Map([
      ["docs/mvp-a-onboarding-non-production-data-gate.md", "incomplete"],
    ]),
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "migration" &&
        finding.subject === "fixture_onboarding.production_like_data",
    ),
    "expected production_like_data migration column to fail the policy gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "openapi" &&
        finding.subject === "/onboarding/new-hire.unmaskedEmail",
    ),
    "expected unmaskedEmail OpenAPI response field to fail the policy gate",
  );
  assert.ok(
    findings.some((finding) => finding.surface === "fixture-seed"),
    "expected fixture or seed text to fail the policy gate",
  );
  assert.ok(
    findings.some((finding) => finding.surface === "documentation"),
    "expected missing documentation blockers to fail the policy gate",
  );
});

test("MVP-A policy-as-code gate fails closed for affected readiness overclaims", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        "docs/fixture-readiness-overclaim.md",
        [
          "P0-R05 / #11 authorization and data-scope enforcement: Accepted.",
          "P0-R06 / #12 audit immutability and production backup is production-like-ready: Go.",
          "P0-R08 / #14 raw payload and CSV/export can be treated as Accepted.",
        ].join("\n"),
      ],
    ]),
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === "docs/fixture-readiness-overclaim.md" &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected P0-R05 Accepted overclaim to fail the documentation policy gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === "docs/fixture-readiness-overclaim.md" &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected P0-R06 production-like overclaim to fail the documentation policy gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === "docs/fixture-readiness-overclaim.md" &&
        finding.subject === "P0-R08 / #14",
    ),
    "expected P0-R08 Accepted overclaim to fail the documentation policy gate",
  );
});

test("MVP-A policy-as-code gate scans ADR-path table rows as gate claims", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        "docs/fixture-adr-path-overclaim.md",
        [
          "| Decision record | Readiness |",
          "| --- | --- |",
          "| docs/adr/0011-data-scope-policy-dsl-rls-boundary.md | Accepted |",
          "| docs/adr/0012-audit-event-hash-chain-worm-object-lock-boundary.md | production-like-ready: Go |",
          "| docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md | Accepted |",
        ].join("\n"),
      ],
    ]),
  });

  for (const subject of ["P0-R05 / #11", "P0-R06 / #12", "P0-R08 / #14"]) {
    assert.ok(
      findings.some(
        (finding) =>
          finding.surface === "documentation" &&
          finding.path === "docs/fixture-adr-path-overclaim.md" &&
          finding.subject === subject,
      ),
      `expected ${subject} ADR-path table overclaim to fail the policy gate`,
    );
  }
});

test("MVP-A policy-as-code input loader scans P2X bounded practical-use artifacts", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await writeMinimalPolicyInputRepository(fixtureCwd);
  const p2xFixtureClaims = [
    [
      "README.md",
      [
        "Current P2X bounded status: HR practical-use readiness: Go.",
        "Current P2X bounded status: production-like readiness: Go.",
        "Current P2X bounded status: production-like data processing: Go.",
        "Current P2X bounded status: real employee data is approved.",
        "Current P2X bounded status: data-owner approval is approved.",
        "Current P2X bounded status: live IdP/Okta operation is enabled.",
        "Current P2X bounded status: production queue/DLQ ready: Go.",
        "Current P2X bounded status: retention/deletion runtime ready: Go.",
        "Current P2X bounded status: two-key acceptance is approved.",
      ].join("\n"),
      [
        "HR practical-use readiness",
        "production-like readiness",
        "production-like data processing",
        "real employee data readiness",
        "data-owner approval",
        "live IdP/Okta readiness",
        "production queue/DLQ readiness",
        "retention/deletion runtime readiness",
        "two-key Accepted approval",
      ],
    ],
    [
      "docs/p2x-01-next-wave-recommendation-closeout.md",
      [
        "Production backup is approved.",
        "Production restore approval is complete.",
        "| Surface | Status |",
        "| --- | --- |",
        "| live IdP/Okta | complete |",
        "| production queue/DLQ | processing |",
      ].join("\n"),
      [
        "production backup/restore readiness",
        "live IdP/Okta readiness",
        "production queue/DLQ readiness",
      ],
    ],
    [
      "docs/p2x-hr-practical-use-gap-assessment.md",
      [
        "HR practical-use readiness: Go.",
        "Real employee data is ready.",
        "Production ops readiness: Go.",
        "Production operations authority is approved.",
        "Production authorization/RLS is approved.",
        "Production audit immutability is accepted.",
        "Production audit readiness: Go.",
        "Broad audit search is approved.",
        "Compliance archive is enabled.",
        "WORM/Object Lock is approved.",
        "Legal/privacy acceptance is approved.",
        "Legal/privacy runtime is accepted.",
        "Two-key acceptance is approved.",
        "Two-key acceptance: Go.",
      ].join("\n"),
      [
        "HR practical-use readiness",
        "real employee data readiness",
        "production ops readiness",
        "production authorization/RLS readiness",
        "production audit immutability readiness",
        "production audit/archive readiness",
        "legal/privacy acceptance",
        "two-key Accepted approval",
      ],
    ],
    [
      "docs/p2x-local-bounded-operator-runbook.md",
      [
        "No real employee data, but HR practical-use readiness: Go.",
        "No real employee data but practical-use readiness is Go.",
        "HR practical-use readiness: Go, but real employee data remains blocked.",
        "No unrestricted raw payload | production-like readiness: Go.",
        "Unrestricted raw payload is enabled.",
        "Raw payload access is approved.",
        "Support-console custody is approved.",
        "Production support process is enabled.",
      ].join("\n"),
      [
        "HR practical-use readiness",
        "production-like readiness",
        "unrestricted raw payload readiness",
        "support-console readiness",
      ],
    ],
    [
      "docs/p2x-synthetic-practical-use-rehearsal-checklist.md",
      [
        "Real-data processing is approved and live-provider operation is enabled.",
        "Live tenant data is approved.",
        "Live tenant export is enabled.",
        "Production credentials are enabled.",
        "Regulated identifiers are allowed.",
        "Sensitive personal information is approved.",
      ].join("\n"),
      [
        "real employee data readiness",
        "live IdP/Okta readiness",
        "regulated data/credential readiness",
      ],
    ],
    [
      "docs/p2x-cross-flow-audit-correlation-lookup-map.md",
      "Production scheduler/queue/DLQ ready: Go. Broad CSV/export is allowed.",
      ["production queue/DLQ readiness", "broad export readiness"],
    ],
    [
      "docs/p2x-synthetic-test-data-governance.md",
      "Retention/deletion jobs are enabled. Two-key approval is approved.",
      ["retention/deletion runtime readiness", "two-key Accepted approval"],
    ],
    [
      "docs/p2x-02-bounded-practical-use-follow-up-closeout.md",
      [
        "HR practical-use readiness: Go.",
        "Production-like readiness is approved.",
        "Live IdP/Okta operation is enabled.",
      ].join("\n"),
      [
        "HR practical-use readiness",
        "production-like readiness",
        "live IdP/Okta readiness",
      ],
    ],
    [
      "docs/p2x-closeout-reference-inventory.md",
      [
        "HR practical-use readiness is approved.",
        "Production-like readiness is approved.",
        "Real employee data is ready.",
        "Live IdP/Okta is enabled.",
      ].join("\n"),
      [
        "HR practical-use readiness",
        "production-like readiness",
        "real employee data readiness",
        "live IdP/Okta readiness",
      ],
    ],
    [
      "docs/p2x-03-bounded-closeout-synchronization-closeout.md",
      [
        "HR practical-use readiness: Go.",
        "Production-like readiness is approved.",
        "Real employee data is ready.",
        "Live IdP/Okta operation is enabled.",
        "Production queue/DLQ ready: Go.",
        "Retention/deletion runtime ready: Go.",
        "Two-key acceptance is approved.",
      ].join("\n"),
      [
        "HR practical-use readiness",
        "production-like readiness",
        "real employee data readiness",
        "live IdP/Okta readiness",
        "production queue/DLQ readiness",
        "retention/deletion runtime readiness",
        "two-key Accepted approval",
      ],
    ],
    [
      "docs/p2x-04-real-data-legal-privacy-prerequisite-lane.md",
      [
        "Real employee data is ready.",
        "Legal/privacy approval is approved.",
        "Data-owner approval is approved.",
        "HR practical-use readiness: Go.",
        "Production-like readiness is approved.",
        "Production-like data processing: Go.",
      ].join("\n"),
      [
        "real employee data readiness",
        "legal/privacy acceptance",
        "data-owner approval",
        "HR practical-use readiness",
        "production-like readiness",
        "production-like data processing",
      ],
    ],
    [
      "docs/p2x-04-live-provider-custody-credential-prerequisite-lane.md",
      [
        "Live IdP/Okta operation is enabled.",
        "Live provider traffic is approved.",
        "Live tenant binding: Go.",
        "Named tenant binding: Go.",
        "Production credentials are available.",
        "Placeholder credentials are allowed.",
        "Missing credential source is approved.",
        "Trusted credential source is approved.",
        "Credential custody owner: Go.",
        "Secret rotation readiness: Go.",
        "Revocation plan is approved.",
        "Secret revocation plan is ready.",
        "Webhook runtime custody: Go.",
        "Webhook custody boundary is approved.",
        "Webhook source is approved.",
        "Untrusted webhook source is allowed.",
        "Provider audit search: Go.",
        "Audit search boundary is approved.",
        "Provider retry/error custody: Go.",
        "Provider error and retry custody record is ready.",
        "Retry/error custody is ready.",
        "Error and retry custody is approved.",
        "Provider rollback behavior: Go.",
        "Rollback path is ready.",
        "Tested rollback behavior is approved.",
        "Unknown tenant is allowed.",
        "Unsupported provider event is enabled.",
        "Stale provider state is enabled.",
        "HR practical-use readiness: Go.",
        "Production-like readiness is approved.",
      ].join("\n"),
      [
        "live IdP/Okta readiness",
        "live tenant binding",
        "regulated data/credential readiness",
        "secret rotation readiness",
        "webhook runtime custody",
        "provider audit search",
        "provider retry/error custody",
        "provider rollback behavior",
        "HR practical-use readiness",
        "production-like readiness",
      ],
    ],
    [
      "docs/p2x-04-production-authorization-rls-prerequisite-lane.md",
      [
        "Production authorization/RLS is approved.",
        "Production RBAC authority is ready.",
        "Production authorization/RLS is accepted.",
        "Production RBAC authority is allowed.",
        "PostgreSQL RLS source of truth is approved.",
        "Authorization/data-scope design acceptance: Go.",
        "Actor/role/tenant binding is approved.",
        "Trusted proxy identity boundary is ready.",
        "Accepted trusted proxy identity boundary.",
        "Ready actor/role/tenant binding.",
        "Approved query-layer enforcement.",
        "Query-layer enforcement is approved.",
        "Service-layer enforcement is approved.",
        "Negative enforcement tests are complete.",
        "Mixed-boundary fail-closed evidence is approved.",
        "Support-console authority is approved.",
        "HR practical-use readiness: Go.",
        "Production-like readiness is approved.",
      ].join("\n"),
      [
        "production authorization/RLS readiness",
        "support-console readiness",
        "HR practical-use readiness",
        "production-like readiness",
      ],
    ],
  ] as const;

  for (const [path, text] of p2xFixtureClaims) {
    await writeFile(join(fixtureCwd, path), text);
  }

  const findings = checkMvpAPolicyAsCode(
    await loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd),
  );

  for (const [path, , expectedSubjects] of p2xFixtureClaims) {
    for (const subject of expectedSubjects) {
      assert.ok(
        findings.some(
          (finding) =>
            finding.surface === "documentation" &&
            finding.path === path &&
            finding.subject === subject,
        ),
        `expected loader-read ${path} overclaim to fail for ${subject}`,
      );
    }
  }
});

test("MVP-A policy-as-code P2X guard requires affirmative table statuses", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await writeMinimalPolicyInputRepository(fixtureCwd);

  const tableStatusPath = "docs/p2x-local-bounded-operator-runbook.md";
  const benignMentionPath =
    "docs/p2x-synthetic-practical-use-rehearsal-checklist.md";
  await writeFile(
    join(fixtureCwd, tableStatusPath),
    [
      "| Surface | Evidence | Status |",
      "| --- | --- | --- |",
      "| real employee data | #203 | complete |",
      "| live IdP/Okta | #204 | processing |",
    ].join("\n"),
  );
  await writeFile(
    join(fixtureCwd, benignMentionPath),
    [
      "HR practical-use readiness review is documentation-only.",
      "This updates the HR practical-use readiness checklist.",
      "The production-like readiness blocker remains in force.",
      "The production-like readiness review is documentation-only.",
      "The real-data processing boundary remains out of scope.",
      "The real-data processing follow-up stays blocked.",
      "Raw payload viewing remains closed.",
      "| Allowed bounded surface | Blocked surface |",
      "| --- | --- |",
      "| explicitly approved non-production data | real employee data |",
    ].join("\n"),
  );

  const findings = checkMvpAPolicyAsCode(
    await loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd),
  );

  for (const subject of [
    "real employee data readiness",
    "live IdP/Okta readiness",
  ]) {
    assert.ok(
      findings.some(
        (finding) =>
          finding.surface === "documentation" &&
          finding.path === tableStatusPath &&
          finding.subject === subject,
      ),
      `expected table-status P2X overclaim to fail for ${subject}`,
    );
  }

  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === benignMentionPath,
    ),
    false,
    "expected non-affirmative P2X readiness mentions to stay allowed",
  );
});

test("MVP-A policy-as-code P2X guard rejects table and approval metadata bypasses", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await writeMinimalPolicyInputRepository(fixtureCwd);

  const pipeTablePath = "docs/p2x-cross-flow-audit-correlation-lookup-map.md";
  const scopedBlockerPath = "docs/p2x-synthetic-test-data-governance.md";
  const leadingBlockerCellPath =
    "docs/p2x-01-next-wave-recommendation-closeout.md";
  const approvalMetadataPath = "docs/p2x-hr-practical-use-gap-assessment.md";
  const commaListBypassPath = "docs/p2x-local-bounded-operator-runbook.md";
  await writeFile(
    join(fixtureCwd, pipeTablePath),
    [
      "Surface | Evidence | Status",
      "--- | --- | ---",
      "real employee data | repository-only evidence reference that is intentionally long enough to exceed the prose detector window | approved",
      "live IdP/Okta | repository-only evidence reference that is intentionally long enough to exceed the prose detector window | enabled",
      "regulated identifiers | repository-only evidence reference that is intentionally long enough to exceed the prose detector window | available",
      "production backup | repository-only evidence reference that is intentionally long enough to exceed the prose detector window | complete",
      "production restore | repository-only evidence reference that is intentionally long enough to exceed the prose detector window | processing",
    ].join("\n"),
  );
  await writeFile(
    join(fixtureCwd, scopedBlockerPath),
    [
      "| Surface | Status | Note |",
      "| --- | --- | --- |",
      "| real employee data | approved | No real employee data remains blocked |",
    ].join("\n"),
  );
  await writeFile(
    join(fixtureCwd, leadingBlockerCellPath),
    [
      "| Note | Status | Surface |",
      "| --- | --- | --- |",
      "| No real employee data remains blocked | approved | real employee data |",
    ].join("\n"),
  );
  await writeFile(
    join(fixtureCwd, approvalMetadataPath),
    [
      "Approver: legal/privacy acceptance is approved.",
      "Counter-approver: two-key acceptance is approved.",
    ].join("\n"),
  );
  await writeFile(
    join(fixtureCwd, commaListBypassPath),
    [
      "No real employee data, HR practical-use readiness: Go.",
      "No unrestricted raw payload, production-like readiness: Go.",
      "Do not use production credentials, support-console custody is approved.",
    ].join("\n"),
  );

  const findings = checkMvpAPolicyAsCode(
    await loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd),
  );

  for (const [path, subject] of [
    [pipeTablePath, "real employee data readiness"],
    [pipeTablePath, "live IdP/Okta readiness"],
    [pipeTablePath, "regulated data/credential readiness"],
    [pipeTablePath, "production backup/restore readiness"],
    [scopedBlockerPath, "real employee data readiness"],
    [leadingBlockerCellPath, "real employee data readiness"],
    [approvalMetadataPath, "legal/privacy acceptance"],
    [approvalMetadataPath, "two-key Accepted approval"],
    [commaListBypassPath, "HR practical-use readiness"],
    [commaListBypassPath, "production-like readiness"],
    [commaListBypassPath, "support-console readiness"],
  ] as const) {
    assert.ok(
      findings.some(
        (finding) =>
          finding.surface === "documentation" &&
          finding.path === path &&
          finding.subject === subject,
      ),
      `expected ${path} bypass probe to fail for ${subject}`,
    );
  }
});

test("MVP-A policy-as-code P2X guard rejects subject blockers followed by later affirmative status", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await writeMinimalPolicyInputRepository(fixtureCwd);

  const probePath = "docs/p2x-02-bounded-practical-use-follow-up-closeout.md";
  await writeFile(
    join(fixtureCwd, probePath),
    "rejects stale blockers and live IdP/Okta remains blocked pending review and operation: Go.",
  );

  const findings = checkMvpAPolicyAsCode(
    await loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd),
  );

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === probePath &&
        finding.subject === "live IdP/Okta readiness",
    ),
    "expected later affirmative live IdP/Okta status to fail even after a subject blocker",
  );
});

test("MVP-A policy-as-code P2X guard covers current unresolved review-thread probes", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await writeMinimalPolicyInputRepository(fixtureCwd);

  const currentReviewProbeClaims = [
    [
      "README.md",
      [
        "Current P2X bounded status: HR practical-use readiness: Go.",
        "Current P2X bounded status: production-like readiness: Go.",
        "Current P2X bounded status: production-like data processing: Go.",
        "Current P2X bounded status: real employee data approved.",
        "Current P2X bounded status: data-owner approval approved.",
        "Current P2X bounded status: live IdP/Okta operation enabled.",
        "Current P2X bounded status: production queue/DLQ ready: Go.",
        "Current P2X bounded status: retention/deletion runtime ready: Go.",
        "Current P2X bounded status: two-key acceptance approved.",
      ].join("\n"),
      [
        "HR practical-use readiness",
        "production-like readiness",
        "production-like data processing",
        "real employee data readiness",
        "data-owner approval",
        "live IdP/Okta readiness",
        "production queue/DLQ readiness",
        "retention/deletion runtime readiness",
        "two-key Accepted approval",
      ],
    ],
    [
      "docs/p2x-01-next-wave-recommendation-closeout.md",
      [
        "HR practical-use readiness: Go.",
        "Real employee data is approved.",
        "Production backup is approved.",
        "Production restore policy is ready.",
      ].join("\n"),
      [
        "HR practical-use readiness",
        "real employee data readiness",
        "production backup/restore readiness",
      ],
    ],
    [
      "docs/p2x-hr-practical-use-gap-assessment.md",
      [
        "HR practical-use readiness: Go.",
        "Real employee data is approved.",
        "No real employee data, but HR practical-use readiness: Go.",
        "Raw payload access is approved.",
      ].join("\n"),
      [
        "HR practical-use readiness",
        "real employee data readiness",
        "unrestricted raw payload readiness",
      ],
    ],
    [
      "docs/p2x-local-bounded-operator-runbook.md",
      [
        "Unrestricted raw payload is enabled.",
        "Raw payload access is approved.",
        "Production database access is approved.",
        "Cloud accounts are enabled.",
      ].join("\n"),
      [
        "unrestricted raw payload readiness",
        "production infrastructure access readiness",
      ],
    ],
    [
      "docs/p2x-cross-flow-audit-correlation-lookup-map.md",
      [
        "Surface | Evidence | Status",
        "--- | --- | ---",
        "real employee data | repository-only evidence reference that is intentionally long enough to exceed the prose detector window | approved",
        "live IdP/Okta | repository-only evidence reference that is intentionally long enough to exceed the prose detector window | available",
        "support-console custody | bounded note | available",
        "regulated identifiers | bounded note | available",
        "production backup | bounded note | complete",
        "production restore | bounded note | processing",
      ].join("\n"),
      [
        "real employee data readiness",
        "live IdP/Okta readiness",
        "support-console readiness",
        "regulated data/credential readiness",
        "production backup/restore readiness",
      ],
    ],
    [
      "docs/p2x-synthetic-test-data-governance.md",
      [
        "| Surface | Status |",
        "| --- | --- |",
        "| real employee data | complete |",
        "| live IdP/Okta | complete |",
        "| production credentials | available |",
        "| legal-hold | approved |",
        "| anonymization job | enabled |",
      ].join("\n"),
      [
        "real employee data readiness",
        "live IdP/Okta readiness",
        "regulated data/credential readiness",
        "retention/deletion runtime readiness",
      ],
    ],
    [
      "docs/p2x-synthetic-practical-use-rehearsal-checklist.md",
      "rejects real employee data blockers and is approved.",
      ["real employee data readiness"],
    ],
    [
      "docs/p2x-02-bounded-practical-use-follow-up-closeout.md",
      [
        "No real employee data, but HR practical-use readiness: Go.",
        "Real employee data approved: Blocked.",
        "rejects stale blockers and live IdP/Okta operation: Go.",
        "Live IdP/Okta remains blocked, operation: Go.",
        "rejects stale blockers and live IdP/Okta remains blocked pending review and operation: Go.",
        "Keeps live IdP/Okta operation approved and real employee data blocked.",
      ].join("\n"),
      [
        "HR practical-use readiness",
        "real employee data readiness",
        "live IdP/Okta readiness",
      ],
    ],
    [
      "docs/p2x-closeout-reference-inventory.md",
      [
        "Rejects stale blockers and live IdP/Okta protected operation: Go.",
        "Keeps real employee data evidence approved and live IdP/Okta blocked.",
        "keeps live IdP/Okta blocked and real employee data evidence approved.",
        "keeps blocker evidence and real employee data approved while live IdP/Okta remains blocked.",
      ].join("\n"),
      ["live IdP/Okta readiness", "real employee data readiness"],
    ],
    [
      "docs/p2x-03-bounded-closeout-synchronization-closeout.md",
      [
        "No real employee data, but HR practical-use readiness: Go.",
        "Keeps live IdP/Okta blocked and real employee data approved.",
        "Production queue/DLQ ready: Go.",
        "Retention/deletion runtime ready: Go.",
        "Two-key acceptance approved.",
      ].join("\n"),
      [
        "HR practical-use readiness",
        "real employee data readiness",
        "production queue/DLQ readiness",
        "retention/deletion runtime readiness",
        "two-key Accepted approval",
      ],
    ],
    [
      "docs/p2x-04-real-data-legal-privacy-prerequisite-lane.md",
      [
        "No real employee data, but legal/privacy approval is ready.",
        "Keeps HR practical-use blocked and real employee data approved.",
        "Production-like readiness: Go.",
        "Production-like data processing: Go.",
        "Data-owner approval: Go.",
      ].join("\n"),
      [
        "legal/privacy acceptance",
        "real employee data readiness",
        "production-like readiness",
        "production-like data processing",
        "data-owner approval",
      ],
    ],
    [
      "docs/p2x-04-live-provider-custody-credential-prerequisite-lane.md",
      [
        "No live IdP/Okta, but live provider traffic is enabled.",
        "Live tenant binding: Go.",
        "Named tenant binding: Go.",
        "Production credentials are approved.",
        "Placeholder credentials are allowed.",
        "Missing credential source is approved.",
        "Trusted credential source is approved.",
        "Credential custody owner: Go.",
        "Secret rotation readiness: Go.",
        "Revocation plan is approved.",
        "Secret revocation plan is ready.",
        "Webhook runtime custody: Go.",
        "Webhook custody boundary is approved.",
        "Webhook source is approved.",
        "Untrusted webhook source is allowed.",
        "Provider audit search: Go.",
        "Audit search boundary is approved.",
        "Provider retry/error custody: Go.",
        "Provider error and retry custody record is ready.",
        "Retry/error custody is ready.",
        "Error and retry custody is approved.",
        "Provider rollback behavior: Go.",
        "Rollback path is ready.",
        "Tested rollback behavior is approved.",
        "Unknown tenant is allowed.",
        "Unsupported provider event is enabled.",
        "Stale provider state is enabled.",
        "Keeps HR practical-use blocked and live IdP/Okta operation enabled.",
        "HR practical-use readiness: Go.",
        "Production-like readiness: Go.",
      ].join("\n"),
      [
        "live IdP/Okta readiness",
        "live tenant binding",
        "regulated data/credential readiness",
        "secret rotation readiness",
        "webhook runtime custody",
        "provider audit search",
        "provider retry/error custody",
        "provider rollback behavior",
        "HR practical-use readiness",
        "production-like readiness",
      ],
    ],
    [
      "docs/p2x-04-production-authorization-rls-prerequisite-lane.md",
      [
        "No production authorization/RLS, but Production RBAC authority is ready.",
        "PostgreSQL RLS source of truth: Go.",
        "PostgreSQL RLS source of truth is accepted.",
        "Production RBAC authority is allowed.",
        "Authorization/data-scope design acceptance is approved.",
        "Actor/role/tenant binding is approved.",
        "Trusted proxy identity boundary is ready.",
        "Approved trusted proxy identity boundary.",
        "Ready actor/role/tenant binding.",
        "Query-layer enforcement is approved.",
        "Service-layer enforcement is approved.",
        "Negative enforcement tests are complete.",
        "Mixed-boundary fail-closed evidence is approved.",
        "Support-console authority is approved.",
        "Keeps HR practical-use blocked and production authorization/RLS approved.",
        "HR practical-use readiness: Go.",
        "Production-like readiness: Go.",
      ].join("\n"),
      [
        "production authorization/RLS readiness",
        "support-console readiness",
        "HR practical-use readiness",
        "production-like readiness",
      ],
    ],
  ] as const;

  for (const [path, text] of currentReviewProbeClaims) {
    await writeFile(join(fixtureCwd, path), text);
  }

  const findings = checkMvpAPolicyAsCode(
    await loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd),
  );

  for (const [path, , expectedSubjects] of currentReviewProbeClaims) {
    for (const subject of expectedSubjects) {
      assert.ok(
        findings.some(
          (finding) =>
            finding.surface === "documentation" &&
            finding.path === path &&
            finding.subject === subject,
        ),
        `expected current review probe ${path} to fail for ${subject}`,
      );
    }
  }
});

test("MVP-A policy-as-code P2X guard preserves later-Accepted blocker wording", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await writeMinimalPolicyInputRepository(fixtureCwd);

  const probePath = "docs/p2x-02-bounded-practical-use-follow-up-closeout.md";
  await writeFile(
    join(fixtureCwd, probePath),
    "real employee data remains blocked and requires a later Accepted decision.",
  );

  const findings = checkMvpAPolicyAsCode(
    await loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd),
  );

  assert.ok(
    !findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === probePath &&
        finding.subject === "real employee data readiness",
    ),
    "expected later Accepted prerequisite wording to remain a blocker, not an approval",
  );
});

test("MVP-A policy-as-code P2X authorization aliases preserve blocked wording", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await writeMinimalPolicyInputRepository(fixtureCwd);

  const probePath =
    "docs/p2x-04-production-authorization-rls-prerequisite-lane.md";
  await writeFile(
    join(fixtureCwd, probePath),
    [
      "production RBAC authority is not approved.",
      "PostgreSQL RLS source of truth is not ready.",
      "authorization/data-scope design acceptance remains blocked.",
      "actor/role/tenant binding is not allowed.",
      "trusted proxy identity boundary is not accepted.",
      "query-layer enforcement remains blocked.",
      "service-layer enforcement is not enabled.",
      "negative enforcement tests are not ready.",
      "mixed-boundary fail-closed evidence remains blocked.",
    ].join("\n"),
  );

  const findings = checkMvpAPolicyAsCode(
    await loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd),
  );

  assert.ok(
    !findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === probePath &&
        finding.subject === "production authorization/RLS readiness",
    ),
    "expected blocked authorization alias wording to stay allowed",
  );
});

test("MVP-A policy-as-code P2X authorization accepted-design promotions fail", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const path = "docs/p2x-04-production-authorization-rls-prerequisite-lane.md";
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        path,
        [
          "Accepted authorization/data-scope design exists with trusted proxy identity boundary.",
          "The accepted authorization/data-scope design includes PostgreSQL RLS source of truth.",
          "Accepted authorization/data-scope design covers negative enforcement tests.",
          "Required before any stronger claim: accepted authorization/data-scope design is approved with trusted proxy identity boundary.",
        ].join("\n"),
      ],
    ]),
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === path &&
        finding.subject === "production authorization/RLS readiness",
    ),
    "expected accepted authorization/data-scope design promotion wording to fail",
  );
});

test("MVP-A policy-as-code gate preserves lowercase readiness status context", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const path = "docs/fixture-lowercase-readiness-status-context.md";
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [path, "P0-R05 / #11. production-like ready: Go."],
    ]),
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === path &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected lowercase production-like status sentence to keep gate context",
  );
});

test("MVP-A policy-as-code gate carries ADR document identity into status claims", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md",
        [
          "# ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary",
          "",
          "## Status",
          "",
          "Accepted",
          "",
          "## Decision owners",
          "",
          "- Author: TommyKammy",
          "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
          "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
          "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
        ].join("\n"),
      ],
    ]),
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path ===
          "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md" &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected status-only Accepted ADR claim to fail via ADR document identity",
  );
});

test("MVP-A policy-as-code input loader scans affected ADR readiness claims", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await writeMinimalPolicyInputRepository(fixtureCwd);
  await writeFile(
    join(fixtureCwd, "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md"),
    [
      "# ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary",
      "",
      "## Status",
      "",
      "Accepted",
      "",
      "## Decision owners",
      "",
      "- Author: TommyKammy",
      "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
      "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
      "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    ].join("\n"),
  );
  await writeFile(
    join(
      fixtureCwd,
      "docs/adr/0012-audit-event-hash-chain-worm-object-lock-boundary.md",
    ),
    [
      "# ADR 0012: Audit Event Hash Chain, WORM, and S3 Object Lock MVP-A/v1 Boundary",
      "",
      "## Status",
      "",
      "Proposed",
      "",
      "## Readiness",
      "",
      "production-like-ready: Go",
      "",
      "## Decision owners",
      "",
      "- Author: TommyKammy",
      "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
      "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
      "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    ].join("\n"),
  );

  const findings = checkMvpAPolicyAsCode(
    await loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd),
  );

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path ===
          "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md" &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected loader-read ADR 0011 Accepted status to fail via document identity",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path ===
          "docs/adr/0012-audit-event-hash-chain-worm-object-lock-boundary.md" &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected loader-read ADR 0012 production-like readiness to fail via document identity",
  );
});

test("MVP-A policy-as-code input loader scans affected companion gate docs", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await writeMinimalPolicyInputRepository(fixtureCwd);
  await writeFile(
    join(fixtureCwd, "docs/mvp-a-onboarding-evidence-authorization-gate.md"),
    "P0-R05 / #11 authorization and data-scope enforcement: Accepted.",
  );
  await writeFile(
    join(fixtureCwd, "docs/mvp-a-onboarding-backup-restore-rehearsal-gate.md"),
    "P0-R06 / #12: production-like ready.",
  );
  await writeFile(
    join(fixtureCwd, "docs/mvp-a-onboarding-pii-export-gate.md"),
    "P0-R08 / #14 raw payload and CSV/export can be treated as Accepted.",
  );
  await writeFile(
    join(fixtureCwd, "docs/p0-gov-01-solo-maintainer-governance-closeout.md"),
    "P0-R08 / #14 raw payload and CSV/export can be treated as Accepted.",
  );

  const findings = checkMvpAPolicyAsCode(
    await loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd),
  );

  for (const [path, subject] of [
    ["docs/mvp-a-onboarding-evidence-authorization-gate.md", "P0-R05 / #11"],
    ["docs/mvp-a-onboarding-backup-restore-rehearsal-gate.md", "P0-R06 / #12"],
    ["docs/mvp-a-onboarding-pii-export-gate.md", "P0-R08 / #14"],
    ["docs/p0-gov-01-solo-maintainer-governance-closeout.md", "P0-R08 / #14"],
  ]) {
    assert.ok(
      findings.some(
        (finding) =>
          finding.surface === "documentation" &&
          finding.path === path &&
          finding.subject === subject,
      ),
      `expected loader-read ${path} overclaim to fail the policy gate`,
    );
  }
});

test("MVP-A policy-as-code input loader scans solo-maintainer closeout gate claims", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await writeMinimalPolicyInputRepository(fixtureCwd);
  const closeoutPath = "docs/p0-gov-01-solo-maintainer-governance-closeout.md";
  await writeFile(
    join(fixtureCwd, closeoutPath),
    [
      "P0-R05 / #11 authorization and data-scope enforcement is Accepted.",
      "P0-R06 / #12 audit and backup evidence is production-like ready.",
      "P0-R08 / #14 raw payload and CSV/export controls are Accepted.",
    ].join("\n"),
  );

  const findings = checkMvpAPolicyAsCode(
    await loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd),
  );

  for (const subject of ["P0-R05 / #11", "P0-R06 / #12", "P0-R08 / #14"]) {
    assert.ok(
      findings.some(
        (finding) =>
          finding.surface === "documentation" &&
          finding.path === closeoutPath &&
          finding.subject === subject,
      ),
      `expected loader-read solo-maintainer closeout overclaim to fail for ${subject}`,
    );
  }
});

test("MVP-A policy-as-code gate keeps non-production documentation checks path-scoped", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const companionOnlyRequiredText = [
    "mvp_a_onboarding_non_production_data_handling_v1",
    "repo_owned_synthetic_fixture",
    "approved_non_production_dataset",
    "mvp_a_onboarding_pii_export_closed_v1",
    "#202",
    "#203 legal/privacy approval evidence placeholder",
    "#203 independent data-owner approval placeholder",
    "#203 two-key approval record placeholder",
    "does not approve legal approval, privacy approval, real-data processing, production-like data processing, raw payload viewing, CSV/export, download logs, watermark/manifest behavior, My Number, Specific Personal Information, or sensitive personal information",
  ].join("\n");
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      ["README.md", "incomplete non-production readiness summary"],
      [
        "docs/mvp-a-onboarding-non-production-data-gate.md",
        "incomplete non-production gate",
      ],
      ["docs/mvp-a-onboarding-pii-export-gate.md", companionOnlyRequiredText],
    ]),
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path ===
          "README.md docs/mvp-a-onboarding-non-production-data-gate.md" &&
        finding.subject === "mvp_a_onboarding_pii_export_closed_v1",
    ),
    "expected companion-only required text not to satisfy the non-production documentation check",
  );
});

test("MVP-A policy-as-code gate covers current readiness review probes", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await writeMinimalPolicyInputRepository(fixtureCwd);
  await writeFile(
    join(fixtureCwd, "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md"),
    [
      "# ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary",
      "",
      "## Status",
      "",
      "- Accepted",
      "",
      "## Decision owners",
      "",
      "- Author: TommyKammy",
      "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
      "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
      "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
    ].join("\n"),
  );
  await writeFile(
    join(fixtureCwd, "docs/mvp-a-onboarding-backup-restore-rehearsal-gate.md"),
    [
      "P0-R06 / #12: production-like ready.",
      "| Gate | Readiness |",
      "| --- | --- |",
      "| P0-R06 / #12 | production-like-ready |",
    ].join("\n"),
  );

  const findings = checkMvpAPolicyAsCode(
    await loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd),
  );

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path ===
          "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md" &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected bullet Accepted ADR status to fail via ADR document identity",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path ===
          "docs/mvp-a-onboarding-backup-restore-rehearsal-gate.md" &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected companion-doc shorthand production-like readiness claims to fail",
  );
});

test("MVP-A policy-as-code gate scopes independent approval to each readiness claim", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        "docs/fixture-scoped-independent-approval.md",
        [
          "| Gate | Readiness | Independent approval |",
          "| --- | --- | --- |",
          "| P0-R05 / #11 | Accepted | Independent approver: Alice; Independent counter-approver: Bob; Time-locked review window: 2026-05-01 to 2026-05-02 completed |",
          "| P0-R06 / #12 | Accepted | Independent approver: Required before Accepted; Independent counter-approver: Required before Accepted; Time-locked review window: Required before Accepted |",
          "| P0-R08 / #14 | Accepted | Independent approver: Alice; Independent counter-approver: Bob; Time-locked review window: 2026-05-01 to 2026-05-02 not completed |",
        ].join("\n"),
      ],
    ]),
  });

  assert.ok(
    !findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === "docs/fixture-scoped-independent-approval.md" &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected documented independent approval on the same P0-R05 claim to pass",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === "docs/fixture-scoped-independent-approval.md" &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected P0-R06 overclaim to fail despite another row's approval evidence",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === "docs/fixture-scoped-independent-approval.md" &&
        finding.subject === "P0-R08 / #14",
    ),
    "expected P0-R08 overclaim to fail when review window is incomplete",
  );
});

test("MVP-A policy-as-code gate handles affected readiness claim edge cases", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        "docs/fixture-current-head-readiness-edges.md",
        [
          "Issue #114 is Accepted as an unrelated follow-up.",
          "P0-R05 / #11 is Accepted; Independent approver: Alice; Independent counter-approver: Bob; Time-locked review window: 2026-05-01 to 2026-05-02 completed.",
          "P0-R06 / #12: production-like ready.",
          "| Gate | Readiness | Evidence |",
          "| --- | --- | --- |",
          "| P0-R05 / #11 | Accepted | accepted authorization evidence attached |",
        ].join("\n"),
      ],
      [
        "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md",
        [
          "# ADR 0011: Data Scope Policy DSL and PostgreSQL RLS MVP-A/v1 Boundary",
          "",
          "Status: Accepted",
          "",
          "## Decision owners",
          "",
          "- Author: TommyKammy",
          "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
          "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
          "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
        ].join("\n"),
      ],
    ]),
  });

  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === "docs/fixture-current-head-readiness-edges.md" &&
        finding.subject === "P0-R05 / #11",
    ),
    true,
    "expected P0-R05 Accepted evidence row to fail",
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === "docs/fixture-current-head-readiness-edges.md" &&
        finding.subject === "P0-R06 / #12",
    ),
    true,
    "expected P0-R06 shorthand production-like-ready claim to fail",
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path ===
          "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md" &&
        finding.subject === "P0-R05 / #11",
    ),
    true,
    "expected inline ADR Status: Accepted claim to fail via document identity",
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === "docs/fixture-current-head-readiness-edges.md" &&
        finding.subject === "P0-R08 / #14",
    ),
    false,
    "expected unrelated #114 Accepted wording not to match #14",
  );
});

test("MVP-A policy-as-code gate does not substring-match issue aliases", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const path = "docs/fixture-alias-boundary.md";
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        path,
        [
          "Issue #114 is Accepted as an unrelated follow-up.",
          "Issue #125 is Accepted as an unrelated follow-up.",
          "Issue #140 is Accepted as an unrelated follow-up.",
        ].join("\n"),
      ],
    ]),
  });

  assert.equal(
    findings.some(
      (finding) => finding.surface === "documentation" && finding.path === path,
    ),
    false,
    "expected unrelated issue aliases not to trigger affected readiness findings",
  );
});

test("MVP-A policy-as-code gate preserves semicolon approval metadata", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const path = "docs/fixture-semicolon-readiness-approval.md";
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        path,
        "P0-R05 / #11 is Accepted; Independent approver: Alice; Independent counter-approver: Bob; Time-locked review window: 2026-05-01 to 2026-05-02 completed.",
      ],
    ]),
  });

  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === path &&
        finding.subject === "P0-R05 / #11",
    ),
    false,
    "expected semicolon-separated independent approval metadata to satisfy the same claim",
  );
});

test("MVP-A policy-as-code gate rejects same-person two-key readiness approval", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        "docs/fixture-same-person-readiness-approval.md",
        [
          "| Gate | Readiness | Independent approval |",
          "| --- | --- | --- |",
          "| P0-R05 / #11 | Accepted | Independent approver: Alice; Independent counter-approver: Alice; Time-locked review window: 2026-05-01 to 2026-05-02 completed |",
        ].join("\n"),
      ],
    ]),
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === "docs/fixture-same-person-readiness-approval.md" &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected same-person two-key readiness approval to fail",
  );
});

test("MVP-A policy-as-code gate rejects bare production-like ready table cells", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        "docs/fixture-bare-production-like-ready.md",
        [
          "| Gate | Readiness |",
          "| --- | --- |",
          "| P0-R06 / #12 | production-like ready |",
        ].join("\n"),
      ],
    ]),
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === "docs/fixture-bare-production-like-ready.md" &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected bare production-like ready table cell to fail",
  );
});

test("MVP-A policy-as-code gate rejects weak readiness approval wording", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        "docs/fixture-weak-readiness-approval.md",
        [
          "| Gate | Readiness | Independent approval |",
          "| --- | --- | --- |",
          "| P0-R05 / #11 | Accepted | Approver: Required before Accepted; Counter-approver: Required before Accepted; Time-locked review window: Required before Accepted |",
          "| P0-R06 / #12 | production-like ready | Independent approver: Alice; Independent counter-approver: Alice; Time-locked review window: 2026-05-01 to 2026-05-02 completed |",
          "| P0-R08 / #14 | #14-class raw payload follow-up | accepted |",
        ].join("\n"),
      ],
    ]),
  });

  for (const subject of ["P0-R05 / #11", "P0-R06 / #12", "P0-R08 / #14"]) {
    assert.ok(
      findings.some(
        (finding) =>
          finding.surface === "documentation" &&
          finding.path === "docs/fixture-weak-readiness-approval.md" &&
          finding.subject === subject,
      ),
      `expected ${subject} weak readiness approval wording to fail`,
    );
  }
});

test("MVP-A policy-as-code gate rejects accepted claims with generic negation wording", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const path = "docs/fixture-generic-negation-accepted.md";
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [path, "P0-R05 / #11 does not need more review and is Accepted."],
    ]),
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === path &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected generic does-not wording not to suppress an Accepted overclaim",
  );
});

test("MVP-A policy-as-code gate covers latest readiness review probes", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const path = "docs/fixture-latest-readiness-review-probes.md";
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        path,
        [
          "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md is Accepted.",
          "| Gate | Readiness | Approval status |",
          "| --- | --- | --- |",
          "| P0-R05 / #11 | Proposed | Approver: Required before Accepted; Counter-approver: Required before Accepted; Time-locked review window: Required before Accepted |",
          "P0-R06 / #12 must not rely on production backup shortcuts and is Accepted.",
          "P0-R05 / #11 is not Accepted; P0-R08 / #14 is Accepted.",
        ].join("\n"),
      ],
    ]),
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === path &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected ADR path alias Accepted claim to fail",
  );
  assert.equal(
    findings.filter(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === path &&
        finding.subject === "P0-R05 / #11",
    ).length,
    1,
    "expected Proposed rows with approval placeholders not to fail as Accepted claims",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === path &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected unrelated must-not wording not to suppress an Accepted claim",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === path &&
        finding.subject === "P0-R08 / #14",
    ),
    "expected negative wording for one gate not to suppress another gate's Accepted claim",
  );
});

test("MVP-A policy-as-code gate covers follow-up readiness review probes", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const wrappedPath = "docs/fixture-wrapped-readiness-claim.md";
  const metadataBeforeClaimPath =
    "docs/fixture-metadata-before-readiness-claim.md";
  const approvedDependencyPath =
    "docs/fixture-approved-readiness-dependency.md";
  const missingApprovalPath = "docs/fixture-missing-readiness-approval.md";
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        wrappedPath,
        [
          "The solo-maintainer governance boundary keeps P0-R05 / #11 data-scope and RLS",
          "are Accepted.",
        ].join("\n"),
      ],
      [
        metadataBeforeClaimPath,
        "Approver: Required before Accepted; Counter-approver: Required before Accepted; P0-R06 / #12 is Accepted.",
      ],
      [
        approvedDependencyPath,
        [
          "| Gate | Readiness | Dependency | Independent approval |",
          "| --- | --- | --- | --- |",
          "| P0-R08 / #14 | Accepted | depends on ADR 0011 | Independent approver: Alice; Independent counter-approver: Bob; Time-locked review window: 2026-05-01 to 2026-05-02 completed |",
        ].join("\n"),
      ],
      [
        missingApprovalPath,
        "P0-R05 / #11 is Accepted; Independent approver: missing; Independent counter-approver: absent; Time-locked review window: 2026-05-01 to 2026-05-02 completed.",
      ],
    ]),
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === wrappedPath &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected wrapped prose aliases and Accepted wording to fail",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === metadataBeforeClaimPath &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected metadata-before-claim placeholders not to hide Accepted wording",
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === approvedDependencyPath,
    ),
    false,
    "expected same-row approval to stay scoped to the claimed gate despite dependency aliases",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === missingApprovalPath &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected missing or absent approval metadata not to satisfy two-key approval",
  );
});

test("MVP-A policy-as-code gate covers current readiness review probes", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const selfApprovalPath = "docs/fixture-self-approved-readiness.md";
  const headingScopedPath = "docs/fixture-heading-scoped-readiness.md";
  const repeatedGatePath = "docs/fixture-repeated-gate-readiness.md";
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        selfApprovalPath,
        "P0-R05 / #11 is Accepted; Author: Alice; Approver: Alice; Counter-approver: Bob; Time-locked review window: 2026-05-01 to 2026-05-02 completed.",
      ],
      [
        headingScopedPath,
        ["# P0-R06 / #12", "", "## Status", "", "Accepted"].join("\n"),
      ],
      [
        repeatedGatePath,
        "P0-R08 / #14 is not Accepted; P0-R08 / #14 is Accepted for launch.",
      ],
    ]),
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === selfApprovalPath &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected author/approver self-approval to fail",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === headingScopedPath &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected heading-scoped Accepted status to fail",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === repeatedGatePath &&
        finding.subject === "P0-R08 / #14",
    ),
    "expected later same-gate Accepted claim to fail after an earlier negation",
  );
});

test("MVP-A policy-as-code gate covers final readiness review probes", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const multiGatePath = "docs/fixture-multi-gate-readiness-claim.md";
  const directProductionLikePath =
    "docs/fixture-direct-production-like-ready.md";
  const acceptedFollowUpPath = "docs/fixture-accepted-follow-up-work.md";
  const numberedStatusPath = "docs/fixture-numbered-status-readiness.md";
  const negativeThenAcceptedPath =
    "docs/fixture-negative-then-accepted-readiness.md";
  const commaMetadataBeforeClaimPath =
    "docs/fixture-comma-metadata-before-readiness.md";
  const waivedCounterApproverPath =
    "docs/fixture-waived-counter-approver-readiness.md";
  const approvedDependencyLabelPath =
    "docs/fixture-approved-dependency-label-readiness.md";
  const adrStatusVariantPath =
    "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md";
  const approvedMultiGateRowPath =
    "docs/fixture-approved-multi-gate-row-readiness.md";
  const commaSeparatedApprovalPath =
    "docs/fixture-comma-separated-approval-readiness.md";
  const boldStandaloneAdrStatusPath =
    "docs/adr/0012-audit-event-hash-chain-worm-object-lock-boundary.md";
  const futureReviewWindowPath =
    "docs/fixture-future-review-window-readiness.md";
  const statusBeforeGatePath = "docs/fixture-status-before-gate-readiness.md";
  const dependencyOnlyAliasPath =
    "docs/fixture-dependency-only-alias-readiness.md";
  const sharedStatusPath = "docs/fixture-shared-status-readiness.md";
  const boldStatusValuePath =
    "docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md";
  const productionLikeUsePath = "docs/fixture-production-like-use-readiness.md";
  const headingScopedTablePath =
    "docs/fixture-heading-scoped-table-readiness.md";
  const dependencyHeaderPath = "docs/fixture-dependency-header-readiness.md";
  const mixedGateStatusRowPath =
    "docs/fixture-mixed-gate-status-row-readiness.md";
  const fencedMarkdownExamplePath =
    "docs/fixture-fenced-markdown-example-readiness.md";
  const referentialCounterApproverPath =
    "docs/fixture-referential-counter-approver-readiness.md";
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        multiGatePath,
        "P0-R05 / #11 is Accepted; P0-R06 / #12 remains blocked.",
      ],
      [directProductionLikePath, "P0-R05 / #11 production-like ready."],
      [acceptedFollowUpPath, "P0-R05 / #11 is Accepted with follow-up work."],
      [numberedStatusPath, ["# P0-R06 / #12", "", "1. Accepted"].join("\n")],
      [
        negativeThenAcceptedPath,
        "P0-R05 / #11 is not production-like ready but is Accepted.",
      ],
      [
        commaMetadataBeforeClaimPath,
        "Approver: Required before Accepted, Counter-approver: Required before Accepted, P0-R06 / #12 is Accepted.",
      ],
      [
        waivedCounterApproverPath,
        "P0-R08 / #14 is Accepted; Independent approver: Alice; Independent counter-approver: Not required because solo-maintainer; Time-locked review window: 2026-05-01 to 2026-05-02 completed.",
      ],
      [
        approvedDependencyLabelPath,
        [
          "| Gate | Readiness | Dependency | Independent approval |",
          "| --- | --- | --- | --- |",
          "| P0-R08 / #14 | Accepted | dependency: ADR 0011 | Independent approver: Alice; Independent counter-approver: Bob; Time-locked review window: 2026-05-01 to 2026-05-02 completed |",
        ].join("\n"),
      ],
      [
        adrStatusVariantPath,
        [
          "# ADR 0011: Data scope policy DSL and RLS boundary",
          "",
          "## Status",
          "",
          "**Status:** Accepted with follow-ups",
        ].join("\n"),
      ],
      [
        approvedMultiGateRowPath,
        [
          "| Gate A | Gate B | Readiness | Independent approval |",
          "| --- | --- | --- | --- |",
          "| P0-R05 / #11 | P0-R06 / #12 | Accepted | Independent approver: Alice; Independent counter-approver: Bob; Time-locked review window: 2026-05-01 to 2026-05-02 completed |",
        ].join("\n"),
      ],
      [
        commaSeparatedApprovalPath,
        "P0-R05 / #11 is Accepted; Independent approver: Alice, Independent counter-approver: Bob, Time-locked review window: 2026-05-01 to 2026-05-02 completed.",
      ],
      [
        boldStandaloneAdrStatusPath,
        [
          "# ADR 0012: Audit event hash chain and WORM object-lock boundary",
          "",
          "## Status",
          "",
          "**Accepted**",
        ].join("\n"),
      ],
      [
        futureReviewWindowPath,
        "P0-R06 / #12 is Accepted; Independent approver: Alice; Independent counter-approver: Bob; Time-locked review window: scheduled to be completed after merge.",
      ],
      [
        statusBeforeGatePath,
        [
          "| Readiness | Gate |",
          "| --- | --- |",
          "| production-like ready | P0-R06 / #12 |",
        ].join("\n"),
      ],
      [
        dependencyOnlyAliasPath,
        "P0-R08 / #14 depends on ADR 0011 and is Accepted.",
      ],
      [sharedStatusPath, "P0-R05 / #11 and P0-R06 / #12 are Accepted."],
      [
        boldStatusValuePath,
        [
          "# ADR 0014: Raw payload CSV export redaction boundary",
          "",
          "Status: **Accepted**",
        ].join("\n"),
      ],
      [productionLikeUsePath, "P0-R05 / #11 is ready for production-like use."],
      [
        headingScopedTablePath,
        ["# P0-R06 / #12", "", "| Status | Accepted |"].join("\n"),
      ],
      [
        dependencyHeaderPath,
        [
          "| Gate | Readiness | Dependency | Independent approval |",
          "| --- | --- | --- | --- |",
          "| P0-R08 / #14 | Accepted | ADR 0011 | Independent approver: Alice; Independent counter-approver: Bob; Time-locked review window: 2026-05-01 to 2026-05-02 completed |",
        ].join("\n"),
      ],
      [
        mixedGateStatusRowPath,
        [
          "| Gate A | Status A | Gate B | Status B |",
          "| --- | --- | --- | --- |",
          "| P0-R05 / #11 | Proposed | P0-R06 / #12 | Accepted |",
        ].join("\n"),
      ],
      [
        fencedMarkdownExamplePath,
        [
          "The following wording is prohibited and must stay illustrative only:",
          "",
          "```md",
          "P0-R05 / #11 is Accepted",
          "```",
        ].join("\n"),
      ],
      [
        referentialCounterApproverPath,
        "P0-R05 / #11 is Accepted; Independent approver: Alice; Independent counter-approver: same as approver; Time-locked review window: 2026-05-01 to 2026-05-02 completed.",
      ],
    ]),
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === multiGatePath &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected P0-R05 Accepted claim not to inherit P0-R06 blocked wording",
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === multiGatePath &&
        finding.subject === "P0-R06 / #12",
    ),
    false,
    "expected P0-R06 blocked wording in the same sentence to stay allowed",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === directProductionLikePath &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected direct gate-prefixed production-like ready claim to fail",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === acceptedFollowUpPath &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected Accepted with follow-up work to remain an Accepted overclaim",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === numberedStatusPath &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected numbered Accepted status under a gate heading to fail",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === negativeThenAcceptedPath &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected Accepted wording after negative production-like wording to fail",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === commaMetadataBeforeClaimPath &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected comma-separated placeholder metadata not to hide Accepted wording",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === waivedCounterApproverPath &&
        finding.subject === "P0-R08 / #14",
    ),
    "expected waived counter-approver metadata not to satisfy two-key approval",
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === approvedDependencyLabelPath,
    ),
    false,
    "expected dependency-labeled same-row approval to stay scoped to the claimed gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === adrStatusVariantPath &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected ADR status variants containing Accepted to fail via document identity",
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === approvedMultiGateRowPath,
    ),
    false,
    "expected same-row approval evidence to cover comma-separated multi-gate claims",
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === commaSeparatedApprovalPath,
    ),
    false,
    "expected comma-separated independent approval metadata to satisfy the same claim",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === boldStandaloneAdrStatusPath &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected bold standalone Accepted ADR status to fail via document identity",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === futureReviewWindowPath &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected future review windows not to satisfy independent approval",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === statusBeforeGatePath &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected readiness cells before gate aliases to fail",
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === dependencyOnlyAliasPath &&
        finding.subject === "P0-R05 / #11",
    ),
    false,
    "expected dependency-only ADR 0011 aliases not to create P0-R05 claims",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === dependencyOnlyAliasPath &&
        finding.subject === "P0-R08 / #14",
    ),
    "expected dependency rows to preserve the actual P0-R08 Accepted claim",
  );
  for (const subject of ["P0-R05 / #11", "P0-R06 / #12"]) {
    assert.ok(
      findings.some(
        (finding) =>
          finding.surface === "documentation" &&
          finding.path === sharedStatusPath &&
          finding.subject === subject,
      ),
      `expected shared Accepted status to fail for ${subject}`,
    );
  }
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === boldStatusValuePath &&
        finding.subject === "P0-R08 / #14",
    ),
    "expected bolded ADR Status value to fail via document identity",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === productionLikeUsePath &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected ready-for-production-like-use wording to fail",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === headingScopedTablePath &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected heading-scoped table status rows to fail",
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === dependencyHeaderPath,
    ),
    false,
    "expected dependency header cells not to create readiness findings for dependency aliases",
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === mixedGateStatusRowPath &&
        finding.subject === "P0-R05 / #11",
    ),
    false,
    "expected P0-R05 Proposed status not to inherit P0-R06 Accepted wording from the same table row",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === mixedGateStatusRowPath &&
        finding.subject === "P0-R06 / #12",
    ),
    "expected P0-R06 Accepted status to fail in its matching table cells",
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === fencedMarkdownExamplePath,
    ),
    false,
    "expected fenced Markdown examples not to be scanned as readiness claims",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === referentialCounterApproverPath &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected referential counter-approver metadata not to satisfy two-key approval",
  );
});

test("MVP-A policy-as-code gate ignores unrelated accepted prose for affected gates", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const path = "docs/fixture-unrelated-accepted-prose.md";

  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        path,
        [
          "P0-R05 / #11 evidence was accepted by the audit archive.",
          "P0-R06 / #12 follow-up ticket was accepted into backlog.",
        ].join("\n"),
      ],
    ]),
  });

  assert.equal(
    findings.some(
      (finding) => finding.surface === "documentation" && finding.path === path,
    ),
    false,
    "expected unrelated accepted prose not to fail as readiness status",
  );
});

test("MVP-A policy-as-code gate scans past placeholder approval metadata", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const path = "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md";

  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map([
      ...inputs.documentationTextByPath,
      [
        path,
        [
          "# ADR 0011: Data scope policy DSL and RLS boundary",
          "",
          "- Approver: Required before Accepted; no named maintainer approval is recorded in this PR.",
          "- Counter-approver: Required before Accepted; no independent named counter-approver is recorded in this PR.",
          "- Time-locked review window: Required before Accepted; no completed review window is recorded in this PR.",
          "",
          "## Status",
          "",
          "Status: Accepted",
          "",
          "## Independent review",
          "",
          "- Independent approver: Alice",
          "- Independent counter-approver: Bob",
          "- Time-locked review window: 2026-05-01 to 2026-05-02 completed",
        ].join("\n"),
      ],
    ]),
  });

  assert.equal(
    findings.some(
      (finding) => finding.surface === "documentation" && finding.path === path,
    ),
    false,
    "expected later concrete approval metadata to satisfy document-scoped Accepted status",
  );
});

test("MVP-A policy-as-code input loader discovers readiness documentation", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await writeMinimalPolicyInputRepository(fixtureCwd);
  const discoveredDocumentationPath = "docs/future-readiness-closeout.md";
  await writeFile(
    join(fixtureCwd, discoveredDocumentationPath),
    "P0-R05 / #11 is Accepted.",
  );

  const inputs = await loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd);

  assert.equal(
    inputs.documentationTextByPath.get(discoveredDocumentationPath),
    "P0-R05 / #11 is Accepted.",
  );
  assert.ok(
    checkMvpAPolicyAsCode(inputs).some(
      (finding) =>
        finding.surface === "documentation" &&
        finding.path === discoveredDocumentationPath &&
        finding.subject === "P0-R05 / #11",
    ),
    "expected discovered readiness documentation overclaim to fail",
  );
});

test("MVP-A policy-as-code gate allows bounded non-production readiness wording", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();

  assert.deepEqual(
    checkMvpAPolicyAsCode({
      ...inputs,
      documentationTextByPath: new Map([
        ...inputs.documentationTextByPath,
        [
          "docs/fixture-bounded-readiness.md",
          [
            "P0-R05 / #11 authorization and data-scope enforcement remains a conditional-go follow-up.",
            "P0-R06 / #12 production audit immutability remains blocked for production-like readiness.",
            "P0-R08 / #14 raw payload and CSV/export remains blocked for real-data and production-like use.",
            "P0-R08 / #14 is not Accepted for raw payload or CSV/export launch.",
            "The only Go claim is bounded/non-production MVP-A onboarding evidence.",
          ].join("\n"),
        ],
      ]),
    }),
    [],
  );
});

test("MVP-A policy-as-code input loader discovers fixture and seed files", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await writeMinimalPolicyInputRepository(fixtureCwd);
  await mkdir(join(fixtureCwd, "src"));
  await mkdir(join(fixtureCwd, "src", "seeds"));
  await mkdir(join(fixtureCwd, "docs", "fixtures"), { recursive: true });
  await writeFile(
    join(fixtureCwd, "src", "review-fixture.ts"),
    "export const fixtureName = 'real employee';",
  );
  await writeFile(
    join(fixtureCwd, "src", "seeds", "users.json"),
    JSON.stringify({ name: "production employee" }),
  );
  await writeFile(
    join(fixtureCwd, "docs", "fixtures", "personas.yaml"),
    "persona: actual personnel\n",
  );
  await writeFile(
    join(fixtureCwd, "root-seed.json"),
    JSON.stringify({ seed: "live personnel" }),
  );
  await writeFile(
    join(fixtureCwd, "src", "not-a-fixture.test.ts"),
    "const fixtureName = 'real employee';",
  );

  const inputs = await loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd);

  assert.equal(
    inputs.fixtureSeedTextByPath.get("src/review-fixture.ts"),
    "export const fixtureName = 'real employee';",
  );
  assert.equal(
    inputs.fixtureSeedTextByPath.get("root-seed.json"),
    JSON.stringify({ seed: "live personnel" }),
  );
  assert.equal(
    inputs.fixtureSeedTextByPath.get("src/seeds/users.json"),
    JSON.stringify({ name: "production employee" }),
  );
  assert.equal(
    inputs.fixtureSeedTextByPath.get("docs/fixtures/personas.yaml"),
    "persona: actual personnel\n",
  );
  assert.equal(
    inputs.fixtureSeedTextByPath.has("src/not-a-fixture.test.ts"),
    false,
  );

  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    documentationTextByPath: new Map(),
  });
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "fixture-seed" &&
        finding.path === "src/review-fixture.ts",
    ),
    "expected discovered source fixture file to fail the policy gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "fixture-seed" && finding.path === "root-seed.json",
    ),
    "expected discovered root seed file to fail the policy gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "fixture-seed" &&
        finding.path === "src/seeds/users.json",
    ),
    "expected discovered source seed directory file to fail the policy gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "fixture-seed" &&
        finding.path === "docs/fixtures/personas.yaml",
    ),
    "expected discovered docs fixture directory file to fail the policy gate",
  );
});

test("MVP-A policy-as-code input loader fails when monitored documentation is missing", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  const omittedDocumentationPath = "docs/solo-maintainer-governance.md";
  await writeMinimalPolicyInputRepository(
    fixtureCwd,
    mvpAPolicyAsCodeDocumentationPaths.filter(
      (path) => path !== omittedDocumentationPath,
    ),
  );

  await assert.rejects(
    loadCurrentMvpAPolicyAsCodeInputs(fixtureCwd),
    (error: unknown) => {
      const nodeError = error as NodeJS.ErrnoException;
      return (
        error instanceof Error &&
        nodeError.code === "ENOENT" &&
        error.message.includes(omittedDocumentationPath)
      );
    },
    "expected missing monitored documentation to fail input loading",
  );
});

test("MVP-A policy-as-code gate fails closed for prohibited onboarding OpenAPI surfaces", async () => {
  const inputs = await loadCurrentMvpAPolicyAsCodeInputs();
  const findings = checkMvpAPolicyAsCode({
    ...inputs,
    migrationSqlByPath: new Map(),
    openApiContract: {
      paths: {
        "/onboarding/new-hire/export": {
          get: {
            operationId: "exportOnboardingRawPayload",
            parameters: [
              {
                in: "query",
                name: "csvExport",
                schema: {
                  type: "boolean",
                },
              },
            ],
            responses: {
              200: {
                description: "Blocked fixture",
                content: {
                  "application/json": {
                    schema: {
                      properties: {
                        rawPayload: {
                          type: "object",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "/audit/mvp-a/onboarding-correlations/{correlationId}/export": {
          get: {
            operationId: "getMvpAOnboardingAuditEvidence",
            responses: {
              200: {
                description: "Blocked fixture",
              },
            },
          },
        },
        "/onboarding/reusable-fixture": {
          post: {
            operationId: "submitReusableFixture",
            parameters: [
              {
                $ref: "#/components/parameters/CsvExportFixture",
              },
            ],
            requestBody: {
              $ref: "#/components/requestBodies/RawPayloadFixture",
            },
            responses: {
              204: {
                description: "No content",
              },
            },
          },
        },
      },
      components: {
        parameters: {
          CsvExportFixture: {
            in: "query",
            name: "csvExport",
            schema: {
              type: "boolean",
            },
          },
        },
        requestBodies: {
          RawPayloadFixture: {
            content: {
              "application/json": {
                schema: {
                  properties: {
                    rawPayload: {
                      type: "object",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "openapi" &&
        finding.subject === "/onboarding/new-hire/export",
    ),
    "expected export onboarding route to fail the policy gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "openapi" && finding.subject.includes("rawPayload"),
    ),
    "expected rawPayload OpenAPI property to fail the policy gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "openapi" &&
        finding.subject === "/onboarding/new-hire/export parameter csvExport",
    ),
    "expected csvExport OpenAPI parameter to fail the policy gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "openapi" &&
        finding.subject ===
          "/audit/mvp-a/onboarding-correlations/{correlationId}/export",
    ),
    "expected audit onboarding export route to fail the policy gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "openapi" &&
        finding.subject === "/onboarding/reusable-fixture parameter csvExport",
    ),
    "expected reusable csvExport OpenAPI parameter to fail the policy gate",
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.surface === "openapi" &&
        finding.subject === "/onboarding/reusable-fixture.rawPayload",
    ),
    "expected reusable rawPayload OpenAPI request body property to fail the policy gate",
  );
});

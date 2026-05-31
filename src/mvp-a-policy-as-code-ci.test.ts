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

import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { text, sqliteTable } from "drizzle-orm/sqlite-core";

import {
  checkMvpAPolicyAsCode,
  loadCurrentMvpAPolicyAsCodeInputs,
  type MvpAPolicyAsCodeInputs,
} from "./mvp-a-policy-as-code-ci.js";

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

test("MVP-A policy-as-code input loader discovers fixture and seed files", async () => {
  const fixtureCwd = await mkdtemp(join(tmpdir(), "hrcore-policy-"));
  await mkdir(join(fixtureCwd, "drizzle"));
  await mkdir(join(fixtureCwd, "openapi"));
  await mkdir(join(fixtureCwd, "src"));
  await mkdir(join(fixtureCwd, "src", "seeds"));
  await mkdir(join(fixtureCwd, "docs"));
  await mkdir(join(fixtureCwd, "docs", "fixtures"));
  await writeFile(join(fixtureCwd, "drizzle", "0000_fixture.sql"), "");
  await writeFile(
    join(fixtureCwd, "openapi", "hrcore.openapi.json"),
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
  await writeFile(join(fixtureCwd, "README.md"), "fixture policy root");
  await writeFile(
    join(fixtureCwd, "docs", "mvp-a-onboarding-non-production-data-gate.md"),
    "fixture policy docs",
  );
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

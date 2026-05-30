import assert from "node:assert/strict";
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

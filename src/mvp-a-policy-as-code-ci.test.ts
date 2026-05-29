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
});

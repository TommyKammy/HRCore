import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  assertMvpAOnboardingPiiExportGate,
  mvpAOnboardingPiiExportGate,
} from "./mvp-a-onboarding-pii-export-gate.js";
import {
  createOnboardingTransactionRequestFixture,
  OnboardingTransactionRequestValidationError,
  parseOnboardingTransactionRequestInput,
} from "./onboarding-transaction-request.js";

const readRepoFile = (path: string): Promise<string> =>
  readFile(join(process.cwd(), path), "utf8");

test("MVP-A onboarding PII masking/export gate is explicit and fail-closed", () => {
  assert.doesNotThrow(() =>
    assertMvpAOnboardingPiiExportGate(mvpAOnboardingPiiExportGate),
  );
});

test("MVP-A onboarding input rejects prohibited raw, export, and regulated payload keys", () => {
  for (const prohibitedKey of mvpAOnboardingPiiExportGate.prohibitedPayloadKeys) {
    assert.throws(
      () =>
        parseOnboardingTransactionRequestInput({
          ...createOnboardingTransactionRequestFixture(),
          payload: {
            ...createOnboardingTransactionRequestFixture().payload,
            [prohibitedKey]: "blocked",
          },
        }),
      (error) =>
        error instanceof OnboardingTransactionRequestValidationError &&
        error instanceof Error &&
        error.message ===
          `payload contains unsupported fields: ${prohibitedKey}`,
      `expected payload.${prohibitedKey} to be rejected`,
    );
  }
});

test("MVP-A OpenAPI contract exposes no raw payload or CSV/export onboarding surfaces", async () => {
  const contract = JSON.parse(
    await readRepoFile("openapi/hrcore.openapi.json"),
  ) as {
    paths?: Record<string, unknown>;
    components?: {
      schemas?: Record<
        string,
        {
          properties?: Record<string, unknown>;
        }
      >;
    };
  };

  for (const route of Object.keys(contract.paths ?? {})) {
    assertMvpAOnboardingPiiExportGate(mvpAOnboardingPiiExportGate, {
      route,
    });
  }

  const onboardingSchemas = Object.entries(contract.components?.schemas ?? {})
    .filter(([schemaName]) => schemaName.includes("Onboarding"))
    .flatMap(([, schema]) => Object.keys(schema.properties ?? {}));

  for (const propertyName of onboardingSchemas) {
    assertMvpAOnboardingPiiExportGate(mvpAOnboardingPiiExportGate, {
      fieldName: propertyName,
    });
  }
});

test("MVP-A onboarding PII/export gate documents remaining two-key dependencies", async () => {
  const [gateDoc, readme] = await Promise.all([
    readRepoFile("docs/mvp-a-onboarding-pii-export-gate.md"),
    readRepoFile("README.md"),
  ]);
  const normalizedGateDoc = gateDoc.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# MVP-A Onboarding PII Masking and Export Gate",
    "`mvp_a_onboarding_pii_export_closed_v1`",
    "ADR 0005",
    "ADR 0007",
    "ADR 0014",
    "ADR 0015",
    "ADR 0016",
    "ADR 0020",
    "legal and privacy approval",
    "field classification, redaction, and masking profile design",
    "separate export permission and raw-view permission checks",
    "watermark or manifest traceability",
    "download-log and raw-payload access audit evidence",
    "production real-data processing acceptance",
    "reject prohibited raw, export, and regulated-data payload keys",
  ]) {
    assert.ok(
      normalizedGateDoc.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing MVP-A PII/export gate documentation text: ${requiredText}`,
    );
  }

  assert.match(
    readme,
    /\[MVP-A Onboarding PII Masking and Export Gate\]\(docs\/mvp-a-onboarding-pii-export-gate\.md\)/,
  );
});

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

type OpenApiSchema = {
  $ref?: string;
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  allOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
};

type OpenApiContract = {
  paths?: Record<string, unknown>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
};

const openApiMethods = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

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
  ) as OpenApiContract;

  assertOpenApiOnboardingContractHasNoProhibitedSurfaces(contract);
});

test("MVP-A OpenAPI scan includes the root onboarding route", () => {
  assert.throws(
    () =>
      assertOpenApiOnboardingContractHasNoProhibitedSurfaces({
        paths: {
          "/onboarding": {
            get: {
              operationId: "exportOnboardingTransactions",
            },
          },
        },
      }),
    /exposes prohibited/u,
  );
});

test("MVP-A OpenAPI scan inspects inline onboarding schemas", () => {
  assert.throws(
    () =>
      assertOpenApiOnboardingContractHasNoProhibitedSurfaces({
        paths: {
          "/onboarding/new-hire": {
            post: {
              operationId: "createOnboardingRequest",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      properties: {
                        safeWrapper: {
                          properties: {
                            rawPayload: {},
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
      }),
    /exposes prohibited/u,
  );
});

function assertOpenApiOnboardingContractHasNoProhibitedSurfaces(
  contract: OpenApiContract,
): void {
  const onboardingPathEntries = Object.entries(contract.paths ?? {}).filter(
    ([route]) => isMvpAOnboardingRoute(route),
  );
  assert.ok(
    onboardingPathEntries.length > 0,
    "expected OpenAPI contract to expose MVP-A onboarding routes",
  );

  const schemas = contract.components?.schemas ?? {};
  for (const [route, pathItem] of onboardingPathEntries) {
    assertMvpAOnboardingPiiExportGate(mvpAOnboardingPiiExportGate, {
      route,
    });

    for (const metadataValue of collectOpenApiOperationMetadata(pathItem)) {
      assertMvpAOnboardingPiiExportGate(mvpAOnboardingPiiExportGate, {
        fieldName: metadataValue,
      });
    }

    for (const propertyName of collectOpenApiSchemaPropertyNamesFromValue(
      pathItem,
      schemas,
    )) {
      assertMvpAOnboardingPiiExportGate(mvpAOnboardingPiiExportGate, {
        fieldName: propertyName,
      });
    }
  }

  const onboardingSchemaNames = collectOnboardingSchemaNames(
    onboardingPathEntries.map(([, pathItem]) => pathItem),
    schemas,
  );
  if (Object.keys(schemas).length > 0) {
    assert.ok(
      onboardingSchemaNames.has("ValidationErrorResponse"),
      "expected onboarding schema scan to include shared referenced components",
    );
  }

  for (const schemaName of onboardingSchemaNames) {
    assertMvpAOnboardingPiiExportGate(mvpAOnboardingPiiExportGate, {
      fieldName: schemaName,
    });

    for (const propertyName of collectOpenApiSchemaPropertyNames(
      schemas[schemaName],
      schemas,
    )) {
      assertMvpAOnboardingPiiExportGate(mvpAOnboardingPiiExportGate, {
        fieldName: propertyName,
      });
    }
  }
}

test("MVP-A onboarding PII/export gate rejects route and field aliases", () => {
  for (const route of [
    "/onboarding/new-hire/raw",
    "/onboarding/new-hire/raw/payload",
    "/onboarding/new-hire/raw/view",
    "/onboarding/new-hire/csv/export",
  ]) {
    assert.throws(
      () =>
        assertMvpAOnboardingPiiExportGate(mvpAOnboardingPiiExportGate, {
          route,
        }),
      /exposes prohibited/u,
      `expected ${route} to be rejected`,
    );
  }

  for (const fieldName of [
    "employeeMyNumber",
    "candidateSpecificPersonalInformation",
    "rawPayloadJson",
    "exportOnboardingTransactions",
    "OnboardingExportResponse",
    "onboardingDownloadUrl",
    "onboardingCsvReport",
    "metadata",
    "requestMetadata",
    "note",
    "memo",
    "jsonb",
    "attachment",
    "attachmentBlob",
    "exportJob",
    "exportFileManifest",
    "watermarkToken",
    "rawPayloadAccessLog",
    "maskingProfile",
    "redactionProfile",
    "fieldClassification",
    "processingPurpose",
    "consentBasis",
    "dsarHandling",
    "privacyEvidence",
    "dataScopePolicy",
    "laborUnionMembership",
    "harassmentInvestigation",
    "disciplinaryInvestigation",
    "familyOrigin",
    "permanentDomicile",
  ]) {
    assert.throws(
      () =>
        assertMvpAOnboardingPiiExportGate(mvpAOnboardingPiiExportGate, {
          fieldName,
        }),
      /exposes prohibited/u,
      `expected ${fieldName} to be rejected`,
    );
  }
});

test("MVP-A onboarding input rejects prohibited keys inside payload sections", () => {
  for (const prohibitedKey of mvpAOnboardingPiiExportGate.prohibitedPayloadKeys) {
    for (const payloadSection of [
      "employment",
      "assignment",
      "workEmailExpectation",
    ] as const) {
      const fixture = createOnboardingTransactionRequestFixture();
      assert.throws(
        () =>
          parseOnboardingTransactionRequestInput({
            ...fixture,
            payload: {
              ...fixture.payload,
              [payloadSection]: {
                ...fixture.payload[payloadSection],
                [prohibitedKey]: "blocked",
              },
            },
          }),
        (error) =>
          error instanceof OnboardingTransactionRequestValidationError &&
          error instanceof Error &&
          error.message ===
            `payload.${payloadSection} contains unsupported fields: ${prohibitedKey}`,
        `expected payload.${payloadSection}.${prohibitedKey} to be rejected`,
      );
    }
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

function collectOpenApiOperationMetadata(pathItem: unknown): string[] {
  if (!isRecord(pathItem)) {
    return [];
  }

  const metadataValues: string[] = [];
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!openApiMethods.has(method) || !isRecord(operation)) {
      continue;
    }

    for (const key of ["operationId", "summary", "description"] as const) {
      const value = operation[key];
      if (typeof value === "string") {
        metadataValues.push(value);
      }
    }

    const tags = operation.tags;
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        if (typeof tag === "string") {
          metadataValues.push(tag);
        }
      }
    }
  }

  return metadataValues;
}

function isMvpAOnboardingRoute(route: string): boolean {
  return route === "/onboarding" || route.startsWith("/onboarding/");
}

function collectOnboardingSchemaNames(
  pathItems: readonly unknown[],
  schemas: Record<string, OpenApiSchema>,
): Set<string> {
  const schemaNames = new Set(
    Object.keys(schemas).filter((schemaName) =>
      schemaName.includes("Onboarding"),
    ),
  );
  const pendingSchemaNames = [
    ...schemaNames,
    ...pathItems.flatMap((pathItem) => collectOpenApiSchemaRefs(pathItem)),
  ];
  const processedSchemaNames = new Set<string>();

  while (pendingSchemaNames.length > 0) {
    const schemaName = pendingSchemaNames.pop();
    if (
      schemaName === undefined ||
      processedSchemaNames.has(schemaName) ||
      schemas[schemaName] === undefined
    ) {
      continue;
    }

    processedSchemaNames.add(schemaName);
    schemaNames.add(schemaName);
    pendingSchemaNames.push(...collectOpenApiSchemaRefs(schemas[schemaName]));
  }

  return schemaNames;
}

function collectOpenApiSchemaPropertyNames(
  schema: OpenApiSchema | undefined,
  schemas: Record<string, OpenApiSchema>,
): string[] {
  const propertyNames: string[] = [];

  function visitSchema(
    currentSchema: OpenApiSchema | undefined,
    visitedSchemaNames: ReadonlySet<string>,
  ): void {
    if (currentSchema === undefined) {
      return;
    }

    const refSchemaName = getOpenApiSchemaNameFromRef(currentSchema.$ref);
    if (refSchemaName !== undefined) {
      if (visitedSchemaNames.has(refSchemaName)) {
        return;
      }

      visitSchema(
        schemas[refSchemaName],
        new Set([...visitedSchemaNames, refSchemaName]),
      );
    }

    for (const [propertyName, propertySchema] of Object.entries(
      currentSchema.properties ?? {},
    )) {
      propertyNames.push(propertyName);
      visitSchema(propertySchema, visitedSchemaNames);
    }

    visitSchema(currentSchema.items, visitedSchemaNames);
    for (const nestedSchema of [
      ...(currentSchema.allOf ?? []),
      ...(currentSchema.anyOf ?? []),
      ...(currentSchema.oneOf ?? []),
    ]) {
      visitSchema(nestedSchema, visitedSchemaNames);
    }
  }

  visitSchema(schema, new Set());
  return propertyNames;
}

function collectOpenApiSchemaPropertyNamesFromValue(
  value: unknown,
  schemas: Record<string, OpenApiSchema>,
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectOpenApiSchemaPropertyNamesFromValue(item, schemas),
    );
  }

  if (!isRecord(value)) {
    return [];
  }

  const propertyNames = isOpenApiSchemaLike(value)
    ? collectOpenApiSchemaPropertyNames(value, schemas)
    : [];

  for (const nestedValue of Object.values(value)) {
    propertyNames.push(
      ...collectOpenApiSchemaPropertyNamesFromValue(nestedValue, schemas),
    );
  }

  return propertyNames;
}

function collectOpenApiSchemaRefs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectOpenApiSchemaRefs(item));
  }

  if (!isRecord(value)) {
    return [];
  }

  const refs: string[] = [];
  const schemaName = getOpenApiSchemaNameFromRef(value.$ref);
  if (schemaName !== undefined) {
    refs.push(schemaName);
  }

  for (const nestedValue of Object.values(value)) {
    refs.push(...collectOpenApiSchemaRefs(nestedValue));
  }

  return refs;
}

function getOpenApiSchemaNameFromRef(ref: unknown): string | undefined {
  const schemaRefPrefix = "#/components/schemas/";
  if (typeof ref !== "string" || !ref.startsWith(schemaRefPrefix)) {
    return undefined;
  }

  return ref.slice(schemaRefPrefix.length);
}

function isOpenApiSchemaLike(value: Record<string, unknown>): boolean {
  return (
    typeof value.$ref === "string" ||
    isRecord(value.properties) ||
    isRecord(value.items) ||
    Array.isArray(value.allOf) ||
    Array.isArray(value.anyOf) ||
    Array.isArray(value.oneOf)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

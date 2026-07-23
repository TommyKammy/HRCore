import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildApp } from "./app.js";
import { loadOpenApiContract } from "./openapi.js";
import {
  p2ListAuditContract,
  p2ListAuditDeniedFields,
  p2ListAuditEventTypes,
  p2ListAuditFields,
  p2ListAuthorizationContract,
  p2ListCursorContract,
  p2ListCursorVersion,
  p2ListDefaultLimit,
  p2ListDeferredEmployeeFields,
  p2ListDeferredLifecycleFields,
  p2ListDeniedSurfaces,
  p2ListEmployeeDefaultOrder,
  p2ListEmployeeExportFields,
  p2ListEmployeeFields,
  p2ListEmployeeFilters,
  p2ListEmployeeSortFields,
  p2ListErrorMessageMaximumLength,
  p2ListErrorCodes,
  p2ListExportContract,
  p2ListExportMaximumRows,
  p2ListExportReasonCodes,
  p2ListExportSchemaVersion,
  p2ListFieldVisibility,
  p2ListLifecycleDefaultOrder,
  p2ListLifecycleExportFields,
  p2ListLifecycleFields,
  p2ListLifecycleFilters,
  p2ListLifecycleRangePairs,
  p2ListLifecycleSortNullPlacement,
  p2ListLifecycleSortFields,
  p2ListMaximumDateRangeDays,
  p2ListMaximumCursorLength,
  p2ListMaximumLimit,
  p2ListMaximumQueryLength,
  p2ListPermissions,
  p2ListPersistedLifecycleTypeMap,
  p2ListQueryPattern,
  p2ListReadiness,
  p2ListRoleActionMatrix,
  p2ListUnknownQueryParameterPolicy,
} from "./p2list-contract.js";

interface OpenApiSchema {
  type?: string | string[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  enum?: string[];
  const?: string | boolean | number | null;
  default?: string | number;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
  maxLength?: number;
  minLength?: number;
  minProperties?: number;
  pattern?: string;
  items?: OpenApiSchema;
  allOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  dependentRequired?: Record<string, string[]>;
  additionalProperties?: boolean;
  "x-hrcore-required-claims"?: string[];
  "x-hrcore-nullable-sort-value-encoding"?: string;
  $ref?: string;
}

interface OpenApiParameter {
  name: string;
  in: string;
  schema: OpenApiSchema;
}

interface OpenApiOperation {
  description: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content: Record<
      string,
      {
        schema: OpenApiSchema;
        example?: unknown;
      }
    >;
  };
  responses: Record<
    string,
    {
      content?: Record<
        string,
        {
          schema: OpenApiSchema;
          example?: unknown;
        }
      >;
      headers?: Record<string, { schema: OpenApiSchema }>;
    }
  >;
  "x-hrcore-readiness": string;
  "x-hrcore-implementation-status": string;
  "x-hrcore-default-order"?: string[];
  "x-hrcore-cursor-version"?: string;
  "x-hrcore-maximum-date-range-days"?: number;
  "x-hrcore-dependent-query-parameters"?: Record<string, string[]>;
  "x-hrcore-query-schema"?: OpenApiSchema;
  "x-hrcore-sort-null-placement"?: Record<string, string>;
  "x-hrcore-unknown-query-parameters"?: string;
  "x-hrcore-conditional-filter-permissions"?: Record<string, string>;
  "x-hrcore-required-permission"?: string;
  "x-hrcore-required-permissions"?: string[];
  "x-hrcore-export-schema-version"?: string;
  "x-hrcore-maximum-rows"?: number;
  "x-hrcore-meaningful-filter-any-of"?: string[];
}

interface P2ListOpenApiContract {
  paths: Record<
    string,
    {
      get?: OpenApiOperation;
      post?: OpenApiOperation;
    }
  >;
  components: {
    schemas: Record<string, OpenApiSchema>;
  };
}

const parameterNames = (operation: OpenApiOperation): string[] =>
  (operation.parameters ?? []).map(({ name }) => name);

const schemaRefName = (schema: OpenApiSchema): string | undefined =>
  schema.$ref?.replace("#/components/schemas/", "");

const normalizedSurface = (value: string): string =>
  value.replaceAll("_", "").toLowerCase();

const resolveLocalSchemaRef = (
  schema: OpenApiSchema,
  contract: P2ListOpenApiContract,
): OpenApiSchema => {
  if (!schema.$ref) {
    return schema;
  }
  const segments = schema.$ref
    .replace(/^#\//u, "")
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  let target: unknown = contract;
  for (const segment of segments) {
    target =
      target && typeof target === "object"
        ? (target as Record<string, unknown>)[segment]
        : undefined;
  }
  assert.ok(target, `unresolved local OpenAPI schema ref: ${schema.$ref}`);
  return target as OpenApiSchema;
};

const assertLocalSchemaRefsResolve = (
  value: unknown,
  contract: P2ListOpenApiContract,
): void => {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertLocalSchemaRefsResolve(item, contract);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.$ref === "string") {
    resolveLocalSchemaRef(record as OpenApiSchema, contract);
  }
  for (const nested of Object.values(record)) {
    assertLocalSchemaRefsResolve(nested, contract);
  }
};

test("P2LIST-00 shared contract freezes bounded query, cursor, authorization, export, and audit policy", () => {
  assert.equal(p2ListReadiness, "bounded_synthetic_only_not_production_ready");
  assert.equal(p2ListDefaultLimit, 25);
  assert.equal(p2ListMaximumLimit, 100);
  assert.equal(p2ListExportMaximumRows, 100);

  assert.deepEqual(p2ListEmployeeDefaultOrder, [
    { field: "employeeId", direction: "asc" },
    { field: "employmentId", direction: "asc", tieBreaker: true },
  ]);
  assert.deepEqual(p2ListLifecycleDefaultOrder, [
    { field: "requestedAt", direction: "desc" },
    {
      field: "transactionRequestId",
      direction: "desc",
      tieBreaker: true,
    },
  ]);
  assert.deepEqual(p2ListPersistedLifecycleTypeMap, {
    hire: "onboarding",
    change: "transfer",
    transfer: "transfer",
    terminate: "termination",
  });
  assert.deepEqual(p2ListLifecycleSortNullPlacement, {
    requestedAt: "not_nullable",
    effectiveDate: "last",
  });

  assert.deepEqual(p2ListCursorContract.requiredClaims, [
    "version",
    "resource",
    "sort",
    "direction",
    "lastSortValue",
    "lastSortValueIsNull",
    "lastStableId",
    "filterFingerprint",
  ]);
  assert.equal(p2ListCursorContract.containsPii, false);
  assert.equal(p2ListCursorContract.containsRawQuery, false);
  assert.equal(
    p2ListCursorContract.nullableSortValueEncoding,
    "lastSortValue_null_with_explicit_lastSortValueIsNull",
  );
  assert.deepEqual(p2ListCursorContract.nullableSortContinuation, {
    placement: "last_regardless_of_direction",
    nonNullPartitionPrecedesNullPartition: true,
    nullPartitionOrder: "lastStableId_in_requested_direction",
  });
  assert.equal(p2ListCursorContract.integrityAlgorithm, "hmac_sha256");
  assert.equal(
    p2ListCursorContract.filterFingerprintAlgorithm,
    "sha256_canonical_json",
  );
  assert.equal(
    p2ListCursorContract.maximumWireLength,
    p2ListMaximumCursorLength,
  );
  assert.ok(p2ListCursorContract.rejectedConditions.includes("tampered"));
  assert.ok(
    p2ListCursorContract.rejectedConditions.includes("filter_mismatch"),
  );

  assert.equal(p2ListAuthorizationContract.serverAuthoritative, true);
  assert.equal(p2ListAuthorizationContract.clientPersonaIsAuthoritative, false);
  assert.equal(p2ListAuthorizationContract.rowFilteringAtQueryLayer, true);
  assert.equal(
    p2ListAuthorizationContract.postFetchFilteringIsSufficient,
    false,
  );
  assert.equal(
    p2ListAuthorizationContract.rlsIsAuthorizationSourceOfTruth,
    false,
  );

  assert.equal(
    p2ListRoleActionMatrix.hrOperator.employeeList.requiredPermission,
    p2ListPermissions.employeeListRead,
  );
  assert.equal(p2ListRoleActionMatrix.approver.employeeList.uiVisible, false);
  assert.equal(
    p2ListRoleActionMatrix.approver.employeeList.requiredPermission,
    null,
  );
  assert.equal(
    p2ListRoleActionMatrix.approver.lifecycleRequestList.scope,
    "assigned_approval_requests",
  );
  assert.equal(
    p2ListRoleActionMatrix.boundedAdmin.lifecycleRequestList.uiVisible,
    false,
  );

  assert.equal(p2ListExportContract.requireMeaningfulFilter, true);
  assert.equal(p2ListExportContract.rejectRatherThanTruncate, true);
  assert.equal(p2ListExportContract.requireReasonCode, true);
  assert.deepEqual(p2ListExportContract.reasonCodes, p2ListExportReasonCodes);
  assert.equal(
    p2ListExportContract.conditionalPermissionByFilter.correlationId,
    p2ListPermissions.supportCorrelationRead,
  );
  assert.equal(p2ListExportContract.formulaInjectionProtectionRequired, true);
  assert.equal(p2ListExportContract.delivery, "synchronous_text_csv");
  assert.deepEqual(
    p2ListExportContract.serverOwnedColumnAllowlists.employee,
    p2ListEmployeeExportFields,
  );
  assert.deepEqual(
    p2ListExportContract.serverOwnedColumnAllowlists.lifecycleRequest,
    p2ListLifecycleExportFields,
  );
  assert.deepEqual(
    p2ListRoleActionMatrix.hrOperator.employeeExport.requiredPermissions,
    [
      p2ListPermissions.employeeListRead,
      p2ListPermissions.employeeListExport,
      p2ListPermissions.csvDownload,
    ],
  );
  assert.deepEqual(
    p2ListRoleActionMatrix.hrOperator.lifecycleRequestExport
      .requiredPermissions,
    [
      p2ListPermissions.lifecycleRequestListRead,
      p2ListPermissions.lifecycleRequestListExport,
      p2ListPermissions.csvDownload,
    ],
  );
  assert.deepEqual(p2ListFieldVisibility.approver.employee, []);
  assert.ok(
    !p2ListFieldVisibility.approver.lifecycleRequest.includes(
      "subjectPersonId" as never,
    ),
  );
  assert.equal(p2ListFieldVisibility.maskedFieldsAreReported, true);

  assert.ok(p2ListAuditEventTypes.includes("bounded_export.denied"));
  assert.ok(p2ListAuditEventTypes.includes("authorization.denied"));
  assert.ok(p2ListAuditFields.includes("filterFingerprint"));
  assert.ok(p2ListAuditDeniedFields.includes("rawSearchTerm"));
  assert.ok(p2ListAuditDeniedFields.includes("csvBody"));
  assert.equal(p2ListAuditContract.serverAuthoritative, true);
  assert.equal(p2ListAuditContract.clientTelemetryIsSufficient, false);
  assert.equal(
    p2ListAuditContract.detailOpenSource,
    "authorized_detail_api_response",
  );

  const allowedSurfaces = [
    ...p2ListEmployeeFields,
    ...p2ListLifecycleFields,
    ...p2ListEmployeeExportFields,
    ...p2ListLifecycleExportFields,
  ].map(normalizedSurface);
  const deniedSurfaces = p2ListDeniedSurfaces.map(normalizedSurface);
  assert.deepEqual(
    allowedSurfaces.filter((field) => deniedSurfaces.includes(field)),
    [],
  );
  const allowedAuditSurfaces = p2ListAuditFields.map(normalizedSurface);
  const deniedAuditSurfaces = p2ListAuditDeniedFields.map(normalizedSurface);
  assert.deepEqual(
    allowedAuditSurfaces.filter((field) => deniedAuditSurfaces.includes(field)),
    [],
  );

  assert.ok(p2ListDeferredEmployeeFields.includes("employmentType"));
  assert.ok(p2ListDeferredEmployeeFields.includes("updatedAt"));
  assert.ok(p2ListDeferredLifecycleFields.includes("currentStep"));
  assert.ok(!p2ListEmployeeFields.includes("employmentType" as never));
  assert.ok(!p2ListLifecycleFields.includes("currentStep" as never));
});

test("P2LIST-00 OpenAPI freezes list and bounded export paths with fail-closed examples", async () => {
  const contract = (await loadOpenApiContract()) as P2ListOpenApiContract;
  const employeeOperation = contract.paths["/employees"]?.get;
  const lifecycleOperation =
    contract.paths["/lifecycle/transaction-requests"]?.get;
  const employeeExport = contract.paths["/exports/employee-list"]?.post;
  const lifecycleExport =
    contract.paths["/exports/lifecycle-request-list"]?.post;

  assert.ok(employeeOperation);
  assert.ok(lifecycleOperation);
  assert.ok(employeeExport);
  assert.ok(lifecycleExport);

  assert.deepEqual(parameterNames(employeeOperation), [
    ...p2ListEmployeeFilters,
    "sort",
    "direction",
    "limit",
    "cursor",
  ]);
  assert.deepEqual(parameterNames(lifecycleOperation), [
    ...p2ListLifecycleFilters,
    "sort",
    "direction",
    "limit",
    "cursor",
  ]);
  assert.deepEqual(employeeOperation["x-hrcore-default-order"], [
    "employeeId:asc",
    "employmentId:asc",
  ]);
  assert.deepEqual(lifecycleOperation["x-hrcore-default-order"], [
    "requestedAt:desc",
    "transactionRequestId:desc",
  ]);
  assert.equal(
    employeeOperation["x-hrcore-required-permission"],
    p2ListPermissions.employeeListRead,
  );
  assert.equal(
    lifecycleOperation["x-hrcore-required-permission"],
    p2ListPermissions.lifecycleRequestListRead,
  );
  assert.equal(
    employeeOperation["x-hrcore-cursor-version"],
    p2ListCursorVersion,
  );
  assert.equal(
    lifecycleOperation["x-hrcore-cursor-version"],
    p2ListCursorVersion,
  );
  assert.equal(
    lifecycleOperation["x-hrcore-maximum-date-range-days"],
    p2ListMaximumDateRangeDays,
  );
  assert.deepEqual(
    lifecycleOperation["x-hrcore-dependent-query-parameters"],
    Object.fromEntries(
      p2ListLifecycleRangePairs.flatMap(([start, end]) => [
        [start, [end]],
        [end, [start]],
      ]),
    ),
  );
  for (const [operation, querySchemaName] of [
    [employeeOperation, "P2ListEmployeeListQuery"],
    [lifecycleOperation, "P2ListLifecycleListQuery"],
  ] as const) {
    assert.equal(
      operation["x-hrcore-unknown-query-parameters"],
      p2ListUnknownQueryParameterPolicy,
    );
    assert.equal(
      operation["x-hrcore-query-schema"]?.$ref,
      `#/components/schemas/${querySchemaName}`,
    );
  }
  assert.deepEqual(
    lifecycleOperation["x-hrcore-sort-null-placement"],
    p2ListLifecycleSortNullPlacement,
  );
  assert.deepEqual(
    lifecycleOperation["x-hrcore-conditional-filter-permissions"],
    { correlationId: p2ListPermissions.supportCorrelationRead },
  );

  for (const operation of [
    employeeOperation,
    lifecycleOperation,
    employeeExport,
    lifecycleExport,
  ]) {
    assert.equal(operation["x-hrcore-readiness"], p2ListReadiness);
    assert.equal(operation["x-hrcore-implementation-status"], "contract_only");
    assert.match(operation.description, /server-authorized|server-authorized/);
  }

  for (const operation of [employeeOperation, lifecycleOperation]) {
    assert.deepEqual(Object.keys(operation.responses), [
      "200",
      "400",
      "401",
      "403",
    ]);
    assert.equal(
      schemaRefName(
        operation.responses["400"].content?.["application/json"].schema ?? {},
      ),
      "P2ListErrorResponse",
    );
  }

  for (const operation of [employeeExport, lifecycleExport]) {
    assert.deepEqual(Object.keys(operation.responses), [
      "200",
      "400",
      "401",
      "403",
      "422",
    ]);
    assert.equal(
      operation.responses["200"].headers?.["X-HRCore-Export-Schema-Version"]
        .schema.const,
      "p2list_export_v1",
    );
    assert.ok(operation.responses["200"].content?.["text/csv"].example);
    assert.equal(
      operation["x-hrcore-export-schema-version"],
      p2ListExportSchemaVersion,
    );
    assert.equal(operation["x-hrcore-maximum-rows"], p2ListExportMaximumRows);
  }
  assert.deepEqual(employeeExport["x-hrcore-required-permissions"], [
    p2ListPermissions.employeeListRead,
    p2ListPermissions.employeeListExport,
    p2ListPermissions.csvDownload,
  ]);
  assert.deepEqual(lifecycleExport["x-hrcore-required-permissions"], [
    p2ListPermissions.lifecycleRequestListRead,
    p2ListPermissions.lifecycleRequestListExport,
    p2ListPermissions.csvDownload,
  ]);
  assert.deepEqual(employeeExport["x-hrcore-meaningful-filter-any-of"], [
    "employeeId",
    "organizationCode",
  ]);
  assert.deepEqual(lifecycleExport["x-hrcore-meaningful-filter-any-of"], [
    "subjectEmployeeId",
    "organizationCode",
    "correlationId",
    "requestedRange",
    "effectiveRange",
  ]);

  const employeeLimit = employeeOperation.parameters?.find(
    ({ name }) => name === "limit",
  )?.schema;
  const lifecycleLimit = lifecycleOperation.parameters?.find(
    ({ name }) => name === "limit",
  )?.schema;
  assert.deepEqual(employeeLimit, {
    type: "integer",
    minimum: 1,
    maximum: 100,
    default: 25,
  });
  assert.deepEqual(lifecycleLimit, employeeLimit);

  const employeeQuery = employeeOperation.parameters?.find(
    ({ name }) => name === "q",
  )?.schema;
  const lifecycleQuery = lifecycleOperation.parameters?.find(
    ({ name }) => name === "q",
  )?.schema;
  assert.equal(employeeQuery?.maxLength, p2ListMaximumQueryLength);
  assert.equal(lifecycleQuery?.maxLength, p2ListMaximumQueryLength);
  assert.equal(employeeQuery?.pattern, p2ListQueryPattern);
  assert.equal(lifecycleQuery?.pattern, p2ListQueryPattern);

  const queryPattern = new RegExp(p2ListQueryPattern, "u");
  for (const wildcardQuery of [
    "A*",
    "A?",
    "A%",
    "A_",
    "^EMP",
    "EMP$",
    "[A-Z]",
    "foo+",
    "a|b",
    "a.b",
    "a(b)",
    "a{2}",
    "a\\b",
  ]) {
    assert.equal(
      queryPattern.test(wildcardQuery),
      false,
      `wildcard query must fail closed: ${wildcardQuery}`,
    );
  }
  for (const prefixQuery of ["EMP-001", "山田 太郎", "O'Brien", "山田・太郎"]) {
    assert.equal(
      queryPattern.test(prefixQuery),
      true,
      `ordinary prefix query must remain valid: ${prefixQuery}`,
    );
  }

  const employeeSort = employeeOperation.parameters?.find(
    ({ name }) => name === "sort",
  )?.schema.enum;
  const lifecycleSort = lifecycleOperation.parameters?.find(
    ({ name }) => name === "sort",
  )?.schema.enum;
  assert.deepEqual(employeeSort, p2ListEmployeeSortFields);
  assert.deepEqual(lifecycleSort, p2ListLifecycleSortFields);

  const schemas = contract.components.schemas;
  assert.equal(schemas.P2ListEmployeeListQuery.additionalProperties, false);
  assert.equal(schemas.P2ListLifecycleListQuery.additionalProperties, false);
  assert.deepEqual(
    Object.keys(schemas.P2ListEmployeeListQuery.properties ?? {}),
    parameterNames(employeeOperation),
  );
  assert.deepEqual(
    Object.keys(schemas.P2ListLifecycleListQuery.properties ?? {}),
    parameterNames(lifecycleOperation),
  );
  for (const [operation, querySchema] of [
    [employeeOperation, schemas.P2ListEmployeeListQuery],
    [lifecycleOperation, schemas.P2ListLifecycleListQuery],
  ] as const) {
    for (const parameter of operation.parameters ?? []) {
      const queryProperty = querySchema.properties?.[parameter.name];
      assert.ok(queryProperty, `missing query property: ${parameter.name}`);
      assert.deepEqual(
        resolveLocalSchemaRef(queryProperty, contract),
        resolveLocalSchemaRef(parameter.schema, contract),
        `query schema drift for parameter: ${parameter.name}`,
      );
    }
  }
  assert.deepEqual(
    schemas.P2ListLifecycleListQuery.dependentRequired,
    Object.fromEntries(
      p2ListLifecycleRangePairs.flatMap(([start, end]) => [
        [start, [end]],
        [end, [start]],
      ]),
    ),
  );
  assert.deepEqual(
    Object.keys(schemas.P2ListEmployeeItem.properties ?? {}),
    p2ListEmployeeFields,
  );
  assert.deepEqual(
    Object.keys(schemas.P2ListLifecycleItem.properties ?? {}),
    p2ListLifecycleFields,
  );
  assert.deepEqual(
    schemas.P2ListErrorResponse.properties?.code.enum,
    p2ListErrorCodes,
  );
  assert.deepEqual(
    schemas.P2ListLifecycleItem.properties?.subjectPersonId.type,
    ["string", "null"],
  );
  assert.equal(
    schemas.P2ListErrorResponse.properties?.message.maxLength,
    p2ListErrorMessageMaximumLength,
  );
  assert.deepEqual(
    schemas.P2ListAuthorizationSummary.properties?.maskedFields.items?.enum,
    [...new Set([...p2ListEmployeeFields, ...p2ListLifecycleFields])],
  );
  assert.equal(
    schemas.P2ListEmployeeResponse.properties?.items.maxItems,
    p2ListMaximumLimit,
  );
  assert.equal(
    schemas.P2ListLifecycleResponse.properties?.items.maxItems,
    p2ListMaximumLimit,
  );
  assert.equal(
    schemas.P2ListCursor.pattern,
    "^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$",
  );
  assert.deepEqual(
    schemas.P2ListCursor["x-hrcore-required-claims"],
    p2ListCursorContract.requiredClaims,
  );
  assert.equal(
    schemas.P2ListCursor["x-hrcore-nullable-sort-value-encoding"],
    p2ListCursorContract.nullableSortValueEncoding,
  );
  assert.deepEqual(schemas.P2ListPageInfo.oneOf, [
    {
      required: ["hasNextPage", "nextCursor"],
      properties: {
        hasNextPage: { const: true },
        nextCursor: { $ref: "#/components/schemas/P2ListCursor" },
      },
    },
    {
      required: ["hasNextPage", "nextCursor"],
      properties: {
        hasNextPage: { const: false },
        nextCursor: { type: "null" },
      },
    },
  ]);
  assert.deepEqual(
    schemas.P2ListLifecycleFilters.dependentRequired,
    Object.fromEntries(
      p2ListLifecycleRangePairs.flatMap(([start, end]) => [
        [start, [end]],
        [end, [start]],
      ]),
    ),
  );
  assert.equal(
    schemas.P2ListEmployeeFilters.properties?.q.pattern,
    p2ListQueryPattern,
  );
  assert.equal(
    schemas.P2ListLifecycleFilters.properties?.q.pattern,
    p2ListQueryPattern,
  );
  assert.deepEqual(
    schemas.P2ListEmployeeExportRequest.properties?.filters.allOf?.[1].anyOf,
    [{ required: ["employeeId"] }, { required: ["organizationCode"] }],
  );
  assert.deepEqual(
    schemas.P2ListLifecycleExportRequest.properties?.filters.allOf?.[1].anyOf,
    [
      { required: ["subjectEmployeeId"] },
      { required: ["organizationCode"] },
      { required: ["correlationId"] },
      { required: ["requestedFrom", "requestedTo"] },
      { required: ["effectiveFrom", "effectiveTo"] },
    ],
  );
  assert.deepEqual(
    schemas.P2ListEmployeeExportRequest.properties?.reasonCode.enum,
    p2ListExportReasonCodes,
  );
  assert.deepEqual(
    schemas.P2ListLifecycleExportRequest.properties?.reasonCode.enum,
    p2ListExportReasonCodes,
  );

  const employeeCsvExample = employeeExport.responses["200"].content?.[
    "text/csv"
  ].example as string;
  const lifecycleCsvExample = lifecycleExport.responses["200"].content?.[
    "text/csv"
  ].example as string;
  assert.deepEqual(
    employeeCsvExample.split("\n", 1)[0].split(","),
    p2ListEmployeeExportFields,
  );
  assert.deepEqual(
    lifecycleCsvExample.split("\n", 1)[0].split(","),
    p2ListLifecycleExportFields,
  );
  assertLocalSchemaRefsResolve(contract, contract);

  const serializedContract = JSON.stringify(contract);
  for (const deferredField of [
    ...p2ListDeferredEmployeeFields,
    ...p2ListDeferredLifecycleFields,
  ]) {
    assert.ok(
      !Object.keys(schemas.P2ListEmployeeItem.properties ?? {}).includes(
        deferredField,
      ) &&
        !Object.keys(schemas.P2ListLifecycleItem.properties ?? {}).includes(
          deferredField,
        ),
      `deferred field leaked into a P2LIST item: ${deferredField}`,
    );
  }
  assert.ok(!serializedContract.includes('"totalCount"'));
  assert.ok(!serializedContract.includes('"offset"'));
});

test("P2LIST-00 documentation and policy scan preserve ADR and production boundaries", async () => {
  const [gate, policyCi, readme, adr0011, adr0013, adr0014] = await Promise.all(
    [
      readFile(
        "docs/p2list-00-list-api-contract-authorization-gate.md",
        "utf8",
      ),
      readFile("src/mvp-a-policy-as-code-ci.ts", "utf8"),
      readFile("README.md", "utf8"),
      readFile("docs/adr/0011-data-scope-policy-dsl-rls-boundary.md", "utf8"),
      readFile("docs/adr/0013-self-approval-prevention-boundary.md", "utf8"),
      readFile(
        "docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md",
        "utf8",
      ),
    ],
  );
  const normalizedGate = gate.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# P2LIST-00 List API Contract, Data Classification, and Authorization Gate",
    "Issue: #411",
    "Part of: #410",
    "Runtime endpoint, query repository, WebUI, and export implementation: Deferred",
    "Production authorization/RLS: Blocked",
    "person.id",
    "employment.employment_code",
    "assignment.organization_code",
    "must not synthesize those values",
    "GET /employees",
    "GET /lifecycle/transaction-requests",
    "p2list_cursor_v1",
    "HMAC-SHA-256",
    "at most 200 characters",
    "server-resolved actor",
    "post-fetch filtering is not sufficient",
    "POST /exports/employee-list",
    "POST /exports/lifecycle-request-list",
    "at most 100 bounded synthetic rows",
    "does not authorize export",
    "p2list_audit_v1",
    "authorized detail API response",
    "raw search terms",
    "ADR 0011, ADR 0013, and ADR 0014 remain Proposed",
    "npm run verify:pre-pr",
  ]) {
    assert.ok(
      normalizedGate.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing gate text: ${requiredText}`,
    );
  }

  for (const adr of [adr0011, adr0013, adr0014]) {
    assert.match(adr, /## Status\s+Proposed/u);
  }

  assert.ok(
    policyCi.includes(
      '"docs/p2list-00-list-api-contract-authorization-gate.md"',
    ),
  );
  assert.ok(
    readme.includes(
      "[P2LIST-00 List API Contract and Authorization Gate](docs/p2list-00-list-api-contract-authorization-gate.md)",
    ),
  );

  for (const unsafeText of [
    "production-like readiness: Allowed",
    "real employee data: Allowed",
    "production authorization/RLS: Allowed",
    "broad export: Allowed",
    "two-key approval: Accepted",
  ]) {
    assert.ok(!gate.includes(unsafeText));
  }
});

test("P2LIST-00 remains contract-only before runtime child issues", async (t) => {
  const app = await buildApp();
  t.after(async () => {
    await app.close();
  });

  for (const request of [
    { method: "GET" as const, url: "/employees" },
    { method: "GET" as const, url: "/lifecycle/transaction-requests" },
    { method: "POST" as const, url: "/exports/employee-list" },
    { method: "POST" as const, url: "/exports/lifecycle-request-list" },
  ]) {
    const response = await app.inject(request);
    assert.equal(response.statusCode, 404);
  }
});

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";

import {
  assertMvpAOnboardingEvidenceAuthorizationGate,
  type MvpAOnboardingEvidenceAuthorizationGate,
  mvpAOnboardingEvidenceAuthorizationGate,
} from "./mvp-a-onboarding-evidence-authorization.js";
import {
  assertMvpAOnboardingPiiExportGate,
  type MvpAOnboardingPiiExportGate,
  mvpAOnboardingPiiExportGate,
} from "./mvp-a-onboarding-pii-export-gate.js";
import * as schema from "./persistence/schema.js";

export interface MvpAPolicyAsCodeInputs {
  piiExportGate: MvpAOnboardingPiiExportGate;
  evidenceAuthorizationGate: MvpAOnboardingEvidenceAuthorizationGate;
  schemaTables: readonly SQLiteTable[];
  migrationSqlByPath: ReadonlyMap<string, string>;
  openApiContract: OpenApiContract;
}

export interface MvpAPolicyAsCodeFinding {
  surface: "gate" | "schema" | "migration" | "openapi";
  path: string;
  subject: string;
  message: string;
}

interface OpenApiSchema {
  $ref?: string;
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  allOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
}

interface OpenApiContract {
  paths?: Record<string, unknown>;
  components?: OpenApiComponents;
}

interface OpenApiComponents {
  schemas?: Record<string, OpenApiSchema>;
  parameters?: Record<string, unknown>;
  requestBodies?: Record<string, unknown>;
}

type OpenApiComponentSection = keyof OpenApiComponents;

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
const openApiOperationMetadataKeys = [
  "operationId",
  "summary",
  "description",
] as const;

export function checkMvpAPolicyAsCode(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  return [
    ...collectGateFindings(inputs),
    ...collectSchemaFindings(inputs),
    ...collectMigrationFindings(inputs),
    ...collectOpenApiFindings(inputs),
  ];
}

export function assertMvpAPolicyAsCode(inputs: MvpAPolicyAsCodeInputs): void {
  const findings = checkMvpAPolicyAsCode(inputs);
  if (findings.length === 0) {
    return;
  }

  const findingSummary = findings
    .map(
      (finding) =>
        `${finding.surface}:${finding.path}:${finding.subject}: ${finding.message}`,
    )
    .join("\n");
  throw new Error(`MVP-A policy-as-code gate failed:\n${findingSummary}`);
}

export async function loadCurrentMvpAPolicyAsCodeInputs(
  cwd = process.cwd(),
): Promise<MvpAPolicyAsCodeInputs> {
  return {
    piiExportGate: mvpAOnboardingPiiExportGate,
    evidenceAuthorizationGate: mvpAOnboardingEvidenceAuthorizationGate,
    schemaTables: collectCurrentSchemaTables(),
    migrationSqlByPath: await readCommittedMigrationSqlByPath(cwd),
    openApiContract: JSON.parse(
      await readFile(join(cwd, "openapi/hrcore.openapi.json"), "utf8"),
    ) as OpenApiContract,
  };
}

function collectGateFindings(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  const findings: MvpAPolicyAsCodeFinding[] = [];
  for (const [subject, check] of [
    [
      inputs.piiExportGate.gateId,
      () => assertMvpAOnboardingPiiExportGate(inputs.piiExportGate),
    ],
    [
      inputs.evidenceAuthorizationGate.gateId,
      () =>
        assertMvpAOnboardingEvidenceAuthorizationGate(
          inputs.evidenceAuthorizationGate,
        ),
    ],
  ] as const) {
    try {
      check();
    } catch (error) {
      findings.push({
        surface: "gate",
        path: "src",
        subject,
        message: getErrorMessage(error),
      });
    }
  }

  return findings;
}

function collectSchemaFindings(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  const findings: MvpAPolicyAsCodeFinding[] = [];
  for (const table of inputs.schemaTables) {
    const tableConfig = getTableConfig(table);
    for (const column of tableConfig.columns) {
      const finding = checkPiiExportSurface(
        inputs.piiExportGate,
        "schema",
        "src/persistence/schema.ts",
        `${tableConfig.name}.${column.name}`,
        column.name,
      );
      if (finding !== undefined) {
        findings.push(finding);
      }
    }
  }

  return findings;
}

function collectMigrationFindings(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  const findings: MvpAPolicyAsCodeFinding[] = [];
  for (const [path, sql] of inputs.migrationSqlByPath) {
    for (const { tableName, columnName } of collectMigrationColumnNames(sql)) {
      const finding = checkPiiExportSurface(
        inputs.piiExportGate,
        "migration",
        path,
        `${tableName}.${columnName}`,
        columnName,
      );
      if (finding !== undefined) {
        findings.push(finding);
      }
    }
  }

  return findings;
}

function collectOpenApiFindings(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  const findings: MvpAPolicyAsCodeFinding[] = [];
  const components = inputs.openApiContract.components ?? {};
  const schemas = components.schemas ?? {};
  const onboardingPathEntries = Object.entries(
    inputs.openApiContract.paths ?? {},
  ).filter(([route]) => isMvpAOnboardingRoute(route));

  if (onboardingPathEntries.length === 0) {
    findings.push({
      surface: "openapi",
      path: "openapi/hrcore.openapi.json",
      subject: "paths",
      message: "expected MVP-A onboarding routes to be present",
    });
    return findings;
  }

  for (const [route, pathItem] of onboardingPathEntries) {
    const routeFinding = checkPiiExportSurface(
      inputs.piiExportGate,
      "openapi",
      "openapi/hrcore.openapi.json",
      route,
      route,
      "route",
    );
    if (routeFinding !== undefined) {
      findings.push(routeFinding);
    }

    for (const operationSurface of collectOpenApiOperationSurfaces(
      pathItem,
      components,
    )) {
      const finding = checkPiiExportSurface(
        inputs.piiExportGate,
        "openapi",
        "openapi/hrcore.openapi.json",
        operationSurface.kind === "parameter"
          ? `${route} parameter ${operationSurface.value}`
          : `${route} metadata`,
        operationSurface.value,
      );
      if (finding !== undefined) {
        findings.push(finding);
      }
    }

    for (const propertyName of collectOpenApiSchemaPropertyNamesFromValue(
      pathItem,
      components,
    )) {
      const finding = checkPiiExportSurface(
        inputs.piiExportGate,
        "openapi",
        "openapi/hrcore.openapi.json",
        `${route}.${propertyName}`,
        propertyName,
      );
      if (finding !== undefined) {
        findings.push(finding);
      }
    }
  }

  const onboardingSchemaNames = collectOnboardingSchemaNames(
    onboardingPathEntries.map(([, pathItem]) => pathItem),
    components,
  );
  for (const schemaName of onboardingSchemaNames) {
    const schemaNameFinding = checkPiiExportSurface(
      inputs.piiExportGate,
      "openapi",
      "openapi/hrcore.openapi.json",
      schemaName,
      schemaName,
    );
    if (schemaNameFinding !== undefined) {
      findings.push(schemaNameFinding);
    }

    for (const propertyName of collectOpenApiSchemaPropertyNames(
      schemas[schemaName],
      components,
    )) {
      const finding = checkPiiExportSurface(
        inputs.piiExportGate,
        "openapi",
        "openapi/hrcore.openapi.json",
        `${schemaName}.${propertyName}`,
        propertyName,
      );
      if (finding !== undefined) {
        findings.push(finding);
      }
    }
  }

  return findings;
}

function checkPiiExportSurface(
  gate: MvpAOnboardingPiiExportGate,
  surface: MvpAPolicyAsCodeFinding["surface"],
  path: string,
  subject: string,
  value: string,
  checkKind: "field" | "route" = "field",
): MvpAPolicyAsCodeFinding | undefined {
  try {
    assertMvpAOnboardingPiiExportGate(gate, {
      ...(checkKind === "route" ? { route: value } : { fieldName: value }),
    });
  } catch (error) {
    return {
      surface,
      path,
      subject,
      message: getErrorMessage(error),
    };
  }

  return undefined;
}

function collectCurrentSchemaTables(): SQLiteTable[] {
  const schemaExports = schema as Record<string, unknown>;
  return Object.values(schemaExports).filter(isSQLiteTable);
}

function isSQLiteTable(value: unknown): value is SQLiteTable {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  try {
    getTableConfig(value as SQLiteTable);
    return true;
  } catch {
    return false;
  }
}

async function readCommittedMigrationSqlByPath(
  cwd: string,
): Promise<Map<string, string>> {
  const migrationDirectory = join(cwd, "drizzle");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const migrationSqlByPath = new Map<string, string>();
  for (const migrationFile of migrationFiles) {
    const path = join("drizzle", migrationFile);
    migrationSqlByPath.set(path, await readFile(join(cwd, path), "utf8"));
  }

  return migrationSqlByPath;
}

function collectMigrationColumnNames(
  sql: string,
): { tableName: string; columnName: string }[] {
  const columns: { tableName: string; columnName: string }[] = [];
  const createTablePattern = /CREATE\s+TABLE\s+`([^`]+)`\s*\(([\s\S]*?)\);/giu;
  const columnDefinitionPattern =
    /`([^`]+)`\s+(?:text|integer|real|blob|numeric)/giu;
  for (const match of sql.matchAll(createTablePattern)) {
    const [, tableName, tableBody] = match;
    for (const columnMatch of tableBody.matchAll(columnDefinitionPattern)) {
      const [, columnName] = columnMatch;
      columns.push({ tableName, columnName });
    }
  }

  const alterTableAddPattern =
    /ALTER\s+TABLE\s+`([^`]+)`\s+ADD\s+(?:COLUMN\s+)?`([^`]+)`\s+(?:text|integer|real|blob|numeric)/giu;
  for (const match of sql.matchAll(alterTableAddPattern)) {
    const [, tableName, columnName] = match;
    columns.push({ tableName, columnName });
  }

  return columns;
}

function collectOpenApiOperationSurfaces(
  pathItem: unknown,
  components: OpenApiComponents,
): { kind: "metadata" | "parameter"; value: string }[] {
  if (!isRecord(pathItem)) {
    return [];
  }

  const operationSurfaces: { kind: "metadata" | "parameter"; value: string }[] =
    [];
  for (const parameterName of collectOpenApiParameterNames(
    pathItem.parameters,
    components,
  )) {
    operationSurfaces.push({ kind: "parameter", value: parameterName });
  }

  for (const [method, operation] of Object.entries(pathItem)) {
    if (!openApiMethods.has(method) || !isRecord(operation)) {
      continue;
    }

    for (const key of openApiOperationMetadataKeys) {
      const value = operation[key];
      if (typeof value === "string") {
        operationSurfaces.push({ kind: "metadata", value });
      }
    }

    const tags = operation.tags;
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        if (typeof tag === "string") {
          operationSurfaces.push({ kind: "metadata", value: tag });
        }
      }
    }

    for (const parameterName of collectOpenApiParameterNames(
      operation.parameters,
      components,
    )) {
      operationSurfaces.push({ kind: "parameter", value: parameterName });
    }
  }

  return operationSurfaces;
}

function isMvpAOnboardingRoute(route: string): boolean {
  return (
    route === "/onboarding" ||
    route.startsWith("/onboarding/") ||
    route === "/audit/mvp-a/onboarding-correlations" ||
    route.startsWith("/audit/mvp-a/onboarding-correlations/")
  );
}

function collectOpenApiParameterNames(
  parameters: unknown,
  components: OpenApiComponents,
): string[] {
  if (!Array.isArray(parameters)) {
    return [];
  }

  return parameters.flatMap((parameter) =>
    collectOpenApiParameterNamesFromValue(parameter, components, new Set()),
  );
}

function collectOnboardingSchemaNames(
  pathItems: readonly unknown[],
  components: OpenApiComponents,
): Set<string> {
  const schemas = components.schemas ?? {};
  const schemaNames = new Set(
    Object.keys(schemas).filter((schemaName) =>
      schemaName.includes("Onboarding"),
    ),
  );
  const pendingSchemaNames = [
    ...schemaNames,
    ...pathItems.flatMap((pathItem) =>
      collectOpenApiSchemaRefs(pathItem, components),
    ),
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
    pendingSchemaNames.push(
      ...collectOpenApiSchemaRefs(schemas[schemaName], components),
    );
  }

  return schemaNames;
}

function collectOpenApiSchemaPropertyNames(
  schema: OpenApiSchema | undefined,
  components: OpenApiComponents,
): string[] {
  const propertyNames: string[] = [];

  function visitSchema(
    currentSchema: OpenApiSchema | undefined,
    visitedComponentRefs: ReadonlySet<string>,
  ): void {
    if (currentSchema === undefined) {
      return;
    }

    const componentRef = getOpenApiComponentRef(currentSchema.$ref);
    if (componentRef !== undefined) {
      const refKey = getOpenApiComponentRefKey(componentRef);
      if (!visitedComponentRefs.has(refKey)) {
        visitSchema(
          getOpenApiComponentValue(componentRef, components) as
            | OpenApiSchema
            | undefined,
          new Set([...visitedComponentRefs, refKey]),
        );
      }
    }

    for (const [propertyName, propertySchema] of Object.entries(
      currentSchema.properties ?? {},
    )) {
      propertyNames.push(propertyName);
      visitSchema(propertySchema, visitedComponentRefs);
    }

    visitSchema(currentSchema.items, visitedComponentRefs);
    for (const nestedSchema of [
      ...(currentSchema.allOf ?? []),
      ...(currentSchema.anyOf ?? []),
      ...(currentSchema.oneOf ?? []),
    ]) {
      visitSchema(nestedSchema, visitedComponentRefs);
    }
  }

  visitSchema(schema, new Set());
  return propertyNames;
}

function collectOpenApiSchemaPropertyNamesFromValue(
  value: unknown,
  components: OpenApiComponents,
  visitedComponentRefs: ReadonlySet<string> = new Set(),
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectOpenApiSchemaPropertyNamesFromValue(
        item,
        components,
        visitedComponentRefs,
      ),
    );
  }

  if (!isRecord(value)) {
    return [];
  }

  const componentRef = getOpenApiComponentRef(value.$ref);
  if (componentRef !== undefined) {
    const refKey = getOpenApiComponentRefKey(componentRef);
    if (visitedComponentRefs.has(refKey)) {
      return [];
    }

    return collectOpenApiSchemaPropertyNamesFromValue(
      getOpenApiComponentValue(componentRef, components),
      components,
      new Set([...visitedComponentRefs, refKey]),
    );
  }

  const propertyNames = isOpenApiSchemaLike(value)
    ? collectOpenApiSchemaPropertyNames(value, components)
    : [];

  for (const nestedValue of Object.values(value)) {
    propertyNames.push(
      ...collectOpenApiSchemaPropertyNamesFromValue(
        nestedValue,
        components,
        visitedComponentRefs,
      ),
    );
  }

  return propertyNames;
}

function collectOpenApiSchemaRefs(
  value: unknown,
  components: OpenApiComponents,
  visitedComponentRefs: ReadonlySet<string> = new Set(),
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectOpenApiSchemaRefs(item, components, visitedComponentRefs),
    );
  }

  if (!isRecord(value)) {
    return [];
  }

  const refs: string[] = [];
  const componentRef = getOpenApiComponentRef(value.$ref);
  if (componentRef !== undefined) {
    if (componentRef.section === "schemas") {
      refs.push(componentRef.name);
    }

    const refKey = getOpenApiComponentRefKey(componentRef);
    if (!visitedComponentRefs.has(refKey)) {
      refs.push(
        ...collectOpenApiSchemaRefs(
          getOpenApiComponentValue(componentRef, components),
          components,
          new Set([...visitedComponentRefs, refKey]),
        ),
      );
    }
  }

  for (const nestedValue of Object.values(value)) {
    refs.push(
      ...collectOpenApiSchemaRefs(
        nestedValue,
        components,
        visitedComponentRefs,
      ),
    );
  }

  return refs;
}

function collectOpenApiParameterNamesFromValue(
  value: unknown,
  components: OpenApiComponents,
  visitedComponentRefs: ReadonlySet<string>,
): string[] {
  if (!isRecord(value)) {
    return [];
  }

  const componentRef = getOpenApiComponentRef(value.$ref);
  if (componentRef !== undefined) {
    const refKey = getOpenApiComponentRefKey(componentRef);
    if (visitedComponentRefs.has(refKey)) {
      return [];
    }

    return collectOpenApiParameterNamesFromValue(
      getOpenApiComponentValue(componentRef, components),
      components,
      new Set([...visitedComponentRefs, refKey]),
    );
  }

  return typeof value.name === "string" ? [value.name] : [];
}

function getOpenApiComponentRef(
  ref: unknown,
): { section: OpenApiComponentSection; name: string } | undefined {
  const componentRefPrefix = "#/components/";
  if (typeof ref !== "string" || !ref.startsWith(componentRefPrefix)) {
    return undefined;
  }

  const [section, name, ...rest] = ref
    .slice(componentRefPrefix.length)
    .split("/");
  if (
    rest.length > 0 ||
    !isOpenApiComponentSection(section) ||
    name === undefined
  ) {
    return undefined;
  }

  return {
    section,
    name: decodeJsonPointerSegment(name),
  };
}

function getOpenApiComponentValue(
  componentRef: { section: OpenApiComponentSection; name: string },
  components: OpenApiComponents,
): unknown {
  return components[componentRef.section]?.[componentRef.name];
}

function getOpenApiComponentRefKey(componentRef: {
  section: OpenApiComponentSection;
  name: string;
}): string {
  return `${componentRef.section}/${componentRef.name}`;
}

function isOpenApiComponentSection(
  section: string,
): section is OpenApiComponentSection {
  return (
    section === "schemas" ||
    section === "parameters" ||
    section === "requestBodies"
  );
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    assertMvpAPolicyAsCode(await loadCurrentMvpAPolicyAsCodeInputs());
    console.log("MVP-A policy-as-code gate passed");
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exitCode = 1;
  }
}

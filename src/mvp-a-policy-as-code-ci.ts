import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";

import {
  assertMvpAOnboardingEvidenceAuthorizationGate,
  type MvpAOnboardingEvidenceAuthorizationGate,
  mvpAOnboardingEvidenceAuthorizationGate,
} from "./mvp-a-onboarding-evidence-authorization.js";
import {
  assertMvpAOnboardingFixtureSeedText,
  assertMvpAOnboardingNonProductionApiResponseField,
  assertMvpAOnboardingNonProductionDataGate,
  type MvpAOnboardingNonProductionDataGate,
  mvpAOnboardingNonProductionDataGate,
} from "./mvp-a-onboarding-non-production-data-gate.js";
import {
  assertMvpAOnboardingPiiExportGate,
  type MvpAOnboardingPiiExportGate,
  mvpAOnboardingPiiExportGate,
} from "./mvp-a-onboarding-pii-export-gate.js";
import * as schema from "./persistence/schema.js";

export interface MvpAPolicyAsCodeInputs {
  piiExportGate: MvpAOnboardingPiiExportGate;
  evidenceAuthorizationGate: MvpAOnboardingEvidenceAuthorizationGate;
  nonProductionDataGate: MvpAOnboardingNonProductionDataGate;
  schemaTables: readonly SQLiteTable[];
  migrationSqlByPath: ReadonlyMap<string, string>;
  openApiContract: OpenApiContract;
  fixtureSeedTextByPath: ReadonlyMap<string, string>;
  documentationTextByPath: ReadonlyMap<string, string>;
}

export interface MvpAPolicyAsCodeFinding {
  surface:
    | "gate"
    | "schema"
    | "migration"
    | "openapi"
    | "fixture-seed"
    | "documentation";
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
const fixtureSeedFileNamePattern =
  /(?:^|[-_.])(fixture|fixtures|seed|seeds)(?:[-_.]|$)/iu;
const fixtureSeedTextExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const fixtureSeedIgnoredNamePattern =
  /(?:^|[-_.])(test|spec|snap)(?:[-_.]|$)/iu;

export function checkMvpAPolicyAsCode(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  return [
    ...collectGateFindings(inputs),
    ...collectSchemaFindings(inputs),
    ...collectMigrationFindings(inputs),
    ...collectOpenApiFindings(inputs),
    ...collectFixtureSeedFindings(inputs),
    ...collectDocumentationFindings(inputs),
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
    nonProductionDataGate: mvpAOnboardingNonProductionDataGate,
    schemaTables: collectCurrentSchemaTables(),
    migrationSqlByPath: await readCommittedMigrationSqlByPath(cwd),
    openApiContract: JSON.parse(
      await readFile(join(cwd, "openapi/hrcore.openapi.json"), "utf8"),
    ) as OpenApiContract,
    fixtureSeedTextByPath: await readDiscoveredFixtureSeedTextByPath(cwd),
    documentationTextByPath: await readRepoTextFilesByPath(cwd, [
      "README.md",
      "docs/mvp-a-onboarding-non-production-data-gate.md",
    ]),
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
    [
      inputs.nonProductionDataGate.gateId,
      () =>
        assertMvpAOnboardingNonProductionDataGate(inputs.nonProductionDataGate),
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

      const nonProductionFinding = checkNonProductionApiResponseField(
        inputs.nonProductionDataGate,
        "schema",
        "src/persistence/schema.ts",
        `${tableConfig.name}.${column.name}`,
        column.name,
      );
      if (nonProductionFinding !== undefined) {
        findings.push(nonProductionFinding);
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

      const nonProductionFinding = checkNonProductionApiResponseField(
        inputs.nonProductionDataGate,
        "migration",
        path,
        `${tableName}.${columnName}`,
        columnName,
      );
      if (nonProductionFinding !== undefined) {
        findings.push(nonProductionFinding);
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

      const nonProductionFinding = checkNonProductionApiResponseField(
        inputs.nonProductionDataGate,
        "openapi",
        "openapi/hrcore.openapi.json",
        `${route}.${propertyName}`,
        propertyName,
      );
      if (nonProductionFinding !== undefined) {
        findings.push(nonProductionFinding);
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

      const nonProductionFinding = checkNonProductionApiResponseField(
        inputs.nonProductionDataGate,
        "openapi",
        "openapi/hrcore.openapi.json",
        `${schemaName}.${propertyName}`,
        propertyName,
      );
      if (nonProductionFinding !== undefined) {
        findings.push(nonProductionFinding);
      }
    }
  }

  return findings;
}

function collectFixtureSeedFindings(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  const findings: MvpAPolicyAsCodeFinding[] = [];
  for (const [path, text] of inputs.fixtureSeedTextByPath) {
    try {
      assertMvpAOnboardingFixtureSeedText(
        inputs.nonProductionDataGate,
        path,
        text,
      );
    } catch (error) {
      findings.push({
        surface: "fixture-seed",
        path,
        subject: "fixture-seed text",
        message: getErrorMessage(error),
      });
    }
  }

  return findings;
}

function collectDocumentationFindings(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  const requiredDocumentationText = [
    "mvp_a_onboarding_non_production_data_handling_v1",
    "repo_owned_synthetic_fixture",
    "approved_non_production_dataset",
    "mvp_a_onboarding_pii_export_closed_v1",
    "#202",
    "#203 legal/privacy approval evidence placeholder",
    "#203 independent data-owner approval placeholder",
    "#203 two-key approval record placeholder",
    "does not approve legal approval, privacy approval, real-data processing, production-like data processing, raw payload viewing, CSV/export, download logs, watermark/manifest behavior, My Number, Specific Personal Information, or sensitive personal information",
  ];
  const combinedDocumentation = [...inputs.documentationTextByPath.values()]
    .join("\n")
    .replace(/\s+/gu, " ")
    .trim();
  const findings: MvpAPolicyAsCodeFinding[] = [];

  for (const requiredText of requiredDocumentationText) {
    if (
      !combinedDocumentation.includes(requiredText.replace(/\s+/gu, " ").trim())
    ) {
      findings.push({
        surface: "documentation",
        path: "README.md docs/mvp-a-onboarding-non-production-data-gate.md",
        subject: requiredText,
        message:
          "MVP-A non-production data gate documentation is missing required blocker or boundary text",
      });
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

function checkNonProductionApiResponseField(
  gate: MvpAOnboardingNonProductionDataGate,
  surface: MvpAPolicyAsCodeFinding["surface"],
  path: string,
  subject: string,
  value: string,
): MvpAPolicyAsCodeFinding | undefined {
  try {
    assertMvpAOnboardingNonProductionApiResponseField(gate, value);
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

async function readRepoTextFilesByPath(
  cwd: string,
  paths: readonly string[],
): Promise<Map<string, string>> {
  const textByPath = new Map<string, string>();
  for (const path of paths) {
    textByPath.set(path, await readFile(join(cwd, path), "utf8"));
  }

  return textByPath;
}

async function readDiscoveredFixtureSeedTextByPath(
  cwd: string,
): Promise<Map<string, string>> {
  const discoveredPaths = [
    ...(await discoverFixtureSeedRootFiles(cwd)),
    ...(await discoverFixtureSeedFilesUnder(cwd, "src")),
    ...(await discoverFixtureSeedFilesUnder(cwd, "docs")),
  ].sort();
  return readRepoTextFilesByPath(cwd, discoveredPaths);
}

async function discoverFixtureSeedRootFiles(cwd: string): Promise<string[]> {
  const rootEntries = await readdir(cwd, { withFileTypes: true });
  return rootEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(isFixtureSeedTextPath);
}

async function discoverFixtureSeedFilesUnder(
  cwd: string,
  rootPath: string,
): Promise<string[]> {
  const discoveredPaths: string[] = [];
  const walk = async (relativeDirectory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(join(cwd, relativeDirectory), {
        withFileTypes: true,
      });
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      const relativePath = join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        await walk(relativePath);
        continue;
      }

      if (entry.isFile() && isFixtureSeedTextPath(relativePath)) {
        discoveredPaths.push(relativePath);
      }
    }
  };

  await walk(rootPath);
  return discoveredPaths;
}

function isFixtureSeedTextPath(path: string): boolean {
  const fileName = basename(path);
  const directorySegments = path.split(/[\\/]+/u).slice(0, -1);
  return (
    fixtureSeedTextExtensions.has(extname(fileName).toLowerCase()) &&
    (fixtureSeedFileNamePattern.test(fileName) ||
      directorySegments.some((segment) =>
        fixtureSeedFileNamePattern.test(segment),
      )) &&
    !fixtureSeedIgnoredNamePattern.test(fileName)
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
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
    route.startsWith("/audit/mvp-a/onboarding-correlations/") ||
    route === "/support/mvp-a/onboarding-reviews" ||
    route.startsWith("/support/mvp-a/onboarding-reviews/")
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

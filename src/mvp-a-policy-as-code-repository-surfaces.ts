import { getTableConfig } from "drizzle-orm/sqlite-core";

import { assertMvpAOnboardingNonProductionApiResponseField } from "./mvp-a-onboarding-non-production-data-gate.js";
import type { MvpAOnboardingNonProductionDataGate } from "./mvp-a-onboarding-non-production-data-gate.js";
import {
  assertMvpAOnboardingPiiExportGate,
  type MvpAOnboardingPiiExportGate,
} from "./mvp-a-onboarding-pii-export-gate.js";
import type {
  MvpAPolicyAsCodeFinding,
  MvpAPolicyAsCodeInputs,
} from "./mvp-a-policy-as-code-types.js";

export function collectSchemaFindings(
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

export function collectMigrationFindings(
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

function checkPiiExportSurface(
  gate: MvpAOnboardingPiiExportGate,
  surface: MvpAPolicyAsCodeFinding["surface"],
  path: string,
  subject: string,
  value: string,
): MvpAPolicyAsCodeFinding | undefined {
  try {
    assertMvpAOnboardingPiiExportGate(gate, { fieldName: value });
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import {
  p2ListEmployeeExportFields,
  p2ListExportSchemaVersion,
  p2ListLifecycleExportFields,
  type P2ListExportReasonCode,
} from "./p2list-contract.js";
import type {
  P2ListEmployeeItem,
  P2ListLifecycleItem,
} from "./p2list-read-model-repository.js";

export const p2ListEmployeeExportColumns = p2ListEmployeeExportFields;
export const p2ListLifecycleExportColumns = p2ListLifecycleExportFields;

export interface P2ListExportArtifact {
  contentType: "text/csv; charset=utf-8";
  schemaVersion: typeof p2ListExportSchemaVersion;
  fileName: string;
  csv: string;
  rowCount: number;
}

export function buildEmployeeExportArtifact(
  items: readonly P2ListEmployeeItem[],
): P2ListExportArtifact {
  const rows = items.map((item) => [
    item.employeeId,
    item.displayName,
    item.employmentStatus,
    item.organizationCode ?? "",
    item.positionCode ?? "",
    item.hireDate,
    item.terminationDate ?? "",
  ]);
  return buildArtifact(
    "hrcore-bounded-employees-p2list_export_v1.csv",
    p2ListEmployeeExportColumns,
    rows,
  );
}

export function buildLifecycleExportArtifact(
  items: readonly P2ListLifecycleItem[],
): P2ListExportArtifact {
  const rows = items.map((item) => [
    item.transactionRequestId,
    item.requestType,
    item.status,
    item.subjectEmployeeId ?? "",
    item.subjectDisplayName,
    item.organizationCode,
    item.requestedAt,
    item.effectiveDate,
  ]);
  return buildArtifact(
    "hrcore-bounded-lifecycle-requests-p2list_export_v1.csv",
    p2ListLifecycleExportColumns,
    rows,
  );
}

export function isP2ListExportReasonCode(
  value: unknown,
  allowedReasonCodes: readonly P2ListExportReasonCode[],
): value is P2ListExportReasonCode {
  return (
    typeof value === "string" &&
    allowedReasonCodes.includes(value as P2ListExportReasonCode)
  );
}

function buildArtifact(
  fileName: string,
  columns: readonly string[],
  rows: readonly (readonly string[])[],
): P2ListExportArtifact {
  const csv = [
    columns.join(","),
    ...rows.map((row) => row.map(serializeCsvCell).join(",")),
  ].join("\n");
  return {
    contentType: "text/csv; charset=utf-8",
    schemaVersion: p2ListExportSchemaVersion,
    fileName,
    csv: `${csv}\n`,
    rowCount: rows.length,
  };
}

function serializeCsvCell(value: string): string {
  const neutralized = /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return /[",\n\r]/u.test(neutralized)
    ? `"${neutralized.replace(/"/gu, '""')}"`
    : neutralized;
}

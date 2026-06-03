import { isValidIsoDate } from "./onboarding-transaction-request-validation.js";

export const mvpDCsvImportTemplateVersion = "mvp_d_lifecycle_support_v1";
export const mvpDCsvImportTenantEnvironmentId =
  "repo_owned_synthetic_mvp_d_csv";

export const mvpDCsvImportTemplateColumns = [
  "template_version",
  "row_id",
  "lifecycle_type",
  "tenant_environment_id",
  "person_id",
  "display_name",
  "effective_date",
  "employment_code",
  "assignment_code",
  "organization_reference",
  "work_email",
  "current_assignment_id",
  "target_organization_reference",
  "target_department_reference",
  "target_manager_reference",
  "reason_code",
] as const;

export type MvpDCsvImportColumn = (typeof mvpDCsvImportTemplateColumns)[number];

export type MvpDCsvLifecycleType = "onboarding" | "transfer" | "termination";

export interface MvpDCsvImportAcceptedRow {
  rowNumber: number;
  rowId: string;
  lifecycleType: MvpDCsvLifecycleType;
}

export interface MvpDCsvImportRejectedRow {
  rowNumber: number;
  rowId: string | null;
  reasons: string[];
}

export interface MvpDCsvImportDryRunDiff {
  rowId: string;
  lifecycleType: MvpDCsvLifecycleType;
  operation:
    | "would_create_onboarding_request"
    | "would_create_transfer_request"
    | "would_create_termination_request";
  evidence: {
    personId: string;
    effectiveDate: string;
    correlationId: string;
    rowFingerprint: string;
  };
}

export interface MvpDCsvImportDryRunResult {
  mutatesRecords: false;
  summary: {
    acceptedRows: number;
    rejectedRows: number;
  };
  acceptedRows: MvpDCsvImportAcceptedRow[];
  rejectedRows: MvpDCsvImportRejectedRow[];
  diffs: MvpDCsvImportDryRunDiff[];
}

export type ParsedCsvRow = Record<MvpDCsvImportColumn, string>;
export type AcceptedParsedCsvRow = ParsedCsvRow & {
  lifecycle_type: MvpDCsvLifecycleType;
};

export interface MvpDCsvImportRowsEvaluation {
  acceptedRows: MvpDCsvImportAcceptedRow[];
  rejectedRows: MvpDCsvImportRejectedRow[];
  diffs: MvpDCsvImportDryRunDiff[];
  acceptedParsedRows: AcceptedParsedCsvRow[];
}

const supportedColumnSet = new Set<string>(mvpDCsvImportTemplateColumns);
const requiredCommonFields: readonly MvpDCsvImportColumn[] = [
  "template_version",
  "row_id",
  "lifecycle_type",
  "tenant_environment_id",
  "person_id",
  "display_name",
  "effective_date",
];

const requiredFieldsByLifecycleType: Record<
  MvpDCsvLifecycleType,
  readonly MvpDCsvImportColumn[]
> = {
  onboarding: [
    "employment_code",
    "assignment_code",
    "organization_reference",
    "work_email",
  ],
  transfer: [
    "current_assignment_id",
    "target_organization_reference",
    "target_department_reference",
    "target_manager_reference",
    "reason_code",
  ],
  termination: ["current_assignment_id", "reason_code"],
};

const transferReasonCodes = new Set([
  "team_change",
  "manager_change",
  "organization_change",
]);
const terminationReasonCodes = new Set([
  "resignation",
  "retirement",
  "contract_end",
  "mutual_agreement",
]);

export function parseMvpDCsvImportRows(csvInput: string): {
  header: string[];
  records: string[][];
} {
  const records = parseCsvRecords(csvInput);
  if (records.length === 0) {
    throw new Error("CSV input is malformed: missing header row");
  }

  const header = records[0];
  assertSupportedMvpDCsvHeader(header);

  return {
    header,
    records: records.slice(1),
  };
}

export function evaluateMvpDCsvImportRows(
  csvInput: string,
): MvpDCsvImportRowsEvaluation {
  const { header, records } = parseMvpDCsvImportRows(csvInput);
  const acceptedRows: MvpDCsvImportAcceptedRow[] = [];
  const rejectedRows: MvpDCsvImportRejectedRow[] = [];
  const diffs: MvpDCsvImportDryRunDiff[] = [];
  const acceptedParsedRows: AcceptedParsedCsvRow[] = [];
  const seenRowIds = new Set<string>();

  for (const [recordIndex, record] of records.entries()) {
    const rowNumber = recordIndex + 2;
    if (record.length !== header.length) {
      rejectedRows.push({
        rowNumber,
        rowId: record[header.indexOf("row_id")]?.trim() || null,
        reasons: [
          `row has ${record.length} columns but header has ${header.length}`,
        ],
      });
      continue;
    }

    const row = toCsvRow(header, record);
    const reasons = validateMvpDCsvImportRow(row);
    const rowId = row.row_id.trim();
    if (rowId.length > 0) {
      if (seenRowIds.has(rowId)) {
        reasons.unshift("row_id duplicates an earlier row");
      }
      seenRowIds.add(rowId);
    }

    if (reasons.length > 0) {
      rejectedRows.push({
        rowNumber,
        rowId: rowId.length > 0 ? rowId : null,
        reasons,
      });
      continue;
    }

    const lifecycleType = row.lifecycle_type.trim() as MvpDCsvLifecycleType;
    const acceptedParsedRow: AcceptedParsedCsvRow = {
      ...row,
      lifecycle_type: lifecycleType,
    };
    acceptedRows.push({ rowNumber, rowId, lifecycleType });
    acceptedParsedRows.push(acceptedParsedRow);
    diffs.push({
      rowId,
      lifecycleType,
      operation: dryRunOperationForLifecycleType(lifecycleType),
      evidence: {
        personId: row.person_id.trim(),
        effectiveDate: row.effective_date.trim(),
        correlationId: `csv-import-${rowId}`,
        rowFingerprint: buildRowFingerprint(row),
      },
    });
  }

  return {
    acceptedRows,
    rejectedRows,
    diffs,
    acceptedParsedRows,
  };
}

export function buildMvpDCsvImportDryRunResult(
  evaluation: MvpDCsvImportRowsEvaluation,
): MvpDCsvImportDryRunResult {
  return {
    mutatesRecords: false,
    summary: {
      acceptedRows: evaluation.acceptedRows.length,
      rejectedRows: evaluation.rejectedRows.length,
    },
    acceptedRows: evaluation.acceptedRows,
    rejectedRows: evaluation.rejectedRows,
    diffs: evaluation.diffs,
  };
}

export function buildImportFingerprint(rows: AcceptedParsedCsvRow[]): string {
  return JSON.stringify(rows.map((row) => buildCanonicalCsvRow(row)));
}

export function buildRowFingerprint(row: ParsedCsvRow): string {
  return JSON.stringify(buildCanonicalCsvRow(row));
}

function assertSupportedMvpDCsvHeader(header: string[]): void {
  const unsupportedColumns = header.filter(
    (column) => !supportedColumnSet.has(column),
  );
  if (unsupportedColumns.length > 0) {
    throw new Error(
      `CSV header contains unsupported columns: ${unsupportedColumns.join(
        ", ",
      )}`,
    );
  }

  const duplicateColumns = collectDuplicateValues(header);
  if (duplicateColumns.length > 0) {
    throw new Error(
      `CSV header contains duplicate columns: ${duplicateColumns.join(", ")}`,
    );
  }

  const missingColumns = mvpDCsvImportTemplateColumns.filter(
    (column) => !header.includes(column),
  );
  if (missingColumns.length > 0) {
    throw new Error(
      `CSV header is missing required columns: ${missingColumns.join(", ")}`,
    );
  }
}

function validateMvpDCsvImportRow(row: ParsedCsvRow): string[] {
  const reasons: string[] = [];

  for (const fieldName of requiredCommonFields) {
    requireCsvCell(row, fieldName, reasons);
  }

  if (row.template_version.trim() !== mvpDCsvImportTemplateVersion) {
    reasons.push(`template_version must be ${mvpDCsvImportTemplateVersion}`);
  }
  if (row.tenant_environment_id.trim() !== mvpDCsvImportTenantEnvironmentId) {
    reasons.push(
      `tenant_environment_id must be ${mvpDCsvImportTenantEnvironmentId}`,
    );
  }
  if (
    row.effective_date.trim().length > 0 &&
    !isValidIsoDate(row.effective_date.trim())
  ) {
    reasons.push("effective_date must be an ISO date");
  }

  const lifecycleType = row.lifecycle_type.trim();
  if (!isMvpDCsvLifecycleType(lifecycleType)) {
    reasons.push("lifecycle_type must be onboarding, transfer, or termination");
    return reasons;
  }

  for (const fieldName of requiredFieldsByLifecycleType[lifecycleType]) {
    requireCsvCell(row, fieldName, reasons);
  }

  if (
    lifecycleType === "onboarding" &&
    row.work_email.trim().length > 0 &&
    !row.work_email.includes("@")
  ) {
    reasons.push("work_email must be a skeleton work email");
  }
  if (
    lifecycleType === "transfer" &&
    row.reason_code.trim().length > 0 &&
    !transferReasonCodes.has(row.reason_code.trim())
  ) {
    reasons.push(
      "reason_code must be team_change, manager_change, or organization_change",
    );
  }
  if (
    lifecycleType === "termination" &&
    row.reason_code.trim().length > 0 &&
    !terminationReasonCodes.has(row.reason_code.trim())
  ) {
    reasons.push(
      "termination_reason_code must be resignation, retirement, contract_end, or mutual_agreement",
    );
  }

  return reasons;
}

function buildCanonicalCsvRow(row: ParsedCsvRow): ParsedCsvRow {
  return Object.fromEntries(
    mvpDCsvImportTemplateColumns.map((column) => [column, row[column].trim()]),
  ) as ParsedCsvRow;
}

function requireCsvCell(
  row: ParsedCsvRow,
  fieldName: MvpDCsvImportColumn,
  reasons: string[],
): void {
  if (row[fieldName].trim().length === 0) {
    reasons.push(`${fieldName} must be a non-empty string`);
  }
}

function dryRunOperationForLifecycleType(
  lifecycleType: MvpDCsvLifecycleType,
): MvpDCsvImportDryRunDiff["operation"] {
  switch (lifecycleType) {
    case "onboarding":
      return "would_create_onboarding_request";
    case "transfer":
      return "would_create_transfer_request";
    case "termination":
      return "would_create_termination_request";
  }
}

function isMvpDCsvLifecycleType(value: string): value is MvpDCsvLifecycleType {
  return (
    value === "onboarding" || value === "transfer" || value === "termination"
  );
}

function collectDuplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

function toCsvRow(header: string[], record: string[]): ParsedCsvRow {
  const row = Object.create(null) as ParsedCsvRow;
  for (const column of mvpDCsvImportTemplateColumns) {
    row[column] = "";
  }
  for (const [index, column] of header.entries()) {
    row[column as MvpDCsvImportColumn] = record[index] ?? "";
  }
  return row;
}

function parseCsvRecords(input: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let quotedFieldClosed = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          quotedFieldClosed = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (quotedFieldClosed) {
      if (character === ",") {
        record.push(field);
        field = "";
        quotedFieldClosed = false;
      } else if (character === "\n") {
        record.push(field);
        records.push(record);
        record = [];
        field = "";
        quotedFieldClosed = false;
      } else if (character === "\r") {
        if (input[index + 1] === "\n") {
          continue;
        }
        record.push(field);
        records.push(record);
        record = [];
        field = "";
        quotedFieldClosed = false;
      } else {
        throw new Error(
          "CSV input is malformed: characters after closing quoted field",
        );
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new Error("CSV input is malformed: stray quote in field");
      }
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (character === "\r") {
      if (input[index + 1] === "\n") {
        continue;
      }
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error("CSV input is malformed: unterminated quoted field");
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records.filter(
    (csvRecord) =>
      csvRecord.length > 1 ||
      (csvRecord[0] !== undefined && csvRecord[0] !== ""),
  );
}

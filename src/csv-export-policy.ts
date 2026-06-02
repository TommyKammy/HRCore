import { encodeStableKey } from "./onboarding-transaction-request-shared.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";

export const mvpDCsvExportScope = "repo_owned_synthetic_mvp_d_csv";

export const mvpDCsvExportAllowedFields = [
  "row_id",
  "lifecycle_type",
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

export const mvpDCsvExportDeniedFields = [
  "raw_payload",
  "rawPayload",
  "payload_json",
  "provider_payload",
  "providerPayload",
  "live_provider_payload",
  "liveProviderPayload",
  "real_employee_data",
  "realEmployeeData",
  "regulated_data",
  "regulatedData",
  "my_number",
  "myNumber",
  "specific_personal_information",
  "specificPersonalInformation",
  "sensitive_personal_information",
  "sensitivePersonalInformation",
  "national_id",
  "nationalId",
  "broad_search",
  "broadSearch",
  "download_log",
  "downloadLog",
  "watermark_token",
  "watermarkToken",
] as const;

export type MvpDCsvExportAllowedField =
  (typeof mvpDCsvExportAllowedFields)[number];

export type MvpDCsvExportRow = Partial<
  Record<MvpDCsvExportAllowedField, string>
> &
  Record<string, string | undefined>;

export interface MvpDCsvExportInput {
  scope: string;
  requestedBy: string;
  requestedAt: string;
  correlationId: string;
  fields: readonly string[];
  rows: readonly MvpDCsvExportRow[];
}

export interface MvpDCsvExportResult {
  contentType: "text/csv; charset=utf-8";
  fileName: "mvp-d-synthetic-lifecycle-export.csv";
  readiness: "bounded_synthetic_only_not_production_ready";
  csv: string;
  audit: {
    downloadIntent: "synthetic_bounded_csv_export";
    exportedFields: MvpDCsvExportAllowedField[];
    correlationId: string;
    requestedBy: string;
    requestedAt: string;
  };
}

const allowedFieldSet = new Set<string>(mvpDCsvExportAllowedFields);
const deniedSurfaceSet = new Set(
  mvpDCsvExportDeniedFields.map((field) => normalizeSurface(field)),
);
const syntheticOnlyMarkers = new Set(["synthetic_poc", "synthetic"]);
const realOrRegulatedMarkers = new Set([
  "real_employee_data",
  "real_employee",
  "production",
  "regulated_data",
  "my_number",
  "specific_personal_information",
  "sensitive_personal_information",
  "live_provider_payload",
]);

export function exportSyntheticLifecycleCsv(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvExportInput,
): MvpDCsvExportResult {
  const request = normalizeExportRequest(input);
  const csv = serializeCsv(request.fields, request.rows);

  db.prepare(
    `
      INSERT INTO audit_event (
        id,
        actor_id,
        action,
        subject_table,
        subject_id,
        occurred_at,
        poc_marker,
        correlation_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    `audit-event-csv-export-${encodeStableKey([request.correlationId])}`,
    request.requestedBy,
    "mvp_d.csv_export.synthetic_download_intent",
    "lifecycle_event",
    mvpDCsvExportScope,
    request.requestedAt,
    "synthetic_poc",
    request.correlationId,
  );

  return {
    contentType: "text/csv; charset=utf-8",
    fileName: "mvp-d-synthetic-lifecycle-export.csv",
    readiness: "bounded_synthetic_only_not_production_ready",
    csv,
    audit: {
      downloadIntent: "synthetic_bounded_csv_export",
      exportedFields: [...request.fields],
      correlationId: request.correlationId,
      requestedBy: request.requestedBy,
      requestedAt: request.requestedAt,
    },
  };
}

function normalizeExportRequest(input: MvpDCsvExportInput): {
  scope: typeof mvpDCsvExportScope;
  requestedBy: string;
  requestedAt: string;
  correlationId: string;
  fields: MvpDCsvExportAllowedField[];
  rows: MvpDCsvExportRow[];
} {
  const scope = input.scope.trim();
  const requestedBy = input.requestedBy.trim();
  const requestedAt = input.requestedAt.trim();
  const correlationId = input.correlationId.trim();

  if (scope !== mvpDCsvExportScope) {
    throwOutsidePolicy();
  }
  if (requestedBy.length === 0 || correlationId.length === 0) {
    throwOutsidePolicy();
  }
  if (!isValidIsoTimestamp(requestedAt)) {
    throwOutsidePolicy();
  }
  if (input.fields.length === 0) {
    throwOutsidePolicy();
  }

  const seenFields = new Set<string>();
  const fields = input.fields.map((field) => {
    const trimmedField = field.trim();
    if (
      trimmedField.length === 0 ||
      seenFields.has(trimmedField) ||
      deniedSurfaceSet.has(normalizeSurface(trimmedField)) ||
      !allowedFieldSet.has(trimmedField)
    ) {
      throwOutsidePolicy();
    }
    seenFields.add(trimmedField);
    return trimmedField as MvpDCsvExportAllowedField;
  });

  const rows = input.rows.map((row) => normalizeExportRow(row));
  return {
    scope: mvpDCsvExportScope,
    requestedBy,
    requestedAt,
    correlationId,
    fields,
    rows,
  };
}

function normalizeExportRow(row: MvpDCsvExportRow): MvpDCsvExportRow {
  for (const [key, value] of Object.entries(row)) {
    if (deniedSurfaceSet.has(normalizeSurface(key))) {
      throwOutsidePolicy();
    }

    const normalizedValue = normalizeSurface(value ?? "");
    if (
      realOrRegulatedMarkers.has(normalizedValue) ||
      (normalizeSurface(key).endsWith("marker") &&
        normalizedValue.length > 0 &&
        !syntheticOnlyMarkers.has(normalizedValue))
    ) {
      throwOutsidePolicy();
    }
  }

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value?.trim() ?? ""]),
  ) as MvpDCsvExportRow;
}

function serializeCsv(
  fields: readonly MvpDCsvExportAllowedField[],
  rows: readonly MvpDCsvExportRow[],
): string {
  const lines = [
    fields.join(","),
    ...rows.map((row) =>
      fields
        .map((field) =>
          escapeCsvValue(maskExportValue(field, row[field] ?? "")),
        )
        .join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function maskExportValue(
  field: MvpDCsvExportAllowedField,
  value: string,
): string {
  if (field !== "work_email") {
    return value;
  }

  const atIndex = value.indexOf("@");
  if (atIndex <= 0 || atIndex === value.length - 1) {
    return "";
  }

  return `${value[0]}***${value.slice(atIndex)}`;
}

function escapeCsvValue(value: string): string {
  if (!/[",\n\r]/u.test(value)) {
    return value;
  }

  return `"${value.replace(/"/gu, '""')}"`;
}

function normalizeSurface(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .toLowerCase();
}

function throwOutsidePolicy(): never {
  throw new Error(
    "CSV export request is outside the bounded synthetic MVP-D policy",
  );
}

function isValidIsoTimestamp(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) {
    return false;
  }

  const [, year, month, day, hour, minute, second, millisecond, offset] = match;
  const localDate = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number((millisecond ?? "").padEnd(3, "0")),
    ),
  );
  const date = new Date(value);
  const offsetHour = offset === "Z" ? 0 : Number(offset.slice(1, 3));
  const offsetMinute = offset === "Z" ? 0 : Number(offset.slice(4, 6));
  return (
    !Number.isNaN(date.getTime()) &&
    offsetHour <= 23 &&
    offsetMinute <= 59 &&
    localDate.getUTCFullYear() === Number(year) &&
    localDate.getUTCMonth() + 1 === Number(month) &&
    localDate.getUTCDate() === Number(day) &&
    localDate.getUTCHours() === Number(hour) &&
    localDate.getUTCMinutes() === Number(minute) &&
    localDate.getUTCSeconds() === Number(second)
  );
}

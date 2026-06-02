import { createHash } from "node:crypto";

import { encodeStableKey } from "./onboarding-transaction-request-shared.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";

export const mvpDCsvExportScope = "repo_owned_synthetic_mvp_d_csv";
export const mvpDCsvExportRequiredPermission = "mvp_d.synthetic_csv_export";
export const mvpDCsvExportMaskingProfile =
  "work_email_local_part_masked_synthetic_only";

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
  permissions: readonly string[];
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
    auditEventId: string;
    correlationId: string;
    evidenceHash: string;
    maskingProfile: typeof mvpDCsvExportMaskingProfile;
    requestedBy: string;
    requestedAt: string;
    rowCount: number;
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
const auditAction = "mvp_d.csv_export.synthetic_download_intent";

export function exportSyntheticLifecycleCsv(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvExportInput,
): MvpDCsvExportResult {
  const request = normalizeExportRequest(input);
  const dataCsv = serializeCsvData(request.fields, request.rows);
  const evidenceHash = sha256(dataCsv);
  const auditEventId = buildAuditEventId(db, request);
  const evidenceSubjectId = buildEvidenceSubjectId(request, evidenceHash);
  const csv = serializeCsvArtifact(request, {
    auditEventId,
    evidenceHash,
    rowCount: request.rows.length,
  });

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
    auditEventId,
    request.requestedBy,
    auditAction,
    "lifecycle_event",
    evidenceSubjectId,
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
      auditEventId,
      correlationId: request.correlationId,
      evidenceHash,
      maskingProfile: mvpDCsvExportMaskingProfile,
      requestedBy: request.requestedBy,
      requestedAt: request.requestedAt,
      rowCount: request.rows.length,
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
  if (!input.permissions.includes(mvpDCsvExportRequiredPermission)) {
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

  const rows = input.rows.map((row) => normalizeExportRow(row, seenFields));
  return {
    scope: mvpDCsvExportScope,
    requestedBy,
    requestedAt,
    correlationId,
    fields,
    rows,
  };
}

function normalizeExportRow(
  row: MvpDCsvExportRow,
  selectedFieldSet: ReadonlySet<string>,
): MvpDCsvExportRow {
  const seenRowKeys = new Set<string>();
  for (const [key, value] of Object.entries(row)) {
    const trimmedKey = key.trim();
    if (
      trimmedKey.length === 0 ||
      seenRowKeys.has(trimmedKey) ||
      deniedSurfaceSet.has(normalizeSurface(trimmedKey)) ||
      !selectedFieldSet.has(trimmedKey)
    ) {
      throwOutsidePolicy();
    }
    seenRowKeys.add(trimmedKey);

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
    Object.entries(row).map(([key, value]) => [
      key.trim(),
      value?.trim() ?? "",
    ]),
  ) as MvpDCsvExportRow;
}

function serializeCsvArtifact(
  request: ReturnType<typeof normalizeExportRequest>,
  trace: {
    auditEventId: string;
    evidenceHash: string;
    rowCount: number;
  },
): string {
  return [
    serializeCsvTraceLine(
      "hrcore_export_surface",
      "mvp_d_bounded_synthetic_csv",
    ),
    serializeCsvTraceLine(
      "readiness",
      "bounded_synthetic_only_not_production_ready",
    ),
    serializeCsvTraceLine("scope", mvpDCsvExportScope),
    serializeCsvTraceLine("audit_event_id", trace.auditEventId),
    serializeCsvTraceLine("correlation_id", request.correlationId),
    serializeCsvTraceLine("evidence_sha256", trace.evidenceHash),
    serializeCsvTraceLine("row_count", String(trace.rowCount)),
    serializeCsvTraceLine("masking_profile", mvpDCsvExportMaskingProfile),
    serializeCsvTraceLine("exported_fields", request.fields.join(",")),
    "",
    serializeCsvData(request.fields, request.rows).trimEnd(),
    "",
  ].join("\n");
}

function serializeCsvTraceLine(label: string, value: string): string {
  return `# ${label},${serializeCsvCell(value)}`;
}

function serializeCsvData(
  fields: readonly MvpDCsvExportAllowedField[],
  rows: readonly MvpDCsvExportRow[],
): string {
  const lines = [
    fields.join(","),
    ...rows.map((row) =>
      fields
        .map((field) =>
          serializeCsvCell(maskExportValue(field, row[field] ?? "")),
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

function serializeCsvCell(value: string): string {
  return escapeCsvValue(neutralizeSpreadsheetFormula(value));
}

function neutralizeSpreadsheetFormula(value: string): string {
  if (/^[=+\-@]/u.test(value)) {
    return `'${value}`;
  }

  return value;
}

function buildAuditEventId(
  db: OnboardingTransactionRequestDatabase,
  request: ReturnType<typeof normalizeExportRequest>,
): string {
  const row = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM audit_event
        WHERE action = ?
          AND correlation_id = ?
      `,
    )
    .get(auditAction, request.correlationId) as
    | { count: number | bigint }
    | undefined;
  const downloadSequence = Number(row?.count ?? 0) + 1;
  return `audit-event-csv-export-${encodeStableKey([
    request.correlationId,
    request.requestedAt,
    request.requestedBy,
    String(downloadSequence),
  ])}`;
}

function buildEvidenceSubjectId(
  request: ReturnType<typeof normalizeExportRequest>,
  evidenceHash: string,
): string {
  return [
    "mvp-d-synthetic-csv-evidence",
    `fields-${request.fields.join("+")}`,
    `rows-${request.rows.length}`,
    `masking-${mvpDCsvExportMaskingProfile}`,
    `sha256-${evidenceHash}`,
  ].join("-");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
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

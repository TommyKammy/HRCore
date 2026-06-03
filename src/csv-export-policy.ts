import { createHash } from "node:crypto";

import { encodeStableKey } from "./onboarding-transaction-request-shared.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";

export const mvpDCsvExportScope = "repo_owned_synthetic_mvp_d_csv";
export const mvpDCsvExportRequiredPermission = "mvp_d.synthetic_csv_export";
export const mvpDCsvExportDownloadPermission = "mvp_d.synthetic_csv_download";
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

export type MvpDCsvExportDeniedReason =
  | "unsupported_scope"
  | "missing_request_identity"
  | "missing_required_permissions"
  | "invalid_requested_at"
  | "missing_fields"
  | "denied_field_surface"
  | "unsupported_field_surface"
  | "duplicate_field"
  | "denied_row_surface"
  | "unsupported_row_surface"
  | "duplicate_row_key"
  | "real_or_regulated_row_value"
  | "non_synthetic_marker";

export type MvpDCsvExportSurfaceClassification =
  | {
      kind: "allowed_field";
      field: MvpDCsvExportAllowedField;
    }
  | {
      kind: "denied_surface";
      normalizedSurface: string;
    }
  | {
      kind: "unsupported_surface";
      normalizedSurface: string;
    };

export interface MvpDCsvExportNormalizedRequest {
  scope: typeof mvpDCsvExportScope;
  requestedBy: string;
  requestedAt: string;
  correlationId: string;
  fields: MvpDCsvExportAllowedField[];
  rows: MvpDCsvExportRow[];
}

export type MvpDCsvExportPolicyEvaluation =
  | {
      outcome: "allowed";
      request: MvpDCsvExportNormalizedRequest;
    }
  | {
      outcome: "denied";
      reason: MvpDCsvExportDeniedReason;
    };

export interface MvpDCsvExportAuditEvidence {
  auditEventId: string;
  evidenceHash: string;
  evidenceSubjectId: string;
  rowCount: number;
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
  const evaluation = evaluateMvpDCsvExportPolicy(input);
  if (evaluation.outcome === "denied") {
    throwOutsidePolicy();
  }

  const request = evaluation.request;
  const dataCsv = serializeCsvData(request.fields, request.rows);
  const auditEvidence = buildMvpDCsvExportAuditEvidence(db, request, dataCsv);
  const csv = serializeCsvArtifact(request, {
    auditEventId: auditEvidence.auditEventId,
    evidenceHash: auditEvidence.evidenceHash,
    rowCount: auditEvidence.rowCount,
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
    auditEvidence.auditEventId,
    request.requestedBy,
    auditAction,
    "lifecycle_event",
    auditEvidence.evidenceSubjectId,
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
      auditEventId: auditEvidence.auditEventId,
      correlationId: request.correlationId,
      evidenceHash: auditEvidence.evidenceHash,
      maskingProfile: mvpDCsvExportMaskingProfile,
      requestedBy: request.requestedBy,
      requestedAt: request.requestedAt,
      rowCount: auditEvidence.rowCount,
    },
  };
}

export function evaluateMvpDCsvExportPolicy(
  input: MvpDCsvExportInput,
): MvpDCsvExportPolicyEvaluation {
  const scope = input.scope.trim();
  const requestedBy = input.requestedBy.trim();
  const requestedAt = input.requestedAt.trim();
  const correlationId = input.correlationId.trim();

  if (scope !== mvpDCsvExportScope) {
    return denyMvpDCsvExport("unsupported_scope");
  }
  if (requestedBy.length === 0 || correlationId.length === 0) {
    return denyMvpDCsvExport("missing_request_identity");
  }
  if (
    !input.permissions.includes(mvpDCsvExportRequiredPermission) ||
    !input.permissions.includes(mvpDCsvExportDownloadPermission)
  ) {
    return denyMvpDCsvExport("missing_required_permissions");
  }
  if (!isValidIsoTimestamp(requestedAt)) {
    return denyMvpDCsvExport("invalid_requested_at");
  }
  if (input.fields.length === 0) {
    return denyMvpDCsvExport("missing_fields");
  }

  const seenFields = new Set<string>();
  const fields: MvpDCsvExportAllowedField[] = [];
  for (const field of input.fields) {
    const trimmedField = field.trim();
    if (trimmedField.length === 0) {
      return denyMvpDCsvExport("unsupported_field_surface");
    }
    if (seenFields.has(trimmedField)) {
      return denyMvpDCsvExport("duplicate_field");
    }

    const classification = classifyMvpDCsvExportSurface(trimmedField);
    if (classification.kind === "denied_surface") {
      return denyMvpDCsvExport("denied_field_surface");
    }
    if (classification.kind === "unsupported_surface") {
      return denyMvpDCsvExport("unsupported_field_surface");
    }

    seenFields.add(trimmedField);
    fields.push(classification.field);
  }

  const rows: MvpDCsvExportRow[] = [];
  for (const row of input.rows) {
    const normalized = normalizeExportRow(row, seenFields);
    if (normalized.outcome === "denied") {
      return denyMvpDCsvExport(normalized.reason);
    }
    rows.push(normalized.row);
  }

  return {
    outcome: "allowed",
    request: {
      scope: mvpDCsvExportScope,
      requestedBy,
      requestedAt,
      correlationId,
      fields,
      rows,
    },
  };
}

export function classifyMvpDCsvExportSurface(
  value: string,
): MvpDCsvExportSurfaceClassification {
  const normalizedSurface = normalizeSurface(value);
  if (deniedSurfaceSet.has(normalizedSurface)) {
    return {
      kind: "denied_surface",
      normalizedSurface,
    };
  }
  if (allowedFieldSet.has(value)) {
    return {
      kind: "allowed_field",
      field: value as MvpDCsvExportAllowedField,
    };
  }
  return {
    kind: "unsupported_surface",
    normalizedSurface,
  };
}

function normalizeExportRow(
  row: MvpDCsvExportRow,
  selectedFieldSet: ReadonlySet<string>,
):
  | {
      outcome: "allowed";
      row: MvpDCsvExportRow;
    }
  | {
      outcome: "denied";
      reason: MvpDCsvExportDeniedReason;
    } {
  const seenRowKeys = new Set<string>();
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(row)) {
    const trimmedKey = key.trim();
    if (trimmedKey.length === 0) {
      return denyMvpDCsvExportRow("unsupported_row_surface");
    }
    if (seenRowKeys.has(trimmedKey)) {
      return denyMvpDCsvExportRow("duplicate_row_key");
    }

    const classification = classifyMvpDCsvExportSurface(trimmedKey);
    if (classification.kind === "denied_surface") {
      return denyMvpDCsvExportRow("denied_row_surface");
    }
    if (
      classification.kind === "unsupported_surface" ||
      !selectedFieldSet.has(trimmedKey)
    ) {
      return denyMvpDCsvExportRow("unsupported_row_surface");
    }
    seenRowKeys.add(trimmedKey);

    const normalizedValue = normalizeSurface(value ?? "");
    if (realOrRegulatedMarkers.has(normalizedValue)) {
      return denyMvpDCsvExportRow("real_or_regulated_row_value");
    }
    if (
      normalizeSurface(key).endsWith("marker") &&
      normalizedValue.length > 0 &&
      !syntheticOnlyMarkers.has(normalizedValue)
    ) {
      return denyMvpDCsvExportRow("non_synthetic_marker");
    }
    entries.push([trimmedKey, value?.trim() ?? ""]);
  }

  return {
    outcome: "allowed",
    row: Object.fromEntries(entries) as MvpDCsvExportRow,
  };
}

export function buildMvpDCsvExportAuditEvidence(
  db: OnboardingTransactionRequestDatabase,
  request: MvpDCsvExportNormalizedRequest,
  dataCsv: string,
): MvpDCsvExportAuditEvidence {
  const evidenceHash = sha256(dataCsv);
  return {
    auditEventId: buildAuditEventId(db, request),
    evidenceHash,
    evidenceSubjectId: buildEvidenceSubjectId(request, evidenceHash),
    rowCount: request.rows.length,
  };
}

function serializeCsvArtifact(
  request: MvpDCsvExportNormalizedRequest,
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
    serializeCsvTraceLine("requested_by", request.requestedBy),
    serializeCsvTraceLine("requested_at", request.requestedAt),
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
  request: MvpDCsvExportNormalizedRequest,
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
  request: MvpDCsvExportNormalizedRequest,
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

function denyMvpDCsvExport(
  reason: MvpDCsvExportDeniedReason,
): MvpDCsvExportPolicyEvaluation {
  return {
    outcome: "denied",
    reason,
  };
}

function denyMvpDCsvExportRow(reason: MvpDCsvExportDeniedReason): {
  outcome: "denied";
  reason: MvpDCsvExportDeniedReason;
} {
  return {
    outcome: "denied",
    reason,
  };
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

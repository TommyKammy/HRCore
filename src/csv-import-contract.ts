import { isValidIsoDate } from "./onboarding-transaction-request-validation.js";
import {
  encodeStableKey,
  rollbackNamedSavepoint,
} from "./onboarding-transaction-request-shared.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";

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

type MvpDCsvImportColumn = (typeof mvpDCsvImportTemplateColumns)[number];

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

export interface MvpDCsvImportApplyInput {
  csvInput: string;
  dryRun: MvpDCsvImportDryRunResult;
  appliedAt: string;
  appliedBy: string;
  correlationId: string;
}

export interface MvpDCsvImportAppliedRow {
  rowId: string;
  lifecycleType: MvpDCsvLifecycleType;
  status: "applied" | "idempotent";
  transactionRequestId: string;
  lifecycleEventId: string;
}

export interface MvpDCsvImportFailedApplyRow {
  rowId: string;
  lifecycleType: MvpDCsvLifecycleType;
  status: "failed";
  reason: string;
}

export interface MvpDCsvImportApplyResult {
  summary: {
    appliedRows: number;
    failedRows: number;
    idempotentRows: number;
  };
  rows: Array<MvpDCsvImportAppliedRow | MvpDCsvImportFailedApplyRow>;
  correlationId: string;
}

type ParsedCsvRow = Record<MvpDCsvImportColumn, string>;
type AcceptedParsedCsvRow = ParsedCsvRow & {
  lifecycle_type: MvpDCsvLifecycleType;
};

type ExistingCsvImportRowOutcome = {
  row_id: string;
  lifecycle_type: string;
  status_code: string;
  transaction_request_id: string | null;
  lifecycle_event_id: string | null;
  error_message: string | null;
  row_fingerprint: string;
};

type ExistingCsvImportJob = {
  correlation_id: string;
  import_fingerprint: string;
};

type NormalizedMvpDCsvImportApplyInput = MvpDCsvImportApplyInput & {
  appliedAt: string;
  appliedBy: string;
  correlationId: string;
};

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

export function dryRunSyntheticLifecycleCsvImport(
  csvInput: string,
): MvpDCsvImportDryRunResult {
  const records = parseCsvRecords(csvInput);
  if (records.length === 0) {
    throw new Error("CSV input is malformed: missing header row");
  }

  const header = records[0];
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

  const acceptedRows: MvpDCsvImportAcceptedRow[] = [];
  const rejectedRows: MvpDCsvImportRejectedRow[] = [];
  const diffs: MvpDCsvImportDryRunDiff[] = [];
  const seenRowIds = new Set<string>();

  for (const [recordIndex, record] of records.slice(1).entries()) {
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
    const reasons = validateCsvImportRow(row);
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
    acceptedRows.push({ rowNumber, rowId, lifecycleType });
    diffs.push({
      rowId,
      lifecycleType,
      operation: dryRunOperationForLifecycleType(lifecycleType),
      evidence: {
        personId: row.person_id.trim(),
        effectiveDate: row.effective_date.trim(),
        correlationId: `csv-import-${rowId}`,
      },
    });
  }

  return {
    mutatesRecords: false,
    summary: {
      acceptedRows: acceptedRows.length,
      rejectedRows: rejectedRows.length,
    },
    acceptedRows,
    rejectedRows,
    diffs,
  };
}

export function applySyntheticLifecycleCsvImport(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvImportApplyInput,
): MvpDCsvImportApplyResult {
  const command = normalizeApplyCommand(input);

  const currentDryRun = dryRunSyntheticLifecycleCsvImport(command.csvInput);
  if (!matchesDryRunContract(command.dryRun, currentDryRun)) {
    throw new Error(
      "CSV import apply requires a current dry-run result for the exact CSV input",
    );
  }
  if (currentDryRun.summary.rejectedRows > 0) {
    throw new Error(
      "CSV import apply requires a dry-run with no rejected rows",
    );
  }

  const acceptedRows = readAcceptedCsvRows(command.csvInput);
  const rowsById = new Map(acceptedRows.map((row) => [row.row_id.trim(), row]));
  const importFingerprint = buildImportFingerprint(acceptedRows);
  const applyRows: Array<
    MvpDCsvImportAppliedRow | MvpDCsvImportFailedApplyRow
  > = [];
  let appliedRows = 0;
  let idempotentRows = 0;
  let failedRows = 0;
  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT mvp_d_csv_import_apply");
    savepointStarted = true;

    recordCsvImportJob(db, command, importFingerprint, {
      acceptedRows: currentDryRun.summary.acceptedRows,
      failedRows: currentDryRun.summary.rejectedRows,
    });

    for (const dryRunRow of currentDryRun.acceptedRows) {
      const row = rowsById.get(dryRunRow.rowId);
      if (!row) {
        throw new Error(
          `CSV import apply row ${dryRunRow.rowId} is missing from the CSV input`,
        );
      }

      const rowIds = buildApplyRowIds(row);
      const jobRowIds = buildApplyJobRowIds(command, row);
      const rowFingerprint = buildRowFingerprint(row);
      const existingOutcome = readCsvImportRowOutcome(db, dryRunRow.rowId);
      if (existingOutcome) {
        if (
          !matchesAppliedOutcome(existingOutcome, row, rowIds, rowFingerprint)
        ) {
          throw new Error(
            `CSV import row ${dryRunRow.rowId} conflicts with existing outcome evidence`,
          );
        }
        recordIdempotentCsvImportRowOutcome(
          db,
          command,
          row,
          rowIds,
          jobRowIds,
          rowFingerprint,
        );
        applyRows.push({
          rowId: dryRunRow.rowId,
          lifecycleType: dryRunRow.lifecycleType,
          status: "idempotent",
          transactionRequestId: rowIds.transactionRequestId,
          lifecycleEventId: rowIds.lifecycleEventId,
        });
        idempotentRows += 1;
        continue;
      }

      try {
        db.exec("SAVEPOINT mvp_d_csv_import_apply_row");
        applyAcceptedCsvRow(
          db,
          command,
          row,
          rowIds,
          jobRowIds,
          rowFingerprint,
        );
        db.exec("RELEASE SAVEPOINT mvp_d_csv_import_apply_row");
        applyRows.push({
          rowId: dryRunRow.rowId,
          lifecycleType: dryRunRow.lifecycleType,
          status: "applied",
          transactionRequestId: rowIds.transactionRequestId,
          lifecycleEventId: rowIds.lifecycleEventId,
        });
        appliedRows += 1;
      } catch (error) {
        rollbackNamedSavepoint(db, "mvp_d_csv_import_apply_row");
        const reason =
          error instanceof Error ? error.message : "unknown CSV import failure";
        recordFailedCsvImportRowOutcome(
          db,
          command,
          row,
          jobRowIds,
          rowFingerprint,
          reason,
        );
        applyRows.push({
          rowId: dryRunRow.rowId,
          lifecycleType: dryRunRow.lifecycleType,
          status: "failed",
          reason,
        });
        failedRows += 1;
      }
    }

    finalizeCsvImportJob(db, command, {
      appliedRows,
      failedRows,
      idempotentRows,
    });

    db.exec("RELEASE SAVEPOINT mvp_d_csv_import_apply");
  } catch (error) {
    if (savepointStarted) {
      rollbackNamedSavepoint(db, "mvp_d_csv_import_apply");
    }
    throw error;
  }

  return {
    summary: {
      appliedRows,
      failedRows,
      idempotentRows,
    },
    rows: applyRows,
    correlationId: command.correlationId,
  };
}

function validateCsvImportRow(row: ParsedCsvRow): string[] {
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

function normalizeApplyCommand(
  input: MvpDCsvImportApplyInput,
): NormalizedMvpDCsvImportApplyInput {
  const appliedAt = input.appliedAt.trim();
  const appliedBy = input.appliedBy.trim();
  const correlationId = input.correlationId.trim();

  if (!isValidIsoTimestamp(appliedAt)) {
    throw new Error("CSV import apply requires an ISO timestamp");
  }
  if (appliedBy.length === 0) {
    throw new Error("CSV import apply requires an authenticated actor");
  }
  if (correlationId.length === 0) {
    throw new Error("CSV import apply requires a correlation id");
  }

  return {
    ...input,
    appliedAt,
    appliedBy,
    correlationId,
  };
}

function matchesDryRunContract(
  expected: MvpDCsvImportDryRunResult,
  actual: MvpDCsvImportDryRunResult,
): boolean {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function readAcceptedCsvRows(csvInput: string): AcceptedParsedCsvRow[] {
  const records = parseCsvRecords(csvInput);
  const header = records[0] ?? [];
  const acceptedRows: AcceptedParsedCsvRow[] = [];

  for (const record of records.slice(1)) {
    if (record.length !== header.length) {
      continue;
    }
    const row = toCsvRow(header, record);
    const lifecycleType = row.lifecycle_type.trim();
    if (
      validateCsvImportRow(row).length === 0 &&
      isMvpDCsvLifecycleType(lifecycleType)
    ) {
      acceptedRows.push({
        ...row,
        lifecycle_type: lifecycleType,
      });
    }
  }

  return acceptedRows;
}

function recordCsvImportJob(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvImportApplyInput,
  importFingerprint: string,
  counts: { acceptedRows: number; failedRows: number },
): void {
  const existingJob = readCsvImportJob(db, input.correlationId);
  if (existingJob) {
    if (existingJob.import_fingerprint !== importFingerprint) {
      throw new Error(
        "CSV import apply correlation id already belongs to a different import",
      );
    }
    return;
  }

  db.prepare(
    `
      INSERT INTO csv_import_job (
        id,
        correlation_id,
        import_fingerprint,
        template_version,
        tenant_environment_id,
        status_code,
        requested_at,
        requested_by,
        accepted_rows,
        failed_rows
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    buildCsvImportJobId(input.correlationId),
    input.correlationId,
    importFingerprint,
    mvpDCsvImportTemplateVersion,
    mvpDCsvImportTenantEnvironmentId,
    counts.failedRows > 0 ? "failed" : "applied",
    input.appliedAt,
    input.appliedBy,
    counts.acceptedRows,
    counts.failedRows,
  );
}

function readCsvImportJob(
  db: OnboardingTransactionRequestDatabase,
  correlationId: string,
): ExistingCsvImportJob | undefined {
  return db
    .prepare(
      `
      SELECT correlation_id, import_fingerprint
      FROM csv_import_job
      WHERE correlation_id = ?
    `,
    )
    .get(correlationId) as ExistingCsvImportJob | undefined;
}

function finalizeCsvImportJob(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvImportApplyInput,
  counts: {
    appliedRows: number;
    failedRows: number;
    idempotentRows: number;
  },
): void {
  db.prepare(
    `
      UPDATE csv_import_job
      SET
        status_code = ?,
        accepted_rows = ?,
        failed_rows = ?
      WHERE correlation_id = ?
    `,
  ).run(
    counts.failedRows > 0 ? "failed" : "applied",
    counts.appliedRows + counts.idempotentRows,
    counts.failedRows,
    input.correlationId,
  );
}

function applyAcceptedCsvRow(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvImportApplyInput,
  row: AcceptedParsedCsvRow,
  rowIds: ReturnType<typeof buildApplyRowIds>,
  jobRowIds: ReturnType<typeof buildApplyJobRowIds>,
  rowFingerprint: string,
): void {
  if (row.lifecycle_type === "onboarding") {
    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES (?, ?, ?)
      `,
    ).run(row.person_id.trim(), row.display_name.trim(), input.appliedAt);
  } else {
    assertCurrentAssignmentReference(db, row);
  }

  db.prepare(
    `
      INSERT INTO transaction_request (
        id,
        person_id,
        request_type,
        status_code,
        requested_at,
        correlation_id
      )
      VALUES (?, ?, ?, 'completed', ?, ?)
    `,
  ).run(
    rowIds.transactionRequestId,
    row.person_id.trim(),
    requestTypeForLifecycleType(row.lifecycle_type),
    input.appliedAt,
    rowIds.rowCorrelationId,
  );

  db.prepare(
    `
      INSERT INTO lifecycle_event (
        id,
        person_id,
        transaction_request_id,
        contact_point_id,
        event_type,
        effective_date,
        occurred_at
      )
      VALUES (?, ?, ?, NULL, ?, ?, ?)
    `,
  ).run(
    rowIds.lifecycleEventId,
    row.person_id.trim(),
    rowIds.transactionRequestId,
    eventTypeForLifecycleType(row.lifecycle_type),
    row.effective_date.trim(),
    input.appliedAt,
  );

  db.prepare(
    `
      INSERT INTO audit_event (
        id,
        actor_id,
        action,
        subject_table,
        subject_id,
        occurred_at,
        correlation_id,
        poc_marker
      )
      VALUES (?, ?, 'mvp_d.csv_import.apply_row', 'lifecycle_event', ?, ?, ?, 'synthetic_poc')
    `,
  ).run(
    rowIds.auditEventId,
    input.appliedBy,
    rowIds.lifecycleEventId,
    input.appliedAt,
    input.correlationId,
  );

  db.prepare(
    `
      INSERT INTO csv_import_row_outcome (
        id,
        job_id,
        row_id,
        lifecycle_type,
        status_code,
        transaction_request_id,
        lifecycle_event_id,
        row_fingerprint,
        error_message,
        correlation_id,
        decided_at
      )
      VALUES (?, ?, ?, ?, 'applied', ?, ?, ?, NULL, ?, ?)
    `,
  ).run(
    jobRowIds.rowOutcomeId,
    buildCsvImportJobId(input.correlationId),
    row.row_id.trim(),
    row.lifecycle_type,
    rowIds.transactionRequestId,
    rowIds.lifecycleEventId,
    rowFingerprint,
    jobRowIds.rowOutcomeCorrelationId,
    input.appliedAt,
  );
}

function assertCurrentAssignmentReference(
  db: OnboardingTransactionRequestDatabase,
  row: AcceptedParsedCsvRow,
): void {
  const currentAssignment = db
    .prepare(
      `
      SELECT id
      FROM assignment
      WHERE id = ?
        AND person_id = ?
        AND end_date IS NULL
    `,
    )
    .get(row.current_assignment_id.trim(), row.person_id.trim());

  if (!currentAssignment) {
    throw new Error(
      "CSV import apply requires current_assignment_id to match an open assignment for the person",
    );
  }
}

function recordFailedCsvImportRowOutcome(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvImportApplyInput,
  row: AcceptedParsedCsvRow,
  jobRowIds: ReturnType<typeof buildApplyJobRowIds>,
  rowFingerprint: string,
  reason: string,
): void {
  db.prepare(
    `
      INSERT INTO csv_import_row_outcome (
        id,
        job_id,
        row_id,
        lifecycle_type,
        status_code,
        transaction_request_id,
        lifecycle_event_id,
        row_fingerprint,
        error_message,
        correlation_id,
        decided_at
      )
      VALUES (?, ?, ?, ?, 'failed', NULL, NULL, ?, ?, ?, ?)
      ON CONFLICT(job_id, row_id) DO NOTHING
    `,
  ).run(
    jobRowIds.rowOutcomeId,
    buildCsvImportJobId(input.correlationId),
    row.row_id.trim(),
    row.lifecycle_type,
    rowFingerprint,
    reason,
    jobRowIds.rowOutcomeCorrelationId,
    input.appliedAt,
  );
}

function recordIdempotentCsvImportRowOutcome(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvImportApplyInput,
  row: AcceptedParsedCsvRow,
  rowIds: ReturnType<typeof buildApplyRowIds>,
  jobRowIds: ReturnType<typeof buildApplyJobRowIds>,
  rowFingerprint: string,
): void {
  db.prepare(
    `
      INSERT INTO csv_import_row_outcome (
        id,
        job_id,
        row_id,
        lifecycle_type,
        status_code,
        transaction_request_id,
        lifecycle_event_id,
        row_fingerprint,
        error_message,
        correlation_id,
        decided_at
      )
      VALUES (?, ?, ?, ?, 'idempotent', ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(job_id, row_id) DO NOTHING
    `,
  ).run(
    jobRowIds.rowOutcomeId,
    buildCsvImportJobId(input.correlationId),
    row.row_id.trim(),
    row.lifecycle_type,
    rowIds.transactionRequestId,
    rowIds.lifecycleEventId,
    rowFingerprint,
    jobRowIds.rowOutcomeCorrelationId,
    input.appliedAt,
  );
}

function readCsvImportRowOutcome(
  db: OnboardingTransactionRequestDatabase,
  rowId: string,
): ExistingCsvImportRowOutcome | undefined {
  return db
    .prepare(
      `
      SELECT
        row_id,
        lifecycle_type,
        status_code,
        transaction_request_id,
        lifecycle_event_id,
        row_fingerprint,
        error_message
      FROM csv_import_row_outcome
      WHERE row_id = ?
      ORDER BY decided_at, id
      LIMIT 1
    `,
    )
    .get(rowId) as ExistingCsvImportRowOutcome | undefined;
}

function matchesAppliedOutcome(
  existing: ExistingCsvImportRowOutcome,
  row: AcceptedParsedCsvRow,
  rowIds: ReturnType<typeof buildApplyRowIds>,
  rowFingerprint: string,
): boolean {
  return (
    existing.lifecycle_type === row.lifecycle_type &&
    (existing.status_code === "applied" ||
      existing.status_code === "idempotent") &&
    existing.transaction_request_id === rowIds.transactionRequestId &&
    existing.lifecycle_event_id === rowIds.lifecycleEventId &&
    existing.row_fingerprint === rowFingerprint &&
    existing.error_message === null
  );
}

function buildApplyRowIds(row: AcceptedParsedCsvRow) {
  const rowId = row.row_id.trim();
  return {
    transactionRequestId: `csv-import-transaction-request-${rowId}`,
    lifecycleEventId: `csv-import-lifecycle-event-${rowId}`,
    auditEventId: `audit-event-csv-import-lifecycle-event-${rowId}-applied`,
    rowCorrelationId: `csv-import-${rowId}`,
  };
}

function buildApplyJobRowIds(
  input: MvpDCsvImportApplyInput,
  row: AcceptedParsedCsvRow,
) {
  const rowId = row.row_id.trim();
  const rowOutcomeKey = encodeStableKey([input.correlationId, rowId]);
  return {
    rowOutcomeId: `csv-import-row-outcome-${rowOutcomeKey}`,
    rowOutcomeCorrelationId: `csv-import-row-outcome-correlation-${rowOutcomeKey}`,
  };
}

function buildCsvImportJobId(correlationId: string): string {
  return `csv-import-job-${correlationId}`;
}

function buildImportFingerprint(rows: AcceptedParsedCsvRow[]): string {
  return JSON.stringify(rows.map((row) => buildCanonicalCsvRow(row)));
}

function buildRowFingerprint(row: AcceptedParsedCsvRow): string {
  return JSON.stringify(buildCanonicalCsvRow(row));
}

function buildCanonicalCsvRow(row: AcceptedParsedCsvRow): ParsedCsvRow {
  return Object.fromEntries(
    mvpDCsvImportTemplateColumns.map((column) => [column, row[column].trim()]),
  ) as ParsedCsvRow;
}

function isValidIsoTimestamp(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(
      value,
    );
  if (!match) {
    return false;
  }

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(value);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day) &&
    date.getUTCHours() === Number(hour) &&
    date.getUTCMinutes() === Number(minute) &&
    date.getUTCSeconds() === Number(second)
  );
}

function requestTypeForLifecycleType(
  lifecycleType: MvpDCsvLifecycleType,
): "hire" | "transfer" | "terminate" {
  switch (lifecycleType) {
    case "onboarding":
      return "hire";
    case "transfer":
      return "transfer";
    case "termination":
      return "terminate";
  }
}

function eventTypeForLifecycleType(
  lifecycleType: MvpDCsvLifecycleType,
): "hire" | "assignment_change" | "termination" {
  switch (lifecycleType) {
    case "onboarding":
      return "hire";
    case "transfer":
      return "assignment_change";
    case "termination":
      return "termination";
  }
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

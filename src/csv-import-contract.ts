import {
  encodeStableKey,
  rollbackNamedSavepoint,
} from "./onboarding-transaction-request-shared.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";
import {
  buildImportFingerprint,
  buildMvpDCsvImportDryRunResult,
  buildRowFingerprint,
  evaluateMvpDCsvImportRows,
  mvpDCsvImportTemplateVersion,
  mvpDCsvImportTenantEnvironmentId,
  type AcceptedParsedCsvRow,
  type MvpDCsvImportDryRunResult,
  type MvpDCsvLifecycleType,
} from "./csv-import-contract-helpers.js";

export {
  evaluateMvpDCsvImportRows,
  mvpDCsvImportTemplateColumns,
  mvpDCsvImportTemplateVersion,
  mvpDCsvImportTenantEnvironmentId,
} from "./csv-import-contract-helpers.js";

export type {
  MvpDCsvImportAcceptedRow,
  MvpDCsvImportDryRunDiff,
  MvpDCsvImportDryRunResult,
  MvpDCsvImportRejectedRow,
  MvpDCsvLifecycleType,
} from "./csv-import-contract-helpers.js";

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

export function dryRunSyntheticLifecycleCsvImport(
  csvInput: string,
): MvpDCsvImportDryRunResult {
  return buildMvpDCsvImportDryRunResult(evaluateMvpDCsvImportRows(csvInput));
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

  const acceptedRows = evaluateMvpDCsvImportRows(
    command.csvInput,
  ).acceptedParsedRows;
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
      const existingOutcome = readSuccessfulCsvImportRowOutcome(
        db,
        dryRunRow.rowId,
      );
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

  recordAppliedCsvImportRowOutcome(
    db,
    input,
    row,
    rowIds,
    jobRowIds,
    rowFingerprint,
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

function recordAppliedCsvImportRowOutcome(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvImportApplyInput,
  row: AcceptedParsedCsvRow,
  rowIds: ReturnType<typeof buildApplyRowIds>,
  jobRowIds: ReturnType<typeof buildApplyJobRowIds>,
  rowFingerprint: string,
): void {
  const rowId = row.row_id.trim();
  const jobId = buildCsvImportJobId(input.correlationId);
  const existingOutcome = readCsvImportRowOutcomeForJob(db, jobId, rowId);

  if (existingOutcome) {
    if (
      existingOutcome.status_code !== "failed" ||
      existingOutcome.lifecycle_type !== row.lifecycle_type ||
      existingOutcome.row_fingerprint !== rowFingerprint ||
      existingOutcome.transaction_request_id !== null ||
      existingOutcome.lifecycle_event_id !== null ||
      existingOutcome.error_message === null
    ) {
      throw new Error(
        `CSV import row ${rowId} conflicts with existing outcome evidence`,
      );
    }

    const result = db
      .prepare(
        `
          UPDATE csv_import_row_outcome
          SET
            lifecycle_type = ?,
            status_code = 'applied',
            transaction_request_id = ?,
            lifecycle_event_id = ?,
            row_fingerprint = ?,
            error_message = NULL,
            correlation_id = ?,
            decided_at = ?
          WHERE job_id = ?
            AND row_id = ?
            AND status_code = 'failed'
        `,
      )
      .run(
        row.lifecycle_type,
        rowIds.transactionRequestId,
        rowIds.lifecycleEventId,
        rowFingerprint,
        jobRowIds.rowOutcomeCorrelationId,
        input.appliedAt,
        jobId,
        rowId,
      ) as { changes: number };

    if (result.changes !== 1) {
      throw new Error(
        `CSV import row ${rowId} conflicts with existing outcome evidence`,
      );
    }
    return;
  }

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
    jobId,
    rowId,
    row.lifecycle_type,
    rowIds.transactionRequestId,
    rowIds.lifecycleEventId,
    rowFingerprint,
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
  const rowId = row.row_id.trim();
  const jobId = buildCsvImportJobId(input.correlationId);
  const existingOutcome = readCsvImportRowOutcomeForJob(db, jobId, rowId);

  if (existingOutcome) {
    if (matchesAppliedOutcome(existingOutcome, row, rowIds, rowFingerprint)) {
      return;
    }
    if (
      existingOutcome.status_code !== "failed" ||
      existingOutcome.lifecycle_type !== row.lifecycle_type ||
      existingOutcome.row_fingerprint !== rowFingerprint ||
      existingOutcome.transaction_request_id !== null ||
      existingOutcome.lifecycle_event_id !== null ||
      existingOutcome.error_message === null
    ) {
      throw new Error(
        `CSV import row ${rowId} conflicts with existing outcome evidence`,
      );
    }

    const result = db
      .prepare(
        `
          UPDATE csv_import_row_outcome
          SET
            lifecycle_type = ?,
            status_code = 'idempotent',
            transaction_request_id = ?,
            lifecycle_event_id = ?,
            row_fingerprint = ?,
            error_message = NULL,
            correlation_id = ?,
            decided_at = ?
          WHERE job_id = ?
            AND row_id = ?
            AND status_code = 'failed'
        `,
      )
      .run(
        row.lifecycle_type,
        rowIds.transactionRequestId,
        rowIds.lifecycleEventId,
        rowFingerprint,
        jobRowIds.rowOutcomeCorrelationId,
        input.appliedAt,
        jobId,
        rowId,
      ) as { changes: number };

    if (result.changes !== 1) {
      throw new Error(
        `CSV import row ${rowId} conflicts with existing outcome evidence`,
      );
    }
    return;
  }

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
    jobId,
    rowId,
    row.lifecycle_type,
    rowIds.transactionRequestId,
    rowIds.lifecycleEventId,
    rowFingerprint,
    jobRowIds.rowOutcomeCorrelationId,
    input.appliedAt,
  );
}

function readSuccessfulCsvImportRowOutcome(
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
        AND status_code IN ('applied', 'idempotent')
      ORDER BY decided_at, id
      LIMIT 1
    `,
    )
    .get(rowId) as ExistingCsvImportRowOutcome | undefined;
}

function readCsvImportRowOutcomeForJob(
  db: OnboardingTransactionRequestDatabase,
  jobId: string,
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
      WHERE job_id = ?
        AND row_id = ?
      LIMIT 1
    `,
    )
    .get(jobId, rowId) as ExistingCsvImportRowOutcome | undefined;
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

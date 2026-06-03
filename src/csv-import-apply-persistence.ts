import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";
import type {
  AcceptedParsedCsvRow,
  MvpDCsvLifecycleType,
} from "./csv-import-contract-helpers.js";
import {
  mvpDCsvImportTemplateVersion,
  mvpDCsvImportTenantEnvironmentId,
} from "./csv-import-contract-helpers.js";
import { buildCsvImportJobId } from "./csv-import-apply-ids.js";
import {
  decideCsvImportRowOutcome,
  matchesAppliedOutcome,
} from "./csv-import-apply-idempotency.js";
import type {
  ExistingCsvImportJob,
  ExistingCsvImportRowOutcome,
  MvpDCsvImportApplyInput,
  MvpDCsvImportApplyJobRowIds,
  MvpDCsvImportApplyRowIds,
} from "./csv-import-apply-types.js";

export function recordCsvImportJob(
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

export function readCsvImportJob(
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

export function finalizeCsvImportJob(
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

export function applyAcceptedCsvRow(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvImportApplyInput,
  row: AcceptedParsedCsvRow,
  rowIds: MvpDCsvImportApplyRowIds,
  jobRowIds: MvpDCsvImportApplyJobRowIds,
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

export function recordFailedCsvImportRowOutcome(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvImportApplyInput,
  row: AcceptedParsedCsvRow,
  jobRowIds: MvpDCsvImportApplyJobRowIds,
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
  rowIds: MvpDCsvImportApplyRowIds,
  jobRowIds: MvpDCsvImportApplyJobRowIds,
  rowFingerprint: string,
): void {
  const rowId = row.row_id.trim();
  const jobId = buildCsvImportJobId(input.correlationId);
  const existingOutcome = readCsvImportRowOutcomeForJob(db, jobId, rowId);

  if (existingOutcome) {
    const decision = decideCsvImportRowOutcome(
      existingOutcome,
      row,
      rowIds,
      rowFingerprint,
    );
    if (decision.status === "conflict") {
      throw new Error(decision.reason);
    }
    if (decision.status === "matched_success") {
      return;
    }

    updateRetryableCsvImportRowOutcome(
      db,
      input,
      row,
      rowIds,
      jobRowIds,
      rowFingerprint,
      "applied",
    );
    return;
  }

  insertSuccessfulCsvImportRowOutcome(
    db,
    input,
    row,
    rowIds,
    jobRowIds,
    rowFingerprint,
    "applied",
  );
}

export function recordIdempotentCsvImportRowOutcome(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvImportApplyInput,
  row: AcceptedParsedCsvRow,
  rowIds: MvpDCsvImportApplyRowIds,
  jobRowIds: MvpDCsvImportApplyJobRowIds,
  rowFingerprint: string,
): void {
  const rowId = row.row_id.trim();
  const jobId = buildCsvImportJobId(input.correlationId);
  const existingOutcome = readCsvImportRowOutcomeForJob(db, jobId, rowId);

  if (existingOutcome) {
    const decision = decideCsvImportRowOutcome(
      existingOutcome,
      row,
      rowIds,
      rowFingerprint,
    );
    if (decision.status === "conflict") {
      throw new Error(decision.reason);
    }
    if (decision.status === "matched_success") {
      return;
    }

    updateRetryableCsvImportRowOutcome(
      db,
      input,
      row,
      rowIds,
      jobRowIds,
      rowFingerprint,
      "idempotent",
    );
    return;
  }

  insertSuccessfulCsvImportRowOutcome(
    db,
    input,
    row,
    rowIds,
    jobRowIds,
    rowFingerprint,
    "idempotent",
  );
}

function updateRetryableCsvImportRowOutcome(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvImportApplyInput,
  row: AcceptedParsedCsvRow,
  rowIds: MvpDCsvImportApplyRowIds,
  jobRowIds: MvpDCsvImportApplyJobRowIds,
  rowFingerprint: string,
  statusCode: "applied" | "idempotent",
): void {
  const rowId = row.row_id.trim();
  const result = db
    .prepare(
      `
        UPDATE csv_import_row_outcome
        SET
          lifecycle_type = ?,
          status_code = ?,
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
      statusCode,
      rowIds.transactionRequestId,
      rowIds.lifecycleEventId,
      rowFingerprint,
      jobRowIds.rowOutcomeCorrelationId,
      input.appliedAt,
      buildCsvImportJobId(input.correlationId),
      rowId,
    ) as { changes: number };

  if (result.changes !== 1) {
    throw new Error(
      `CSV import row ${rowId} conflicts with existing outcome evidence`,
    );
  }
}

function insertSuccessfulCsvImportRowOutcome(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvImportApplyInput,
  row: AcceptedParsedCsvRow,
  rowIds: MvpDCsvImportApplyRowIds,
  jobRowIds: MvpDCsvImportApplyJobRowIds,
  rowFingerprint: string,
  statusCode: "applied" | "idempotent",
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(job_id, row_id) DO NOTHING
    `,
  ).run(
    jobRowIds.rowOutcomeId,
    buildCsvImportJobId(input.correlationId),
    row.row_id.trim(),
    row.lifecycle_type,
    statusCode,
    rowIds.transactionRequestId,
    rowIds.lifecycleEventId,
    rowFingerprint,
    jobRowIds.rowOutcomeCorrelationId,
    input.appliedAt,
  );
}

export function readSuccessfulCsvImportRowOutcome(
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

export function assertExistingOutcomeMatchesAppliedRow(
  existingOutcome: ExistingCsvImportRowOutcome,
  row: AcceptedParsedCsvRow,
  rowIds: MvpDCsvImportApplyRowIds,
  rowFingerprint: string,
): void {
  if (!matchesAppliedOutcome(existingOutcome, row, rowIds, rowFingerprint)) {
    throw new Error(
      `CSV import row ${row.row_id.trim()} conflicts with existing outcome evidence`,
    );
  }
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

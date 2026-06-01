import {
  parsePersistedTransferApplyPayload,
  previousIsoDate,
} from "./transfer-transaction-request-apply.js";
import {
  buildTransferTargetAssignmentCode,
  buildTransferTargetAssignmentId,
} from "./transfer-transaction-request-ids.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request.js";
import type {
  ExistingTransferApplyJobAttemptRow,
  ExistingTransferAssignmentRow,
  ExistingTransferAuditRow,
  ExistingTransferLifecycleRow,
  ExistingTransferTransactionRequestRow,
  MvpBTransferApplyJobAttemptTrace,
  MvpBTransferAssignmentTrace,
  MvpBTransferAuditTrace,
  MvpBTransferLifecycleTrace,
  ParsedTransferTracePayload,
} from "./transfer-traceability-types.js";
import { throwTransferTraceError } from "./transfer-traceability-types.js";

export function requireTransferTraceCorrelationId(
  correlationId: string,
): string {
  if (correlationId.trim().length === 0) {
    throwTransferTraceError(
      "MVP-B transfer trace requires a non-empty correlation id",
    );
  }

  return correlationId;
}

export function readTransferTraceRequestByCorrelationId(
  db: OnboardingTransactionRequestDatabase,
  correlationId: string,
): ExistingTransferTransactionRequestRow {
  const rows = transferTraceAll<ExistingTransferTransactionRequestRow>(
    db.prepare(
      `
        SELECT
          person.id AS person_id,
          transaction_request.id AS transaction_request_id,
          person.display_name,
          person.created_at,
          transaction_request.request_type,
          transaction_request.status_code,
          transaction_request.requested_at,
          transaction_request.correlation_id,
          transaction_request.payload_version,
          transaction_request.payload_json
        FROM transaction_request
        JOIN person ON person.id = transaction_request.person_id
        WHERE transaction_request.correlation_id = ?
      `,
    ),
    correlationId,
  );

  if (rows.length !== 1) {
    throwTransferTraceError(
      "MVP-B transfer trace requires exactly one transaction_request for the supplied correlation id",
    );
  }
  const request = rows[0];
  if (
    request.request_type !== "transfer" ||
    request.correlation_id !== correlationId
  ) {
    throwTransferTraceError(
      "MVP-B transfer trace requires transaction_request root transfer correlation evidence",
    );
  }

  return request;
}

export function readTransferTracePayload(
  request: ExistingTransferTransactionRequestRow,
): ParsedTransferTracePayload {
  try {
    return parsePersistedTransferApplyPayload(request);
  } catch {
    throwTransferTraceError(
      "MVP-B transfer trace requires supported transfer payload evidence",
    );
  }
}

export function readTransferTraceAuditEvents(
  db: OnboardingTransactionRequestDatabase,
  request: ExistingTransferTransactionRequestRow,
): MvpBTransferAuditTrace[] {
  return transferTraceAll<ExistingTransferAuditRow>(
    db.prepare(
      `
          SELECT
            id,
            actor_id,
            action,
            subject_table,
            subject_id,
            occurred_at,
            correlation_id
          FROM audit_event
          WHERE (
            subject_table = 'transaction_request'
            AND subject_id = ?
            AND action = 'mvp_b.transfer.approve'
          )
          OR (
            subject_table = 'lifecycle_event'
            AND action = 'mvp_b.transfer.apply'
            AND subject_id IN (
              SELECT id
              FROM lifecycle_event
              WHERE transaction_request_id = ?
                AND person_id = ?
                AND event_type = 'assignment_change'
            )
          )
          ORDER BY occurred_at, id
        `,
    ),
    request.transaction_request_id,
    request.transaction_request_id,
    request.person_id,
  ).map(mapTransferTraceAuditRow);
}

export function readTransferTraceLifecycleEvent(
  db: OnboardingTransactionRequestDatabase,
  request: ExistingTransferTransactionRequestRow,
  payload: ParsedTransferTracePayload,
): MvpBTransferLifecycleTrace | undefined {
  const rows = transferTraceAll<ExistingTransferLifecycleRow>(
    db.prepare(
      `
        SELECT
          id,
          transaction_request_id,
          person_id,
          event_type,
          effective_date,
          occurred_at
        FROM lifecycle_event
        WHERE transaction_request_id = ?
          AND person_id = ?
          AND event_type = 'assignment_change'
        ORDER BY occurred_at, id
      `,
    ),
    request.transaction_request_id,
    request.person_id,
  );

  if (rows.length > 1) {
    throwTransferTraceError(
      "MVP-B transfer trace requires a single assignment-change lifecycle event",
    );
  }
  const row = rows[0];
  if (!row) return undefined;
  if (
    row.transaction_request_id !== request.transaction_request_id ||
    row.effective_date !== payload.effectiveDate
  ) {
    throwTransferTraceError(
      "MVP-B transfer trace lifecycle evidence must match the persisted transfer payload",
    );
  }

  return {
    id: row.id,
    transactionRequestId: row.transaction_request_id,
    personId: row.person_id,
    eventType: row.event_type,
    effectiveDate: row.effective_date,
    occurredAt: row.occurred_at,
  };
}

export function readTransferTraceClosedAssignment(
  db: OnboardingTransactionRequestDatabase,
  request: ExistingTransferTransactionRequestRow,
  payload: ParsedTransferTracePayload,
): MvpBTransferAssignmentTrace | undefined {
  const rows = transferTraceAll<ExistingTransferAssignmentRow>(
    db.prepare(
      `
        SELECT
          id,
          person_id,
          employment_id,
          assignment_code,
          organization_code,
          position_code,
          start_date,
          end_date
        FROM assignment
        WHERE id = ?
          AND person_id = ?
          AND assignment_code = ?
          AND end_date = ?
        ORDER BY id
      `,
    ),
    payload.currentAssignment.assignmentId,
    request.person_id,
    payload.currentAssignment.assignmentCode,
    previousIsoDate(payload.effectiveDate),
  );

  if (rows.length > 1) {
    throwTransferTraceError(
      "MVP-B transfer trace requires a single closed current assignment evidence record",
    );
  }
  const row = rows[0];
  return row ? mapTransferTraceAssignmentRow(row) : undefined;
}

export function readTransferTraceTargetAssignment(
  db: OnboardingTransactionRequestDatabase,
  request: ExistingTransferTransactionRequestRow,
  payload: ParsedTransferTracePayload,
  closedAssignment: MvpBTransferAssignmentTrace,
): MvpBTransferAssignmentTrace | undefined {
  const rows = transferTraceAll<ExistingTransferAssignmentRow>(
    db.prepare(
      `
        SELECT
          id,
          person_id,
          employment_id,
          assignment_code,
          organization_code,
          position_code,
          start_date,
          end_date
        FROM assignment
        WHERE id = ?
          AND person_id = ?
          AND employment_id = ?
          AND assignment_code = ?
          AND organization_code = ?
          AND position_code IS ?
          AND start_date = ?
        ORDER BY id
      `,
    ),
    buildTransferTargetAssignmentId(request.transaction_request_id),
    request.person_id,
    closedAssignment.employmentId,
    buildTransferTargetAssignmentCode(payload),
    payload.targetAssignment.organizationReference,
    payload.targetAssignment.positionCode ?? null,
    payload.effectiveDate,
  );

  if (rows.length > 1) {
    throwTransferTraceError(
      "MVP-B transfer trace requires a single target assignment evidence record",
    );
  }
  const row = rows[0];
  return row ? mapTransferTraceAssignmentRow(row) : undefined;
}

export function readTransferTraceApplyJobAttempts(
  db: OnboardingTransactionRequestDatabase,
  request: ExistingTransferTransactionRequestRow,
  applyAuditEvent?: MvpBTransferAuditTrace,
): MvpBTransferApplyJobAttemptTrace[] {
  if (applyAuditEvent === undefined) return [];

  return transferTraceAll<ExistingTransferApplyJobAttemptRow>(
    db.prepare(
      `
          SELECT
            id,
            transaction_request_id,
            person_id,
            status_code,
            attempted_at,
            worker_id,
            correlation_id,
            retryable,
            error_message
          FROM onboarding_apply_job_attempt
          WHERE transaction_request_id = ?
            AND person_id = ?
            AND status_code = 'applied'
            AND correlation_id = ?
          ORDER BY attempted_at, id
        `,
    ),
    request.transaction_request_id,
    request.person_id,
    applyAuditEvent.correlationId,
  ).map((row) => ({
    id: row.id,
    transactionRequestId: row.transaction_request_id,
    personId: row.person_id,
    statusCode: row.status_code,
    attemptedAt: row.attempted_at,
    workerId: row.worker_id,
    correlationId: row.correlation_id,
    retryable: row.retryable === 1,
    errorMessage: row.error_message,
  }));
}

function mapTransferTraceAuditRow(
  row: ExistingTransferAuditRow,
): MvpBTransferAuditTrace {
  if (row.correlation_id === null) {
    throwTransferTraceError(
      "MVP-B transfer trace audit evidence must include a correlation id",
    );
  }

  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    subjectTable: row.subject_table,
    subjectId: row.subject_id,
    occurredAt: row.occurred_at,
    correlationId: row.correlation_id,
  };
}

function mapTransferTraceAssignmentRow(
  row: ExistingTransferAssignmentRow,
): MvpBTransferAssignmentTrace {
  return {
    id: row.id,
    employmentId: row.employment_id,
    assignmentCode: row.assignment_code,
    organizationCode: row.organization_code,
    positionCode: row.position_code,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

function transferTraceAll<T>(
  statement: ReturnType<OnboardingTransactionRequestDatabase["prepare"]>,
  ...values: (string | number | bigint | null)[]
): T[] {
  if (!statement.all) {
    throwTransferTraceError("MVP-B transfer trace requires query-all support");
  }

  return statement.all(...values) as T[];
}

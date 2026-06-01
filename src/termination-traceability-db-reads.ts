import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request.js";
import { parsePersistedTerminationApplyPayload } from "./termination-transaction-request-apply.js";
import type {
  ExistingTerminationApplyJobAttemptRow,
  ExistingTerminationAssignmentRow,
  ExistingTerminationAuditRow,
  ExistingTerminationEmploymentRow,
  ExistingTerminationLifecycleRow,
  ExistingTerminationTransactionRequestRow,
  MvpCTerminationApplyJobAttemptTrace,
  MvpCTerminationAssignmentTrace,
  MvpCTerminationAuditTrace,
  MvpCTerminationEmploymentTrace,
  MvpCTerminationLifecycleTrace,
  ParsedTerminationTracePayload,
} from "./termination-traceability-types.js";
import { throwTerminationTraceError } from "./termination-traceability-types.js";

export function requireTerminationTraceCorrelationId(
  correlationId: string,
): string {
  if (correlationId.trim().length === 0) {
    throwTerminationTraceError(
      "MVP-C termination trace requires a non-empty correlation id",
    );
  }

  return correlationId;
}

export function readTerminationTraceRequestByCorrelationId(
  db: OnboardingTransactionRequestDatabase,
  correlationId: string,
): ExistingTerminationTransactionRequestRow {
  const rows = terminationTraceAll<ExistingTerminationTransactionRequestRow>(
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
    throwTerminationTraceError(
      "MVP-C termination trace requires exactly one transaction_request for the supplied correlation id",
    );
  }
  const request = rows[0];
  if (
    request.request_type !== "terminate" ||
    request.correlation_id !== correlationId
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace requires transaction_request root termination correlation evidence",
    );
  }

  return request;
}

export function readTerminationTracePayload(
  request: ExistingTerminationTransactionRequestRow,
): ParsedTerminationTracePayload {
  try {
    return parsePersistedTerminationApplyPayload(request);
  } catch {
    throwTerminationTraceError(
      "MVP-C termination trace requires supported termination payload evidence",
    );
  }
}

export function readTerminationTraceAuditEvents(
  db: OnboardingTransactionRequestDatabase,
  request: ExistingTerminationTransactionRequestRow,
): MvpCTerminationAuditTrace[] {
  return terminationTraceAll<ExistingTerminationAuditRow>(
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
          AND action = 'mvp_c.termination.approve'
        )
        OR (
          subject_table = 'lifecycle_event'
          AND action = 'mvp_c.termination.apply'
          AND subject_id IN (
            SELECT id
            FROM lifecycle_event
            WHERE transaction_request_id = ?
              AND person_id = ?
              AND event_type = 'termination'
          )
        )
        ORDER BY occurred_at, id
      `,
    ),
    request.transaction_request_id,
    request.transaction_request_id,
    request.person_id,
  ).map(mapTerminationTraceAuditRow);
}

export function readTerminationTraceLifecycleEvent(
  db: OnboardingTransactionRequestDatabase,
  request: ExistingTerminationTransactionRequestRow,
  payload: ParsedTerminationTracePayload,
): MvpCTerminationLifecycleTrace | undefined {
  const rows = terminationTraceAll<ExistingTerminationLifecycleRow>(
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
          AND event_type = 'termination'
        ORDER BY occurred_at, id
      `,
    ),
    request.transaction_request_id,
    request.person_id,
  );

  if (rows.length > 1) {
    throwTerminationTraceError(
      "MVP-C termination trace requires a single termination lifecycle event",
    );
  }
  const row = rows[0];
  if (!row) return undefined;
  if (
    row.transaction_request_id !== request.transaction_request_id ||
    row.effective_date !== payload.effectiveDate
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace lifecycle evidence must match the persisted termination payload",
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

export function readTerminationTraceEndedEmployment(
  db: OnboardingTransactionRequestDatabase,
  request: ExistingTerminationTransactionRequestRow,
  payload: ParsedTerminationTracePayload,
): MvpCTerminationEmploymentTrace | undefined {
  const rows = terminationTraceAll<ExistingTerminationEmploymentRow>(
    db.prepare(
      `
        SELECT
          id,
          person_id,
          employment_code,
          status_code,
          start_date,
          end_date
        FROM employment
        WHERE id = ?
          AND person_id = ?
          AND employment_code = ?
          AND status_code = 'terminated'
          AND end_date = ?
        ORDER BY id
      `,
    ),
    payload.currentEmployment.employmentId,
    request.person_id,
    payload.currentEmployment.employmentCode,
    payload.effectiveDate,
  );

  if (rows.length > 1) {
    throwTerminationTraceError(
      "MVP-C termination trace requires a single ended employment evidence record",
    );
  }
  const row = rows[0];
  return row
    ? {
        id: row.id,
        employmentCode: row.employment_code,
        statusCode: row.status_code,
        startDate: row.start_date,
        endDate: row.end_date,
      }
    : undefined;
}

export function readTerminationTraceEndedAssignment(
  db: OnboardingTransactionRequestDatabase,
  request: ExistingTerminationTransactionRequestRow,
  payload: ParsedTerminationTracePayload,
  endedEmployment: MvpCTerminationEmploymentTrace,
): MvpCTerminationAssignmentTrace | undefined {
  const rows = terminationTraceAll<ExistingTerminationAssignmentRow>(
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
          AND end_date = ?
        ORDER BY id
      `,
    ),
    payload.currentAssignment.assignmentId,
    request.person_id,
    endedEmployment.id,
    payload.currentAssignment.assignmentCode,
    payload.effectiveDate,
  );

  if (rows.length > 1) {
    throwTerminationTraceError(
      "MVP-C termination trace requires a single ended assignment evidence record",
    );
  }
  const row = rows[0];
  return row ? mapTerminationTraceAssignmentRow(row) : undefined;
}

export function readTerminationTraceApplyJobAttempts(
  db: OnboardingTransactionRequestDatabase,
  request: ExistingTerminationTransactionRequestRow,
  applyAuditEvent?: MvpCTerminationAuditTrace,
): MvpCTerminationApplyJobAttemptTrace[] {
  if (applyAuditEvent === undefined) return [];

  return terminationTraceAll<ExistingTerminationApplyJobAttemptRow>(
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

function mapTerminationTraceAuditRow(
  row: ExistingTerminationAuditRow,
): MvpCTerminationAuditTrace {
  if (row.correlation_id === null) {
    throwTerminationTraceError(
      "MVP-C termination trace audit evidence must include a correlation id",
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

function mapTerminationTraceAssignmentRow(
  row: ExistingTerminationAssignmentRow,
): MvpCTerminationAssignmentTrace {
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

function terminationTraceAll<T>(
  statement: ReturnType<OnboardingTransactionRequestDatabase["prepare"]>,
  ...values: (string | number | bigint | null)[]
): T[] {
  if (!statement.all) {
    throwTerminationTraceError(
      "MVP-C termination trace requires query-all support",
    );
  }

  return statement.all(...values) as T[];
}

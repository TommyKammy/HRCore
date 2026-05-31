import {
  assertApplyJobAttemptRow,
  assertAssignmentRow,
  assertAuditRow,
  assertConflictRow,
  assertEmploymentRow,
  assertLifecycleRow,
  assertProviderRefreshRow,
  assertRequestOwnerActorRow,
  assertTransactionRequestRow,
  assertWritebackRow,
  isRecord,
  requireString,
  throwTraceError,
} from "./mvp-a-onboarding-traceability-row-guards.js";
import {
  type MvpAOnboardingApplyJobAttemptTrace,
  type MvpAOnboardingAssignmentTrace,
  type MvpAOnboardingAuditTrace,
  type MvpAOnboardingEmploymentTrace,
  type MvpAOnboardingLifecycleTrace,
  type MvpAOnboardingPayload,
  type MvpAOnboardingProviderRefreshTrace,
  type MvpAOnboardingTraceabilityDatabase,
  type MvpAOnboardingTransactionRequestRow,
  type MvpAOnboardingWorkEmailConflictTrace,
  type MvpAOnboardingWorkEmailWritebackTrace,
  type MvpAOnboardingWritebackCorrelationChain,
} from "./mvp-a-onboarding-traceability-types.js";

export function requireNonEmptyCorrelationId(correlationId: string): string {
  if (correlationId.trim().length === 0) {
    throwTraceError(
      "MVP-A onboarding trace requires a non-empty correlation id",
    );
  }

  return correlationId;
}

export function readTransactionRequest(
  db: MvpAOnboardingTraceabilityDatabase,
  correlationId: string,
): MvpAOnboardingTransactionRequestRow {
  const rootRows = db
    .prepare(
      `
        SELECT
          id,
          person_id,
          request_type,
          status_code,
          correlation_id,
          payload_version,
          payload_json
        FROM transaction_request
        WHERE correlation_id = ?
      `,
    )
    .all(correlationId)
    .map(assertTransactionRequestRow);

  if (rootRows.length > 1) {
    throwTraceError(
      "MVP-A onboarding trace requires exactly one transaction_request for the supplied correlation id",
    );
  }
  if (rootRows.length === 1) {
    return requireRootCorrelation(rootRows[0]);
  }

  const linkedRows = db
    .prepare(
      `
        SELECT DISTINCT
          transaction_request.id,
          transaction_request.person_id,
          transaction_request.request_type,
          transaction_request.status_code,
          transaction_request.correlation_id,
          transaction_request.payload_version,
          transaction_request.payload_json
        FROM transaction_request
        WHERE transaction_request.id IN (
          SELECT audit_event.subject_id
          FROM audit_event
          WHERE audit_event.correlation_id = ?
            AND audit_event.subject_table = 'transaction_request'
            AND audit_event.action = 'mvp_a.onboarding.approve'
          UNION
          SELECT lifecycle_event.transaction_request_id
          FROM audit_event
          JOIN lifecycle_event
            ON lifecycle_event.id = audit_event.subject_id
          WHERE audit_event.correlation_id = ?
            AND audit_event.subject_table = 'lifecycle_event'
            AND audit_event.action = 'mvp_a.onboarding.apply'
            AND lifecycle_event.transaction_request_id IS NOT NULL
          UNION
          SELECT onboarding_apply_job_attempt.transaction_request_id
          FROM onboarding_apply_job_attempt
          WHERE onboarding_apply_job_attempt.correlation_id = ?
            AND onboarding_apply_job_attempt.status_code = 'applied'
        )
      `,
    )
    .all(correlationId, correlationId, correlationId)
    .map(assertTransactionRequestRow);

  if (linkedRows.length !== 1) {
    throwTraceError(
      "MVP-A onboarding trace requires exactly one transaction_request for the supplied correlation id",
    );
  }

  return requireRootCorrelation(linkedRows[0]);
}

export function parseMvpAOnboardingPayload(
  row: MvpAOnboardingTransactionRequestRow,
): MvpAOnboardingPayload {
  if (
    row.request_type !== "hire" ||
    row.payload_version !== "mvp_a_onboarding_v1" ||
    row.payload_json === null
  ) {
    throwTraceError(
      "MVP-A onboarding trace requires a persisted MVP-A hire payload",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.payload_json);
  } catch {
    throwTraceError("MVP-A onboarding trace payload is malformed");
  }
  if (!isRecord(parsed)) {
    throwTraceError("MVP-A onboarding trace payload is malformed");
  }

  const assignment = isRecord(parsed.assignment) ? parsed.assignment : {};
  const employment = isRecord(parsed.employment) ? parsed.employment : {};
  const workEmailExpectation = isRecord(parsed.workEmailExpectation)
    ? parsed.workEmailExpectation
    : {};
  if (
    typeof parsed.tenantEnvironmentId !== "string" ||
    typeof parsed.effectiveDate !== "string" ||
    typeof employment.id !== "string" ||
    typeof employment.employmentCode !== "string" ||
    typeof assignment.id !== "string" ||
    typeof assignment.assignmentCode !== "string" ||
    typeof assignment.departmentReference !== "string" ||
    typeof assignment.legalEntityReference !== "string" ||
    typeof workEmailExpectation.contactPointId !== "string" ||
    typeof workEmailExpectation.value !== "string"
  ) {
    throwTraceError("MVP-A onboarding trace payload is malformed");
  }

  return {
    tenantEnvironmentId: parsed.tenantEnvironmentId,
    effectiveDate: parsed.effectiveDate,
    employment: {
      id: employment.id,
      employmentCode: employment.employmentCode,
    },
    assignment: {
      id: assignment.id,
      assignmentCode: assignment.assignmentCode,
      departmentReference: assignment.departmentReference,
      legalEntityReference: assignment.legalEntityReference,
    },
    workEmailExpectation: {
      contactPointId: workEmailExpectation.contactPointId,
      value: workEmailExpectation.value,
    },
  };
}

export function readAuditEvents(
  db: MvpAOnboardingTraceabilityDatabase,
  request: MvpAOnboardingTransactionRequestRow,
): MvpAOnboardingAuditTrace[] {
  return db
    .prepare(
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
          (
            subject_table = 'transaction_request'
            AND subject_id = ?
            AND action = 'mvp_a.onboarding.approve'
          )
          OR (
            subject_table = 'lifecycle_event'
            AND action = 'mvp_a.onboarding.apply'
            AND subject_id IN (
              SELECT id
              FROM lifecycle_event
              WHERE transaction_request_id = ?
                AND person_id = ?
            )
          )
        )
        ORDER BY occurred_at, id
      `,
    )
    .all(request.id, request.id, request.person_id)
    .map(assertAuditRow)
    .map((row) => {
      const rowCorrelationId = row.correlation_id;
      if (rowCorrelationId === null) {
        throwTraceError(
          "MVP-A onboarding trace audit evidence must include a correlation id",
        );
      }

      return {
        id: row.id,
        actorId: row.actor_id,
        action: row.action,
        subjectTable: row.subject_table,
        subjectId: row.subject_id,
        occurredAt: row.occurred_at,
        correlationId: rowCorrelationId,
      };
    });
}

export function readLifecycleEvent(
  db: MvpAOnboardingTraceabilityDatabase,
  request: MvpAOnboardingTransactionRequestRow,
  payload: MvpAOnboardingPayload,
): MvpAOnboardingLifecycleTrace | undefined {
  const rows = db
    .prepare(
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
          AND event_type = 'hire'
        ORDER BY occurred_at, id
      `,
    )
    .all(request.id, request.person_id)
    .map(assertLifecycleRow);

  if (rows.length > 1) {
    throwTraceError(
      "MVP-A onboarding trace requires a single lifecycle apply event",
    );
  }

  const row = rows[0];
  if (!row) return undefined;
  if (row.effective_date !== payload.effectiveDate) {
    throwTraceError(
      "MVP-A onboarding trace lifecycle evidence must match the persisted effective date",
    );
  }

  return {
    id: row.id,
    transactionRequestId: requireString(row.transaction_request_id),
    personId: row.person_id,
    eventType: row.event_type,
    effectiveDate: row.effective_date,
    occurredAt: row.occurred_at,
  };
}

export function readEmployment(
  db: MvpAOnboardingTraceabilityDatabase,
  request: MvpAOnboardingTransactionRequestRow,
  payload: MvpAOnboardingPayload,
): MvpAOnboardingEmploymentTrace | undefined {
  const rows = db
    .prepare(
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
          AND start_date = ?
        ORDER BY id
      `,
    )
    .all(
      payload.employment.id,
      request.person_id,
      payload.employment.employmentCode,
      payload.effectiveDate,
    )
    .map(assertEmploymentRow);

  if (rows.length > 1) {
    throwTraceError(
      "MVP-A onboarding trace requires a single employment status evidence record",
    );
  }

  const row = rows[0];
  if (!row) return undefined;

  return {
    id: row.id,
    employmentCode: row.employment_code,
    statusCode: row.status_code,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

export function readAssignment(
  db: MvpAOnboardingTraceabilityDatabase,
  request: MvpAOnboardingTransactionRequestRow,
  payload: MvpAOnboardingPayload,
  employment: MvpAOnboardingEmploymentTrace,
): MvpAOnboardingAssignmentTrace | undefined {
  const rows = db
    .prepare(
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
          AND start_date = ?
        ORDER BY id
      `,
    )
    .all(
      payload.assignment.id,
      request.person_id,
      employment.id,
      payload.assignment.assignmentCode,
      payload.assignment.departmentReference,
      payload.effectiveDate,
    )
    .map(assertAssignmentRow);

  if (rows.length > 1) {
    throwTraceError(
      "MVP-A onboarding trace requires a single assignment reference evidence record",
    );
  }

  const row = rows[0];
  if (!row) return undefined;

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

export function readApplyJobAttempts(
  db: MvpAOnboardingTraceabilityDatabase,
  request: MvpAOnboardingTransactionRequestRow,
): MvpAOnboardingApplyJobAttemptTrace[] {
  return db
    .prepare(
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
        ORDER BY attempted_at, id
      `,
    )
    .all(request.id, request.person_id)
    .map(assertApplyJobAttemptRow)
    .map((row) => ({
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

export function readWorkEmailWriteback(
  db: MvpAOnboardingTraceabilityDatabase,
  request: MvpAOnboardingTransactionRequestRow,
  payload: MvpAOnboardingPayload,
  correlationChain: MvpAOnboardingWritebackCorrelationChain | undefined,
): MvpAOnboardingWorkEmailWritebackTrace | undefined {
  if (correlationChain === undefined) return undefined;

  const expectedWritebackCorrelationId =
    correlationChain.writebackCorrelationId;
  const rows = db
    .prepare(
      `
        SELECT
          id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          provider_value,
          correlation_id
        FROM writeback_event
        WHERE correlation_id = ?
          AND person_id = ?
          AND contact_point_id = ?
          AND provider_value = ?
          AND target_contact_type = 'work_email'
        ORDER BY received_at, id
      `,
    )
    .all(
      expectedWritebackCorrelationId,
      request.person_id,
      payload.workEmailExpectation.contactPointId,
      payload.workEmailExpectation.value,
    )
    .map(assertWritebackRow);

  if (rows.length > 1) {
    throwTraceError(
      "MVP-A onboarding trace requires a single matching work_email writeback event",
    );
  }

  const row = rows[0];
  if (!row) return undefined;

  return {
    eventId: row.id,
    personId: row.person_id,
    contactPointId: row.contact_point_id,
    providerName: row.provider_name,
    providerSubjectId: row.provider_subject_id,
    providerValue: row.provider_value,
    correlationId: row.correlation_id,
  };
}

export function readProviderRefresh(
  db: MvpAOnboardingTraceabilityDatabase,
  writeback: MvpAOnboardingWorkEmailWritebackTrace,
  correlationChain: MvpAOnboardingWritebackCorrelationChain | undefined,
): MvpAOnboardingProviderRefreshTrace | undefined {
  if (correlationChain === undefined) return undefined;

  const row = db
    .prepare(
      `
        SELECT
          id,
          writeback_event_id,
          provider_subject_id,
          provider_value,
          refreshed_at,
          correlation_id
        FROM writeback_provider_refresh
        WHERE writeback_event_id = ?
          AND provider_subject_id = ?
          AND substr(correlation_id, 1, ?) = ?
        ORDER BY julianday(refreshed_at) DESC, refreshed_at DESC, id DESC
        LIMIT 1
      `,
    )
    .get(
      writeback.eventId,
      writeback.providerSubjectId,
      correlationChain.providerRefreshCorrelationPrefix.length,
      correlationChain.providerRefreshCorrelationPrefix,
    );
  if (!row) return undefined;
  const refreshRow = assertProviderRefreshRow(row);

  return {
    id: refreshRow.id,
    writebackEventId: refreshRow.writeback_event_id,
    providerSubjectId: refreshRow.provider_subject_id,
    providerValue: refreshRow.provider_value,
    refreshedAt: refreshRow.refreshed_at,
    correlationId: refreshRow.correlation_id,
  };
}

export function readWorkEmailProviderRefreshConflict(
  db: MvpAOnboardingTraceabilityDatabase,
  writeback: MvpAOnboardingWorkEmailWritebackTrace,
  correlationChain: MvpAOnboardingWritebackCorrelationChain | undefined,
): MvpAOnboardingWorkEmailConflictTrace | undefined {
  if (correlationChain === undefined) return undefined;

  const row = db
    .prepare(
      `
        SELECT
          id,
          writeback_event_id,
          conflict_type,
          current_contact_value,
          attempted_provider_value,
          detected_at,
          correlation_id
        FROM writeback_work_email_conflict
        WHERE writeback_event_id = ?
          AND conflict_type = 'provider_refresh_conflict'
          AND substr(correlation_id, 1, ?) = ?
          AND substr(correlation_id, -?) = ?
        ORDER BY julianday(detected_at) DESC,
          detected_at DESC,
          id DESC
        LIMIT 1
      `,
    )
    .get(
      writeback.eventId,
      correlationChain.providerRefreshCorrelationPrefix.length,
      correlationChain.providerRefreshCorrelationPrefix,
      correlationChain.providerRefreshConflictCorrelationSuffix.length,
      correlationChain.providerRefreshConflictCorrelationSuffix,
    );
  if (!row) return undefined;
  const conflictRow = assertConflictRow(row);

  return {
    id: conflictRow.id,
    writebackEventId: conflictRow.writeback_event_id,
    conflictType: conflictRow.conflict_type,
    currentContactValue: conflictRow.current_contact_value,
    attemptedProviderValue: conflictRow.attempted_provider_value,
    detectedAt: conflictRow.detected_at,
    correlationId: conflictRow.correlation_id,
  };
}

export function readInboundWorkEmailConflict(
  db: MvpAOnboardingTraceabilityDatabase,
  writeback: MvpAOnboardingWorkEmailWritebackTrace,
  correlationChain: MvpAOnboardingWritebackCorrelationChain | undefined,
): MvpAOnboardingWorkEmailConflictTrace | undefined {
  if (correlationChain === undefined) return undefined;

  const row = db
    .prepare(
      `
        SELECT
          id,
          writeback_event_id,
          conflict_type,
          current_contact_value,
          attempted_provider_value,
          detected_at,
          correlation_id
        FROM writeback_work_email_conflict
        WHERE writeback_event_id = ?
          AND conflict_type = 'inbound_value_conflict'
          AND correlation_id = ?
        ORDER BY detected_at DESC, id DESC
        LIMIT 1
      `,
    )
    .get(writeback.eventId, correlationChain.inboundConflictCorrelationId);
  if (!row) return undefined;
  const conflictRow = assertConflictRow(row);

  return {
    id: conflictRow.id,
    writebackEventId: conflictRow.writeback_event_id,
    conflictType: conflictRow.conflict_type,
    currentContactValue: conflictRow.current_contact_value,
    attemptedProviderValue: conflictRow.attempted_provider_value,
    detectedAt: conflictRow.detected_at,
    correlationId: conflictRow.correlation_id,
  };
}

export function readMvpAOnboardingCorrelationRequestOwnerActorId(
  db: MvpAOnboardingTraceabilityDatabase,
  input: { correlationId: string },
): string | undefined {
  const correlationId = requireNonEmptyCorrelationId(input.correlationId);
  const rows = db
    .prepare(
      `
        WITH candidate_request AS (
          SELECT transaction_request.id
          FROM transaction_request
          WHERE transaction_request.correlation_id = ?
          UNION
          SELECT audit_event.subject_id
          FROM audit_event
          WHERE audit_event.correlation_id = ?
            AND audit_event.subject_table = 'transaction_request'
            AND audit_event.action = 'mvp_a.onboarding.approve'
          UNION
          SELECT lifecycle_event.transaction_request_id
          FROM audit_event
          JOIN lifecycle_event
            ON lifecycle_event.id = audit_event.subject_id
          WHERE audit_event.correlation_id = ?
            AND audit_event.subject_table = 'lifecycle_event'
            AND audit_event.action = 'mvp_a.onboarding.apply'
            AND lifecycle_event.transaction_request_id IS NOT NULL
          UNION
          SELECT onboarding_apply_job_attempt.transaction_request_id
          FROM onboarding_apply_job_attempt
          WHERE onboarding_apply_job_attempt.correlation_id = ?
            AND onboarding_apply_job_attempt.status_code = 'applied'
        )
        SELECT DISTINCT audit_event.actor_id
        FROM audit_event
        WHERE audit_event.subject_table = 'transaction_request'
          AND audit_event.action = 'mvp_a.onboarding.approve'
          AND audit_event.subject_id IN (
            SELECT id
            FROM candidate_request
          )
      `,
    )
    .all(correlationId, correlationId, correlationId, correlationId)
    .map(assertRequestOwnerActorRow);

  if (rows.length !== 1) return undefined;
  return rows[0].actor_id;
}

function requireRootCorrelation(
  row: MvpAOnboardingTransactionRequestRow,
): MvpAOnboardingTransactionRequestRow {
  if (row.correlation_id === null) {
    throwTraceError(
      "MVP-A onboarding trace requires transaction_request root correlation evidence",
    );
  }

  return row;
}

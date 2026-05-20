type SqlValue = string | number | bigint | null;

export interface TraceabilitySqlStatement {
  get(...values: SqlValue[]): unknown;
  all(...values: SqlValue[]): unknown[];
}

export interface TraceabilityDatabase {
  prepare(sql: string): TraceabilitySqlStatement;
}

export interface VerifySyntheticP1R01CorrelationTraceInput {
  correlationId: string;
  requireLifecycle: boolean;
  requireFutureDateJob: boolean;
  requireWriteback: boolean;
  requiredAuditActions: string[];
}

export interface SyntheticP1R01TransactionTrace {
  id: string;
  personId: string;
  requestType: string;
  statusCode: string;
  correlationId: string;
}

export interface SyntheticP1R01LifecycleTrace {
  id: string;
  transactionRequestId: string;
  personId: string;
  eventType: string;
}

export interface SyntheticP1R01FutureDateApplyFailureTrace {
  jobId: string;
  transactionRequestId: string;
  lifecycleEventId: string;
  personId: string;
  correlationId: string;
  retryable: true;
}

export interface SyntheticP1R01WritebackTrace {
  eventId: string;
  personId: string;
  contactPointId: string;
  providerName: string;
  providerSubjectId: string;
  correlationId: string;
}

export interface SyntheticP1R01ProviderRefreshTrace {
  id: string;
  writebackEventId: string;
  correlationId: string;
}

export interface SyntheticP1R01WritebackConflictTrace {
  id: string;
  writebackEventId: string;
  conflictType: string;
  correlationId: string;
}

export interface SyntheticP1R01WritebackResolutionTrace {
  id: string;
  conflictId: string;
  writebackEventId: string;
  correlationId: string;
}

export interface SyntheticP1R01AuditTrace {
  id: string;
  action: string;
  subjectTable: string;
  subjectId: string;
  correlationId: string;
}

export interface SyntheticP1R01CorrelationTrace {
  transactionRequest: SyntheticP1R01TransactionTrace;
  lifecycleEvents: SyntheticP1R01LifecycleTrace[];
  futureDateApplyFailures: SyntheticP1R01FutureDateApplyFailureTrace[];
  writebackEvents: SyntheticP1R01WritebackTrace[];
  providerRefreshes: SyntheticP1R01ProviderRefreshTrace[];
  writebackConflicts: SyntheticP1R01WritebackConflictTrace[];
  writebackResolutions: SyntheticP1R01WritebackResolutionTrace[];
  auditEvents: SyntheticP1R01AuditTrace[];
  remainingRisk: string[];
}

export function verifySyntheticP1R01CorrelationTrace(
  db: TraceabilityDatabase,
  input: VerifySyntheticP1R01CorrelationTraceInput,
): SyntheticP1R01CorrelationTrace {
  const correlationId = requireNonEmptyCorrelationId(input.correlationId);
  const transactionRequest = readTransactionRequest(db, correlationId);
  const lifecycleEvents = readLifecycleEvents(db, transactionRequest);
  const futureDateApplyFailures = readFutureDateApplyFailures(
    db,
    correlationId,
    transactionRequest,
  );
  const writebackEvents = readWritebackEvents(
    db,
    correlationId,
    transactionRequest,
  );
  const providerRefreshes = readProviderRefreshes(
    db,
    correlationId,
    writebackEvents,
  );
  const writebackConflicts = readWritebackConflicts(
    db,
    correlationId,
    writebackEvents,
  );
  const writebackResolutions = readWritebackResolutions(
    db,
    correlationId,
    writebackEvents,
    writebackConflicts,
  );
  const auditEvents = readAuditEvents(db, correlationId);

  if (input.requireLifecycle && lifecycleEvents.length === 0) {
    throw new Error(
      "EPIC-P1-R01 trace requires lifecycle evidence linked to the correlated transaction request",
    );
  }

  if (input.requireFutureDateJob && futureDateApplyFailures.length === 0) {
    throw new Error(
      "EPIC-P1-R01 trace requires future-date retry job evidence for the correlated transaction request",
    );
  }

  if (input.requireWriteback && writebackEvents.length === 0) {
    throw new Error(
      "EPIC-P1-R01 trace requires writeback evidence for the correlation id",
    );
  }

  validateRequiredAuditActions({
    requiredAuditActions: input.requiredAuditActions,
    auditEvents,
    transactionRequest,
    lifecycleEvents,
    futureDateApplyFailures,
  });

  return {
    transactionRequest,
    lifecycleEvents,
    futureDateApplyFailures,
    writebackEvents,
    providerRefreshes,
    writebackConflicts,
    writebackResolutions,
    auditEvents,
    remainingRisk: [
      "PoC traceability is limited to synthetic SQLite evidence and mock Okta/writeback surfaces.",
      "Production audit immutability, WORM/object-lock storage, RBAC, raw payload access, CSV export, legal/two-key acceptance, and real provider integration remain out of scope.",
    ],
  };
}

function requireNonEmptyCorrelationId(correlationId: string): string {
  if (correlationId.trim().length === 0) {
    throw new Error("EPIC-P1-R01 trace requires a non-empty correlation id");
  }

  return correlationId;
}

function readTransactionRequest(
  db: TraceabilityDatabase,
  correlationId: string,
): SyntheticP1R01TransactionTrace {
  const rows = db
    .prepare(
      `
        SELECT
          id,
          person_id,
          request_type,
          status_code,
          correlation_id
        FROM transaction_request
        WHERE correlation_id = ?
      `,
    )
    .all(correlationId)
    .map(assertTransactionRow);

  if (rows.length !== 1) {
    throw new Error(
      "EPIC-P1-R01 trace requires exactly one transaction_request for the correlation id",
    );
  }

  return rows[0];
}

function readLifecycleEvents(
  db: TraceabilityDatabase,
  transactionRequest: SyntheticP1R01TransactionTrace,
): SyntheticP1R01LifecycleTrace[] {
  return db
    .prepare(
      `
        SELECT
          id,
          transaction_request_id,
          person_id,
          event_type
        FROM lifecycle_event
        WHERE transaction_request_id = ?
          AND person_id = ?
        ORDER BY occurred_at, id
      `,
    )
    .all(transactionRequest.id, transactionRequest.personId)
    .map(assertLifecycleRow);
}

function readFutureDateApplyFailures(
  db: TraceabilityDatabase,
  correlationId: string,
  transactionRequest: SyntheticP1R01TransactionTrace,
): SyntheticP1R01FutureDateApplyFailureTrace[] {
  if (!tableExists(db, "synthetic_future_date_apply_failure_evidence")) {
    return [];
  }

  const rows = db
    .prepare(
      `
        SELECT
          job_id,
          transaction_request_id,
          lifecycle_event_id,
          person_id,
          correlation_id,
          retryable
        FROM synthetic_future_date_apply_failure_evidence
        WHERE correlation_id = ?
        ORDER BY observed_at, job_id
      `,
    )
    .all(correlationId)
    .map(assertFutureDateApplyFailureRow);

  for (const row of rows) {
    if (
      row.transactionRequestId !== transactionRequest.id ||
      row.personId !== transactionRequest.personId
    ) {
      throw new Error(
        "EPIC-P1-R01 trace future-date job evidence must match the correlated transaction request",
      );
    }
  }

  return rows;
}

function readWritebackEvents(
  db: TraceabilityDatabase,
  correlationId: string,
  transactionRequest: SyntheticP1R01TransactionTrace,
): SyntheticP1R01WritebackTrace[] {
  const rows = db
    .prepare(
      `
        SELECT
          id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          correlation_id
        FROM writeback_event
        WHERE correlation_id = ?
        ORDER BY received_at, id
      `,
    )
    .all(correlationId)
    .map(assertWritebackRow);

  for (const row of rows) {
    if (row.personId !== transactionRequest.personId) {
      throw new Error(
        "EPIC-P1-R01 trace writeback evidence must match the correlated transaction person",
      );
    }
  }

  return rows;
}

function readProviderRefreshes(
  db: TraceabilityDatabase,
  correlationId: string,
  writebackEvents: SyntheticP1R01WritebackTrace[],
): SyntheticP1R01ProviderRefreshTrace[] {
  const writebackEventIds = writebackEvents.map((event) => event.eventId);
  if (writebackEventIds.length === 0) {
    return [];
  }

  return db
    .prepare(
      `
        SELECT id, writeback_event_id, correlation_id
        FROM writeback_provider_refresh
        WHERE writeback_event_id IN (${sqlPlaceholders(writebackEventIds)})
          AND (
            correlation_id = ?
            OR correlation_id LIKE ? ESCAPE '\\'
          )
        ORDER BY refreshed_at, id
      `,
    )
    .all(
      ...writebackEventIds,
      correlationId,
      correlationPrefixPattern(correlationId),
    )
    .map(assertProviderRefreshRow);
}

function readWritebackConflicts(
  db: TraceabilityDatabase,
  correlationId: string,
  writebackEvents: SyntheticP1R01WritebackTrace[],
): SyntheticP1R01WritebackConflictTrace[] {
  const writebackEventIds = writebackEvents.map((event) => event.eventId);
  if (writebackEventIds.length === 0) {
    return [];
  }

  return db
    .prepare(
      `
        SELECT id, writeback_event_id, conflict_type, correlation_id
        FROM writeback_work_email_conflict
        WHERE writeback_event_id IN (${sqlPlaceholders(writebackEventIds)})
          AND (
            correlation_id = ?
            OR correlation_id LIKE ? ESCAPE '\\'
          )
        ORDER BY detected_at, id
      `,
    )
    .all(
      ...writebackEventIds,
      correlationId,
      correlationPrefixPattern(correlationId),
    )
    .map(assertWritebackConflictRow);
}

function readWritebackResolutions(
  db: TraceabilityDatabase,
  correlationId: string,
  writebackEvents: SyntheticP1R01WritebackTrace[],
  writebackConflicts: SyntheticP1R01WritebackConflictTrace[],
): SyntheticP1R01WritebackResolutionTrace[] {
  const writebackEventIds = writebackEvents.map((event) => event.eventId);
  if (writebackEventIds.length === 0) {
    return [];
  }

  const rows = db
    .prepare(
      `
        SELECT id, conflict_id, writeback_event_id, correlation_id
        FROM writeback_work_email_conflict_resolution
        WHERE writeback_event_id IN (${sqlPlaceholders(writebackEventIds)})
          AND (
            correlation_id = ?
            OR correlation_id LIKE ? ESCAPE '\\'
          )
        ORDER BY decided_at, id
      `,
    )
    .all(
      ...writebackEventIds,
      correlationId,
      correlationPrefixPattern(correlationId),
    )
    .map(assertWritebackResolutionRow);

  const conflictIds = new Set(
    writebackConflicts.map((conflict) => conflict.id),
  );
  for (const row of rows) {
    if (!conflictIds.has(row.conflictId)) {
      throw new Error(
        "EPIC-P1-R01 trace writeback resolution evidence must match a traced writeback conflict",
      );
    }
  }

  return rows;
}

function readAuditEvents(
  db: TraceabilityDatabase,
  correlationId: string,
): SyntheticP1R01AuditTrace[] {
  return db
    .prepare(
      `
        SELECT id, action, subject_table, subject_id, correlation_id
        FROM audit_event
        WHERE correlation_id = ?
        ORDER BY occurred_at, id
      `,
    )
    .all(correlationId)
    .map(assertAuditRow);
}

function tableExists(db: TraceabilityDatabase, tableName: string): boolean {
  const row = db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
      `,
    )
    .get(tableName);

  return isRecord(row) && row.name === tableName;
}

function sqlPlaceholders(values: readonly SqlValue[]): string {
  return values.map(() => "?").join(", ");
}

function correlationPrefixPattern(correlationId: string): string {
  return `${escapeSqlLikePattern(correlationId)}:%`;
}

function escapeSqlLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function validateRequiredAuditActions(input: {
  requiredAuditActions: string[];
  auditEvents: SyntheticP1R01AuditTrace[];
  transactionRequest: SyntheticP1R01TransactionTrace;
  lifecycleEvents: SyntheticP1R01LifecycleTrace[];
  futureDateApplyFailures: SyntheticP1R01FutureDateApplyFailureTrace[];
}): void {
  for (const action of input.requiredAuditActions) {
    const subjects = linkedAuditSubjectsForAction(action, input);
    if (subjects.length === 0) {
      throw new Error(
        `EPIC-P1-R01 trace requires linked subject evidence for audit action ${action}`,
      );
    }

    if (
      !input.auditEvents.some(
        (event) =>
          event.action === action &&
          subjects.some(
            (subject) =>
              event.subjectTable === subject.subjectTable &&
              event.subjectId === subject.subjectId,
          ),
      )
    ) {
      throw new Error(
        `EPIC-P1-R01 trace requires audit action ${action} linked to traced evidence`,
      );
    }
  }
}

function linkedAuditSubjectsForAction(
  action: string,
  trace: {
    transactionRequest: SyntheticP1R01TransactionTrace;
    lifecycleEvents: SyntheticP1R01LifecycleTrace[];
    futureDateApplyFailures: SyntheticP1R01FutureDateApplyFailureTrace[];
  },
): { subjectTable: string; subjectId: string }[] {
  if (action === "poc.synthetic_hire.request_submitted") {
    return [
      {
        subjectTable: "transaction_request",
        subjectId: trace.transactionRequest.id,
      },
    ];
  }

  if (action === "poc.synthetic_hire.future_date_apply_failed") {
    return trace.futureDateApplyFailures.map((failure) => ({
      subjectTable: "transaction_request",
      subjectId: failure.transactionRequestId,
    }));
  }

  if (action === "poc.synthetic_hire.lifecycle_applied") {
    return trace.lifecycleEvents.map((event) => ({
      subjectTable: "lifecycle_event",
      subjectId: event.id,
    }));
  }

  return [];
}

function assertTransactionRow(row: unknown): SyntheticP1R01TransactionTrace {
  if (
    !isRecord(row) ||
    !isString(row.id) ||
    !isString(row.person_id) ||
    !isString(row.request_type) ||
    !isString(row.status_code) ||
    !isString(row.correlation_id)
  ) {
    throw new Error("EPIC-P1-R01 trace read malformed transaction_request");
  }

  return {
    id: row.id,
    personId: row.person_id,
    requestType: row.request_type,
    statusCode: row.status_code,
    correlationId: row.correlation_id,
  };
}

function assertLifecycleRow(row: unknown): SyntheticP1R01LifecycleTrace {
  if (
    !isRecord(row) ||
    !isString(row.id) ||
    !isString(row.transaction_request_id) ||
    !isString(row.person_id) ||
    !isString(row.event_type)
  ) {
    throw new Error("EPIC-P1-R01 trace read malformed lifecycle_event");
  }

  return {
    id: row.id,
    transactionRequestId: row.transaction_request_id,
    personId: row.person_id,
    eventType: row.event_type,
  };
}

function assertFutureDateApplyFailureRow(
  row: unknown,
): SyntheticP1R01FutureDateApplyFailureTrace {
  if (
    !isRecord(row) ||
    !isString(row.job_id) ||
    !isString(row.transaction_request_id) ||
    !isString(row.lifecycle_event_id) ||
    !isString(row.person_id) ||
    !isString(row.correlation_id) ||
    row.retryable !== 1
  ) {
    throw new Error(
      "EPIC-P1-R01 trace read malformed future-date failure evidence",
    );
  }

  return {
    jobId: row.job_id,
    transactionRequestId: row.transaction_request_id,
    lifecycleEventId: row.lifecycle_event_id,
    personId: row.person_id,
    correlationId: row.correlation_id,
    retryable: true,
  };
}

function assertWritebackRow(row: unknown): SyntheticP1R01WritebackTrace {
  if (
    !isRecord(row) ||
    !isString(row.id) ||
    !isString(row.person_id) ||
    !isString(row.contact_point_id) ||
    !isString(row.provider_name) ||
    !isString(row.provider_subject_id) ||
    !isString(row.correlation_id)
  ) {
    throw new Error("EPIC-P1-R01 trace read malformed writeback_event");
  }

  return {
    eventId: row.id,
    personId: row.person_id,
    contactPointId: row.contact_point_id,
    providerName: row.provider_name,
    providerSubjectId: row.provider_subject_id,
    correlationId: row.correlation_id,
  };
}

function assertProviderRefreshRow(
  row: unknown,
): SyntheticP1R01ProviderRefreshTrace {
  if (
    !isRecord(row) ||
    !isString(row.id) ||
    !isString(row.writeback_event_id) ||
    !isString(row.correlation_id)
  ) {
    throw new Error(
      "EPIC-P1-R01 trace read malformed writeback_provider_refresh",
    );
  }

  return {
    id: row.id,
    writebackEventId: row.writeback_event_id,
    correlationId: row.correlation_id,
  };
}

function assertWritebackConflictRow(
  row: unknown,
): SyntheticP1R01WritebackConflictTrace {
  if (
    !isRecord(row) ||
    !isString(row.id) ||
    !isString(row.writeback_event_id) ||
    !isString(row.conflict_type) ||
    !isString(row.correlation_id)
  ) {
    throw new Error(
      "EPIC-P1-R01 trace read malformed writeback_work_email_conflict",
    );
  }

  return {
    id: row.id,
    writebackEventId: row.writeback_event_id,
    conflictType: row.conflict_type,
    correlationId: row.correlation_id,
  };
}

function assertWritebackResolutionRow(
  row: unknown,
): SyntheticP1R01WritebackResolutionTrace {
  if (
    !isRecord(row) ||
    !isString(row.id) ||
    !isString(row.conflict_id) ||
    !isString(row.writeback_event_id) ||
    !isString(row.correlation_id)
  ) {
    throw new Error(
      "EPIC-P1-R01 trace read malformed writeback_work_email_conflict_resolution",
    );
  }

  return {
    id: row.id,
    conflictId: row.conflict_id,
    writebackEventId: row.writeback_event_id,
    correlationId: row.correlation_id,
  };
}

function assertAuditRow(row: unknown): SyntheticP1R01AuditTrace {
  if (
    !isRecord(row) ||
    !isString(row.id) ||
    !isString(row.action) ||
    !isString(row.subject_table) ||
    !isString(row.subject_id) ||
    !isString(row.correlation_id)
  ) {
    throw new Error("EPIC-P1-R01 trace read malformed audit_event");
  }

  return {
    id: row.id,
    action: row.action,
    subjectTable: row.subject_table,
    subjectId: row.subject_id,
    correlationId: row.correlation_id,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

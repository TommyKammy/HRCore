type SqlValue = string | number | bigint | null;

export interface MvpAOnboardingTraceabilitySqlStatement {
  get(...values: SqlValue[]): unknown;
  all(...values: SqlValue[]): unknown[];
}

export interface MvpAOnboardingTraceabilityDatabase {
  prepare(sql: string): MvpAOnboardingTraceabilitySqlStatement;
}

export interface VerifyMvpAOnboardingCorrelationTraceInput {
  correlationId: string;
  requireApproval: boolean;
  requireApply: boolean;
  requireWriteback: boolean;
  requireProviderRefresh: boolean;
}

export interface MvpAOnboardingTransactionTrace {
  id: string;
  personId: string;
  requestType: string;
  statusCode: string;
  correlationId: string;
}

export interface MvpAOnboardingLifecycleTrace {
  id: string;
  transactionRequestId: string;
  personId: string;
  eventType: string;
  effectiveDate: string;
  occurredAt: string;
}

export interface MvpAOnboardingAuditTrace {
  id: string;
  actorId: string;
  action: string;
  subjectTable: string;
  subjectId: string;
  occurredAt: string;
  correlationId: string;
}

export interface MvpAOnboardingApplyJobAttemptTrace {
  id: string;
  transactionRequestId: string;
  personId: string;
  statusCode: string;
  attemptedAt: string;
  workerId: string;
  correlationId: string;
  retryable: boolean;
  errorMessage: string | null;
}

export interface MvpAOnboardingWorkEmailWritebackTrace {
  eventId: string;
  personId: string;
  contactPointId: string;
  providerName: string;
  providerSubjectId: string;
  providerValue: string;
  correlationId: string;
}

export interface MvpAOnboardingProviderRefreshTrace {
  id: string;
  writebackEventId: string;
  providerSubjectId: string;
  providerValue: string;
  refreshedAt: string;
  correlationId: string;
}

export interface MvpAOnboardingWorkEmailConflictTrace {
  id: string;
  writebackEventId: string;
  conflictType: string;
  currentContactValue: string;
  attemptedProviderValue: string;
  detectedAt: string;
  correlationId: string;
}

export interface MvpAOnboardingCorrelationTrace {
  transactionRequest: MvpAOnboardingTransactionTrace;
  approvalAuditEvent?: MvpAOnboardingAuditTrace;
  applyAuditEvent?: MvpAOnboardingAuditTrace;
  auditEvents: MvpAOnboardingAuditTrace[];
  lifecycleEvent?: MvpAOnboardingLifecycleTrace;
  applyJobAttempts: MvpAOnboardingApplyJobAttemptTrace[];
  workEmailWriteback?: MvpAOnboardingWorkEmailWritebackTrace;
  providerRefresh?: MvpAOnboardingProviderRefreshTrace;
  workEmailConflict?: MvpAOnboardingWorkEmailConflictTrace;
  remainingP2A02Gates: string[];
}

type TransactionRequestRow = {
  id: string;
  person_id: string;
  request_type: string;
  status_code: string;
  correlation_id: string | null;
  payload_version: string | null;
  payload_json: string | null;
};

type Payload = {
  effectiveDate: string;
  employment: { employmentCode: string };
  workEmailExpectation: { contactPointId: string; value: string };
};

type WritebackCorrelationChain = {
  writebackCorrelationId: string;
  providerRefreshCorrelationPrefix: string;
  providerRefreshConflictCorrelationSuffix: string;
  inboundConflictCorrelationId: string;
};

type AuditRow = {
  id: string;
  actor_id: string;
  action: string;
  subject_table: string;
  subject_id: string;
  occurred_at: string;
  correlation_id: string | null;
};

type LifecycleRow = {
  id: string;
  transaction_request_id: string | null;
  person_id: string;
  event_type: string;
  effective_date: string;
  occurred_at: string;
};

type ApplyJobAttemptRow = {
  id: string;
  transaction_request_id: string;
  person_id: string;
  status_code: string;
  attempted_at: string;
  worker_id: string;
  correlation_id: string;
  retryable: number;
  error_message: string | null;
};

type WritebackRow = {
  id: string;
  person_id: string;
  contact_point_id: string;
  provider_name: string;
  provider_subject_id: string;
  provider_value: string;
  correlation_id: string;
};

type ProviderRefreshRow = {
  id: string;
  writeback_event_id: string;
  provider_subject_id: string;
  provider_value: string;
  refreshed_at: string;
  correlation_id: string;
};

type ConflictRow = {
  id: string;
  writeback_event_id: string;
  conflict_type: string;
  current_contact_value: string;
  attempted_provider_value: string;
  detected_at: string;
  correlation_id: string;
};

const remainingP2A02Gates = [
  "WORM / S3 Object Lock audit immutability and archive evidence",
  "broad audit search UI for production support and review",
  "backup / restore rehearsal with snapshot-consistent trace reads",
  "field-level RBAC and data-scope enforcement for onboarding evidence",
  "export controls for raw payloads, CSV output, download logs, and watermark or manifest traceability",
  "real Okta tenant credentials, tenant binding, webhook custody, and provider audit search",
];

export function verifyMvpAOnboardingCorrelationTrace(
  db: MvpAOnboardingTraceabilityDatabase,
  input: VerifyMvpAOnboardingCorrelationTraceInput,
): MvpAOnboardingCorrelationTrace {
  const correlationId = requireNonEmptyCorrelationId(input.correlationId);
  const request = readTransactionRequest(db, correlationId);
  const payload = parsePayload(request);
  const applyJobAttempts = readApplyJobAttempts(db, request);
  const auditEvents = readAuditEvents(
    db,
    request,
    correlationId,
    applyJobAttempts,
  );
  const approvalAuditEvent = auditEvents.find(
    (event) => event.action === "mvp_a.onboarding.approve",
  );
  const applyAuditEvent = auditEvents.find(
    (event) => event.action === "mvp_a.onboarding.apply",
  );
  const lifecycleEvent = readLifecycleEvent(db, request, payload);

  if (input.requireApproval && approvalAuditEvent === undefined) {
    throw new Error(
      "MVP-A onboarding trace requires approval audit evidence for the root correlation id",
    );
  }
  if (input.requireApply && lifecycleEvent === undefined) {
    throw new Error(
      "MVP-A onboarding trace requires lifecycle apply evidence linked to the correlated transaction request",
    );
  }
  if (input.requireApply && applyAuditEvent === undefined) {
    throw new Error(
      "MVP-A onboarding trace requires apply audit evidence for the root correlation id",
    );
  }

  const writebackCorrelationChain = buildWritebackCorrelationChain(
    payload,
    readApplyEvidenceTimestamp(lifecycleEvent, applyAuditEvent),
  );
  const workEmailWriteback = readWorkEmailWriteback(
    db,
    request,
    payload,
    writebackCorrelationChain,
  );
  const providerRefresh = workEmailWriteback
    ? readProviderRefresh(db, workEmailWriteback, writebackCorrelationChain)
    : undefined;
  const providerRefreshConflict = workEmailWriteback
    ? readWorkEmailProviderRefreshConflict(
        db,
        workEmailWriteback,
        writebackCorrelationChain,
      )
    : undefined;
  const inboundWorkEmailConflict = workEmailWriteback
    ? readInboundWorkEmailConflict(
        db,
        workEmailWriteback,
        writebackCorrelationChain,
      )
    : undefined;
  const workEmailConflict = providerRefreshConflict ?? inboundWorkEmailConflict;

  if (input.requireWriteback && workEmailWriteback === undefined) {
    throw new Error(
      "MVP-A onboarding trace requires work_email writeback evidence linked to the correlated onboarding payload",
    );
  }
  if (
    input.requireProviderRefresh &&
    providerRefresh === undefined &&
    providerRefreshConflict === undefined
  ) {
    throw new Error(
      "MVP-A onboarding trace requires provider refresh or conflict evidence linked to the writeback event",
    );
  }

  return {
    transactionRequest: mapTransactionRequest(request, correlationId),
    approvalAuditEvent,
    applyAuditEvent,
    auditEvents,
    lifecycleEvent,
    applyJobAttempts,
    workEmailWriteback,
    providerRefresh,
    workEmailConflict,
    remainingP2A02Gates: [...remainingP2A02Gates],
  };
}

function readApplyEvidenceTimestamp(
  lifecycleEvent: MvpAOnboardingLifecycleTrace | undefined,
  applyAuditEvent: MvpAOnboardingAuditTrace | undefined,
): string | undefined {
  if (
    lifecycleEvent !== undefined &&
    applyAuditEvent !== undefined &&
    lifecycleEvent.occurredAt !== applyAuditEvent.occurredAt
  ) {
    throw new Error(
      "MVP-A onboarding trace requires consistent apply timestamps before selecting writeback evidence",
    );
  }

  return lifecycleEvent?.occurredAt ?? applyAuditEvent?.occurredAt;
}

function buildWritebackCorrelationChain(
  payload: Payload,
  applyTimestamp: string | undefined,
): WritebackCorrelationChain | undefined {
  if (applyTimestamp === undefined) return undefined;

  const writebackCorrelationId = [
    "okta",
    "mock",
    "work_email_writeback",
    "create",
    encodeMvpAOnboardingWorkEmailIdentityPart(
      payload.employment.employmentCode,
    ),
    encodeMvpAOnboardingWorkEmailIdentityPart(applyTimestamp),
  ].join(":");

  return {
    writebackCorrelationId,
    providerRefreshCorrelationPrefix: `${writebackCorrelationId}:provider_refresh:`,
    providerRefreshConflictCorrelationSuffix:
      ":conflict:provider_refresh_conflict",
    inboundConflictCorrelationId: `${writebackCorrelationId}:conflict:inbound_value_conflict`,
  };
}

function requireNonEmptyCorrelationId(correlationId: string): string {
  if (correlationId.trim().length === 0) {
    throw new Error(
      "MVP-A onboarding trace requires a non-empty correlation id",
    );
  }

  return correlationId;
}

function readTransactionRequest(
  db: MvpAOnboardingTraceabilityDatabase,
  correlationId: string,
): TransactionRequestRow {
  const rows = db
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

  if (rows.length !== 1) {
    throw new Error(
      "MVP-A onboarding trace requires exactly one transaction_request for the root correlation id",
    );
  }

  return rows[0];
}

function parsePayload(row: TransactionRequestRow): Payload {
  if (
    row.request_type !== "hire" ||
    row.payload_version !== "mvp_a_onboarding_v1" ||
    row.payload_json === null
  ) {
    throw new Error(
      "MVP-A onboarding trace requires a persisted MVP-A hire payload",
    );
  }

  const parsed = JSON.parse(row.payload_json) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("MVP-A onboarding trace payload is malformed");
  }

  const employment = isRecord(parsed.employment) ? parsed.employment : {};
  const workEmailExpectation = isRecord(parsed.workEmailExpectation)
    ? parsed.workEmailExpectation
    : {};
  if (
    typeof parsed.effectiveDate !== "string" ||
    typeof employment.employmentCode !== "string" ||
    typeof workEmailExpectation.contactPointId !== "string" ||
    typeof workEmailExpectation.value !== "string"
  ) {
    throw new Error("MVP-A onboarding trace payload is malformed");
  }

  return {
    effectiveDate: parsed.effectiveDate,
    employment: { employmentCode: employment.employmentCode },
    workEmailExpectation: {
      contactPointId: workEmailExpectation.contactPointId,
      value: workEmailExpectation.value,
    },
  };
}

function readAuditEvents(
  db: MvpAOnboardingTraceabilityDatabase,
  request: TransactionRequestRow,
  correlationId: string,
  applyJobAttempts: MvpAOnboardingApplyJobAttemptTrace[],
): MvpAOnboardingAuditTrace[] {
  const applyAuditCorrelationIds = uniqueStrings([
    correlationId,
    ...applyJobAttempts
      .filter((attempt) => attempt.statusCode === "applied")
      .map((attempt) => attempt.correlationId),
  ]);
  const applyAuditCorrelationPlaceholders = applyAuditCorrelationIds
    .map(() => "?")
    .join(", ");
  const acceptedApplyAuditCorrelationIds = new Set(applyAuditCorrelationIds);

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
            correlation_id = ?
            AND subject_table = 'transaction_request'
            AND subject_id = ?
          )
          OR (
            correlation_id IN (${applyAuditCorrelationPlaceholders})
            AND subject_table = 'lifecycle_event'
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
    .all(
      correlationId,
      request.id,
      ...applyAuditCorrelationIds,
      request.id,
      request.person_id,
    )
    .map(assertAuditRow)
    .map((row) => {
      const rowCorrelationId = row.correlation_id;
      if (rowCorrelationId === null) {
        throw new Error(
          "MVP-A onboarding trace audit evidence must include a correlation id",
        );
      }
      if (
        row.subject_table === "transaction_request" &&
        rowCorrelationId !== correlationId
      ) {
        throw new Error(
          "MVP-A onboarding trace approval audit evidence must share the root correlation id",
        );
      }
      if (
        row.subject_table === "lifecycle_event" &&
        !acceptedApplyAuditCorrelationIds.has(rowCorrelationId)
      ) {
        throw new Error(
          "MVP-A onboarding trace apply audit evidence must share the root or applied worker attempt correlation id",
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function readLifecycleEvent(
  db: MvpAOnboardingTraceabilityDatabase,
  request: TransactionRequestRow,
  payload: Payload,
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
    throw new Error(
      "MVP-A onboarding trace requires a single lifecycle apply event",
    );
  }

  const row = rows[0];
  if (!row) return undefined;
  if (row.effective_date !== payload.effectiveDate) {
    throw new Error(
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

function readApplyJobAttempts(
  db: MvpAOnboardingTraceabilityDatabase,
  request: TransactionRequestRow,
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

function readWorkEmailWriteback(
  db: MvpAOnboardingTraceabilityDatabase,
  request: TransactionRequestRow,
  payload: Payload,
  correlationChain: WritebackCorrelationChain | undefined,
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
    throw new Error(
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

function readProviderRefresh(
  db: MvpAOnboardingTraceabilityDatabase,
  writeback: MvpAOnboardingWorkEmailWritebackTrace,
  correlationChain: WritebackCorrelationChain | undefined,
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
        ORDER BY refreshed_at DESC, id DESC
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

function readWorkEmailProviderRefreshConflict(
  db: MvpAOnboardingTraceabilityDatabase,
  writeback: MvpAOnboardingWorkEmailWritebackTrace,
  correlationChain: WritebackCorrelationChain | undefined,
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
        ORDER BY detected_at DESC,
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

function readInboundWorkEmailConflict(
  db: MvpAOnboardingTraceabilityDatabase,
  writeback: MvpAOnboardingWorkEmailWritebackTrace,
  correlationChain: WritebackCorrelationChain | undefined,
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

function encodeMvpAOnboardingWorkEmailIdentityPart(value: string): string {
  return encodeURIComponent(value);
}

function mapTransactionRequest(
  row: TransactionRequestRow,
  correlationId: string,
): MvpAOnboardingTransactionTrace {
  return {
    id: row.id,
    personId: row.person_id,
    requestType: row.request_type,
    statusCode: row.status_code,
    correlationId,
  };
}

function assertTransactionRequestRow(row: unknown): TransactionRequestRow {
  if (!isRecord(row)) throw new Error("transaction_request row is malformed");
  return {
    id: requireString(row.id),
    person_id: requireString(row.person_id),
    request_type: requireString(row.request_type),
    status_code: requireString(row.status_code),
    correlation_id: requireNullableString(row.correlation_id),
    payload_version: requireNullableString(row.payload_version),
    payload_json: requireNullableString(row.payload_json),
  };
}

function assertAuditRow(row: unknown): AuditRow {
  if (!isRecord(row)) throw new Error("audit_event row is malformed");
  return {
    id: requireString(row.id),
    actor_id: requireString(row.actor_id),
    action: requireString(row.action),
    subject_table: requireString(row.subject_table),
    subject_id: requireString(row.subject_id),
    occurred_at: requireString(row.occurred_at),
    correlation_id: requireNullableString(row.correlation_id),
  };
}

function assertLifecycleRow(row: unknown): LifecycleRow {
  if (!isRecord(row)) throw new Error("lifecycle_event row is malformed");
  return {
    id: requireString(row.id),
    transaction_request_id: requireNullableString(row.transaction_request_id),
    person_id: requireString(row.person_id),
    event_type: requireString(row.event_type),
    effective_date: requireString(row.effective_date),
    occurred_at: requireString(row.occurred_at),
  };
}

function assertApplyJobAttemptRow(row: unknown): ApplyJobAttemptRow {
  if (!isRecord(row)) {
    throw new Error("onboarding_apply_job_attempt row is malformed");
  }
  return {
    id: requireString(row.id),
    transaction_request_id: requireString(row.transaction_request_id),
    person_id: requireString(row.person_id),
    status_code: requireString(row.status_code),
    attempted_at: requireString(row.attempted_at),
    worker_id: requireString(row.worker_id),
    correlation_id: requireString(row.correlation_id),
    retryable: requireNumber(row.retryable),
    error_message: requireNullableString(row.error_message),
  };
}

function assertWritebackRow(row: unknown): WritebackRow {
  if (!isRecord(row)) throw new Error("writeback_event row is malformed");
  return {
    id: requireString(row.id),
    person_id: requireString(row.person_id),
    contact_point_id: requireString(row.contact_point_id),
    provider_name: requireString(row.provider_name),
    provider_subject_id: requireString(row.provider_subject_id),
    provider_value: requireString(row.provider_value),
    correlation_id: requireString(row.correlation_id),
  };
}

function assertProviderRefreshRow(row: unknown): ProviderRefreshRow {
  if (!isRecord(row)) {
    throw new Error("writeback_provider_refresh row is malformed");
  }
  return {
    id: requireString(row.id),
    writeback_event_id: requireString(row.writeback_event_id),
    provider_subject_id: requireString(row.provider_subject_id),
    provider_value: requireString(row.provider_value),
    refreshed_at: requireString(row.refreshed_at),
    correlation_id: requireString(row.correlation_id),
  };
}

function assertConflictRow(row: unknown): ConflictRow {
  if (!isRecord(row)) {
    throw new Error("writeback_work_email_conflict row is malformed");
  }
  return {
    id: requireString(row.id),
    writeback_event_id: requireString(row.writeback_event_id),
    conflict_type: requireString(row.conflict_type),
    current_contact_value: requireString(row.current_contact_value),
    attempted_provider_value: requireString(row.attempted_provider_value),
    detected_at: requireString(row.detected_at),
    correlation_id: requireString(row.correlation_id),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("MVP-A onboarding trace encountered malformed evidence");
  }

  return value;
}

function requireNullableString(value: unknown): string | null {
  if (value === null) return value;
  return requireString(value);
}

function requireNumber(value: unknown): number {
  if (typeof value !== "number") {
    throw new Error("MVP-A onboarding trace encountered malformed evidence");
  }

  return value;
}

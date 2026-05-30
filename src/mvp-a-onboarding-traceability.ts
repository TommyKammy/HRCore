import {
  assertMvpAOnboardingEvidenceAuthorizationGate,
  mvpAOnboardingEvidenceAuthorizationGate,
  type MvpAOnboardingEvidenceAuthorizationGate,
} from "./mvp-a-onboarding-evidence-authorization.js";
import {
  assertMvpAOnboardingBindingGateEvidence,
  mvpAOnboardingBindingGate,
  type MvpAOnboardingBindingGate,
} from "./mvp-a-onboarding-binding-gate.js";

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

export class MvpAOnboardingCorrelationTraceError extends Error {
  override name = "MvpAOnboardingCorrelationTraceError";
}

export interface MvpAOnboardingTransactionTrace {
  id: string;
  personId: string;
  requestType: string;
  statusCode: string;
  correlationId: string;
}

export interface MvpAOnboardingEmploymentTrace {
  id: string;
  employmentCode: string;
  statusCode: string;
  startDate: string;
  endDate: string | null;
}

export interface MvpAOnboardingAssignmentTrace {
  id: string;
  employmentId: string;
  assignmentCode: string;
  organizationCode: string;
  positionCode: string | null;
  startDate: string;
  endDate: string | null;
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
  authorizationGate: MvpAOnboardingEvidenceAuthorizationGate;
  bindingGate: MvpAOnboardingBindingGate;
  employment?: MvpAOnboardingEmploymentTrace;
  assignment?: MvpAOnboardingAssignmentTrace;
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
  tenantEnvironmentId: string;
  effectiveDate: string;
  employment: { employmentCode: string };
  assignment: {
    assignmentCode: string;
    departmentReference: string;
    legalEntityReference: string;
  };
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

type EmploymentRow = {
  id: string;
  person_id: string;
  employment_code: string;
  status_code: string;
  start_date: string;
  end_date: string | null;
};

type AssignmentRow = {
  id: string;
  person_id: string;
  employment_id: string;
  assignment_code: string;
  organization_code: string;
  position_code: string | null;
  start_date: string;
  end_date: string | null;
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

type RequestOwnerActorRow = {
  actor_id: string;
};

const remainingP2A02Gates = [
  "WORM / S3 Object Lock audit immutability and archive evidence",
  "broad audit search UI for production support and review",
  "production backup readiness beyond the local synthetic backup / restore rehearsal",
  "production field-level RBAC and data-scope enforcement beyond the bounded MVP-A onboarding evidence authorization gate",
  "export controls for raw payloads, CSV output, download logs, and watermark or manifest traceability",
  "real Okta tenant credentials, tenant binding, webhook custody, and provider audit search",
];

export function verifyMvpAOnboardingCorrelationTrace(
  db: MvpAOnboardingTraceabilityDatabase,
  input: VerifyMvpAOnboardingCorrelationTraceInput,
): MvpAOnboardingCorrelationTrace {
  assertMvpAOnboardingEvidenceAuthorizationGate(
    mvpAOnboardingEvidenceAuthorizationGate,
  );

  const correlationId = requireNonEmptyCorrelationId(input.correlationId);
  const request = readTransactionRequest(db, correlationId);
  const rootCorrelationId = requireString(request.correlation_id);
  const payload = parsePayload(request);
  const applyJobAttempts = readApplyJobAttempts(db, request);
  const auditEvents = readAuditEvents(db, request);
  const approvalAuditEvents = auditEvents.filter(
    (event) => event.action === "mvp_a.onboarding.approve",
  );
  const applyAuditEvents = auditEvents.filter(
    (event) => event.action === "mvp_a.onboarding.apply",
  );
  if (approvalAuditEvents.length > 1) {
    throwTraceError(
      "MVP-A onboarding trace requires a single approval audit evidence record",
    );
  }
  if (applyAuditEvents.length > 1) {
    throwTraceError(
      "MVP-A onboarding trace requires a single apply audit evidence record",
    );
  }
  const approvalAuditEvent = approvalAuditEvents[0];
  const applyAuditEvent = applyAuditEvents[0];
  const lifecycleEvent = readLifecycleEvent(db, request, payload);

  if (input.requireApproval && approvalAuditEvent === undefined) {
    throwTraceError(
      "MVP-A onboarding trace requires approval audit evidence for the root correlation id",
    );
  }
  if (input.requireApply && lifecycleEvent === undefined) {
    throwTraceError(
      "MVP-A onboarding trace requires lifecycle apply evidence linked to the correlated transaction request",
    );
  }
  if (input.requireApply && applyAuditEvent === undefined) {
    throwTraceError(
      "MVP-A onboarding trace requires apply audit evidence for the root correlation id",
    );
  }
  const employment = readEmployment(db, request, payload);
  if (input.requireApply && employment === undefined) {
    throwTraceError(
      "MVP-A onboarding trace requires employment status evidence linked to the correlated transaction request",
    );
  }
  const assignment =
    employment === undefined
      ? undefined
      : readAssignment(db, request, payload, employment);
  if (input.requireApply && assignment === undefined) {
    throwTraceError(
      "MVP-A onboarding trace requires assignment reference evidence linked to the correlated transaction request",
    );
  }

  assertTraceBindingEvidence({
    requestedCorrelationId: correlationId,
    request,
    payload,
    approvalAuditEvent,
    auditEvents,
    applyJobAttempts,
  });

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
  const hasProviderRefreshEvidence =
    providerRefresh !== undefined || workEmailConflict !== undefined;

  if (input.requireWriteback && workEmailWriteback === undefined) {
    throwTraceError(
      "MVP-A onboarding trace requires work_email writeback evidence linked to the correlated onboarding payload",
    );
  }
  if (input.requireProviderRefresh && !hasProviderRefreshEvidence) {
    throwTraceError(
      "MVP-A onboarding trace requires provider refresh or conflict evidence linked to the writeback event",
    );
  }

  return {
    transactionRequest: mapTransactionRequest(request, rootCorrelationId),
    authorizationGate: mvpAOnboardingEvidenceAuthorizationGate,
    bindingGate: mvpAOnboardingBindingGate,
    employment,
    assignment,
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

function readApplyEvidenceTimestamp(
  lifecycleEvent: MvpAOnboardingLifecycleTrace | undefined,
  applyAuditEvent: MvpAOnboardingAuditTrace | undefined,
): string | undefined {
  if (
    lifecycleEvent !== undefined &&
    applyAuditEvent !== undefined &&
    lifecycleEvent.occurredAt !== applyAuditEvent.occurredAt
  ) {
    throwTraceError(
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
    throwTraceError(
      "MVP-A onboarding trace requires a non-empty correlation id",
    );
  }

  return correlationId;
}

function readTransactionRequest(
  db: MvpAOnboardingTraceabilityDatabase,
  correlationId: string,
): TransactionRequestRow {
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

function requireRootCorrelation(
  row: TransactionRequestRow,
): TransactionRequestRow {
  if (row.correlation_id === null) {
    throwTraceError(
      "MVP-A onboarding trace requires transaction_request root correlation evidence",
    );
  }

  return row;
}

function parsePayload(row: TransactionRequestRow): Payload {
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
    typeof employment.employmentCode !== "string" ||
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
    employment: { employmentCode: employment.employmentCode },
    assignment: {
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

function assertTraceBindingEvidence(input: {
  requestedCorrelationId: string;
  request: TransactionRequestRow;
  payload: Payload;
  approvalAuditEvent: MvpAOnboardingAuditTrace | undefined;
  auditEvents: readonly MvpAOnboardingAuditTrace[];
  applyJobAttempts: readonly MvpAOnboardingApplyJobAttemptTrace[];
}): void {
  try {
    assertMvpAOnboardingBindingGateEvidence(mvpAOnboardingBindingGate, {
      trustedActorId: input.approvalAuditEvent?.actorId,
      effectiveActorIds: [
        ...input.auditEvents.map((event) => event.actorId),
        ...input.applyJobAttempts.map((attempt) => attempt.workerId),
      ],
      subjectEmployeeId: input.request.person_id,
      tenantEnvironmentId: input.payload.tenantEnvironmentId,
      requestOwnerId: input.approvalAuditEvent?.actorId,
      requestedCorrelationId: input.requestedCorrelationId,
      rootCorrelationId: requireString(input.request.correlation_id),
      linkedCorrelationIds: [
        ...input.auditEvents.map((event) => event.correlationId),
        ...input.applyJobAttempts.map((attempt) => attempt.correlationId),
      ],
    });
  } catch (error) {
    throwTraceError(getErrorMessage(error));
  }
}

function readAuditEvents(
  db: MvpAOnboardingTraceabilityDatabase,
  request: TransactionRequestRow,
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

function readEmployment(
  db: MvpAOnboardingTraceabilityDatabase,
  request: TransactionRequestRow,
  payload: Payload,
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
        WHERE person_id = ?
          AND employment_code = ?
          AND start_date = ?
        ORDER BY id
      `,
    )
    .all(
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

function readAssignment(
  db: MvpAOnboardingTraceabilityDatabase,
  request: TransactionRequestRow,
  payload: Payload,
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
        WHERE person_id = ?
          AND employment_id = ?
          AND assignment_code = ?
          AND organization_code = ?
          AND start_date = ?
        ORDER BY id
      `,
    )
    .all(
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
  if (!isRecord(row)) throwTraceError("transaction_request row is malformed");
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
  if (!isRecord(row)) throwTraceError("audit_event row is malformed");
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

function assertEmploymentRow(row: unknown): EmploymentRow {
  if (!isRecord(row)) throwTraceError("employment row is malformed");
  return {
    id: requireString(row.id),
    person_id: requireString(row.person_id),
    employment_code: requireString(row.employment_code),
    status_code: requireString(row.status_code),
    start_date: requireString(row.start_date),
    end_date: requireNullableString(row.end_date),
  };
}

function assertAssignmentRow(row: unknown): AssignmentRow {
  if (!isRecord(row)) throwTraceError("assignment row is malformed");
  return {
    id: requireString(row.id),
    person_id: requireString(row.person_id),
    employment_id: requireString(row.employment_id),
    assignment_code: requireString(row.assignment_code),
    organization_code: requireString(row.organization_code),
    position_code: requireNullableString(row.position_code),
    start_date: requireString(row.start_date),
    end_date: requireNullableString(row.end_date),
  };
}

function assertRequestOwnerActorRow(row: unknown): RequestOwnerActorRow {
  if (!isRecord(row)) throwTraceError("audit_event row is malformed");
  return {
    actor_id: requireString(row.actor_id),
  };
}

function assertLifecycleRow(row: unknown): LifecycleRow {
  if (!isRecord(row)) throwTraceError("lifecycle_event row is malformed");
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
    throwTraceError("onboarding_apply_job_attempt row is malformed");
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
  if (!isRecord(row)) throwTraceError("writeback_event row is malformed");
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
    throwTraceError("writeback_provider_refresh row is malformed");
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
    throwTraceError("writeback_work_email_conflict row is malformed");
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
    throwTraceError("MVP-A onboarding trace encountered malformed evidence");
  }

  return value;
}

function requireNullableString(value: unknown): string | null {
  if (value === null) return value;
  return requireString(value);
}

function requireNumber(value: unknown): number {
  if (typeof value !== "number") {
    throwTraceError("MVP-A onboarding trace encountered malformed evidence");
  }

  return value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function throwTraceError(message: string): never {
  throw new MvpAOnboardingCorrelationTraceError(message);
}

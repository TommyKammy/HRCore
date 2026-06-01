import {
  createTransferTransactionRequestFixture,
  parseTransferTransactionRequestInput,
} from "./transfer-transaction-request-contract.js";
import {
  buildTransferTargetAssignmentCode,
  buildTransferTargetAssignmentId,
} from "./transfer-transaction-request-ids.js";
import {
  parsePersistedTransferApplyPayload,
  previousIsoDate,
} from "./transfer-transaction-request-apply.js";
import type {
  OnboardingApprovalDecision,
  OnboardingApprovalDecisionInput,
  OnboardingApprovalDecisionResult,
  OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";
import type { TransferTransactionRequestPayload } from "./transfer-transaction-request-contract.js";
import type { OktaTransferProjectionImpactEvidence } from "./transfer-okta-projection-integration.js";

export { applyApprovedTransferTransactionRequest } from "./transfer-transaction-request-apply.js";
export { applyApprovedTransferTransactionRequestWithOktaProjection } from "./transfer-okta-projection-integration.js";
export { decideTransferTransactionRequest } from "./transfer-transaction-request-decision.js";
export { saveTransferTransactionRequest } from "./transfer-transaction-request-persistence.js";
export { applyDueTransferTransactionRequests } from "./transfer-transaction-request-worker.js";

export {
  createTransferTransactionRequestFixture,
  parseTransferTransactionRequestInput,
  TransferTransactionRequestValidationError,
} from "./transfer-transaction-request-contract.js";
export type {
  AppliedTransferTransactionRequestResult,
  ApplyApprovedTransferTransactionRequestInput,
} from "./transfer-transaction-request-apply.js";
export type {
  AppliedTransferTransactionRequestWithOktaProjectionResult,
  ApplyApprovedTransferTransactionRequestWithOktaProjectionInput,
  OktaTransferGroupProjectionStatus,
  OktaTransferProfileProjectionStatus,
  OktaTransferProjectionImpactEvidence,
} from "./transfer-okta-projection-integration.js";
export type { TransferTransactionRequestPersistenceResult } from "./transfer-transaction-request-persistence.js";
export type {
  ApplyDueTransferTransactionRequestsInput,
  ApplyDueTransferTransactionRequestsItemResult,
  ApplyDueTransferTransactionRequestsResult,
  ApplyDueTransferTransactionRequestsStatus,
} from "./transfer-transaction-request-worker.js";
export type {
  TransferTransactionRequestCurrentAssignmentPayload,
  TransferTransactionRequestInput,
  TransferTransactionRequestPayload,
  TransferTransactionRequestPersonInput,
  TransferTransactionRequestReasonPayload,
  TransferTransactionRequestStatus,
  TransferTransactionRequestTargetAssignmentPayload,
} from "./transfer-transaction-request-contract.js";

export type TransferApprovalDecision = OnboardingApprovalDecision;
export type TransferApprovalDecisionInput = OnboardingApprovalDecisionInput;
export type TransferApprovalDecisionResult = OnboardingApprovalDecisionResult;

export class MvpBTransferCorrelationTraceError extends Error {
  override name = "MvpBTransferCorrelationTraceError";
}

export interface VerifyMvpBTransferCorrelationTraceInput {
  correlationId: string;
  requireApproval: boolean;
  requireApply: boolean;
  requireApplyJobAttempt?: boolean;
  requireOktaProjection?: boolean;
  oktaProjection?: OktaTransferProjectionImpactEvidence;
}

export interface MvpBTransferTransactionTrace {
  id: string;
  personId: string;
  requestType: string;
  statusCode: string;
  correlationId: string;
}

export interface MvpBTransferAssignmentTrace {
  id: string;
  employmentId: string;
  assignmentCode: string;
  organizationCode: string;
  positionCode: string | null;
  startDate: string;
  endDate: string | null;
}

export interface MvpBTransferLifecycleTrace {
  id: string;
  transactionRequestId: string;
  personId: string;
  eventType: string;
  effectiveDate: string;
  occurredAt: string;
}

export interface MvpBTransferAuditTrace {
  id: string;
  actorId: string;
  action: string;
  subjectTable: string;
  subjectId: string;
  occurredAt: string;
  correlationId: string;
}

export interface MvpBTransferApplyJobAttemptTrace {
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

export interface MvpBTransferCorrelationTrace {
  transactionRequest: MvpBTransferTransactionTrace;
  approvalAuditEvent?: MvpBTransferAuditTrace;
  applyAuditEvent?: MvpBTransferAuditTrace;
  auditEvents: MvpBTransferAuditTrace[];
  lifecycleEvent?: MvpBTransferLifecycleTrace;
  closedAssignment?: MvpBTransferAssignmentTrace;
  targetAssignment?: MvpBTransferAssignmentTrace;
  applyJobAttempts: MvpBTransferApplyJobAttemptTrace[];
  oktaProjection?: OktaTransferProjectionImpactEvidence;
  remainingProductionReadinessGates: string[];
}

type ExistingTransferTransactionRequestRow = {
  person_id: string;
  transaction_request_id: string;
  display_name: string;
  created_at: string;
  request_type: string;
  status_code: string;
  requested_at: string;
  correlation_id: string | null;
  payload_version: string | null;
  payload_json: string | null;
};

type ExistingTransferAssignmentRow = {
  id: string;
  person_id: string;
  employment_id: string;
  assignment_code: string;
  organization_code: string;
  position_code: string | null;
  start_date: string;
  end_date: string | null;
};

type ExistingTransferAuditRow = {
  id: string;
  actor_id: string;
  action: string;
  subject_table: string;
  subject_id: string;
  occurred_at: string;
  correlation_id: string | null;
};

type ExistingTransferLifecycleRow = {
  id: string;
  transaction_request_id: string | null;
  person_id: string;
  event_type: string;
  effective_date: string;
  occurred_at: string;
};

type ExistingTransferApplyJobAttemptRow = {
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

const remainingMvpBTransferProductionReadinessGates = [
  "#11 production support review remains owner-acknowledged defer",
  "#12 production audit immutability and backup readiness remains owner-acknowledged defer",
  "#14 live Okta provider custody and real-tenant readiness remains owner-acknowledged defer",
  "production-like readiness remains blocked beyond bounded synthetic transfer traceability",
];

export function verifyMvpBTransferCorrelationTrace(
  db: OnboardingTransactionRequestDatabase,
  input: VerifyMvpBTransferCorrelationTraceInput,
): MvpBTransferCorrelationTrace {
  const correlationId = requireTransferTraceCorrelationId(input.correlationId);
  const request = readTransferTraceRequestByCorrelationId(db, correlationId);
  const payload = readTransferTracePayload(request);
  const auditEvents = readTransferTraceAuditEvents(db, request);
  const approvalAuditEvents = auditEvents.filter(
    (event) => event.action === "mvp_b.transfer.approve",
  );
  const applyAuditEvents = auditEvents.filter(
    (event) => event.action === "mvp_b.transfer.apply",
  );

  if (approvalAuditEvents.length > 1) {
    throwTransferTraceError(
      "MVP-B transfer trace requires a single approval audit evidence record",
    );
  }
  if (applyAuditEvents.length > 1) {
    throwTransferTraceError(
      "MVP-B transfer trace requires a single apply audit evidence record",
    );
  }

  const approvalAuditEvent = approvalAuditEvents[0];
  const applyAuditEvent = applyAuditEvents[0];
  const lifecycleEvent = readTransferTraceLifecycleEvent(db, request, payload);
  const closedAssignment = readTransferTraceClosedAssignment(
    db,
    request,
    payload,
  );
  const targetAssignment =
    closedAssignment === undefined
      ? undefined
      : readTransferTraceTargetAssignment(
          db,
          request,
          payload,
          closedAssignment,
        );
  const applyJobAttempts = readTransferTraceApplyJobAttempts(
    db,
    request,
    applyAuditEvent,
  );

  if (input.requireApproval && approvalAuditEvent === undefined) {
    throwTransferTraceError(
      "MVP-B transfer trace requires approval audit evidence for the root correlation id",
    );
  }
  if (input.requireApply && request.status_code !== "completed") {
    throwTransferTraceError(
      "MVP-B transfer trace requires completed transfer request state for apply evidence",
    );
  }
  if (input.requireApply && lifecycleEvent === undefined) {
    throwTransferTraceError(
      "MVP-B transfer trace requires assignment-change lifecycle evidence linked to the correlated transfer request",
    );
  }
  if (input.requireApply && applyAuditEvent === undefined) {
    throwTransferTraceError(
      "MVP-B transfer trace requires apply audit evidence linked to the transfer lifecycle event",
    );
  }
  if (input.requireApply && closedAssignment === undefined) {
    throwTransferTraceError(
      "MVP-B transfer trace requires closed current assignment evidence linked to the transfer payload",
    );
  }
  if (input.requireApply && targetAssignment === undefined) {
    throwTransferTraceError(
      "MVP-B transfer trace requires target assignment evidence linked to the transfer payload",
    );
  }
  assertTransferTraceBindings({
    requestedCorrelationId: correlationId,
    request,
    payloadEffectiveDate: payload.effectiveDate,
    approvalAuditEvent,
    applyAuditEvent,
    lifecycleEvent,
    closedAssignment,
    targetAssignment,
    applyJobAttempts,
    requireApplyJobAttempt: input.requireApplyJobAttempt === true,
    oktaProjection: input.oktaProjection,
    requireOktaProjection: input.requireOktaProjection === true,
  });

  return {
    transactionRequest: {
      id: request.transaction_request_id,
      personId: request.person_id,
      requestType: request.request_type,
      statusCode: request.status_code,
      correlationId,
    },
    approvalAuditEvent,
    applyAuditEvent,
    auditEvents,
    lifecycleEvent,
    closedAssignment,
    targetAssignment,
    applyJobAttempts,
    oktaProjection: input.oktaProjection,
    remainingProductionReadinessGates: [
      ...remainingMvpBTransferProductionReadinessGates,
    ],
  };
}

function requireTransferTraceCorrelationId(correlationId: string): string {
  if (correlationId.trim().length === 0) {
    throwTransferTraceError(
      "MVP-B transfer trace requires a non-empty correlation id",
    );
  }

  return correlationId;
}

function readTransferTraceRequestByCorrelationId(
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

function readTransferTracePayload(
  request: ExistingTransferTransactionRequestRow,
): TransferTransactionRequestPayload {
  try {
    return parsePersistedTransferApplyPayload(request);
  } catch {
    throwTransferTraceError(
      "MVP-B transfer trace requires supported transfer payload evidence",
    );
  }
}

function readTransferTraceAuditEvents(
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

function readTransferTraceLifecycleEvent(
  db: OnboardingTransactionRequestDatabase,
  request: ExistingTransferTransactionRequestRow,
  payload: TransferTransactionRequestPayload,
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

function readTransferTraceClosedAssignment(
  db: OnboardingTransactionRequestDatabase,
  request: ExistingTransferTransactionRequestRow,
  payload: TransferTransactionRequestPayload,
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

function readTransferTraceTargetAssignment(
  db: OnboardingTransactionRequestDatabase,
  request: ExistingTransferTransactionRequestRow,
  payload: TransferTransactionRequestPayload,
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

function readTransferTraceApplyJobAttempts(
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

function assertTransferTraceBindings(input: {
  requestedCorrelationId: string;
  request: ExistingTransferTransactionRequestRow;
  payloadEffectiveDate: string;
  approvalAuditEvent?: MvpBTransferAuditTrace;
  applyAuditEvent?: MvpBTransferAuditTrace;
  lifecycleEvent?: MvpBTransferLifecycleTrace;
  closedAssignment?: MvpBTransferAssignmentTrace;
  targetAssignment?: MvpBTransferAssignmentTrace;
  applyJobAttempts: MvpBTransferApplyJobAttemptTrace[];
  requireApplyJobAttempt: boolean;
  oktaProjection?: OktaTransferProjectionImpactEvidence;
  requireOktaProjection: boolean;
}): void {
  if (input.request.correlation_id !== input.requestedCorrelationId) {
    throwTransferTraceError(
      "MVP-B transfer trace request correlation does not match the requested root correlation id",
    );
  }
  if (
    input.approvalAuditEvent !== undefined &&
    input.approvalAuditEvent.correlationId !== input.requestedCorrelationId
  ) {
    throwTransferTraceError(
      "MVP-B transfer trace approval audit evidence must use the root correlation id",
    );
  }
  if (
    input.applyAuditEvent !== undefined &&
    input.lifecycleEvent !== undefined &&
    input.applyAuditEvent.subjectId !== input.lifecycleEvent.id
  ) {
    throwTransferTraceError(
      "MVP-B transfer trace apply audit evidence must be linked to the lifecycle event",
    );
  }
  if (
    input.applyAuditEvent !== undefined &&
    input.lifecycleEvent !== undefined &&
    input.applyAuditEvent.occurredAt !== input.lifecycleEvent.occurredAt
  ) {
    throwTransferTraceError(
      "MVP-B transfer trace apply audit timing must match the lifecycle evidence",
    );
  }
  if (
    input.applyAuditEvent !== undefined &&
    input.lifecycleEvent !== undefined &&
    transferTraceTimestampDate(input.applyAuditEvent.occurredAt) <
      input.payloadEffectiveDate
  ) {
    throwTransferTraceError(
      "MVP-B transfer trace apply timing must not predate the transfer effective date",
    );
  }
  if (
    input.applyAuditEvent !== undefined &&
    !isRootLinkedTransferTraceApplyCorrelation({
      correlationId: input.applyAuditEvent.correlationId,
      requestedCorrelationId: input.requestedCorrelationId,
      request: input.request,
    })
  ) {
    throwTransferTraceError(
      "MVP-B transfer trace apply audit evidence must be rooted in the transfer correlation",
    );
  }
  if (
    input.lifecycleEvent !== undefined &&
    input.lifecycleEvent.transactionRequestId !==
      input.request.transaction_request_id
  ) {
    throwTransferTraceError(
      "MVP-B transfer trace lifecycle evidence must be linked to the transfer request",
    );
  }
  if (
    input.closedAssignment !== undefined &&
    input.targetAssignment !== undefined &&
    input.closedAssignment.employmentId !== input.targetAssignment.employmentId
  ) {
    throwTransferTraceError(
      "MVP-B transfer trace assignment evidence must stay within one employment record",
    );
  }
  for (const attempt of input.applyJobAttempts) {
    if (
      attempt.transactionRequestId !== input.request.transaction_request_id ||
      attempt.personId !== input.request.person_id
    ) {
      throwTransferTraceError(
        "MVP-B transfer trace apply job attempt evidence must be linked to the transfer request",
      );
    }
  }
  const rootLinkedApplyJobAttempts = input.applyJobAttempts.filter((attempt) =>
    isRootLinkedTransferTraceApplyJobAttempt({
      attempt,
      requestedCorrelationId: input.requestedCorrelationId,
      request: input.request,
      applyAuditEvent: input.applyAuditEvent,
    }),
  );
  if (rootLinkedApplyJobAttempts.length !== input.applyJobAttempts.length) {
    throwTransferTraceError(
      "MVP-B transfer trace apply job attempt evidence must be rooted in the transfer correlation and linked to the apply audit evidence",
    );
  }
  if (rootLinkedApplyJobAttempts.length > 1) {
    throwTransferTraceError(
      "MVP-B transfer trace requires a single applied job attempt linked to the apply audit evidence",
    );
  }
  const rootLinkedApplyJobAttempt = rootLinkedApplyJobAttempts[0];
  if (input.requireApplyJobAttempt && rootLinkedApplyJobAttempt === undefined) {
    throwTransferTraceError(
      "MVP-B transfer trace requires an applied job attempt rooted in the transfer correlation and linked to the apply audit evidence",
    );
  }
  if (
    input.requireApplyJobAttempt &&
    input.applyAuditEvent !== undefined &&
    input.lifecycleEvent !== undefined &&
    rootLinkedApplyJobAttempt !== undefined &&
    transferTraceTimestampDate(rootLinkedApplyJobAttempt.attemptedAt) <
      input.lifecycleEvent.effectiveDate
  ) {
    throwTransferTraceError(
      "MVP-B transfer trace applied job attempt timing must not predate the transfer effective date",
    );
  }
  if (
    input.requireApplyJobAttempt &&
    input.applyAuditEvent !== undefined &&
    rootLinkedApplyJobAttempt !== undefined &&
    rootLinkedApplyJobAttempt.attemptedAt !== input.applyAuditEvent.occurredAt
  ) {
    throwTransferTraceError(
      "MVP-B transfer trace applied job attempt timing must match the apply audit evidence",
    );
  }
  if (input.requireOktaProjection && input.oktaProjection === undefined) {
    throwTransferTraceError(
      "MVP-B transfer trace requires mock Okta projection evidence linked to the transfer apply evidence",
    );
  }
  if (input.oktaProjection !== undefined) {
    if (
      input.oktaProjection.provider !== "okta" ||
      input.oktaProjection.adapterMode !== "mock" ||
      input.oktaProjection.synthetic !== true ||
      input.oktaProjection.authoritativeForRbac !== false ||
      input.oktaProjection.transactionRequestId !==
        input.request.transaction_request_id ||
      input.oktaProjection.lifecycleEventId !== input.lifecycleEvent?.id ||
      input.oktaProjection.applyCorrelationId !==
        input.applyAuditEvent?.correlationId
    ) {
      throwTransferTraceError(
        "MVP-B transfer trace requires mock Okta projection evidence linked to the transfer transaction and apply evidence",
      );
    }
  }
}

function transferTraceTimestampDate(timestamp: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/u.test(timestamp)) {
    throwTransferTraceError(
      "MVP-B transfer trace timing evidence must include an ISO date prefix",
    );
  }

  return timestamp.slice(0, 10);
}

function isRootLinkedTransferTraceApplyJobAttempt(input: {
  attempt: MvpBTransferApplyJobAttemptTrace;
  requestedCorrelationId: string;
  request: ExistingTransferTransactionRequestRow;
  applyAuditEvent?: MvpBTransferAuditTrace;
}): boolean {
  if (
    input.applyAuditEvent === undefined ||
    input.attempt.statusCode !== "applied" ||
    input.attempt.correlationId !== input.applyAuditEvent.correlationId
  ) {
    return false;
  }

  const parsedAttemptCorrelation = parseTransferTraceWorkerAttemptCorrelationId(
    input.attempt.correlationId,
  );
  return (
    parsedAttemptCorrelation !== undefined &&
    parsedAttemptCorrelation.transactionRequestId ===
      input.request.transaction_request_id &&
    isRootTransferTraceWorkerCorrelation(
      parsedAttemptCorrelation.workerCorrelationId,
      input.requestedCorrelationId,
    )
  );
}

function isRootLinkedTransferTraceApplyCorrelation(input: {
  correlationId: string;
  requestedCorrelationId: string;
  request: ExistingTransferTransactionRequestRow;
}): boolean {
  if (input.correlationId === input.requestedCorrelationId) return true;

  const parsedAttemptCorrelation = parseTransferTraceWorkerAttemptCorrelationId(
    input.correlationId,
  );
  return (
    parsedAttemptCorrelation !== undefined &&
    parsedAttemptCorrelation.transactionRequestId ===
      input.request.transaction_request_id &&
    isRootTransferTraceWorkerCorrelation(
      parsedAttemptCorrelation.workerCorrelationId,
      input.requestedCorrelationId,
    )
  );
}

function parseTransferTraceWorkerAttemptCorrelationId(
  correlationId: string,
): { workerCorrelationId: string; transactionRequestId: string } | undefined {
  const prefix = "onboarding-apply-worker-attempt-";
  if (!correlationId.startsWith(prefix)) return undefined;

  try {
    const parsed = JSON.parse(
      Buffer.from(correlationId.slice(prefix.length), "base64url").toString(
        "utf8",
      ),
    ) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      parsed[0].length > 0 &&
      typeof parsed[1] === "string" &&
      parsed[1].length > 0
    ) {
      return {
        workerCorrelationId: parsed[0],
        transactionRequestId: parsed[1],
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isRootTransferTraceWorkerCorrelation(
  workerCorrelationId: string,
  requestedCorrelationId: string,
): boolean {
  return (
    workerCorrelationId === requestedCorrelationId ||
    workerCorrelationId.startsWith(`${requestedCorrelationId}:`)
  );
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

function throwTransferTraceError(message: string): never {
  throw new MvpBTransferCorrelationTraceError(message);
}

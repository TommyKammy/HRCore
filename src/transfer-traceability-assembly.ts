import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request.js";
import { remainingMvpBTransferProductionReadinessGates } from "./transfer-traceability-production-gates.js";
import {
  readTransferTraceApplyJobAttempts,
  readTransferTraceAuditEvents,
  readTransferTraceClosedAssignment,
  readTransferTraceLifecycleEvent,
  readTransferTracePayload,
  readTransferTraceRequestByCorrelationId,
  readTransferTraceTargetAssignment,
  requireTransferTraceCorrelationId,
} from "./transfer-traceability-db-reads.js";
import type {
  ExistingTransferTransactionRequestRow,
  MvpBTransferApplyJobAttemptTrace,
  MvpBTransferAssignmentTrace,
  MvpBTransferAuditTrace,
  MvpBTransferCorrelationTrace,
  MvpBTransferLifecycleTrace,
  VerifyMvpBTransferCorrelationTraceInput,
} from "./transfer-traceability-types.js";
import { throwTransferTraceError } from "./transfer-traceability-types.js";
import type { OktaTransferProjectionImpactEvidence } from "./transfer-okta-projection-integration.js";

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

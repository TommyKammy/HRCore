import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request.js";
import { remainingMvpCTerminationProductionReadinessGates } from "./termination-traceability-production-gates.js";
import {
  readTerminationTraceApplyJobAttempts,
  readTerminationTraceAuditEvents,
  readTerminationTraceEndedAssignment,
  readTerminationTraceEndedEmployment,
  readTerminationTraceLifecycleEvent,
  readTerminationTracePayload,
  readTerminationTraceRequestByCorrelationId,
  requireTerminationTraceCorrelationId,
} from "./termination-traceability-db-reads.js";
import type {
  ExistingTerminationTransactionRequestRow,
  MvpCTerminationApplyJobAttemptTrace,
  MvpCTerminationAssignmentTrace,
  MvpCTerminationAuditTrace,
  MvpCTerminationCorrelationTrace,
  MvpCTerminationEmploymentTrace,
  MvpCTerminationLifecycleTrace,
  VerifyMvpCTerminationCorrelationTraceInput,
} from "./termination-traceability-types.js";
import { throwTerminationTraceError } from "./termination-traceability-types.js";
import type { OktaTerminationProjectionImpactEvidence } from "./termination-okta-projection-integration.js";

export function verifyMvpCTerminationCorrelationTrace(
  db: OnboardingTransactionRequestDatabase,
  input: VerifyMvpCTerminationCorrelationTraceInput,
): MvpCTerminationCorrelationTrace {
  const correlationId = requireTerminationTraceCorrelationId(
    input.correlationId,
  );
  const request = readTerminationTraceRequestByCorrelationId(db, correlationId);
  const payload = readTerminationTracePayload(request);
  const auditEvents = readTerminationTraceAuditEvents(db, request);
  const approvalAuditEvents = auditEvents.filter(
    (event) => event.action === "mvp_c.termination.approve",
  );
  const applyAuditEvents = auditEvents.filter(
    (event) => event.action === "mvp_c.termination.apply",
  );

  if (approvalAuditEvents.length > 1) {
    throwTerminationTraceError(
      "MVP-C termination trace requires a single approval audit evidence record",
    );
  }
  if (applyAuditEvents.length > 1) {
    throwTerminationTraceError(
      "MVP-C termination trace requires a single apply audit evidence record",
    );
  }

  const approvalAuditEvent = approvalAuditEvents[0];
  const applyAuditEvent = applyAuditEvents[0];
  const lifecycleEvent = readTerminationTraceLifecycleEvent(
    db,
    request,
    payload,
  );
  const endedEmployment = readTerminationTraceEndedEmployment(
    db,
    request,
    payload,
  );
  const endedAssignment =
    endedEmployment === undefined
      ? undefined
      : readTerminationTraceEndedAssignment(
          db,
          request,
          payload,
          endedEmployment,
        );
  const applyJobAttempts = readTerminationTraceApplyJobAttempts(
    db,
    request,
    applyAuditEvent,
  );

  if (input.requireApproval && approvalAuditEvent === undefined) {
    throwTerminationTraceError(
      "MVP-C termination trace requires approval audit evidence for the root correlation id",
    );
  }
  if (input.requireApply && request.status_code !== "completed") {
    throwTerminationTraceError(
      "MVP-C termination trace requires completed termination request state for apply evidence",
    );
  }
  if (input.requireApply && lifecycleEvent === undefined) {
    throwTerminationTraceError(
      "MVP-C termination trace requires termination lifecycle evidence linked to the correlated termination request",
    );
  }
  if (input.requireApply && applyAuditEvent === undefined) {
    throwTerminationTraceError(
      "MVP-C termination trace requires apply audit evidence linked to the termination lifecycle event",
    );
  }
  if (input.requireApply && endedEmployment === undefined) {
    throwTerminationTraceError(
      "MVP-C termination trace requires ended employment evidence linked to the termination payload",
    );
  }
  if (input.requireApply && endedAssignment === undefined) {
    throwTerminationTraceError(
      "MVP-C termination trace requires ended assignment evidence linked to the termination payload",
    );
  }
  assertTerminationTraceBindings({
    requestedCorrelationId: correlationId,
    request,
    payloadEffectiveDate: payload.effectiveDate,
    approvalAuditEvent,
    applyAuditEvent,
    lifecycleEvent,
    endedEmployment,
    endedAssignment,
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
    endedEmployment,
    endedAssignment,
    applyJobAttempts,
    oktaProjection: input.oktaProjection,
    remainingProductionReadinessGates: [
      ...remainingMvpCTerminationProductionReadinessGates,
    ],
  };
}

function assertTerminationTraceBindings(input: {
  requestedCorrelationId: string;
  request: ExistingTerminationTransactionRequestRow;
  payloadEffectiveDate: string;
  approvalAuditEvent?: MvpCTerminationAuditTrace;
  applyAuditEvent?: MvpCTerminationAuditTrace;
  lifecycleEvent?: MvpCTerminationLifecycleTrace;
  endedEmployment?: MvpCTerminationEmploymentTrace;
  endedAssignment?: MvpCTerminationAssignmentTrace;
  applyJobAttempts: MvpCTerminationApplyJobAttemptTrace[];
  requireApplyJobAttempt: boolean;
  oktaProjection?: OktaTerminationProjectionImpactEvidence;
  requireOktaProjection: boolean;
}): void {
  if (input.request.correlation_id !== input.requestedCorrelationId) {
    throwTerminationTraceError(
      "MVP-C termination trace request correlation does not match the requested root correlation id",
    );
  }
  if (
    input.approvalAuditEvent !== undefined &&
    input.approvalAuditEvent.correlationId !== input.requestedCorrelationId
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace approval audit evidence must use the root correlation id",
    );
  }
  if (
    input.applyAuditEvent !== undefined &&
    input.lifecycleEvent !== undefined &&
    input.applyAuditEvent.subjectId !== input.lifecycleEvent.id
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace apply audit evidence must be linked to the lifecycle event",
    );
  }
  if (
    input.applyAuditEvent !== undefined &&
    input.lifecycleEvent !== undefined &&
    input.applyAuditEvent.occurredAt !== input.lifecycleEvent.occurredAt
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace apply audit timing must match the lifecycle evidence",
    );
  }
  if (
    input.approvalAuditEvent !== undefined &&
    input.applyAuditEvent !== undefined &&
    input.approvalAuditEvent.occurredAt > input.applyAuditEvent.occurredAt
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace approval audit timing must not postdate apply evidence",
    );
  }
  if (
    input.approvalAuditEvent !== undefined &&
    input.applyAuditEvent === undefined &&
    input.lifecycleEvent !== undefined &&
    input.approvalAuditEvent.occurredAt > input.lifecycleEvent.occurredAt
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace approval audit timing must not postdate lifecycle evidence",
    );
  }
  if (
    input.applyAuditEvent !== undefined &&
    input.lifecycleEvent !== undefined &&
    terminationTraceTimestampDate(input.applyAuditEvent.occurredAt) <
      input.payloadEffectiveDate
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace apply timing must not predate the termination effective date",
    );
  }
  if (
    input.applyAuditEvent !== undefined &&
    !isRootLinkedTerminationTraceApplyCorrelation({
      correlationId: input.applyAuditEvent.correlationId,
      requestedCorrelationId: input.requestedCorrelationId,
      request: input.request,
    })
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace apply audit evidence must be rooted in the termination correlation",
    );
  }
  if (
    input.lifecycleEvent !== undefined &&
    input.lifecycleEvent.transactionRequestId !==
      input.request.transaction_request_id
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace lifecycle evidence must be linked to the termination request",
    );
  }
  if (
    input.endedEmployment !== undefined &&
    input.endedAssignment !== undefined &&
    input.endedEmployment.id !== input.endedAssignment.employmentId
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace employment and assignment evidence must stay within one employment record",
    );
  }
  for (const attempt of input.applyJobAttempts) {
    if (
      attempt.transactionRequestId !== input.request.transaction_request_id ||
      attempt.personId !== input.request.person_id
    ) {
      throwTerminationTraceError(
        "MVP-C termination trace apply job attempt evidence must be linked to the termination request",
      );
    }
  }
  const rootLinkedApplyJobAttempts = input.applyJobAttempts.filter((attempt) =>
    isRootLinkedTerminationTraceApplyJobAttempt({
      attempt,
      requestedCorrelationId: input.requestedCorrelationId,
      request: input.request,
      applyAuditEvent: input.applyAuditEvent,
    }),
  );
  if (rootLinkedApplyJobAttempts.length !== input.applyJobAttempts.length) {
    throwTerminationTraceError(
      "MVP-C termination trace apply job attempt evidence must be rooted in the termination correlation and linked to the apply audit evidence",
    );
  }
  if (rootLinkedApplyJobAttempts.length > 1) {
    throwTerminationTraceError(
      "MVP-C termination trace requires a single applied job attempt linked to the apply audit evidence",
    );
  }
  const rootLinkedApplyJobAttempt = rootLinkedApplyJobAttempts[0];
  if (input.requireApplyJobAttempt && rootLinkedApplyJobAttempt === undefined) {
    throwTerminationTraceError(
      "MVP-C termination trace requires an applied job attempt rooted in the termination correlation and linked to the apply audit evidence",
    );
  }
  if (
    input.requireApplyJobAttempt &&
    input.lifecycleEvent !== undefined &&
    rootLinkedApplyJobAttempt !== undefined &&
    terminationTraceTimestampDate(rootLinkedApplyJobAttempt.attemptedAt) <
      input.lifecycleEvent.effectiveDate
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace applied job attempt timing must not predate the termination effective date",
    );
  }
  if (
    input.requireApplyJobAttempt &&
    input.applyAuditEvent !== undefined &&
    rootLinkedApplyJobAttempt !== undefined &&
    rootLinkedApplyJobAttempt.attemptedAt !== input.applyAuditEvent.occurredAt
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace applied job attempt timing must match the apply audit evidence",
    );
  }
  if (input.requireOktaProjection && input.oktaProjection === undefined) {
    throwTerminationTraceError(
      "MVP-C termination trace requires mock Okta disable projection evidence linked to the termination apply evidence",
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
      throwTerminationTraceError(
        "MVP-C termination trace requires mock Okta disable projection evidence linked to the termination transaction and apply evidence",
      );
    }
    if (
      !isSuccessfulTerminationOktaProjectionStatus(
        input.oktaProjection.profile.status,
      ) ||
      !isSuccessfulTerminationOktaProjectionStatus(
        input.oktaProjection.groups.status,
      )
    ) {
      throwTerminationTraceError(
        "MVP-C termination trace requires successful mock Okta disable projection evidence before closeout",
      );
    }
  }
}

function isSuccessfulTerminationOktaProjectionStatus(status: string): boolean {
  return status === "projected" || status === "already_projected";
}

function terminationTraceTimestampDate(timestamp: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/u.test(timestamp)) {
    throwTerminationTraceError(
      "MVP-C termination trace timing evidence must include an ISO date prefix",
    );
  }

  return timestamp.slice(0, 10);
}

function isRootLinkedTerminationTraceApplyJobAttempt(input: {
  attempt: MvpCTerminationApplyJobAttemptTrace;
  requestedCorrelationId: string;
  request: ExistingTerminationTransactionRequestRow;
  applyAuditEvent?: MvpCTerminationAuditTrace;
}): boolean {
  if (
    input.applyAuditEvent === undefined ||
    input.attempt.statusCode !== "applied" ||
    input.attempt.correlationId !== input.applyAuditEvent.correlationId
  ) {
    return false;
  }

  const parsedAttemptCorrelation =
    parseTerminationTraceWorkerAttemptCorrelationId(
      input.attempt.correlationId,
    );
  return (
    parsedAttemptCorrelation !== undefined &&
    parsedAttemptCorrelation.transactionRequestId ===
      input.request.transaction_request_id &&
    isRootTerminationTraceWorkerCorrelation(
      parsedAttemptCorrelation.workerCorrelationId,
      input.requestedCorrelationId,
    )
  );
}

function isRootLinkedTerminationTraceApplyCorrelation(input: {
  correlationId: string;
  requestedCorrelationId: string;
  request: ExistingTerminationTransactionRequestRow;
}): boolean {
  if (input.correlationId === input.requestedCorrelationId) return true;

  const parsedAttemptCorrelation =
    parseTerminationTraceWorkerAttemptCorrelationId(input.correlationId);
  return (
    parsedAttemptCorrelation !== undefined &&
    parsedAttemptCorrelation.transactionRequestId ===
      input.request.transaction_request_id &&
    isRootTerminationTraceWorkerCorrelation(
      parsedAttemptCorrelation.workerCorrelationId,
      input.requestedCorrelationId,
    )
  );
}

function parseTerminationTraceWorkerAttemptCorrelationId(
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

function isRootTerminationTraceWorkerCorrelation(
  workerCorrelationId: string,
  requestedCorrelationId: string,
): boolean {
  return (
    workerCorrelationId === requestedCorrelationId ||
    workerCorrelationId.startsWith(`${requestedCorrelationId}:`)
  );
}

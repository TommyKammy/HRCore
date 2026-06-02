import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request.js";
import { buildOnboardingApplyJobAttemptId } from "./onboarding-transaction-request-ids.js";
import {
  buildTerminationApplyAuditEventId,
  buildTerminationApplyLifecycleEventIdForRequest,
  buildTerminationDecisionAuditEventId,
} from "./termination-transaction-request-ids.js";
import { encodeProjectionKeyPart } from "./okta-mastering-adapter-metadata.js";
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

const terminationTraceTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

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
    input.approvalAuditEvent !== undefined &&
    input.request.status_code !== "approved" &&
    input.request.status_code !== "completed"
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace approval evidence requires approved or completed termination request state",
    );
  }
  if (
    input.approvalAuditEvent !== undefined &&
    input.approvalAuditEvent.id !==
      buildTerminationDecisionAuditEventId({
        transactionRequestId: input.request.transaction_request_id,
        decision: "approve",
        decidedAt: input.approvalAuditEvent.occurredAt,
        decidedBy: input.approvalAuditEvent.actorId,
        correlationId: input.approvalAuditEvent.correlationId,
      })
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace approval audit evidence must use the canonical approval audit id",
    );
  }
  const expectedLifecycleEventId =
    buildTerminationApplyLifecycleEventIdForRequest(
      input.request.transaction_request_id,
    );
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
    input.lifecycleEvent !== undefined &&
    input.lifecycleEvent.id !== expectedLifecycleEventId
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace lifecycle evidence must use the canonical apply lifecycle id",
    );
  }
  if (
    input.applyAuditEvent !== undefined &&
    input.applyAuditEvent.id !==
      buildTerminationApplyAuditEventId(expectedLifecycleEventId)
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace apply audit evidence must use the canonical apply audit id",
    );
  }
  if (
    input.applyAuditEvent !== undefined &&
    input.lifecycleEvent !== undefined &&
    !isTerminationTraceSameInstant(
      input.applyAuditEvent.occurredAt,
      input.lifecycleEvent.occurredAt,
    )
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace apply audit timing must match the lifecycle evidence",
    );
  }
  if (
    input.approvalAuditEvent !== undefined &&
    input.applyAuditEvent !== undefined &&
    isTerminationTraceInstantAfter(
      input.approvalAuditEvent.occurredAt,
      input.applyAuditEvent.occurredAt,
    )
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace approval audit timing must not postdate apply evidence",
    );
  }
  if (
    input.approvalAuditEvent !== undefined &&
    input.applyAuditEvent === undefined &&
    input.lifecycleEvent !== undefined &&
    isTerminationTraceInstantAfter(
      input.approvalAuditEvent.occurredAt,
      input.lifecycleEvent.occurredAt,
    )
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
    if (
      attempt.id !==
      buildOnboardingApplyJobAttemptId(
        input.request.transaction_request_id,
        attempt.correlationId,
      )
    ) {
      throwTerminationTraceError(
        "MVP-C termination trace applied job attempt evidence must use the canonical applied job attempt id",
      );
    }
    if (attempt.retryable || attempt.errorMessage !== null) {
      throwTerminationTraceError(
        "MVP-C termination trace applied job attempt success evidence must not carry retryable or error details",
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
    rootLinkedApplyJobAttempt.workerId !== input.applyAuditEvent.actorId
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace applied job attempt actor must match the apply audit evidence",
    );
  }
  if (
    input.requireApplyJobAttempt &&
    input.applyAuditEvent !== undefined &&
    rootLinkedApplyJobAttempt !== undefined &&
    !isTerminationTraceSameInstant(
      rootLinkedApplyJobAttempt.attemptedAt,
      input.applyAuditEvent.occurredAt,
    )
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
    if (
      !isTerminationOktaProjectionIdentityLinked({
        oktaProjection: input.oktaProjection,
        endedEmployment: input.endedEmployment,
        applyAuditEvent: input.applyAuditEvent,
      })
    ) {
      throwTerminationTraceError(
        "MVP-C termination trace requires mock Okta disable projection identity details linked to ended employment and apply evidence",
      );
    }
  }
}

function isSuccessfulTerminationOktaProjectionStatus(status: string): boolean {
  return status === "projected" || status === "already_projected";
}

function isTerminationOktaProjectionIdentityLinked(input: {
  oktaProjection: OktaTerminationProjectionImpactEvidence;
  endedEmployment?: MvpCTerminationEmploymentTrace;
  applyAuditEvent?: MvpCTerminationAuditTrace;
}): boolean {
  if (
    input.endedEmployment === undefined ||
    input.applyAuditEvent === undefined
  ) {
    return false;
  }

  const employeeNumber = input.endedEmployment.employmentCode;
  const effectiveAt = input.applyAuditEvent.occurredAt;
  const profileResult = input.oktaProjection.profile.result;
  const groupResult = input.oktaProjection.groups.result;

  if (
    profileResult.operation !== "disable" ||
    profileResult.employeeNumber !== employeeNumber ||
    profileResult.effectiveAt !== effectiveAt ||
    !isMockOktaProjectionMetadata(
      profileResult.metadata,
      expectedTerminationOktaProjectionKey({
        operation: "disable",
        employeeNumber,
        effectiveAt,
      }),
    ) ||
    !isSuccessfulTerminationOktaProfileResult(
      input.oktaProjection.profile.status,
      profileResult,
    )
  ) {
    return false;
  }

  return (
    groupResult !== undefined &&
    groupResult.operation === "replace_user_groups" &&
    groupResult.employeeNumber === employeeNumber &&
    groupResult.effectiveAt === effectiveAt &&
    groupResult.groupKeys.length === 0 &&
    isMockOktaProjectionMetadata(
      groupResult.metadata,
      expectedTerminationOktaGroupProjectionKey({
        employeeNumber,
        groupKeys: [],
        effectiveAt,
      }),
    ) &&
    isSuccessfulTerminationOktaGroupResult(
      input.oktaProjection.groups.status,
      groupResult,
    )
  );
}

function isSuccessfulTerminationOktaProfileResult(
  status: OktaTerminationProjectionImpactEvidence["profile"]["status"],
  result: OktaTerminationProjectionImpactEvidence["profile"]["result"],
): boolean {
  if (status === "projected") {
    return result.outcome === "success";
  }

  return (
    status === "already_projected" &&
    result.outcome === "skipped" &&
    result.operation === "disable" &&
    result.reason === "already_deprovisioned"
  );
}

function isSuccessfulTerminationOktaGroupResult(
  status: OktaTerminationProjectionImpactEvidence["groups"]["status"],
  result: NonNullable<
    OktaTerminationProjectionImpactEvidence["groups"]["result"]
  >,
): boolean {
  if (status === "projected") {
    return result.outcome === "success";
  }

  return (
    status === "already_projected" &&
    result.outcome === "skipped" &&
    result.reason === "already_projected"
  );
}

function isMockOktaProjectionMetadata(
  metadata: OktaTerminationProjectionImpactEvidence["profile"]["result"]["metadata"],
  projectionKey: string,
): boolean {
  return (
    metadata.provider === "okta" &&
    metadata.adapterMode === "mock" &&
    metadata.synthetic === true &&
    metadata.projectionKey === projectionKey
  );
}

function expectedTerminationOktaProjectionKey(input: {
  operation: "disable";
  employeeNumber: string;
  effectiveAt: string;
}): string {
  return [
    "okta",
    "mock",
    encodeProjectionKeyPart(input.operation),
    encodeProjectionKeyPart(input.employeeNumber),
    encodeProjectionKeyPart(input.effectiveAt),
  ].join(":");
}

function expectedTerminationOktaGroupProjectionKey(input: {
  employeeNumber: string;
  groupKeys: string[];
  effectiveAt: string;
}): string {
  return [
    "okta",
    "mock",
    encodeProjectionKeyPart("replace_user_groups"),
    encodeProjectionKeyPart(input.employeeNumber),
    encodeProjectionKeyPart(JSON.stringify(input.groupKeys)),
    encodeProjectionKeyPart(input.effectiveAt),
  ].join(":");
}

function isTerminationTraceInstantAfter(left: string, right: string): boolean {
  return (
    terminationTraceTimestampMillis(left) >
    terminationTraceTimestampMillis(right)
  );
}

function isTerminationTraceSameInstant(left: string, right: string): boolean {
  return (
    terminationTraceTimestampMillis(left) ===
    terminationTraceTimestampMillis(right)
  );
}

function terminationTraceTimestampMillis(timestamp: string): number {
  const match = terminationTraceTimestampPattern.exec(timestamp);
  if (
    !match ||
    !isValidTerminationTraceIsoDateParts(match[1], match[2], match[3])
  ) {
    throwTerminationTraceError(
      "MVP-C termination trace timing evidence must include a valid ISO timestamp",
    );
  }

  const millis = Date.parse(timestamp);
  if (!Number.isFinite(millis)) {
    throwTerminationTraceError(
      "MVP-C termination trace timing evidence must include a valid ISO timestamp",
    );
  }

  return millis;
}

function isValidTerminationTraceIsoDateParts(
  yearText: string,
  monthText: string,
  dayText: string,
): boolean {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function terminationTraceTimestampDate(timestamp: string): string {
  return new Date(terminationTraceTimestampMillis(timestamp))
    .toISOString()
    .slice(0, 10);
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

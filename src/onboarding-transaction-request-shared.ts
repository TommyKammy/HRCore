import { OnboardingTransactionRequestValidationError } from "./onboarding-transaction-request-error.js";
import {
  buildOnboardingApplyAuditEventId,
  buildOnboardingApplyJobAttemptId,
  buildOnboardingApplyJobRunId,
  buildOnboardingApplyLifecycleEventIdForRequest,
} from "./onboarding-transaction-request-ids.js";
import {
  readAuditEventById,
  readOnboardingApplyJobAttemptByCorrelation,
  readOnboardingApplyJobRun,
  readOnboardingTransactionRequestById,
} from "./onboarding-transaction-request-readers.js";
import type {
  AppliedOnboardingTransactionRequestResult,
  ApplyApprovedOnboardingTransactionRequestInput,
  ApplyDueOnboardingTransactionRequestsItemResult,
  ApplyDueOnboardingTransactionRequestsResult,
  ApplyDueOnboardingTransactionRequestsStatus,
  ExistingAppliedOnboardingTransactionRequestRow,
  ExistingAuditEventRow,
  ExistingOnboardingApplyJobAttemptRow,
  ExistingOnboardingApplyJobRunRow,
  ExistingOnboardingTransactionRequestRow,
  OnboardingApprovalDecision,
  OnboardingApprovalDecisionInput,
  OnboardingApprovalDecisionResult,
  OnboardingTransactionRequestDatabase,
  OnboardingTransactionRequestInput,
  OnboardingTransactionRequestPayload,
  OnboardingTransactionRequestPersistedStatus,
  OnboardingTransactionRequestPersistenceResult,
  SqlRunResult,
} from "./onboarding-transaction-request-types.js";
import {
  isRecord,
  isValidIsoDate,
} from "./onboarding-transaction-request-validation.js";

export type OnboardingDecisionTarget = {
  statusCode: OnboardingApprovalDecisionResult["statusCode"];
  auditAction: string;
};

export function assertSingleDraftUpdate(result: unknown): void {
  if (!isSingleSqlChange(result)) {
    throw new Error(
      "onboarding transaction request edit conflicts with the current draft state",
    );
  }
}

export function isSingleSqlChange(result: unknown): boolean {
  return (
    isSqlRunResult(result) && (result.changes === 1 || result.changes === 1n)
  );
}

export function getOnboardingDecisionTarget(
  decision: OnboardingApprovalDecision,
): OnboardingDecisionTarget {
  switch (decision) {
    case "approve":
      return {
        statusCode: "approved",
        auditAction: "mvp_a.onboarding.approve",
      };
    case "return":
      return {
        statusCode: "returned",
        auditAction: "mvp_a.onboarding.return",
      };
    case "reject":
      return {
        statusCode: "rejected",
        auditAction: "mvp_a.onboarding.reject",
      };
    case "cancel":
      return {
        statusCode: "cancelled",
        auditAction: "mvp_a.onboarding.cancel",
      };
  }
}

export function assertLegalOnboardingDecision(
  existing: ExistingOnboardingTransactionRequestRow,
  decision: OnboardingApprovalDecisionInput,
  target: OnboardingDecisionTarget,
): void {
  if (existing.status_code === target.statusCode) {
    throw new Error(
      "onboarding transaction request decision audit evidence is missing for the repeated command",
    );
  }

  if (existing.status_code !== "submitted") {
    throw new Error(
      `onboarding transaction request ${decision.decision} decision requires submitted state`,
    );
  }
}

export function isSqlRunResult(result: unknown): result is SqlRunResult {
  if (!isRecord(result) || !("changes" in result)) {
    return false;
  }

  return (
    typeof result.changes === "number" || typeof result.changes === "bigint"
  );
}

export function recordOnboardingApplyJobRun(
  db: OnboardingTransactionRequestDatabase,
  run: ExistingOnboardingApplyJobRunRow & {
    correlationId: string;
    workerId: string;
    startedAt: string;
    effectiveDate: string;
  },
): ExistingOnboardingApplyJobRunRow {
  db.prepare(
    `
      INSERT INTO onboarding_apply_job_run (
        id,
        correlation_id,
        worker_id,
        started_at,
        effective_date,
        attempted,
        applied,
        failed,
        skipped
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(correlation_id) DO NOTHING
    `,
  ).run(
    buildOnboardingApplyJobRunId(run.correlationId),
    run.correlationId,
    run.workerId,
    run.startedAt,
    run.effectiveDate,
    run.attempted,
    run.applied,
    run.failed,
    run.skipped,
  );

  const recorded = readOnboardingApplyJobRun(db, run.correlationId);
  if (!recorded) {
    throw new Error("onboarding apply job run was not persisted");
  }

  return recorded;
}

export function matchesOnboardingTransactionRequestRetry(
  existing: ExistingOnboardingTransactionRequestRow,
  input: OnboardingTransactionRequestInput,
  payloadJson: string,
): boolean {
  const requestAlreadyAccepted =
    existing.status_code === input.statusCode ||
    (input.statusCode === "submitted" &&
      (existing.status_code === "completed" ||
        existing.status_code === "approved"));

  return (
    requestAlreadyAccepted &&
    existing.person_id === input.person.id &&
    existing.display_name === input.person.displayName &&
    existing.created_at === input.person.createdAt &&
    existing.request_type === input.requestType &&
    existing.requested_at === input.requestedAt &&
    existing.correlation_id === input.correlationId &&
    existing.payload_version === input.payloadVersion &&
    existing.payload_json === payloadJson
  );
}

export function buildOnboardingTransactionRequestRetryResult(
  existing: ExistingOnboardingTransactionRequestRow,
): OnboardingTransactionRequestPersistenceResult {
  if (existing.correlation_id === null) {
    throw new Error(
      "onboarding transaction request retry read malformed existing request",
    );
  }

  return {
    personId: existing.person_id,
    transactionRequestId: existing.transaction_request_id,
    statusCode:
      existing.status_code as OnboardingTransactionRequestPersistedStatus,
    correlationId: existing.correlation_id,
  };
}

export function buildOnboardingDecisionResult(
  existing: ExistingOnboardingTransactionRequestRow,
  decision: OnboardingApprovalDecisionInput,
  target: OnboardingDecisionTarget,
  auditEventId: string,
): OnboardingApprovalDecisionResult {
  return {
    personId: existing.person_id,
    transactionRequestId: existing.transaction_request_id,
    statusCode: target.statusCode,
    decision: decision.decision,
    auditEventId,
    correlationId: decision.correlationId,
  };
}

export function buildCompletedOnboardingApplyRetryResult(
  existing: ExistingAppliedOnboardingTransactionRequestRow,
  payload: OnboardingTransactionRequestPayload,
  apply: ApplyApprovedOnboardingTransactionRequestInput,
  lifecycleEventId: string,
): AppliedOnboardingTransactionRequestResult {
  assertCompletedOnboardingApplyMatchesInput(
    existing,
    payload,
    apply,
    lifecycleEventId,
  );

  return {
    personId: existing.person_id,
    employmentId: payload.employment.id,
    assignmentId: payload.assignment.id,
    transactionRequestId: apply.transactionRequestId,
    lifecycleEventId,
    statusCode: "completed",
    correlationId: apply.correlationId,
  };
}

export function assertCompletedOnboardingApplyMatchesInput(
  existing: ExistingAppliedOnboardingTransactionRequestRow,
  payload: OnboardingTransactionRequestPayload,
  apply: ApplyApprovedOnboardingTransactionRequestInput,
  lifecycleEventId: string,
): void {
  if (
    existing.transaction_status_code !== "completed" ||
    existing.request_type !== "hire" ||
    existing.lifecycle_event_id !== lifecycleEventId ||
    existing.lifecycle_event_type !== "hire" ||
    existing.lifecycle_effective_date !== payload.effectiveDate ||
    existing.lifecycle_occurred_at !== apply.appliedAt ||
    existing.employment_id !== payload.employment.id ||
    existing.employment_code !== payload.employment.employmentCode ||
    existing.employment_status_code !== "active" ||
    existing.employment_start_date !== payload.employment.startDate ||
    existing.employment_end_date !== null ||
    existing.assignment_id !== payload.assignment.id ||
    existing.assignment_code !== payload.assignment.assignmentCode ||
    existing.organization_code !== payload.assignment.departmentReference ||
    existing.position_code !== (payload.assignment.positionCode ?? null) ||
    existing.assignment_start_date !== payload.effectiveDate ||
    existing.assignment_end_date !== null ||
    existing.audit_event_id !==
      buildOnboardingApplyAuditEventId(lifecycleEventId) ||
    existing.audit_actor_id !== apply.appliedBy ||
    existing.audit_action !== "mvp_a.onboarding.apply" ||
    existing.audit_subject_table !== "lifecycle_event" ||
    existing.audit_subject_id !== lifecycleEventId ||
    existing.audit_occurred_at !== apply.appliedAt ||
    existing.audit_correlation_id !== apply.correlationId
  ) {
    throw new Error(
      "approved onboarding apply retry conflicts with the completed request",
    );
  }
}

export function recordOnboardingApplyJobAttempt(
  db: OnboardingTransactionRequestDatabase,
  attempt: {
    transactionRequestId: string;
    personId: string;
    status: ApplyDueOnboardingTransactionRequestsStatus;
    attemptedAt: string;
    workerId: string;
    correlationId: string;
    retryable: boolean;
    errorMessage: string | null;
  },
): ExistingOnboardingApplyJobAttemptRow {
  db.prepare(
    `
      INSERT INTO onboarding_apply_job_attempt (
        id,
        transaction_request_id,
        person_id,
        status_code,
        attempted_at,
        worker_id,
        correlation_id,
        retryable,
        error_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(correlation_id) DO NOTHING
    `,
  ).run(
    buildOnboardingApplyJobAttemptId(
      attempt.transactionRequestId,
      attempt.correlationId,
    ),
    attempt.transactionRequestId,
    attempt.personId,
    attempt.status,
    attempt.attemptedAt,
    attempt.workerId,
    attempt.correlationId,
    attempt.retryable ? 1 : 0,
    attempt.errorMessage,
  );

  const recorded = readOnboardingApplyJobAttemptByCorrelation(
    db,
    attempt.correlationId,
  );
  if (!recorded) {
    throw new Error("onboarding apply job attempt was not persisted");
  }
  if (recorded.transaction_request_id !== attempt.transactionRequestId) {
    throw new Error(
      "onboarding apply job attempt correlation conflicts with another request",
    );
  }
  if (attempt.status === "applied" && recorded.status_code !== "applied") {
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET status_code = 'applied',
            attempted_at = ?,
            worker_id = ?,
            retryable = 0,
            error_message = NULL
        WHERE correlation_id = ?
          AND transaction_request_id = ?
          AND status_code != 'applied'
      `,
    ).run(
      attempt.attemptedAt,
      attempt.workerId,
      attempt.correlationId,
      attempt.transactionRequestId,
    );
    const upgraded = readOnboardingApplyJobAttemptByCorrelation(
      db,
      attempt.correlationId,
    );
    if (
      !upgraded ||
      upgraded.transaction_request_id !== attempt.transactionRequestId ||
      upgraded.status_code !== "applied"
    ) {
      throw new Error(
        "onboarding apply job attempt applied outcome was not persisted",
      );
    }

    return upgraded;
  }

  return recorded;
}

export function buildOnboardingApplyJobAttemptResult(
  existing: ExistingOnboardingApplyJobAttemptRow,
): ApplyDueOnboardingTransactionRequestsItemResult {
  if (existing.status_code === "applied") {
    return {
      transactionRequestId: existing.transaction_request_id,
      status: "applied",
      lifecycleEventId: buildOnboardingApplyLifecycleEventIdForRequest(
        existing.transaction_request_id,
      ),
    };
  }

  if (
    existing.status_code !== "retryable_failure" &&
    existing.status_code !== "non_retryable_failure"
  ) {
    throw new Error("onboarding apply job attempt retry is malformed");
  }

  return {
    transactionRequestId: existing.transaction_request_id,
    status: existing.status_code,
    errorMessage:
      existing.error_message ?? "unknown onboarding apply attempt failure",
  };
}

export function buildOnboardingDecisionRetryResultAfterConflict(
  db: OnboardingTransactionRequestDatabase,
  decision: OnboardingApprovalDecisionInput,
  target: OnboardingDecisionTarget,
  auditEventId: string,
): OnboardingApprovalDecisionResult | undefined {
  const latest = readOnboardingTransactionRequestById(
    db,
    decision.transactionRequestId,
  );
  const auditEvent = readAuditEventById(db, auditEventId);

  if (
    !latest ||
    latest.request_type !== "hire" ||
    latest.status_code !== target.statusCode ||
    !auditEvent
  ) {
    return undefined;
  }

  assertMatchingOnboardingDecisionAuditEvent(
    auditEvent,
    latest,
    decision,
    target,
  );
  return buildOnboardingDecisionResult(latest, decision, target, auditEventId);
}

export function buildApplyDueOnboardingTransactionRequestsResult(
  correlationId: string,
  attempts:
    | ApplyDueOnboardingTransactionRequestsItemResult[]
    | ExistingOnboardingApplyJobAttemptRow[],
  skipped: number,
): ApplyDueOnboardingTransactionRequestsResult {
  const results = attempts.map((attempt) =>
    "status" in attempt
      ? attempt
      : buildOnboardingApplyJobAttemptResult(attempt),
  );
  const failed = results.filter((result) => result.status !== "applied").length;

  return {
    attempted: results.length,
    applied: results.length - failed,
    failed,
    skipped,
    correlationId,
    results,
  };
}

export function buildApplyDueOnboardingTransactionRequestsResultFromRun(
  correlationId: string,
  run: ExistingOnboardingApplyJobRunRow,
): ApplyDueOnboardingTransactionRequestsResult {
  return {
    attempted: run.attempted,
    applied: run.applied,
    failed: run.failed,
    skipped: run.skipped,
    correlationId,
    results: [],
  };
}

export function getMvpWorkerEffectiveDate(now: string): string {
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) {
    throw new OnboardingTransactionRequestValidationError(
      "now must be a valid ISO timestamp",
    );
  }

  const effectiveDate = parsed.toISOString().slice(0, 10);
  if (!isValidIsoDate(effectiveDate)) {
    throw new OnboardingTransactionRequestValidationError(
      "now must be a valid ISO timestamp",
    );
  }

  return effectiveDate;
}

export function encodeStableKey(parts: string[]): string {
  return Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
}

export function isRetryableOnboardingApplyWorkerFailure(
  error: unknown,
): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  return !(
    error instanceof OnboardingTransactionRequestValidationError ||
    error.message.includes("persisted onboarding apply payload") ||
    error.message.includes("requires an approved hire transaction request") ||
    error.message.includes("retry conflicts with the completed request")
  );
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "unknown onboarding apply error";
}

export function assertMatchingOnboardingDecisionAuditEvent(
  auditEvent: ExistingAuditEventRow,
  existing: ExistingOnboardingTransactionRequestRow,
  decision: OnboardingApprovalDecisionInput,
  target: OnboardingDecisionTarget,
): void {
  if (
    auditEvent.actor_id !== decision.decidedBy ||
    auditEvent.action !== target.auditAction ||
    auditEvent.subject_table !== "transaction_request" ||
    auditEvent.subject_id !== existing.transaction_request_id ||
    auditEvent.occurred_at !== decision.decidedAt ||
    auditEvent.correlation_id !== decision.correlationId
  ) {
    throw new Error(
      "onboarding transaction request repeated decision conflicts with existing audit evidence",
    );
  }
}

export function assertEditableDraftBinding(
  existing: ExistingOnboardingTransactionRequestRow,
  input: OnboardingTransactionRequestInput,
): void {
  if (
    existing.transaction_request_id !== input.id ||
    existing.person_id !== input.person.id ||
    existing.correlation_id !== input.correlationId
  ) {
    throw new Error(
      "onboarding transaction request edit conflicts with the existing request binding",
    );
  }

  if (existing.status_code !== "draft" && existing.status_code !== "returned") {
    throw new Error(
      "onboarding transaction request can only be edited while draft or returned",
    );
  }
}

export function rollbackNamedSavepoint(
  db: OnboardingTransactionRequestDatabase,
  savepointName: string,
): void {
  try {
    db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
  } catch {
    // Preserve the original write failure; rollback cleanup is best-effort.
  }

  try {
    db.exec(`RELEASE SAVEPOINT ${savepointName}`);
  } catch {
    // Preserve the original write failure; rollback cleanup is best-effort.
  }
}

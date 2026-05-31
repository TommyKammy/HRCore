import {
  buildOnboardingApplyAuditEventId,
  buildOnboardingApplyLifecycleEventId,
} from "./onboarding-transaction-request-ids.js";
import {
  parseApplyApprovedOnboardingTransactionRequestInput,
  parsePersistedOnboardingApplyPayload,
} from "./onboarding-transaction-request-parser.js";
import {
  readCompletedOnboardingApply,
  readOnboardingTransactionRequestById,
} from "./onboarding-transaction-request-readers.js";
import {
  buildCompletedOnboardingApplyRetryResult,
  isSingleSqlChange,
  rollbackNamedSavepoint,
} from "./onboarding-transaction-request-shared.js";
import type {
  AppliedOnboardingTransactionRequestResult,
  ApplyApprovedOnboardingTransactionRequestInput,
  OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request-types.js";

export function applyApprovedOnboardingTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): AppliedOnboardingTransactionRequestResult {
  const apply = parseApplyApprovedOnboardingTransactionRequestInput(input);
  const lifecycleEventId = buildOnboardingApplyLifecycleEventId(apply);
  const auditEventId = buildOnboardingApplyAuditEventId(lifecycleEventId);

  const existing = readOnboardingTransactionRequestById(
    db,
    apply.transactionRequestId,
  );
  if (
    existing &&
    existing.request_type === "hire" &&
    existing.status_code === "completed"
  ) {
    const payload = parsePersistedOnboardingApplyPayload(existing);
    const completedApply = readCompletedOnboardingApply(
      db,
      apply,
      lifecycleEventId,
      auditEventId,
      payload,
    );
    if (!completedApply) {
      throw new Error(
        "approved onboarding apply retry conflicts with the completed request",
      );
    }

    return buildCompletedOnboardingApplyRetryResult(
      completedApply,
      payload,
      apply,
      lifecycleEventId,
    );
  }

  if (
    !existing ||
    existing.request_type !== "hire" ||
    existing.status_code !== "approved"
  ) {
    throw new Error(
      "approved onboarding apply requires an approved hire transaction request",
    );
  }

  const payload = parsePersistedOnboardingApplyPayload(existing);

  db.exec("SAVEPOINT approved_onboarding_transaction_request_apply");
  try {
    db.prepare(
      `
        INSERT INTO employment (
          id,
          person_id,
          employment_code,
          status_code,
          start_date,
          end_date
        )
        VALUES (?, ?, ?, 'active', ?, NULL)
      `,
    ).run(
      payload.employment.id,
      existing.person_id,
      payload.employment.employmentCode,
      payload.employment.startDate,
    );

    db.prepare(
      `
        INSERT INTO assignment (
          id,
          person_id,
          employment_id,
          assignment_code,
          organization_code,
          position_code,
          start_date,
          end_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
      `,
    ).run(
      payload.assignment.id,
      existing.person_id,
      payload.employment.id,
      payload.assignment.assignmentCode,
      payload.assignment.departmentReference,
      payload.assignment.positionCode ?? null,
      payload.effectiveDate,
    );

    db.prepare(
      `
        INSERT INTO lifecycle_event (
          id,
          person_id,
          transaction_request_id,
          event_type,
          effective_date,
          occurred_at
        )
        VALUES (?, ?, ?, 'hire', ?, ?)
      `,
    ).run(
      lifecycleEventId,
      existing.person_id,
      existing.transaction_request_id,
      payload.effectiveDate,
      apply.appliedAt,
    );

    const updateResult = db
      .prepare(
        `
          UPDATE transaction_request
          SET status_code = 'completed'
          WHERE id = ?
            AND person_id = ?
            AND request_type = 'hire'
            AND status_code = 'approved'
        `,
      )
      .run(existing.transaction_request_id, existing.person_id);
    if (!isSingleSqlChange(updateResult)) {
      throw new Error(
        "approved onboarding apply conflicts with the current approved state",
      );
    }

    db.prepare(
      `
        INSERT INTO audit_event (
          id,
          actor_id,
          action,
          subject_table,
          subject_id,
          occurred_at,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, 'mvp_a.onboarding.apply', 'lifecycle_event', ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      auditEventId,
      apply.appliedBy,
      lifecycleEventId,
      apply.appliedAt,
      apply.correlationId,
    );

    db.exec("RELEASE SAVEPOINT approved_onboarding_transaction_request_apply");
  } catch (error) {
    rollbackNamedSavepoint(db, "approved_onboarding_transaction_request_apply");
    const completedAfterRollback = readCompletedOnboardingApply(
      db,
      apply,
      lifecycleEventId,
      auditEventId,
      payload,
    );
    if (completedAfterRollback) {
      return buildCompletedOnboardingApplyRetryResult(
        completedAfterRollback,
        payload,
        apply,
        lifecycleEventId,
      );
    }

    throw error;
  }

  return {
    personId: existing.person_id,
    employmentId: payload.employment.id,
    assignmentId: payload.assignment.id,
    transactionRequestId: existing.transaction_request_id,
    lifecycleEventId,
    statusCode: "completed",
    correlationId: apply.correlationId,
  };
}

export { applyApprovedOnboardingTransactionRequestWithOktaProjection } from "./onboarding-okta-writeback-integration.js";
export type {
  AppliedOnboardingTransactionRequestResult,
  ApplyApprovedOnboardingTransactionRequestInput,
} from "./onboarding-transaction-request-types.js";
export type {
  AppliedOnboardingTransactionRequestWithOktaProjectionResult,
  ApplyApprovedOnboardingTransactionRequestWithOktaProjectionInput,
  OktaOnboardingUserProjectionResult,
  OktaOnboardingUserProjectionStatus,
  OnboardingWorkEmailWritebackResult,
  OnboardingWorkEmailWritebackStatus,
} from "./onboarding-okta-writeback-integration.js";

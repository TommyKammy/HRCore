import { parseApplyApprovedOnboardingTransactionRequestInput } from "./onboarding-transaction-request-parser.js";
import { readOnboardingTransactionRequestById } from "./onboarding-transaction-request-readers.js";
import { rollbackNamedSavepoint } from "./onboarding-transaction-request-shared.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request.js";
import {
  assertNoOtherConflictingTerminationAssignments,
  assertSupportedTerminationWindow,
  parsePersistedTerminationApplyPayload,
  readCompletedTerminationApply,
  readCurrentTerminationAssignment,
  readCurrentTerminationEmployment,
} from "./termination-transaction-request-apply-reads.js";
import { buildCompletedTerminationApplyRetryResult } from "./termination-transaction-request-apply-retry.js";
import type {
  AppliedTerminationTransactionRequestResult,
  ApplyApprovedTerminationTransactionRequestInput,
} from "./termination-transaction-request-apply-types.js";
import {
  closeCurrentTerminationAssignment,
  closeCurrentTerminationEmployment,
  insertTerminationApplyAuditEvent,
  insertTerminationApplyLifecycleEvent,
  markTerminationTransactionRequestCompleted,
} from "./termination-transaction-request-apply-writes.js";
import {
  buildTerminationApplyAuditEventId,
  buildTerminationApplyLifecycleEventId,
} from "./termination-transaction-request-ids.js";

export type {
  AppliedTerminationTransactionRequestResult,
  ApplyApprovedTerminationTransactionRequestInput,
} from "./termination-transaction-request-apply-types.js";
export { parsePersistedTerminationApplyPayload } from "./termination-transaction-request-apply-reads.js";

export function applyApprovedTerminationTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): AppliedTerminationTransactionRequestResult {
  const apply = parseApplyApprovedOnboardingTransactionRequestInput(input);
  const lifecycleEventId = buildTerminationApplyLifecycleEventId(apply);
  const auditEventId = buildTerminationApplyAuditEventId(lifecycleEventId);
  const existing = readOnboardingTransactionRequestById(
    db,
    apply.transactionRequestId,
  );

  if (
    existing &&
    existing.request_type === "terminate" &&
    existing.status_code === "completed"
  ) {
    const payload = parsePersistedTerminationApplyPayload(existing);
    const completedApply = readCompletedTerminationApply(
      db,
      apply,
      lifecycleEventId,
      auditEventId,
      payload,
    );
    if (!completedApply) {
      throw new Error(
        "approved termination apply retry conflicts with the completed request",
      );
    }

    return buildCompletedTerminationApplyRetryResult(
      completedApply,
      payload,
      apply,
      lifecycleEventId,
    );
  }

  if (
    !existing ||
    existing.request_type !== "terminate" ||
    existing.status_code !== "approved"
  ) {
    throw new Error(
      "approved termination apply requires an approved termination transaction request",
    );
  }

  const payload = parsePersistedTerminationApplyPayload(existing);
  const employment = readCurrentTerminationEmployment(db, existing, payload);
  const assignment = readCurrentTerminationAssignment(
    db,
    existing,
    payload,
    employment,
  );
  assertSupportedTerminationWindow(employment, assignment, payload);
  assertNoOtherConflictingTerminationAssignments(
    db,
    existing,
    employment,
    assignment,
    payload,
  );

  db.exec("SAVEPOINT approved_termination_transaction_request_apply");
  try {
    closeCurrentTerminationAssignment(
      db,
      existing,
      employment,
      assignment,
      payload,
    );
    closeCurrentTerminationEmployment(
      db,
      existing,
      employment,
      assignment,
      payload,
    );
    insertTerminationApplyLifecycleEvent(
      db,
      existing,
      apply,
      lifecycleEventId,
      payload,
    );
    markTerminationTransactionRequestCompleted(db, existing);
    insertTerminationApplyAuditEvent(db, apply, lifecycleEventId, auditEventId);

    db.exec("RELEASE SAVEPOINT approved_termination_transaction_request_apply");
  } catch (error) {
    rollbackNamedSavepoint(
      db,
      "approved_termination_transaction_request_apply",
    );
    const completedAfterRollback = readCompletedTerminationApply(
      db,
      apply,
      lifecycleEventId,
      auditEventId,
      payload,
    );
    if (completedAfterRollback) {
      return buildCompletedTerminationApplyRetryResult(
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
    employmentId: employment.id,
    assignmentId: assignment.id,
    transactionRequestId: existing.transaction_request_id,
    lifecycleEventId,
    statusCode: "completed",
    correlationId: apply.correlationId,
  };
}

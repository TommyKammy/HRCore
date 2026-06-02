import type { TerminationTransactionRequestPayload } from "./termination-transaction-request-contract.js";
import { buildTerminationApplyAuditEventId } from "./termination-transaction-request-ids.js";
import type {
  AppliedTerminationTransactionRequestResult,
  ApplyApprovedTerminationTransactionRequestInput,
  ExistingCompletedTerminationApplyRow,
} from "./termination-transaction-request-apply-types.js";

export function buildCompletedTerminationApplyRetryResult(
  existing: ExistingCompletedTerminationApplyRow,
  payload: TerminationTransactionRequestPayload,
  apply: ApplyApprovedTerminationTransactionRequestInput,
  lifecycleEventId: string,
): AppliedTerminationTransactionRequestResult {
  assertCompletedTerminationApplyMatchesInput(
    existing,
    payload,
    apply,
    lifecycleEventId,
  );

  return {
    personId: existing.person_id,
    employmentId: payload.currentEmployment.employmentId,
    assignmentId: payload.currentAssignment.assignmentId,
    transactionRequestId: apply.transactionRequestId,
    lifecycleEventId,
    statusCode: "completed",
    correlationId: apply.correlationId,
  };
}

function assertCompletedTerminationApplyMatchesInput(
  existing: ExistingCompletedTerminationApplyRow,
  payload: TerminationTransactionRequestPayload,
  apply: ApplyApprovedTerminationTransactionRequestInput,
  lifecycleEventId: string,
): void {
  if (
    existing.transaction_status_code !== "completed" ||
    existing.request_type !== "terminate" ||
    existing.lifecycle_event_id !== lifecycleEventId ||
    existing.lifecycle_event_type !== "termination" ||
    existing.lifecycle_effective_date !== payload.effectiveDate ||
    existing.lifecycle_occurred_at !== apply.appliedAt ||
    existing.employment_id !== payload.currentEmployment.employmentId ||
    existing.employment_code !== payload.currentEmployment.employmentCode ||
    existing.employment_status_code !== "terminated" ||
    existing.employment_start_date === null ||
    existing.employment_start_date > payload.effectiveDate ||
    existing.employment_end_date !== payload.effectiveDate ||
    existing.assignment_id !== payload.currentAssignment.assignmentId ||
    existing.assignment_employment_id !==
      payload.currentEmployment.employmentId ||
    existing.assignment_code !== payload.currentAssignment.assignmentCode ||
    existing.assignment_start_date === null ||
    existing.assignment_start_date > payload.effectiveDate ||
    existing.assignment_end_date !== payload.effectiveDate ||
    existing.audit_event_id !==
      buildTerminationApplyAuditEventId(lifecycleEventId) ||
    existing.audit_actor_id !== apply.appliedBy ||
    existing.audit_action !== "mvp_c.termination.apply" ||
    existing.audit_subject_table !== "lifecycle_event" ||
    existing.audit_subject_id !== lifecycleEventId ||
    existing.audit_occurred_at !== apply.appliedAt ||
    existing.audit_correlation_id !== apply.correlationId
  ) {
    throw new Error(
      "approved termination apply retry conflicts with the completed request",
    );
  }
}

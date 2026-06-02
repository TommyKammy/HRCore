import type { ExistingOnboardingTransactionRequestRow } from "./onboarding-transaction-request-types.js";
import { parseTerminationPayload } from "./termination-transaction-request-contract.js";
import type { TerminationTransactionRequestPayload } from "./termination-transaction-request-contract.js";
import type {
  ApplyApprovedTerminationTransactionRequestInput,
  ExistingCompletedTerminationApplyRow,
  ExistingTerminationAssignmentRow,
  ExistingTerminationEmploymentRow,
  TerminationApplyDatabase,
} from "./termination-transaction-request-apply-types.js";

export function parsePersistedTerminationApplyPayload(
  existing: ExistingOnboardingTransactionRequestRow,
): TerminationTransactionRequestPayload {
  if (existing.payload_version !== "mvp_c_termination_v1") {
    throw new Error(
      "persisted termination apply payload version is unsupported",
    );
  }
  if (existing.payload_json === null) {
    throw new Error("persisted termination apply payload is missing");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(existing.payload_json);
  } catch {
    throw new Error("persisted termination apply payload is malformed JSON");
  }

  return parseTerminationPayload(payload);
}

export function readCurrentTerminationEmployment(
  db: TerminationApplyDatabase,
  existing: ExistingOnboardingTransactionRequestRow,
  payload: TerminationTransactionRequestPayload,
): ExistingTerminationEmploymentRow {
  const employment = db
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
        WHERE id = ?
          AND person_id = ?
          AND employment_code = ?
        LIMIT 1
      `,
    )
    .get(
      payload.currentEmployment.employmentId,
      existing.person_id,
      payload.currentEmployment.employmentCode,
    ) as ExistingTerminationEmploymentRow | undefined;

  if (!employment) {
    throw new Error(
      "approved termination apply requires the explicit current employment",
    );
  }

  return employment;
}

export function readCurrentTerminationAssignment(
  db: TerminationApplyDatabase,
  existing: ExistingOnboardingTransactionRequestRow,
  payload: TerminationTransactionRequestPayload,
  employment: ExistingTerminationEmploymentRow,
): ExistingTerminationAssignmentRow {
  const assignment = db
    .prepare(
      `
        SELECT
          id,
          person_id,
          employment_id,
          assignment_code,
          start_date,
          end_date
        FROM assignment
        WHERE id = ?
          AND person_id = ?
          AND employment_id = ?
          AND assignment_code = ?
        LIMIT 1
      `,
    )
    .get(
      payload.currentAssignment.assignmentId,
      existing.person_id,
      employment.id,
      payload.currentAssignment.assignmentCode,
    ) as ExistingTerminationAssignmentRow | undefined;

  if (!assignment) {
    throw new Error(
      "approved termination apply requires the explicit current assignment",
    );
  }

  return assignment;
}

export function assertSupportedTerminationWindow(
  employment: ExistingTerminationEmploymentRow,
  assignment: ExistingTerminationAssignmentRow,
  payload: TerminationTransactionRequestPayload,
): void {
  if (employment.status_code !== "active" || employment.end_date !== null) {
    throw new Error(
      "approved termination apply requires an active open current employment",
    );
  }
  if (assignment.end_date !== null) {
    throw new Error(
      "approved termination apply requires an open current assignment",
    );
  }
  if (
    employment.start_date > payload.effectiveDate ||
    assignment.start_date > payload.effectiveDate
  ) {
    throw new Error(
      "approved termination apply requires the effective date on or after the current employment and assignment start dates",
    );
  }
}

export function assertNoOtherConflictingTerminationAssignments(
  db: TerminationApplyDatabase,
  existing: ExistingOnboardingTransactionRequestRow,
  employment: ExistingTerminationEmploymentRow,
  assignment: ExistingTerminationAssignmentRow,
  payload: TerminationTransactionRequestPayload,
): void {
  const otherConflictingAssignment = db
    .prepare(
      `
        SELECT id
        FROM assignment
        WHERE person_id = ?
          AND employment_id = ?
          AND id <> ?
          AND (end_date IS NULL OR end_date > ?)
        LIMIT 1
      `,
    )
    .get(
      existing.person_id,
      employment.id,
      assignment.id,
      payload.effectiveDate,
    ) as { id: string } | undefined;

  if (otherConflictingAssignment) {
    throw new Error(
      "approved termination apply requires no other assignment extending beyond the termination effective date for the current employment",
    );
  }
}

export function readCompletedTerminationApply(
  db: TerminationApplyDatabase,
  apply: ApplyApprovedTerminationTransactionRequestInput,
  lifecycleEventId: string,
  auditEventId: string,
  payload: TerminationTransactionRequestPayload,
): ExistingCompletedTerminationApplyRow | undefined {
  return db
    .prepare(
      `
        SELECT
          transaction_request.status_code AS transaction_status_code,
          transaction_request.request_type,
          transaction_request.person_id,
          transaction_request.payload_version,
          transaction_request.payload_json,
          lifecycle_event.id AS lifecycle_event_id,
          lifecycle_event.event_type AS lifecycle_event_type,
          lifecycle_event.effective_date AS lifecycle_effective_date,
          lifecycle_event.occurred_at AS lifecycle_occurred_at,
          employment.id AS employment_id,
          employment.employment_code,
          employment.status_code AS employment_status_code,
          employment.start_date AS employment_start_date,
          employment.end_date AS employment_end_date,
          assignment.id AS assignment_id,
          assignment.employment_id AS assignment_employment_id,
          assignment.assignment_code,
          assignment.start_date AS assignment_start_date,
          assignment.end_date AS assignment_end_date,
          audit_event.id AS audit_event_id,
          audit_event.actor_id AS audit_actor_id,
          audit_event.action AS audit_action,
          audit_event.subject_table AS audit_subject_table,
          audit_event.subject_id AS audit_subject_id,
          audit_event.occurred_at AS audit_occurred_at,
          audit_event.correlation_id AS audit_correlation_id
        FROM transaction_request
        LEFT JOIN lifecycle_event
          ON lifecycle_event.id = ?
         AND lifecycle_event.transaction_request_id = transaction_request.id
         AND lifecycle_event.person_id = transaction_request.person_id
        LEFT JOIN audit_event
          ON audit_event.id = ?
        LEFT JOIN employment
          ON employment.id = ?
         AND employment.person_id = transaction_request.person_id
        LEFT JOIN assignment
          ON assignment.id = ?
         AND assignment.person_id = transaction_request.person_id
         AND assignment.employment_id = employment.id
        WHERE transaction_request.id = ?
          AND transaction_request.status_code = 'completed'
        LIMIT 1
      `,
    )
    .get(
      lifecycleEventId,
      auditEventId,
      payload.currentEmployment.employmentId,
      payload.currentAssignment.assignmentId,
      apply.transactionRequestId,
    ) as ExistingCompletedTerminationApplyRow | undefined;
}

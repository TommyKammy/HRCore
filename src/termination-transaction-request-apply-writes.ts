import type { ExistingOnboardingTransactionRequestRow } from "./onboarding-transaction-request-types.js";
import { isSingleSqlChange } from "./onboarding-transaction-request-shared.js";
import type { TerminationTransactionRequestPayload } from "./termination-transaction-request-contract.js";
import type {
  ApplyApprovedTerminationTransactionRequestInput,
  ExistingTerminationAssignmentRow,
  ExistingTerminationEmploymentRow,
  TerminationApplyDatabase,
} from "./termination-transaction-request-apply-types.js";

export function closeCurrentTerminationAssignment(
  db: TerminationApplyDatabase,
  existing: ExistingOnboardingTransactionRequestRow,
  employment: ExistingTerminationEmploymentRow,
  assignment: ExistingTerminationAssignmentRow,
  payload: TerminationTransactionRequestPayload,
): void {
  const closeAssignmentResult = db
    .prepare(
      `
          UPDATE assignment
          SET end_date = ?
          WHERE id = ?
            AND person_id = ?
            AND employment_id = ?
            AND assignment_code = ?
            AND start_date <= ?
            AND end_date IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM assignment AS other_assignment
              WHERE other_assignment.person_id = assignment.person_id
                AND other_assignment.employment_id = assignment.employment_id
                AND other_assignment.id <> assignment.id
                AND (
                  other_assignment.end_date IS NULL
                  OR other_assignment.end_date > ?
                )
            )
        `,
    )
    .run(
      payload.effectiveDate,
      assignment.id,
      existing.person_id,
      employment.id,
      payload.currentAssignment.assignmentCode,
      payload.effectiveDate,
      payload.effectiveDate,
    );
  if (!isSingleSqlChange(closeAssignmentResult)) {
    throw new Error(
      "approved termination apply conflicts with the current assignment state",
    );
  }
}

export function closeCurrentTerminationEmployment(
  db: TerminationApplyDatabase,
  existing: ExistingOnboardingTransactionRequestRow,
  employment: ExistingTerminationEmploymentRow,
  assignment: ExistingTerminationAssignmentRow,
  payload: TerminationTransactionRequestPayload,
): void {
  const closeEmploymentResult = db
    .prepare(
      `
          UPDATE employment
          SET status_code = 'terminated',
              end_date = ?
          WHERE id = ?
            AND person_id = ?
            AND employment_code = ?
            AND status_code = 'active'
            AND start_date <= ?
            AND end_date IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM assignment AS other_assignment
              WHERE other_assignment.person_id = employment.person_id
                AND other_assignment.employment_id = employment.id
                AND other_assignment.id <> ?
                AND (
                  other_assignment.end_date IS NULL
                  OR other_assignment.end_date > ?
                )
            )
        `,
    )
    .run(
      payload.effectiveDate,
      employment.id,
      existing.person_id,
      payload.currentEmployment.employmentCode,
      payload.effectiveDate,
      assignment.id,
      payload.effectiveDate,
    );
  if (!isSingleSqlChange(closeEmploymentResult)) {
    throw new Error(
      "approved termination apply conflicts with the current employment state",
    );
  }
}

export function insertTerminationApplyLifecycleEvent(
  db: TerminationApplyDatabase,
  existing: ExistingOnboardingTransactionRequestRow,
  apply: ApplyApprovedTerminationTransactionRequestInput,
  lifecycleEventId: string,
  payload: TerminationTransactionRequestPayload,
): void {
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
        VALUES (?, ?, ?, 'termination', ?, ?)
      `,
  ).run(
    lifecycleEventId,
    existing.person_id,
    existing.transaction_request_id,
    payload.effectiveDate,
    apply.appliedAt,
  );
}

export function markTerminationTransactionRequestCompleted(
  db: TerminationApplyDatabase,
  existing: ExistingOnboardingTransactionRequestRow,
): void {
  const updateResult = db
    .prepare(
      `
          UPDATE transaction_request
          SET status_code = 'completed'
          WHERE id = ?
            AND person_id = ?
            AND request_type = 'terminate'
            AND status_code = 'approved'
        `,
    )
    .run(existing.transaction_request_id, existing.person_id);
  if (!isSingleSqlChange(updateResult)) {
    throw new Error(
      "approved termination apply conflicts with the current approved state",
    );
  }
}

export function insertTerminationApplyAuditEvent(
  db: TerminationApplyDatabase,
  apply: ApplyApprovedTerminationTransactionRequestInput,
  lifecycleEventId: string,
  auditEventId: string,
): void {
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
        VALUES (?, ?, 'mvp_c.termination.apply', 'lifecycle_event', ?, ?, ?, 'synthetic_poc')
      `,
  ).run(
    auditEventId,
    apply.appliedBy,
    lifecycleEventId,
    apply.appliedAt,
    apply.correlationId,
  );
}

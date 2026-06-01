import {
  buildOnboardingApplyAuditEventId,
  buildOnboardingApplyLifecycleEventId,
} from "./onboarding-transaction-request-ids.js";
import { parseApplyApprovedOnboardingTransactionRequestInput } from "./onboarding-transaction-request-parser.js";
import { readOnboardingTransactionRequestById } from "./onboarding-transaction-request-readers.js";
import {
  isSingleSqlChange,
  rollbackNamedSavepoint,
} from "./onboarding-transaction-request-shared.js";
import type {
  ApplyApprovedOnboardingTransactionRequestInput,
  OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";
import type { ExistingOnboardingTransactionRequestRow } from "./onboarding-transaction-request-types.js";
import { parseTerminationPayload } from "./termination-transaction-request-contract.js";
import type { TerminationTransactionRequestPayload } from "./termination-transaction-request-contract.js";

export type ApplyApprovedTerminationTransactionRequestInput =
  ApplyApprovedOnboardingTransactionRequestInput;

export interface AppliedTerminationTransactionRequestResult {
  personId: string;
  employmentId: string;
  assignmentId: string;
  transactionRequestId: string;
  lifecycleEventId: string;
  statusCode: "completed";
  correlationId: string;
}

type ExistingTerminationEmploymentRow = {
  id: string;
  person_id: string;
  employment_code: string;
  status_code: string;
  start_date: string;
  end_date: string | null;
};

type ExistingTerminationAssignmentRow = {
  id: string;
  person_id: string;
  employment_id: string;
  assignment_code: string;
  start_date: string;
  end_date: string | null;
};

type ExistingCompletedTerminationApplyRow = {
  transaction_status_code: string;
  request_type: string;
  person_id: string;
  payload_version: string | null;
  payload_json: string | null;
  lifecycle_event_id: string | null;
  lifecycle_event_type: string | null;
  lifecycle_effective_date: string | null;
  lifecycle_occurred_at: string | null;
  employment_id: string | null;
  employment_code: string | null;
  employment_status_code: string | null;
  employment_start_date: string | null;
  employment_end_date: string | null;
  assignment_id: string | null;
  assignment_employment_id: string | null;
  assignment_code: string | null;
  assignment_start_date: string | null;
  assignment_end_date: string | null;
  audit_event_id: string | null;
  audit_actor_id: string | null;
  audit_action: string | null;
  audit_subject_table: string | null;
  audit_subject_id: string | null;
  audit_occurred_at: string | null;
  audit_correlation_id: string | null;
};

export function applyApprovedTerminationTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): AppliedTerminationTransactionRequestResult {
  const apply = parseApplyApprovedOnboardingTransactionRequestInput(input);
  const lifecycleEventId = buildOnboardingApplyLifecycleEventId(apply);
  const auditEventId = buildOnboardingApplyAuditEventId(lifecycleEventId);
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
    const closeAssignmentResult = db
      .prepare(
        `
          UPDATE assignment
          SET end_date = ?
          WHERE id = ?
            AND person_id = ?
            AND employment_id = ?
            AND assignment_code = ?
            AND end_date IS NULL
        `,
      )
      .run(
        payload.effectiveDate,
        assignment.id,
        existing.person_id,
        employment.id,
        payload.currentAssignment.assignmentCode,
      );
    if (!isSingleSqlChange(closeAssignmentResult)) {
      throw new Error(
        "approved termination apply conflicts with the current assignment state",
      );
    }

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
            AND end_date IS NULL
        `,
      )
      .run(
        payload.effectiveDate,
        employment.id,
        existing.person_id,
        payload.currentEmployment.employmentCode,
      );
    if (!isSingleSqlChange(closeEmploymentResult)) {
      throw new Error(
        "approved termination apply conflicts with the current employment state",
      );
    }

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

function readCurrentTerminationEmployment(
  db: OnboardingTransactionRequestDatabase,
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

function readCurrentTerminationAssignment(
  db: OnboardingTransactionRequestDatabase,
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

function assertSupportedTerminationWindow(
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

function assertNoOtherConflictingTerminationAssignments(
  db: OnboardingTransactionRequestDatabase,
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

function readCompletedTerminationApply(
  db: OnboardingTransactionRequestDatabase,
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

function buildCompletedTerminationApplyRetryResult(
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
      buildOnboardingApplyAuditEventId(lifecycleEventId) ||
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

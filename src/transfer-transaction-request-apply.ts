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
import { parseTransferPayload } from "./transfer-transaction-request-contract.js";
import type { TransferTransactionRequestPayload } from "./transfer-transaction-request-contract.js";
import {
  buildTransferTargetAssignmentCode,
  buildTransferTargetAssignmentId,
} from "./transfer-transaction-request-ids.js";

export type ApplyApprovedTransferTransactionRequestInput =
  ApplyApprovedOnboardingTransactionRequestInput;

export interface AppliedTransferTransactionRequestResult {
  personId: string;
  employmentId: string;
  closedAssignmentId: string;
  targetAssignmentId: string;
  transactionRequestId: string;
  lifecycleEventId: string;
  statusCode: "completed";
  correlationId: string;
}

export type ExistingTransferTransactionRequestRow = {
  person_id: string;
  transaction_request_id: string;
  display_name: string;
  created_at: string;
  request_type: string;
  status_code: string;
  requested_at: string;
  correlation_id: string | null;
  payload_version: string | null;
  payload_json: string | null;
};

type ExistingTransferAssignmentRow = {
  id: string;
  person_id: string;
  employment_id: string;
  assignment_code: string;
  organization_code: string;
  position_code: string | null;
  start_date: string;
  end_date: string | null;
};

type ExistingCompletedTransferApplyRow = {
  transaction_status_code: string;
  request_type: string;
  person_id: string;
  payload_version: string | null;
  payload_json: string | null;
  lifecycle_event_id: string | null;
  lifecycle_event_type: string | null;
  lifecycle_effective_date: string | null;
  lifecycle_occurred_at: string | null;
  current_assignment_id: string | null;
  current_employment_id: string | null;
  current_assignment_code: string | null;
  current_assignment_end_date: string | null;
  target_assignment_id: string | null;
  target_employment_id: string | null;
  target_assignment_code: string | null;
  target_organization_code: string | null;
  target_position_code: string | null;
  target_assignment_start_date: string | null;
  target_assignment_end_date: string | null;
  audit_event_id: string | null;
  audit_actor_id: string | null;
  audit_action: string | null;
  audit_subject_table: string | null;
  audit_subject_id: string | null;
  audit_occurred_at: string | null;
  audit_correlation_id: string | null;
};

export function applyApprovedTransferTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): AppliedTransferTransactionRequestResult {
  const apply = parseApplyApprovedOnboardingTransactionRequestInput(input);
  const lifecycleEventId = buildOnboardingApplyLifecycleEventId(apply);
  const auditEventId = buildOnboardingApplyAuditEventId(lifecycleEventId);
  const existing = readOnboardingTransactionRequestById(
    db,
    apply.transactionRequestId,
  );

  if (
    existing &&
    existing.request_type === "transfer" &&
    existing.status_code === "completed"
  ) {
    const payload = parsePersistedTransferApplyPayload(existing);
    const completedApply = readCompletedTransferApply(
      db,
      apply,
      lifecycleEventId,
      auditEventId,
      payload,
    );
    if (!completedApply) {
      throw new Error(
        "approved transfer apply retry conflicts with the completed request",
      );
    }

    return buildCompletedTransferApplyRetryResult(
      completedApply,
      payload,
      apply,
      lifecycleEventId,
    );
  }

  if (
    !existing ||
    existing.request_type !== "transfer" ||
    existing.status_code !== "approved"
  ) {
    throw new Error(
      "approved transfer apply requires an approved transfer transaction request",
    );
  }

  const payload = parsePersistedTransferApplyPayload(existing);
  const currentAssignment = readCurrentTransferAssignment(
    db,
    existing,
    payload,
  );
  assertSupportedTransferAssignmentWindow(currentAssignment, payload);
  assertNoTransferAssignmentCollision(db, currentAssignment, payload);

  const targetAssignmentId = buildTransferTargetAssignmentId(
    existing.transaction_request_id,
  );
  const targetAssignmentCode = buildTransferTargetAssignmentCode(payload);
  const closedCurrentAssignmentEndDate = previousIsoDate(payload.effectiveDate);

  db.exec("SAVEPOINT approved_transfer_transaction_request_apply");
  try {
    const closeCurrentResult = db
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
        closedCurrentAssignmentEndDate,
        currentAssignment.id,
        existing.person_id,
        currentAssignment.employment_id,
        payload.currentAssignment.assignmentCode,
      );
    if (!isSingleSqlChange(closeCurrentResult)) {
      throw new Error(
        "approved transfer apply conflicts with the current assignment state",
      );
    }

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
      targetAssignmentId,
      existing.person_id,
      currentAssignment.employment_id,
      targetAssignmentCode,
      payload.targetAssignment.organizationReference,
      payload.targetAssignment.positionCode ?? null,
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
        VALUES (?, ?, ?, 'assignment_change', ?, ?)
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
            AND request_type = 'transfer'
            AND status_code = 'approved'
        `,
      )
      .run(existing.transaction_request_id, existing.person_id);
    if (!isSingleSqlChange(updateResult)) {
      throw new Error(
        "approved transfer apply conflicts with the current approved state",
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
        VALUES (?, ?, 'mvp_b.transfer.apply', 'lifecycle_event', ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      auditEventId,
      apply.appliedBy,
      lifecycleEventId,
      apply.appliedAt,
      apply.correlationId,
    );

    db.exec("RELEASE SAVEPOINT approved_transfer_transaction_request_apply");
  } catch (error) {
    rollbackNamedSavepoint(db, "approved_transfer_transaction_request_apply");
    const completedAfterRollback = readCompletedTransferApply(
      db,
      apply,
      lifecycleEventId,
      auditEventId,
      payload,
    );
    if (completedAfterRollback) {
      return buildCompletedTransferApplyRetryResult(
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
    employmentId: currentAssignment.employment_id,
    closedAssignmentId: currentAssignment.id,
    targetAssignmentId,
    transactionRequestId: existing.transaction_request_id,
    lifecycleEventId,
    statusCode: "completed",
    correlationId: apply.correlationId,
  };
}

export function parsePersistedTransferApplyPayload(
  existing: ExistingTransferTransactionRequestRow,
): TransferTransactionRequestPayload {
  if (existing.payload_version !== "mvp_b_transfer_v1") {
    throw new Error("persisted transfer apply payload version is unsupported");
  }
  if (existing.payload_json === null) {
    throw new Error("persisted transfer apply payload is missing");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(existing.payload_json);
  } catch {
    throw new Error("persisted transfer apply payload is malformed JSON");
  }

  return parseTransferPayload(payload);
}

function readCurrentTransferAssignment(
  db: OnboardingTransactionRequestDatabase,
  existing: ExistingTransferTransactionRequestRow,
  payload: TransferTransactionRequestPayload,
): ExistingTransferAssignmentRow {
  const assignment = db
    .prepare(
      `
        SELECT
          id,
          person_id,
          employment_id,
          assignment_code,
          organization_code,
          position_code,
          start_date,
          end_date
        FROM assignment
        WHERE id = ?
          AND person_id = ?
          AND assignment_code = ?
        LIMIT 1
      `,
    )
    .get(
      payload.currentAssignment.assignmentId,
      existing.person_id,
      payload.currentAssignment.assignmentCode,
    ) as ExistingTransferAssignmentRow | undefined;

  if (!assignment) {
    throw new Error(
      "approved transfer apply requires the explicit current assignment",
    );
  }

  return assignment;
}

function assertSupportedTransferAssignmentWindow(
  assignment: ExistingTransferAssignmentRow,
  payload: TransferTransactionRequestPayload,
): void {
  if (assignment.end_date !== null) {
    throw new Error(
      "approved transfer apply requires an open current assignment",
    );
  }
  if (assignment.start_date >= payload.effectiveDate) {
    throw new Error(
      "approved transfer apply requires the effective date after the current assignment start date",
    );
  }
}

function assertNoTransferAssignmentCollision(
  db: OnboardingTransactionRequestDatabase,
  currentAssignment: ExistingTransferAssignmentRow,
  payload: TransferTransactionRequestPayload,
): void {
  const collision = db
    .prepare(
      `
        SELECT id
        FROM assignment
        WHERE person_id = ?
          AND employment_id = ?
          AND id != ?
          AND (end_date IS NULL OR end_date >= ?)
        LIMIT 1
      `,
    )
    .get(
      currentAssignment.person_id,
      currentAssignment.employment_id,
      currentAssignment.id,
      payload.effectiveDate,
    );

  if (collision) {
    throw new Error(
      "approved transfer apply detected overlapping assignment effective dates",
    );
  }
}

function readCompletedTransferApply(
  db: OnboardingTransactionRequestDatabase,
  apply: ApplyApprovedTransferTransactionRequestInput,
  lifecycleEventId: string,
  auditEventId: string,
  payload: TransferTransactionRequestPayload,
): ExistingCompletedTransferApplyRow | undefined {
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
          current_assignment.id AS current_assignment_id,
          current_assignment.employment_id AS current_employment_id,
          current_assignment.assignment_code AS current_assignment_code,
          current_assignment.end_date AS current_assignment_end_date,
          target_assignment.id AS target_assignment_id,
          target_assignment.employment_id AS target_employment_id,
          target_assignment.assignment_code AS target_assignment_code,
          target_assignment.organization_code AS target_organization_code,
          target_assignment.position_code AS target_position_code,
          target_assignment.start_date AS target_assignment_start_date,
          target_assignment.end_date AS target_assignment_end_date,
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
        LEFT JOIN assignment AS current_assignment
          ON current_assignment.id = ?
         AND current_assignment.person_id = transaction_request.person_id
        LEFT JOIN assignment AS target_assignment
          ON target_assignment.id = ?
         AND target_assignment.person_id = transaction_request.person_id
         AND target_assignment.employment_id = current_assignment.employment_id
        WHERE transaction_request.id = ?
          AND transaction_request.status_code = 'completed'
        LIMIT 1
      `,
    )
    .get(
      lifecycleEventId,
      auditEventId,
      payload.currentAssignment.assignmentId,
      buildTransferTargetAssignmentId(apply.transactionRequestId),
      apply.transactionRequestId,
    ) as ExistingCompletedTransferApplyRow | undefined;
}

function buildCompletedTransferApplyRetryResult(
  existing: ExistingCompletedTransferApplyRow,
  payload: TransferTransactionRequestPayload,
  apply: ApplyApprovedTransferTransactionRequestInput,
  lifecycleEventId: string,
): AppliedTransferTransactionRequestResult {
  const targetAssignmentId = buildTransferTargetAssignmentId(
    apply.transactionRequestId,
  );
  assertCompletedTransferApplyMatchesInput(
    existing,
    payload,
    apply,
    lifecycleEventId,
    targetAssignmentId,
  );

  if (existing.current_assignment_id === null) {
    throw new Error(
      "approved transfer apply retry conflicts with the completed request",
    );
  }
  if (existing.current_employment_id === null) {
    throw new Error(
      "approved transfer apply retry conflicts with the completed request",
    );
  }

  return {
    personId: existing.person_id,
    employmentId: existing.current_employment_id,
    closedAssignmentId: existing.current_assignment_id,
    targetAssignmentId,
    transactionRequestId: apply.transactionRequestId,
    lifecycleEventId,
    statusCode: "completed",
    correlationId: apply.correlationId,
  };
}

function assertCompletedTransferApplyMatchesInput(
  existing: ExistingCompletedTransferApplyRow,
  payload: TransferTransactionRequestPayload,
  apply: ApplyApprovedTransferTransactionRequestInput,
  lifecycleEventId: string,
  targetAssignmentId: string,
): void {
  const expectedClosedEndDate = previousIsoDate(payload.effectiveDate);
  if (
    existing.transaction_status_code !== "completed" ||
    existing.request_type !== "transfer" ||
    existing.lifecycle_event_id !== lifecycleEventId ||
    existing.lifecycle_event_type !== "assignment_change" ||
    existing.lifecycle_effective_date !== payload.effectiveDate ||
    existing.lifecycle_occurred_at !== apply.appliedAt ||
    existing.current_assignment_id !== payload.currentAssignment.assignmentId ||
    existing.current_employment_id === null ||
    existing.current_assignment_code !==
      payload.currentAssignment.assignmentCode ||
    existing.current_assignment_end_date !== expectedClosedEndDate ||
    existing.target_assignment_id !== targetAssignmentId ||
    existing.target_employment_id !== existing.current_employment_id ||
    existing.target_assignment_code !==
      buildTransferTargetAssignmentCode(payload) ||
    existing.target_organization_code !==
      payload.targetAssignment.organizationReference ||
    existing.target_position_code !==
      (payload.targetAssignment.positionCode ?? null) ||
    existing.target_assignment_start_date !== payload.effectiveDate ||
    existing.target_assignment_end_date !== null ||
    existing.audit_event_id !==
      buildOnboardingApplyAuditEventId(lifecycleEventId) ||
    existing.audit_actor_id !== apply.appliedBy ||
    existing.audit_action !== "mvp_b.transfer.apply" ||
    existing.audit_subject_table !== "lifecycle_event" ||
    existing.audit_subject_id !== lifecycleEventId ||
    existing.audit_occurred_at !== apply.appliedAt ||
    existing.audit_correlation_id !== apply.correlationId
  ) {
    throw new Error(
      "approved transfer apply retry conflicts with the completed request",
    );
  }
}

export function previousIsoDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

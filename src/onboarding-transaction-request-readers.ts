import type {
  ApplyApprovedOnboardingTransactionRequestInput,
  DueOnboardingApplyCandidateRow,
  ExistingAppliedOnboardingTransactionRequestRow,
  ExistingAuditEventRow,
  ExistingOnboardingApplyJobAttemptRow,
  ExistingOnboardingApplyJobRunRow,
  ExistingOnboardingTransactionRequestRow,
  OnboardingTransactionRequestDatabase,
  OnboardingTransactionRequestInput,
  OnboardingTransactionRequestPayload,
} from "./onboarding-transaction-request-types.js";
import {
  buildWorkerAttemptCorrelationId,
  buildWorkerAttemptCorrelationIdSearchPrefix,
} from "./onboarding-transaction-request-ids.js";

export function readOnboardingTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: OnboardingTransactionRequestInput,
): ExistingOnboardingTransactionRequestRow | undefined {
  const statement = db.prepare(
    `
      SELECT
        person.id AS person_id,
        transaction_request.id AS transaction_request_id,
        person.display_name,
        person.created_at,
        transaction_request.request_type,
        transaction_request.status_code,
        transaction_request.requested_at,
        transaction_request.correlation_id,
        transaction_request.payload_version,
        transaction_request.payload_json
      FROM transaction_request
      JOIN person ON person.id = transaction_request.person_id
      WHERE transaction_request.correlation_id = ?
         OR (
           transaction_request.id = ?
           AND transaction_request.person_id = ?
         )
      ORDER BY
        CASE
          WHEN transaction_request.correlation_id = ? THEN 0
          WHEN transaction_request.id = ?
            AND transaction_request.person_id = ? THEN 1
          ELSE 2
        END,
        transaction_request.id
      LIMIT 1
    `,
  );

  return statement.get(
    input.correlationId,
    input.id,
    input.person.id,
    input.correlationId,
    input.id,
    input.person.id,
  ) as ExistingOnboardingTransactionRequestRow | undefined;
}

export function readOnboardingTransactionRequestById(
  db: OnboardingTransactionRequestDatabase,
  transactionRequestId: string,
): ExistingOnboardingTransactionRequestRow | undefined {
  return db
    .prepare(
      `
        SELECT
          person.id AS person_id,
          transaction_request.id AS transaction_request_id,
          person.display_name,
          person.created_at,
          transaction_request.request_type,
          transaction_request.status_code,
          transaction_request.requested_at,
          transaction_request.correlation_id,
          transaction_request.payload_version,
          transaction_request.payload_json
        FROM transaction_request
        JOIN person ON person.id = transaction_request.person_id
        WHERE transaction_request.id = ?
        LIMIT 1
      `,
    )
    .get(transactionRequestId) as
    | ExistingOnboardingTransactionRequestRow
    | undefined;
}

export function readAuditEventById(
  db: OnboardingTransactionRequestDatabase,
  auditEventId: string,
): ExistingAuditEventRow | undefined {
  return db
    .prepare(
      `
        SELECT
          id,
          actor_id,
          action,
          subject_table,
          subject_id,
          occurred_at,
          correlation_id
        FROM audit_event
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(auditEventId) as ExistingAuditEventRow | undefined;
}

export function readCompletedOnboardingApply(
  db: OnboardingTransactionRequestDatabase,
  apply: ApplyApprovedOnboardingTransactionRequestInput,
  lifecycleEventId: string,
  auditEventId: string,
  payload: OnboardingTransactionRequestPayload,
): ExistingAppliedOnboardingTransactionRequestRow | undefined {
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
          assignment.assignment_code,
          assignment.organization_code,
          assignment.position_code,
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
      payload.employment.id,
      payload.assignment.id,
      apply.transactionRequestId,
    ) as ExistingAppliedOnboardingTransactionRequestRow | undefined;
}

export function readDueOnboardingApplyCandidates(
  db: OnboardingTransactionRequestDatabase,
  batchLimit: number,
  effectiveDate: string,
): DueOnboardingApplyCandidateRow[] {
  const statement = db.prepare(
    `
      SELECT
        person.id AS person_id,
        transaction_request.id AS transaction_request_id,
        person.display_name,
        person.created_at,
        transaction_request.request_type,
        transaction_request.status_code,
        transaction_request.requested_at,
        transaction_request.correlation_id,
        transaction_request.payload_version,
        transaction_request.payload_json
      FROM transaction_request
      JOIN person ON person.id = transaction_request.person_id
      WHERE transaction_request.request_type = 'hire'
        AND transaction_request.status_code = 'approved'
        AND transaction_request.payload_version = 'mvp_a_onboarding_v1'
        AND NOT EXISTS (
          SELECT 1
          FROM onboarding_apply_job_attempt
          WHERE onboarding_apply_job_attempt.transaction_request_id = transaction_request.id
            AND onboarding_apply_job_attempt.status_code = 'non_retryable_failure'
        )
      ORDER BY
        CASE
          WHEN json_valid(transaction_request.payload_json) = 1
            AND json_type(transaction_request.payload_json, '$.effectiveDate') = 'text'
            AND json_extract(transaction_request.payload_json, '$.effectiveDate') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
            AND date(json_extract(transaction_request.payload_json, '$.effectiveDate')) = json_extract(transaction_request.payload_json, '$.effectiveDate')
            AND json_extract(transaction_request.payload_json, '$.effectiveDate') <= ? THEN 0
          WHEN json_valid(transaction_request.payload_json) = 0 THEN 1
          WHEN json_type(transaction_request.payload_json, '$.effectiveDate') IS NULL THEN 1
          WHEN json_type(transaction_request.payload_json, '$.effectiveDate') != 'text' THEN 1
          ELSE 2
        END,
        transaction_request.requested_at,
        transaction_request.id
      LIMIT ?
    `,
  );
  if (!statement.all) {
    throw new Error("onboarding apply worker requires query-all support");
  }

  return statement.all(
    effectiveDate,
    batchLimit,
  ) as DueOnboardingApplyCandidateRow[];
}

export function readOnboardingApplyJobAttemptByCorrelation(
  db: OnboardingTransactionRequestDatabase,
  correlationId: string,
): ExistingOnboardingApplyJobAttemptRow | undefined {
  return db
    .prepare(
      `
        SELECT
          transaction_request_id,
          status_code,
          error_message
        FROM onboarding_apply_job_attempt
        WHERE correlation_id = ?
        LIMIT 1
      `,
    )
    .get(correlationId) as ExistingOnboardingApplyJobAttemptRow | undefined;
}

export function readOnboardingApplyJobRun(
  db: OnboardingTransactionRequestDatabase,
  correlationId: string,
): ExistingOnboardingApplyJobRunRow | undefined {
  return db
    .prepare(
      `
        SELECT
          attempted,
          applied,
          failed,
          skipped
        FROM onboarding_apply_job_run
        WHERE correlation_id = ?
        LIMIT 1
      `,
    )
    .get(correlationId) as ExistingOnboardingApplyJobRunRow | undefined;
}

export function readOnboardingApplyJobAttemptsForWorkerCorrelation(
  db: OnboardingTransactionRequestDatabase,
  workerCorrelationId: string,
): ExistingOnboardingApplyJobAttemptRow[] {
  const correlationPrefix =
    buildWorkerAttemptCorrelationIdSearchPrefix(workerCorrelationId);
  const statement = db.prepare(
    `
      SELECT
        transaction_request_id,
        status_code,
        error_message,
        correlation_id
      FROM onboarding_apply_job_attempt
      WHERE correlation_id >= ?
        AND correlation_id < ?
      ORDER BY attempted_at, transaction_request_id
    `,
  );
  if (!statement.all) {
    throw new Error("onboarding apply worker requires query-all support");
  }

  return (
    statement.all(
      correlationPrefix,
      `${correlationPrefix}\uffff`,
    ) as (ExistingOnboardingApplyJobAttemptRow & {
      correlation_id: string;
    })[]
  )
    .filter(
      (attempt) =>
        attempt.correlation_id ===
        buildWorkerAttemptCorrelationId(
          workerCorrelationId,
          attempt.transaction_request_id,
        ),
    )
    .map(({ transaction_request_id, status_code, error_message }) => ({
      transaction_request_id,
      status_code,
      error_message,
    }));
}

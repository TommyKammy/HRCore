import { insertSyntheticLifecycleAppliedAuditEvent } from "./synthetic-hire-audit.js";
import {
  type AppliedSyntheticHireRequestResult,
  type ApplySyntheticHireRequestInput,
  type SyntheticHireDatabase,
} from "./synthetic-hire-types.js";
import {
  isDateStrictlyAfterTimestampDate,
  isNonEmptyString,
  rollbackNamedSavepoint,
  toSqliteBoolean,
  validateApplySyntheticHireRequest,
} from "./synthetic-hire-validation.js";

export function applySyntheticHireRequest(
  db: SyntheticHireDatabase,
  input: ApplySyntheticHireRequestInput,
): AppliedSyntheticHireRequestResult {
  validateApplySyntheticHireRequest(input);

  const existingApply = readCompletedSyntheticHireApply(db, input);
  if (existingApply) {
    const retryResult = buildCompletedSyntheticHireApplyRetryResult(
      existingApply,
      input,
    );
    if (retryResult) {
      return retryResult;
    }

    throw new Error(
      "synthetic hire apply retry conflicts with the completed request",
    );
  }

  const submittedRequest = readSubmittedSyntheticHireRequestForApply(db, input);
  if (!submittedRequest) {
    const retryApply = readCompletedSyntheticHireApply(db, input);
    if (retryApply) {
      const retryResult = buildCompletedSyntheticHireApplyRetryResult(
        retryApply,
        input,
      );
      if (retryResult) {
        return retryResult;
      }
    }

    throw new Error("synthetic hire apply requires a submitted hire request");
  }
  const submittedCorrelationId = requirePersistedSyntheticHireCorrelation(
    submittedRequest.correlation_id,
  );

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT synthetic_hire_request_apply");
    savepointStarted = true;

    if (input.hire.contactPoint) {
      db.prepare(
        `
          INSERT INTO contact_point (
            id,
            person_id,
            contact_type,
            value,
            is_primary,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      ).run(
        input.hire.contactPoint.id,
        input.hire.contactPoint.personId,
        input.hire.contactPoint.contactType,
        input.hire.contactPoint.value,
        toSqliteBoolean(
          "contactPoint.isPrimary",
          input.hire.contactPoint.isPrimary,
        ),
        input.hire.contactPoint.createdAt,
      );
    }

    // Fail closed on missing or non-hire requests without relying on adapter row-count metadata.
    db.prepare(
      `
        INSERT INTO lifecycle_event (
          id,
          person_id,
          transaction_request_id,
          contact_point_id,
          event_type,
          effective_date,
          occurred_at
        )
        VALUES (
          ?,
          (
            SELECT person_id
            FROM transaction_request
            WHERE id = ?
              AND person_id = ?
              AND request_type = 'hire'
              AND status_code = 'submitted'
          ),
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `,
    ).run(
      input.lifecycleEvent.id,
      input.request.transactionRequest.id,
      input.request.person.id,
      input.request.transactionRequest.id,
      input.hire.contactPoint?.id ?? null,
      input.lifecycleEvent.eventType,
      input.lifecycleEvent.effectiveDate,
      input.lifecycleEvent.occurredAt,
    );

    db.prepare(
      `
        UPDATE transaction_request
        SET status_code = 'completed'
        WHERE id = ?
          AND person_id = ?
          AND request_type = 'hire'
          AND status_code = 'submitted'
      `,
    ).run(input.request.transactionRequest.id, input.request.person.id);

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
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.hire.employment.id,
      input.hire.employment.personId,
      input.hire.employment.employmentCode,
      input.hire.employment.statusCode,
      input.hire.employment.startDate,
      input.hire.employment.endDate ?? null,
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.hire.assignment.id,
      input.hire.assignment.personId,
      input.hire.assignment.employmentId,
      input.hire.assignment.assignmentCode,
      input.hire.assignment.organizationCode,
      input.hire.assignment.positionCode ?? null,
      input.hire.assignment.startDate,
      input.hire.assignment.endDate ?? null,
    );

    insertSyntheticLifecycleAppliedAuditEvent(db, {
      id: `audit-event-${input.lifecycleEvent.id}-applied`,
      subjectId: input.lifecycleEvent.id,
      occurredAt: input.lifecycleEvent.occurredAt,
      transactionRequestId: input.request.transactionRequest.id,
      personId: input.request.person.id,
    });

    db.exec("RELEASE SAVEPOINT synthetic_hire_request_apply");

    return {
      transactionRequestId: input.request.transactionRequest.id,
      lifecycleEventId: input.lifecycleEvent.id,
      personId: input.request.person.id,
      statusCode: "completed",
      correlationId: submittedCorrelationId,
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackNamedSavepoint(db, "synthetic_hire_request_apply");
      const existingApply = readCompletedSyntheticHireApply(db, input);
      if (existingApply) {
        const retryResult = buildCompletedSyntheticHireApplyRetryResult(
          existingApply,
          input,
        );
        if (retryResult) {
          return retryResult;
        }
      }
    }

    throw error;
  }
}

export type ExistingSubmittedSyntheticHireApplyRequestRow = {
  correlation_id: string | null;
  requested_at: string;
};

export type ExistingCompletedSyntheticHireApplyRow = {
  transaction_status_code: string;
  request_type: string;
  correlation_id: string | null;
  requested_at: string;
  person_id: string;
  lifecycle_event_id: string;
  lifecycle_event_type: string;
  lifecycle_contact_point_id: string | null;
  effective_date: string;
  lifecycle_occurred_at: string;
  employment_id: string;
  employment_code: string;
  employment_status_code: string;
  employment_start_date: string;
  employment_end_date: string | null;
  assignment_id: string;
  assignment_code: string;
  organization_code: string;
  position_code: string | null;
  assignment_start_date: string;
  assignment_end_date: string | null;
  contact_point_id: string | null;
  contact_type: string | null;
  contact_created_at: string | null;
};

export function readSubmittedSyntheticHireRequestForApply(
  db: SyntheticHireDatabase,
  input: ApplySyntheticHireRequestInput,
): ExistingSubmittedSyntheticHireApplyRequestRow | undefined {
  const statement = db.prepare(
    `
      SELECT
        correlation_id,
        requested_at
      FROM transaction_request
      WHERE id = ?
        AND person_id = ?
        AND request_type = 'hire'
        AND status_code = 'submitted'
    `,
  );

  return statement.get(
    input.request.transactionRequest.id,
    input.request.person.id,
  ) as ExistingSubmittedSyntheticHireApplyRequestRow | undefined;
}

export function readCompletedSyntheticHireApply(
  db: SyntheticHireDatabase,
  input: ApplySyntheticHireRequestInput,
): ExistingCompletedSyntheticHireApplyRow | undefined {
  const statement = db.prepare(
    `
      SELECT
        transaction_request.status_code AS transaction_status_code,
        transaction_request.request_type,
        transaction_request.correlation_id,
        transaction_request.requested_at,
        person.id AS person_id,
        lifecycle_event.id AS lifecycle_event_id,
        lifecycle_event.event_type AS lifecycle_event_type,
        lifecycle_event.contact_point_id AS lifecycle_contact_point_id,
        lifecycle_event.effective_date,
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
        contact_point.id AS contact_point_id,
        contact_point.contact_type,
        contact_point.created_at AS contact_created_at
      FROM transaction_request
      JOIN person
        ON person.id = transaction_request.person_id
      LEFT JOIN lifecycle_event
        ON lifecycle_event.transaction_request_id = transaction_request.id
       AND lifecycle_event.person_id = transaction_request.person_id
      LEFT JOIN employment
        ON employment.id = ?
       AND employment.person_id = transaction_request.person_id
      LEFT JOIN assignment
        ON assignment.id = ?
       AND assignment.person_id = transaction_request.person_id
       AND assignment.employment_id = employment.id
      LEFT JOIN contact_point
        ON contact_point.id = lifecycle_event.contact_point_id
       AND contact_point.person_id = transaction_request.person_id
       AND contact_point.contact_type = 'work_email'
      WHERE transaction_request.id = ?
        AND transaction_request.person_id = ?
        AND transaction_request.status_code = 'completed'
    `,
  );

  return statement.get(
    input.hire.employment.id,
    input.hire.assignment.id,
    input.request.transactionRequest.id,
    input.request.person.id,
  ) as ExistingCompletedSyntheticHireApplyRow | undefined;
}

export function buildCompletedSyntheticHireApplyRetryResult(
  existing: ExistingCompletedSyntheticHireApplyRow,
  input: ApplySyntheticHireRequestInput,
): AppliedSyntheticHireRequestResult | undefined {
  if (!matchesCompletedSyntheticHireApplyRetry(existing, input)) {
    return undefined;
  }

  return {
    transactionRequestId: input.request.transactionRequest.id,
    lifecycleEventId: input.lifecycleEvent.id,
    personId: input.request.person.id,
    statusCode: "completed",
    correlationId: requirePersistedSyntheticHireCorrelation(
      existing.correlation_id,
    ),
  };
}

function matchesCompletedSyntheticHireApplyRetry(
  existing: ExistingCompletedSyntheticHireApplyRow,
  input: ApplySyntheticHireRequestInput,
): boolean {
  if (
    existing.transaction_status_code !== "completed" ||
    existing.request_type !== input.request.transactionRequest.requestType ||
    existing.person_id !== input.request.person.id ||
    existing.lifecycle_event_id !== input.lifecycleEvent.id ||
    existing.lifecycle_event_type !== input.lifecycleEvent.eventType ||
    existing.effective_date !== input.lifecycleEvent.effectiveDate ||
    existing.lifecycle_occurred_at !== input.lifecycleEvent.occurredAt ||
    existing.employment_id !== input.hire.employment.id ||
    existing.employment_code !== input.hire.employment.employmentCode ||
    existing.employment_status_code !== input.hire.employment.statusCode ||
    existing.employment_start_date !== input.hire.employment.startDate ||
    existing.employment_end_date !== (input.hire.employment.endDate ?? null) ||
    existing.assignment_id !== input.hire.assignment.id ||
    existing.assignment_code !== input.hire.assignment.assignmentCode ||
    existing.organization_code !== input.hire.assignment.organizationCode ||
    existing.position_code !== (input.hire.assignment.positionCode ?? null) ||
    existing.assignment_start_date !== input.hire.assignment.startDate ||
    existing.assignment_end_date !== (input.hire.assignment.endDate ?? null)
  ) {
    return false;
  }

  if (!input.hire.contactPoint) {
    return existing.lifecycle_contact_point_id === null;
  }

  return (
    existing.lifecycle_contact_point_id === input.hire.contactPoint.id &&
    existing.contact_point_id === input.hire.contactPoint.id &&
    existing.contact_type === input.hire.contactPoint.contactType &&
    existing.contact_created_at === input.hire.contactPoint.createdAt
  );
}

export function requirePersistedSyntheticHireCorrelation(
  value: string | null | undefined,
): string {
  if (!isNonEmptyString(value)) {
    throw new Error(
      "synthetic hire apply requires a persisted request correlation",
    );
  }

  return value;
}

export function assertSyntheticFutureDateApplyJobCorrelation(
  actualCorrelationId: string,
  persistedCorrelationId: string,
): void {
  if (actualCorrelationId !== persistedCorrelationId) {
    throw new Error(
      "synthetic future-date apply job correlation must match the persisted request",
    );
  }
}

export function assertSyntheticFutureDateApplyIsFuture(
  effectiveDate: string,
  persistedRequestedAt: string,
): void {
  if (!isDateStrictlyAfterTimestampDate(effectiveDate, persistedRequestedAt)) {
    throw new Error(
      "synthetic future-date apply job requires a future effective date",
    );
  }
}

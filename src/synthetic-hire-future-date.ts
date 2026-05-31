import { insertSyntheticFutureDateApplyFailureAuditEvent } from "./synthetic-hire-audit.js";
import {
  applySyntheticHireRequest,
  assertSyntheticFutureDateApplyIsFuture,
  assertSyntheticFutureDateApplyJobCorrelation,
  buildCompletedSyntheticHireApplyRetryResult,
  readCompletedSyntheticHireApply,
  readSubmittedSyntheticHireRequestForApply,
  requirePersistedSyntheticHireCorrelation,
} from "./synthetic-hire-apply.js";
import { syntheticAuditPocMarker } from "./synthetic-hire-constants.js";
import {
  type ApplySyntheticFutureDateHireJobInput,
  type ApplySyntheticHireRequestInput,
  type SyntheticFutureDateApplyFailureEvidence,
  type SyntheticFutureDateApplyJobResult,
  type SyntheticFutureDateApplyObservedState,
  type SyntheticHireDatabase,
} from "./synthetic-hire-types.js";
import {
  rollbackNamedSavepoint,
  validateSyntheticFutureDateApplyJob,
} from "./synthetic-hire-validation.js";

export function applySyntheticFutureDateHireJob(
  db: SyntheticHireDatabase,
  input: ApplySyntheticFutureDateHireJobInput,
): SyntheticFutureDateApplyJobResult {
  validateSyntheticFutureDateApplyJob(input);

  const persistedFailureEvidenceResult =
    buildPersistedSyntheticFutureDateApplyFailureJobResult(db, input);
  if (persistedFailureEvidenceResult) {
    return persistedFailureEvidenceResult;
  }

  const submittedRequest = readSubmittedSyntheticHireRequestForApply(
    db,
    input.apply,
  );
  if (!submittedRequest) {
    return requireCompletedSyntheticFutureDateApplyRetryJobResultAfterFailureEvidenceReread(
      db,
      input,
    );
  }

  const persistedCorrelationId = requirePersistedSyntheticHireCorrelation(
    submittedRequest.correlation_id,
  );
  if (input.job.correlationId !== persistedCorrelationId) {
    assertSyntheticFutureDateApplyJobCorrelation(
      input.job.correlationId,
      persistedCorrelationId,
    );
  }
  assertSyntheticFutureDateApplyIsFuture(
    input.apply.lifecycleEvent.effectiveDate,
    submittedRequest.requested_at,
  );

  const failureEvidenceBeforeApplyResult =
    buildPersistedSyntheticFutureDateApplyFailureJobResult(db, input);
  if (failureEvidenceBeforeApplyResult) {
    return failureEvidenceBeforeApplyResult;
  }

  if (input.job.failAfterPreconditionsReason) {
    const failureEvidence = buildSyntheticFutureDateApplyFailureEvidence(
      db,
      input,
      input.job.failAfterPreconditionsReason,
      persistedCorrelationId,
    );
    if (!failureEvidence) {
      return requireCompletedSyntheticFutureDateApplyRetryJobResultAfterFailureEvidenceReread(
        db,
        input,
      );
    }
    const persistedFailureEvidence =
      persistSyntheticFutureDateApplyFailureEvidence(db, failureEvidence);

    return {
      outcome: "retryable_failure",
      failureEvidence: persistedFailureEvidence,
    };
  }

  return applySyntheticFutureDateHireJobAfterFailureEvidenceReread(db, input);
}

function buildPersistedSyntheticFutureDateApplyFailureJobResult(
  db: SyntheticHireDatabase,
  input: ApplySyntheticFutureDateHireJobInput,
): SyntheticFutureDateApplyJobResult | undefined {
  const persistedFailureEvidence = readSyntheticFutureDateApplyFailureEvidence(
    db,
    input.job.id,
  );
  if (!persistedFailureEvidence) {
    return undefined;
  }

  assertSyntheticFutureDateApplyFailureEvidenceMatchesInput(
    persistedFailureEvidence,
    input,
  );

  return {
    outcome: "retryable_failure",
    failureEvidence: persistedFailureEvidence,
  };
}

function buildCompletedSyntheticFutureDateApplyRetryJobResult(
  db: SyntheticHireDatabase,
  input: ApplySyntheticFutureDateHireJobInput,
): SyntheticFutureDateApplyJobResult | undefined {
  const retryApply = readCompletedSyntheticHireApply(db, input.apply);
  if (!retryApply) {
    return undefined;
  }

  const completedRetryCorrelationId = requirePersistedSyntheticHireCorrelation(
    retryApply.correlation_id,
  );
  assertSyntheticFutureDateApplyJobCorrelation(
    input.job.correlationId,
    completedRetryCorrelationId,
  );
  assertSyntheticFutureDateApplyIsFuture(
    retryApply.effective_date,
    retryApply.requested_at,
  );

  const retryResult = buildCompletedSyntheticHireApplyRetryResult(
    retryApply,
    input.apply,
  );
  if (!retryResult) {
    return undefined;
  }

  return {
    outcome: "applied",
    ...retryResult,
  };
}

function buildCompletedSyntheticFutureDateApplyRetryJobResultAfterFailureEvidenceReread(
  db: SyntheticHireDatabase,
  input: ApplySyntheticFutureDateHireJobInput,
): SyntheticFutureDateApplyJobResult | undefined {
  const persistedFailureEvidenceResult =
    buildPersistedSyntheticFutureDateApplyFailureJobResult(db, input);
  if (persistedFailureEvidenceResult) {
    return persistedFailureEvidenceResult;
  }

  return buildCompletedSyntheticFutureDateApplyRetryJobResult(db, input);
}

function requireCompletedSyntheticFutureDateApplyRetryJobResultAfterFailureEvidenceReread(
  db: SyntheticHireDatabase,
  input: ApplySyntheticFutureDateHireJobInput,
): SyntheticFutureDateApplyJobResult {
  const result =
    buildCompletedSyntheticFutureDateApplyRetryJobResultAfterFailureEvidenceReread(
      db,
      input,
    );
  if (!result) {
    throw new Error(
      "synthetic future-date apply requires a submitted or completed hire request",
    );
  }

  return result;
}

function applySyntheticFutureDateHireJobAfterFailureEvidenceReread(
  db: SyntheticHireDatabase,
  input: ApplySyntheticFutureDateHireJobInput,
): SyntheticFutureDateApplyJobResult {
  const persistedFailureEvidenceResult =
    buildPersistedSyntheticFutureDateApplyFailureJobResult(db, input);
  if (persistedFailureEvidenceResult) {
    return persistedFailureEvidenceResult;
  }

  return {
    outcome: "applied",
    ...applySyntheticHireRequest(db, input.apply),
  };
}

function assertSyntheticFutureDateApplyFailureEvidenceMatchesInput(
  persisted: SyntheticFutureDateApplyFailureEvidence,
  input: ApplySyntheticFutureDateHireJobInput,
): void {
  if (
    persisted.jobId !== input.job.id ||
    persisted.transactionRequestId !==
      input.apply.request.transactionRequest.id ||
    persisted.lifecycleEventId !== input.apply.lifecycleEvent.id ||
    persisted.personId !== input.apply.request.person.id ||
    persisted.correlationId !== input.job.correlationId
  ) {
    throw new Error(
      "synthetic future-date apply job must match persisted failure evidence",
    );
  }
}

function assertSyntheticFutureDateApplyFailureEvidenceMatchesEvidence(
  persisted: SyntheticFutureDateApplyFailureEvidence,
  expected: SyntheticFutureDateApplyFailureEvidence,
): void {
  if (
    persisted.id !== expected.id ||
    persisted.jobId !== expected.jobId ||
    persisted.transactionRequestId !== expected.transactionRequestId ||
    persisted.lifecycleEventId !== expected.lifecycleEventId ||
    persisted.personId !== expected.personId ||
    persisted.correlationId !== expected.correlationId
  ) {
    throw new Error(
      "synthetic future-date apply failure evidence must match the persisted job scope",
    );
  }
}

function persistSyntheticFutureDateApplyFailureEvidence(
  db: SyntheticHireDatabase,
  input: SyntheticFutureDateApplyFailureEvidence,
): SyntheticFutureDateApplyFailureEvidence {
  db.exec("SAVEPOINT synthetic_future_date_apply_failure_evidence");

  try {
    ensureSyntheticFutureDateApplyFailureEvidenceTable(db);
    const inserted = insertSyntheticFutureDateApplyFailureEvidence(db, input);
    if (inserted) {
      insertSyntheticFutureDateApplyFailureAuditEvent(db, input);
    }
    db.exec("RELEASE SAVEPOINT synthetic_future_date_apply_failure_evidence");
  } catch (error) {
    rollbackNamedSavepoint(db, "synthetic_future_date_apply_failure_evidence");
    throw error;
  }

  const persisted = readSyntheticFutureDateApplyFailureEvidence(
    db,
    input.jobId,
  );
  if (!persisted) {
    throw new Error(
      "synthetic future-date apply failure evidence was not persisted",
    );
  }
  assertSyntheticFutureDateApplyFailureEvidenceMatchesEvidence(
    persisted,
    input,
  );

  return persisted;
}

function syntheticFutureDateApplyFailureEvidenceTableExists(
  db: SyntheticHireDatabase,
): boolean {
  const row = db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'synthetic_future_date_apply_failure_evidence'
      `,
    )
    .get() as { name: string } | undefined;

  return row?.name === "synthetic_future_date_apply_failure_evidence";
}

function ensureSyntheticFutureDateApplyFailureEvidenceTable(
  db: SyntheticHireDatabase,
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS synthetic_future_date_apply_failure_evidence (
      id TEXT PRIMARY KEY NOT NULL,
      job_id TEXT NOT NULL UNIQUE,
      transaction_request_id TEXT NOT NULL,
      lifecycle_event_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      failure_reason TEXT NOT NULL,
      retryable INTEGER NOT NULL DEFAULT 1,
      observed_at TEXT NOT NULL,
      transaction_request_status_code TEXT NOT NULL,
      lifecycle_event_count INTEGER NOT NULL,
      employment_count INTEGER NOT NULL,
      assignment_count INTEGER NOT NULL,
      lifecycle_applied_audit_count INTEGER NOT NULL,
      poc_marker TEXT NOT NULL DEFAULT 'synthetic_poc',
      CHECK(length(id) > 0),
      CHECK(length(job_id) > 0),
      CHECK(length(transaction_request_id) > 0),
      CHECK(length(lifecycle_event_id) > 0),
      CHECK(length(person_id) > 0),
      CHECK(length(correlation_id) > 0),
      CHECK(length(failure_reason) > 0),
      CHECK(retryable = 1),
      CHECK(observed_at glob '????-??-??*'),
      CHECK(transaction_request_status_code = 'submitted'),
      CHECK(lifecycle_event_count >= 0),
      CHECK(employment_count >= 0),
      CHECK(assignment_count >= 0),
      CHECK(lifecycle_applied_audit_count >= 0),
      CHECK(poc_marker = 'synthetic_poc')
    )
  `);
}

function insertSyntheticFutureDateApplyFailureEvidence(
  db: SyntheticHireDatabase,
  input: SyntheticFutureDateApplyFailureEvidence,
): boolean {
  try {
    db.prepare(
      `
        INSERT INTO synthetic_future_date_apply_failure_evidence (
          id,
          job_id,
          transaction_request_id,
          lifecycle_event_id,
          person_id,
          correlation_id,
          failure_reason,
          retryable,
          observed_at,
          transaction_request_status_code,
          lifecycle_event_count,
          employment_count,
          assignment_count,
          lifecycle_applied_audit_count,
          poc_marker
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
    ).run(
      input.id,
      input.jobId,
      input.transactionRequestId,
      input.lifecycleEventId,
      input.personId,
      input.correlationId,
      input.failureReason,
      1,
      input.observedAt,
      input.observedState.transactionRequestStatusCode,
      input.observedState.lifecycleEventCount,
      input.observedState.employmentCount,
      input.observedState.assignmentCount,
      input.observedState.lifecycleAppliedAuditCount,
      syntheticAuditPocMarker,
    );
  } catch (error) {
    if (isDuplicateSyntheticFutureDateApplyFailureEvidenceError(error)) {
      return false;
    }

    throw error;
  }

  return true;
}

function isDuplicateSyntheticFutureDateApplyFailureEvidenceError(
  error: unknown,
): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes(
      "unique constraint failed: synthetic_future_date_apply_failure_evidence.id",
    ) ||
    message.includes(
      "unique constraint failed: synthetic_future_date_apply_failure_evidence.job_id",
    )
  );
}

function readSyntheticFutureDateApplyFailureEvidence(
  db: SyntheticHireDatabase,
  jobId: string,
): SyntheticFutureDateApplyFailureEvidence | undefined {
  if (!syntheticFutureDateApplyFailureEvidenceTableExists(db)) {
    return undefined;
  }

  const row = db
    .prepare(
      `
        SELECT
          id,
          job_id,
          transaction_request_id,
          lifecycle_event_id,
          person_id,
          correlation_id,
          failure_reason,
          retryable,
          observed_at,
          transaction_request_status_code,
          lifecycle_event_count,
          employment_count,
          assignment_count,
          lifecycle_applied_audit_count
        FROM synthetic_future_date_apply_failure_evidence
        WHERE job_id = ?
      `,
    )
    .get(jobId) as
    | {
        id: string;
        job_id: string;
        transaction_request_id: string;
        lifecycle_event_id: string;
        person_id: string;
        correlation_id: string;
        failure_reason: string;
        retryable: number;
        observed_at: string;
        transaction_request_status_code: "submitted";
        lifecycle_event_count: number;
        employment_count: number;
        assignment_count: number;
        lifecycle_applied_audit_count: number;
      }
    | undefined;

  if (!row) {
    return undefined;
  }

  if (row.retryable !== 1) {
    throw new Error(
      "synthetic future-date apply failure evidence must be retryable",
    );
  }

  return {
    id: row.id,
    jobId: row.job_id,
    transactionRequestId: row.transaction_request_id,
    lifecycleEventId: row.lifecycle_event_id,
    personId: row.person_id,
    correlationId: row.correlation_id,
    failureReason: row.failure_reason,
    retryable: true,
    observedAt: row.observed_at,
    observedState: {
      transactionRequestStatusCode: row.transaction_request_status_code,
      lifecycleEventCount: row.lifecycle_event_count,
      employmentCount: row.employment_count,
      assignmentCount: row.assignment_count,
      lifecycleAppliedAuditCount: row.lifecycle_applied_audit_count,
    },
  };
}

function buildSyntheticFutureDateApplyFailureEvidence(
  db: SyntheticHireDatabase,
  input: ApplySyntheticFutureDateHireJobInput,
  failureReason: string,
  correlationId: string,
): SyntheticFutureDateApplyFailureEvidence | undefined {
  const observedState = readSyntheticFutureDateApplyObservedState(
    db,
    input.apply,
  );
  if (!observedState) {
    return undefined;
  }

  return {
    id: `future-date-apply-failure-${input.job.id}`,
    jobId: input.job.id,
    transactionRequestId: input.apply.request.transactionRequest.id,
    lifecycleEventId: input.apply.lifecycleEvent.id,
    personId: input.apply.request.person.id,
    correlationId,
    failureReason,
    retryable: true,
    observedAt: input.job.observedAt,
    observedState,
  };
}

function readSyntheticFutureDateApplyObservedState(
  db: SyntheticHireDatabase,
  input: ApplySyntheticHireRequestInput,
): SyntheticFutureDateApplyObservedState | undefined {
  const row = db
    .prepare(
      `
        SELECT
          transaction_request.status_code AS transaction_request_status_code,
          (
            SELECT count(*)
            FROM lifecycle_event
            WHERE id = ?
          ) AS lifecycle_event_count,
          (
            SELECT count(*)
            FROM employment
            WHERE id = ?
          ) AS employment_count,
          (
            SELECT count(*)
            FROM assignment
            WHERE id = ?
          ) AS assignment_count,
          (
            SELECT count(*)
            FROM audit_event
            WHERE action = 'poc.synthetic_hire.lifecycle_applied'
              AND subject_id = ?
          ) AS lifecycle_applied_audit_count
        FROM transaction_request
        WHERE id = ?
          AND person_id = ?
          AND request_type = 'hire'
          AND status_code = 'submitted'
      `,
    )
    .get(
      input.lifecycleEvent.id,
      input.hire.employment.id,
      input.hire.assignment.id,
      input.lifecycleEvent.id,
      input.request.transactionRequest.id,
      input.request.person.id,
    ) as
    | {
        transaction_request_status_code: "submitted";
        lifecycle_event_count: number;
        employment_count: number;
        assignment_count: number;
        lifecycle_applied_audit_count: number;
      }
    | undefined;

  if (!row) return undefined;

  return {
    transactionRequestStatusCode: row.transaction_request_status_code,
    lifecycleEventCount: row.lifecycle_event_count,
    employmentCount: row.employment_count,
    assignmentCount: row.assignment_count,
    lifecycleAppliedAuditCount: row.lifecycle_applied_audit_count,
  };
}

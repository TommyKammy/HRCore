import { OnboardingTransactionRequestValidationError } from "./onboarding-transaction-request-error.js";
import {
  buildOnboardingApplyAuditEventId,
  buildOnboardingApplyJobAttemptId,
  buildOnboardingApplyJobRunId,
  buildOnboardingApplyLifecycleEventId,
  buildOnboardingApplyLifecycleEventIdForRequest,
  buildOnboardingDecisionAuditEventId,
  buildWorkerAttemptCorrelationId,
} from "./onboarding-transaction-request-ids.js";
import {
  parseApplyApprovedOnboardingTransactionRequestInput,
  parseApplyDueOnboardingTransactionRequestsInput,
  parseOnboardingApprovalDecisionInput,
  parseOnboardingTransactionRequestInput,
  parsePersistedOnboardingApplyPayload,
  serializeOnboardingPayload,
} from "./onboarding-transaction-request-parser.js";
import {
  readAuditEventById,
  readCompletedOnboardingApply,
  readDueOnboardingApplyCandidates,
  readOnboardingApplyJobAttemptByCorrelation,
  readOnboardingApplyJobAttemptsForWorkerCorrelation,
  readOnboardingApplyJobRun,
  readOnboardingTransactionRequest,
  readOnboardingTransactionRequestById,
} from "./onboarding-transaction-request-readers.js";
import type {
  ApplyApprovedOnboardingTransactionRequestInput,
  AppliedOnboardingTransactionRequestResult,
  ApplyDueOnboardingTransactionRequestsInput,
  ApplyDueOnboardingTransactionRequestsItemResult,
  ApplyDueOnboardingTransactionRequestsResult,
  ApplyDueOnboardingTransactionRequestsStatus,
  EditableOnboardingTransactionRequestPersistenceResult,
  ExistingAppliedOnboardingTransactionRequestRow,
  ExistingAuditEventRow,
  ExistingOnboardingApplyJobAttemptRow,
  ExistingOnboardingApplyJobRunRow,
  ExistingOnboardingTransactionRequestRow,
  OnboardingApprovalDecision,
  OnboardingApprovalDecisionInput,
  OnboardingApprovalDecisionResult,
  OnboardingTransactionRequestDatabase,
  OnboardingTransactionRequestInput,
  OnboardingTransactionRequestPayload,
  OnboardingTransactionRequestPersistedStatus,
  OnboardingTransactionRequestPersistenceResult,
  SqlRunResult,
} from "./onboarding-transaction-request-types.js";
import {
  isRecord,
  isValidIsoDate,
} from "./onboarding-transaction-request-validation.js";

export { OnboardingTransactionRequestValidationError } from "./onboarding-transaction-request-error.js";
export {
  createOnboardingTransactionRequestFixture,
  parseOnboardingTransactionRequestInput,
  parsePersistedOnboardingApplyPayload,
} from "./onboarding-transaction-request-parser.js";
export { readOnboardingTransactionRequestById } from "./onboarding-transaction-request-readers.js";
export type {
  ApplyApprovedOnboardingTransactionRequestInput,
  AppliedOnboardingTransactionRequestResult,
  ApplyDueOnboardingTransactionRequestsInput,
  ApplyDueOnboardingTransactionRequestsItemResult,
  ApplyDueOnboardingTransactionRequestsResult,
  ApplyDueOnboardingTransactionRequestsStatus,
  EditableOnboardingTransactionRequestPersistenceResult,
  ExistingOnboardingTransactionRequestRow,
  OnboardingApprovalDecision,
  OnboardingApprovalDecisionInput,
  OnboardingApprovalDecisionResult,
  OnboardingTransactionRequestAssignmentPayload,
  OnboardingTransactionRequestDatabase,
  OnboardingTransactionRequestEmploymentPayload,
  OnboardingTransactionRequestInput,
  OnboardingTransactionRequestPayload,
  OnboardingTransactionRequestPersistedStatus,
  OnboardingTransactionRequestPersistenceResult,
  OnboardingTransactionRequestPersonInput,
  OnboardingTransactionRequestStatus,
  OnboardingTransactionRequestWorkEmailExpectation,
  SqlStatement,
} from "./onboarding-transaction-request-types.js";

type OnboardingDecisionTarget = {
  statusCode: OnboardingApprovalDecisionResult["statusCode"];
  auditAction: string;
};

export function saveOnboardingTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): OnboardingTransactionRequestPersistenceResult {
  const parsed = parseOnboardingTransactionRequestInput(input);
  const payloadJson = serializeOnboardingPayload(parsed.payload);

  const existingRequest = readOnboardingTransactionRequest(db, parsed);
  if (existingRequest) {
    if (
      matchesOnboardingTransactionRequestRetry(
        existingRequest,
        parsed,
        payloadJson,
      )
    ) {
      return buildOnboardingTransactionRequestRetryResult(existingRequest);
    }

    throw new Error(
      "onboarding transaction request retry conflicts with the existing request",
    );
  }

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT onboarding_transaction_request_persistence");
    savepointStarted = true;

    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES (?, ?, ?)
      `,
    ).run(parsed.person.id, parsed.person.displayName, parsed.person.createdAt);

    db.prepare(
      `
        INSERT INTO transaction_request (
          id,
          person_id,
          request_type,
          status_code,
          requested_at,
          correlation_id,
          payload_version,
          payload_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      parsed.id,
      parsed.person.id,
      parsed.requestType,
      parsed.statusCode,
      parsed.requestedAt,
      parsed.correlationId,
      parsed.payloadVersion,
      payloadJson,
    );

    db.exec("RELEASE SAVEPOINT onboarding_transaction_request_persistence");

    return {
      personId: parsed.person.id,
      transactionRequestId: parsed.id,
      statusCode: parsed.statusCode,
      correlationId: parsed.correlationId,
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackNamedSavepoint(db, "onboarding_transaction_request_persistence");
      const existingRequest = readOnboardingTransactionRequest(db, parsed);
      if (
        existingRequest &&
        matchesOnboardingTransactionRequestRetry(
          existingRequest,
          parsed,
          payloadJson,
        )
      ) {
        return buildOnboardingTransactionRequestRetryResult(existingRequest);
      }
    }

    throw error;
  }
}

export function saveEditableOnboardingTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): EditableOnboardingTransactionRequestPersistenceResult {
  const parsed = parseOnboardingTransactionRequestInput(input);
  const payloadJson = serializeOnboardingPayload(parsed.payload);
  const existingRequest = readOnboardingTransactionRequest(db, parsed);

  if (!existingRequest) {
    return {
      ...saveOnboardingTransactionRequest(db, parsed),
      operation: "created",
    };
  }

  if (
    matchesOnboardingTransactionRequestRetry(
      existingRequest,
      parsed,
      payloadJson,
    )
  ) {
    return {
      ...buildOnboardingTransactionRequestRetryResult(existingRequest),
      operation: "idempotent",
    };
  }

  assertEditableDraftBinding(existingRequest, parsed);

  db.exec("SAVEPOINT onboarding_transaction_request_edit");
  try {
    db.prepare(
      `
        UPDATE person
        SET display_name = ?,
            created_at = ?
        WHERE id = ?
      `,
    ).run(parsed.person.displayName, parsed.person.createdAt, parsed.person.id);

    const transactionRequestUpdate = db
      .prepare(
        `
        UPDATE transaction_request
        SET status_code = ?,
            requested_at = ?,
            payload_version = ?,
            payload_json = ?
        WHERE id = ?
          AND person_id = ?
          AND correlation_id = ?
          AND status_code in ('draft', 'returned')
      `,
      )
      .run(
        parsed.statusCode,
        parsed.requestedAt,
        parsed.payloadVersion,
        payloadJson,
        parsed.id,
        parsed.person.id,
        parsed.correlationId,
      );
    assertSingleDraftUpdate(transactionRequestUpdate);

    db.exec("RELEASE SAVEPOINT onboarding_transaction_request_edit");
  } catch (error) {
    rollbackNamedSavepoint(db, "onboarding_transaction_request_edit");
    throw error;
  }

  return {
    personId: parsed.person.id,
    transactionRequestId: parsed.id,
    statusCode: parsed.statusCode,
    correlationId: parsed.correlationId,
    operation: "updated",
  };
}

export function decideOnboardingTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): OnboardingApprovalDecisionResult {
  const decision = parseOnboardingApprovalDecisionInput(input);
  const target = getOnboardingDecisionTarget(decision.decision);
  const auditEventId = buildOnboardingDecisionAuditEventId(decision);
  const existing = readOnboardingTransactionRequestById(
    db,
    decision.transactionRequestId,
  );

  if (!existing) {
    throw new Error("onboarding transaction request decision target not found");
  }

  if (existing.request_type !== "hire") {
    throw new Error("onboarding transaction request decision target not found");
  }

  const existingAuditEvent = readAuditEventById(db, auditEventId);
  if (existing.status_code === target.statusCode && existingAuditEvent) {
    assertMatchingOnboardingDecisionAuditEvent(
      existingAuditEvent,
      existing,
      decision,
      target,
    );
    return buildOnboardingDecisionResult(
      existing,
      decision,
      target,
      auditEventId,
    );
  }

  assertLegalOnboardingDecision(existing, decision, target);

  db.exec("SAVEPOINT onboarding_transaction_request_decision");
  try {
    const updateResult = db
      .prepare(
        `
          UPDATE transaction_request
          SET status_code = ?
          WHERE id = ?
            AND person_id = ?
            AND request_type = 'hire'
            AND status_code = 'submitted'
        `,
      )
      .run(
        target.statusCode,
        existing.transaction_request_id,
        existing.person_id,
      );
    if (!isSingleSqlChange(updateResult)) {
      const retryResult = buildOnboardingDecisionRetryResultAfterConflict(
        db,
        decision,
        target,
        auditEventId,
      );
      if (retryResult) {
        db.exec("RELEASE SAVEPOINT onboarding_transaction_request_decision");
        return retryResult;
      }

      throw new Error(
        "onboarding transaction request decision conflicts with the current submitted state",
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
        VALUES (?, ?, ?, 'transaction_request', ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      auditEventId,
      decision.decidedBy,
      target.auditAction,
      existing.transaction_request_id,
      decision.decidedAt,
      decision.correlationId,
    );

    db.exec("RELEASE SAVEPOINT onboarding_transaction_request_decision");
  } catch (error) {
    rollbackNamedSavepoint(db, "onboarding_transaction_request_decision");
    throw error;
  }

  return buildOnboardingDecisionResult(
    existing,
    decision,
    target,
    auditEventId,
  );
}

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

export function applyDueOnboardingTransactionRequests(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): ApplyDueOnboardingTransactionRequestsResult {
  const worker = parseApplyDueOnboardingTransactionRequestsInput(input);
  const batchLimit = worker.batchLimit ?? 100;
  const effectiveDate = getMvpWorkerEffectiveDate(worker.now);
  const replayedRun = readOnboardingApplyJobRun(db, worker.correlationId);
  const replayedAttempts = readOnboardingApplyJobAttemptsForWorkerCorrelation(
    db,
    worker.correlationId,
  );
  if (replayedRun) {
    if (replayedAttempts.length > 0) {
      return buildApplyDueOnboardingTransactionRequestsResult(
        worker.correlationId,
        replayedAttempts,
        replayedRun.skipped,
      );
    }

    return buildApplyDueOnboardingTransactionRequestsResultFromRun(
      worker.correlationId,
      replayedRun,
    );
  }

  const candidates = readDueOnboardingApplyCandidates(
    db,
    batchLimit,
    effectiveDate,
  );
  const results: ApplyDueOnboardingTransactionRequestsItemResult[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    const attemptCorrelationId = buildWorkerAttemptCorrelationId(
      worker.correlationId,
      candidate.transaction_request_id,
    );

    let payload: OnboardingTransactionRequestPayload;
    try {
      payload = parsePersistedOnboardingApplyPayload(candidate);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      results.push(
        buildOnboardingApplyJobAttemptResult(
          recordOnboardingApplyJobAttempt(db, {
            transactionRequestId: candidate.transaction_request_id,
            personId: candidate.person_id,
            status: "non_retryable_failure",
            attemptedAt: worker.now,
            workerId: worker.workerId,
            correlationId: attemptCorrelationId,
            retryable: false,
            errorMessage,
          }),
        ),
      );
      continue;
    }

    if (payload.effectiveDate > effectiveDate) {
      skipped += 1;
      continue;
    }

    try {
      const applied = applyApprovedOnboardingTransactionRequest(db, {
        transactionRequestId: candidate.transaction_request_id,
        appliedAt: worker.now,
        appliedBy: worker.workerId,
        correlationId: attemptCorrelationId,
      });
      const attemptResult = buildOnboardingApplyJobAttemptResult(
        recordOnboardingApplyJobAttempt(db, {
          transactionRequestId: candidate.transaction_request_id,
          personId: candidate.person_id,
          status: "applied",
          attemptedAt: worker.now,
          workerId: worker.workerId,
          correlationId: attemptCorrelationId,
          retryable: false,
          errorMessage: null,
        }),
      );
      results.push(
        attemptResult.status === "applied"
          ? { ...attemptResult, lifecycleEventId: applied.lifecycleEventId }
          : attemptResult,
      );
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const retryable = isRetryableOnboardingApplyWorkerFailure(error);
      const status = retryable ? "retryable_failure" : "non_retryable_failure";
      results.push(
        buildOnboardingApplyJobAttemptResult(
          recordOnboardingApplyJobAttempt(db, {
            transactionRequestId: candidate.transaction_request_id,
            personId: candidate.person_id,
            status,
            attemptedAt: worker.now,
            workerId: worker.workerId,
            correlationId: attemptCorrelationId,
            retryable,
            errorMessage,
          }),
        ),
      );
    }
  }

  const persistedAttempts = readOnboardingApplyJobAttemptsForWorkerCorrelation(
    db,
    worker.correlationId,
  );
  const result = buildApplyDueOnboardingTransactionRequestsResult(
    worker.correlationId,
    persistedAttempts.length > 0 ? persistedAttempts : results,
    skipped,
  );
  recordOnboardingApplyJobRun(db, {
    correlationId: worker.correlationId,
    workerId: worker.workerId,
    startedAt: worker.now,
    effectiveDate,
    attempted: result.attempted,
    applied: result.applied,
    failed: result.failed,
    skipped: result.skipped,
  });
  return result;
}

function buildApplyDueOnboardingTransactionRequestsResult(
  correlationId: string,
  attempts:
    | ApplyDueOnboardingTransactionRequestsItemResult[]
    | ExistingOnboardingApplyJobAttemptRow[],
  skipped: number,
): ApplyDueOnboardingTransactionRequestsResult {
  const results = attempts.map((attempt) =>
    "status" in attempt
      ? attempt
      : buildOnboardingApplyJobAttemptResult(attempt),
  );
  const failed = results.filter((result) => result.status !== "applied").length;

  return {
    attempted: results.length,
    applied: results.length - failed,
    failed,
    skipped,
    correlationId,
    results,
  };
}

function buildApplyDueOnboardingTransactionRequestsResultFromRun(
  correlationId: string,
  run: ExistingOnboardingApplyJobRunRow,
): ApplyDueOnboardingTransactionRequestsResult {
  return {
    attempted: run.attempted,
    applied: run.applied,
    failed: run.failed,
    skipped: run.skipped,
    correlationId,
    results: [],
  };
}

function assertSingleDraftUpdate(result: unknown): void {
  if (!isSingleSqlChange(result)) {
    throw new Error(
      "onboarding transaction request edit conflicts with the current draft state",
    );
  }
}

function isSingleSqlChange(result: unknown): boolean {
  return (
    isSqlRunResult(result) && (result.changes === 1 || result.changes === 1n)
  );
}

function getOnboardingDecisionTarget(
  decision: OnboardingApprovalDecision,
): OnboardingDecisionTarget {
  switch (decision) {
    case "approve":
      return {
        statusCode: "approved",
        auditAction: "mvp_a.onboarding.approve",
      };
    case "return":
      return {
        statusCode: "returned",
        auditAction: "mvp_a.onboarding.return",
      };
    case "reject":
      return {
        statusCode: "rejected",
        auditAction: "mvp_a.onboarding.reject",
      };
    case "cancel":
      return {
        statusCode: "cancelled",
        auditAction: "mvp_a.onboarding.cancel",
      };
  }
}

function assertLegalOnboardingDecision(
  existing: ExistingOnboardingTransactionRequestRow,
  decision: OnboardingApprovalDecisionInput,
  target: OnboardingDecisionTarget,
): void {
  if (existing.status_code === target.statusCode) {
    throw new Error(
      "onboarding transaction request decision audit evidence is missing for the repeated command",
    );
  }

  if (existing.status_code !== "submitted") {
    throw new Error(
      `onboarding transaction request ${decision.decision} decision requires submitted state`,
    );
  }
}

function isSqlRunResult(result: unknown): result is SqlRunResult {
  if (!isRecord(result) || !("changes" in result)) {
    return false;
  }

  return (
    typeof result.changes === "number" || typeof result.changes === "bigint"
  );
}

function recordOnboardingApplyJobRun(
  db: OnboardingTransactionRequestDatabase,
  run: ExistingOnboardingApplyJobRunRow & {
    correlationId: string;
    workerId: string;
    startedAt: string;
    effectiveDate: string;
  },
): ExistingOnboardingApplyJobRunRow {
  db.prepare(
    `
      INSERT INTO onboarding_apply_job_run (
        id,
        correlation_id,
        worker_id,
        started_at,
        effective_date,
        attempted,
        applied,
        failed,
        skipped
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(correlation_id) DO NOTHING
    `,
  ).run(
    buildOnboardingApplyJobRunId(run.correlationId),
    run.correlationId,
    run.workerId,
    run.startedAt,
    run.effectiveDate,
    run.attempted,
    run.applied,
    run.failed,
    run.skipped,
  );

  const recorded = readOnboardingApplyJobRun(db, run.correlationId);
  if (!recorded) {
    throw new Error("onboarding apply job run was not persisted");
  }

  return recorded;
}

function matchesOnboardingTransactionRequestRetry(
  existing: ExistingOnboardingTransactionRequestRow,
  input: OnboardingTransactionRequestInput,
  payloadJson: string,
): boolean {
  const requestAlreadyAccepted =
    existing.status_code === input.statusCode ||
    (input.statusCode === "submitted" &&
      (existing.status_code === "completed" ||
        existing.status_code === "approved"));

  return (
    requestAlreadyAccepted &&
    existing.person_id === input.person.id &&
    existing.display_name === input.person.displayName &&
    existing.created_at === input.person.createdAt &&
    existing.request_type === input.requestType &&
    existing.requested_at === input.requestedAt &&
    existing.correlation_id === input.correlationId &&
    existing.payload_version === input.payloadVersion &&
    existing.payload_json === payloadJson
  );
}

function buildOnboardingTransactionRequestRetryResult(
  existing: ExistingOnboardingTransactionRequestRow,
): OnboardingTransactionRequestPersistenceResult {
  if (existing.correlation_id === null) {
    throw new Error(
      "onboarding transaction request retry read malformed existing request",
    );
  }

  return {
    personId: existing.person_id,
    transactionRequestId: existing.transaction_request_id,
    statusCode:
      existing.status_code as OnboardingTransactionRequestPersistedStatus,
    correlationId: existing.correlation_id,
  };
}

function buildOnboardingDecisionResult(
  existing: ExistingOnboardingTransactionRequestRow,
  decision: OnboardingApprovalDecisionInput,
  target: OnboardingDecisionTarget,
  auditEventId: string,
): OnboardingApprovalDecisionResult {
  return {
    personId: existing.person_id,
    transactionRequestId: existing.transaction_request_id,
    statusCode: target.statusCode,
    decision: decision.decision,
    auditEventId,
    correlationId: decision.correlationId,
  };
}

function buildCompletedOnboardingApplyRetryResult(
  existing: ExistingAppliedOnboardingTransactionRequestRow,
  payload: OnboardingTransactionRequestPayload,
  apply: ApplyApprovedOnboardingTransactionRequestInput,
  lifecycleEventId: string,
): AppliedOnboardingTransactionRequestResult {
  assertCompletedOnboardingApplyMatchesInput(
    existing,
    payload,
    apply,
    lifecycleEventId,
  );

  return {
    personId: existing.person_id,
    employmentId: payload.employment.id,
    assignmentId: payload.assignment.id,
    transactionRequestId: apply.transactionRequestId,
    lifecycleEventId,
    statusCode: "completed",
    correlationId: apply.correlationId,
  };
}

function assertCompletedOnboardingApplyMatchesInput(
  existing: ExistingAppliedOnboardingTransactionRequestRow,
  payload: OnboardingTransactionRequestPayload,
  apply: ApplyApprovedOnboardingTransactionRequestInput,
  lifecycleEventId: string,
): void {
  if (
    existing.transaction_status_code !== "completed" ||
    existing.request_type !== "hire" ||
    existing.lifecycle_event_id !== lifecycleEventId ||
    existing.lifecycle_event_type !== "hire" ||
    existing.lifecycle_effective_date !== payload.effectiveDate ||
    existing.lifecycle_occurred_at !== apply.appliedAt ||
    existing.employment_id !== payload.employment.id ||
    existing.employment_code !== payload.employment.employmentCode ||
    existing.employment_status_code !== "active" ||
    existing.employment_start_date !== payload.employment.startDate ||
    existing.employment_end_date !== null ||
    existing.assignment_id !== payload.assignment.id ||
    existing.assignment_code !== payload.assignment.assignmentCode ||
    existing.organization_code !== payload.assignment.departmentReference ||
    existing.position_code !== (payload.assignment.positionCode ?? null) ||
    existing.assignment_start_date !== payload.effectiveDate ||
    existing.assignment_end_date !== null ||
    existing.audit_event_id !==
      buildOnboardingApplyAuditEventId(lifecycleEventId) ||
    existing.audit_actor_id !== apply.appliedBy ||
    existing.audit_action !== "mvp_a.onboarding.apply" ||
    existing.audit_subject_table !== "lifecycle_event" ||
    existing.audit_subject_id !== lifecycleEventId ||
    existing.audit_occurred_at !== apply.appliedAt ||
    existing.audit_correlation_id !== apply.correlationId
  ) {
    throw new Error(
      "approved onboarding apply retry conflicts with the completed request",
    );
  }
}

function recordOnboardingApplyJobAttempt(
  db: OnboardingTransactionRequestDatabase,
  attempt: {
    transactionRequestId: string;
    personId: string;
    status: ApplyDueOnboardingTransactionRequestsStatus;
    attemptedAt: string;
    workerId: string;
    correlationId: string;
    retryable: boolean;
    errorMessage: string | null;
  },
): ExistingOnboardingApplyJobAttemptRow {
  db.prepare(
    `
      INSERT INTO onboarding_apply_job_attempt (
        id,
        transaction_request_id,
        person_id,
        status_code,
        attempted_at,
        worker_id,
        correlation_id,
        retryable,
        error_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(correlation_id) DO NOTHING
    `,
  ).run(
    buildOnboardingApplyJobAttemptId(
      attempt.transactionRequestId,
      attempt.correlationId,
    ),
    attempt.transactionRequestId,
    attempt.personId,
    attempt.status,
    attempt.attemptedAt,
    attempt.workerId,
    attempt.correlationId,
    attempt.retryable ? 1 : 0,
    attempt.errorMessage,
  );

  const recorded = readOnboardingApplyJobAttemptByCorrelation(
    db,
    attempt.correlationId,
  );
  if (!recorded) {
    throw new Error("onboarding apply job attempt was not persisted");
  }
  if (recorded.transaction_request_id !== attempt.transactionRequestId) {
    throw new Error(
      "onboarding apply job attempt correlation conflicts with another request",
    );
  }
  if (attempt.status === "applied" && recorded.status_code !== "applied") {
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET status_code = 'applied',
            attempted_at = ?,
            worker_id = ?,
            retryable = 0,
            error_message = NULL
        WHERE correlation_id = ?
          AND transaction_request_id = ?
          AND status_code != 'applied'
      `,
    ).run(
      attempt.attemptedAt,
      attempt.workerId,
      attempt.correlationId,
      attempt.transactionRequestId,
    );
    const upgraded = readOnboardingApplyJobAttemptByCorrelation(
      db,
      attempt.correlationId,
    );
    if (
      !upgraded ||
      upgraded.transaction_request_id !== attempt.transactionRequestId ||
      upgraded.status_code !== "applied"
    ) {
      throw new Error(
        "onboarding apply job attempt applied outcome was not persisted",
      );
    }

    return upgraded;
  }

  return recorded;
}

function buildOnboardingApplyJobAttemptResult(
  existing: ExistingOnboardingApplyJobAttemptRow,
): ApplyDueOnboardingTransactionRequestsItemResult {
  if (existing.status_code === "applied") {
    return {
      transactionRequestId: existing.transaction_request_id,
      status: "applied",
      lifecycleEventId: buildOnboardingApplyLifecycleEventIdForRequest(
        existing.transaction_request_id,
      ),
    };
  }

  if (
    existing.status_code !== "retryable_failure" &&
    existing.status_code !== "non_retryable_failure"
  ) {
    throw new Error("onboarding apply job attempt retry is malformed");
  }

  return {
    transactionRequestId: existing.transaction_request_id,
    status: existing.status_code,
    errorMessage:
      existing.error_message ?? "unknown onboarding apply attempt failure",
  };
}

function buildOnboardingDecisionRetryResultAfterConflict(
  db: OnboardingTransactionRequestDatabase,
  decision: OnboardingApprovalDecisionInput,
  target: OnboardingDecisionTarget,
  auditEventId: string,
): OnboardingApprovalDecisionResult | undefined {
  const latest = readOnboardingTransactionRequestById(
    db,
    decision.transactionRequestId,
  );
  const auditEvent = readAuditEventById(db, auditEventId);

  if (
    !latest ||
    latest.request_type !== "hire" ||
    latest.status_code !== target.statusCode ||
    !auditEvent
  ) {
    return undefined;
  }

  assertMatchingOnboardingDecisionAuditEvent(
    auditEvent,
    latest,
    decision,
    target,
  );
  return buildOnboardingDecisionResult(latest, decision, target, auditEventId);
}

function getMvpWorkerEffectiveDate(now: string): string {
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) {
    throw new OnboardingTransactionRequestValidationError(
      "now must be a valid ISO timestamp",
    );
  }

  const effectiveDate = parsed.toISOString().slice(0, 10);
  if (!isValidIsoDate(effectiveDate)) {
    throw new OnboardingTransactionRequestValidationError(
      "now must be a valid ISO timestamp",
    );
  }

  return effectiveDate;
}

function encodeStableKey(parts: string[]): string {
  return Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
}

function isRetryableOnboardingApplyWorkerFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  return !(
    error instanceof OnboardingTransactionRequestValidationError ||
    error.message.includes("persisted onboarding apply payload") ||
    error.message.includes("requires an approved hire transaction request") ||
    error.message.includes("retry conflicts with the completed request")
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "unknown onboarding apply error";
}

function assertMatchingOnboardingDecisionAuditEvent(
  auditEvent: ExistingAuditEventRow,
  existing: ExistingOnboardingTransactionRequestRow,
  decision: OnboardingApprovalDecisionInput,
  target: OnboardingDecisionTarget,
): void {
  if (
    auditEvent.actor_id !== decision.decidedBy ||
    auditEvent.action !== target.auditAction ||
    auditEvent.subject_table !== "transaction_request" ||
    auditEvent.subject_id !== existing.transaction_request_id ||
    auditEvent.occurred_at !== decision.decidedAt ||
    auditEvent.correlation_id !== decision.correlationId
  ) {
    throw new Error(
      "onboarding transaction request repeated decision conflicts with existing audit evidence",
    );
  }
}

function assertEditableDraftBinding(
  existing: ExistingOnboardingTransactionRequestRow,
  input: OnboardingTransactionRequestInput,
): void {
  if (
    existing.transaction_request_id !== input.id ||
    existing.person_id !== input.person.id ||
    existing.correlation_id !== input.correlationId
  ) {
    throw new Error(
      "onboarding transaction request edit conflicts with the existing request binding",
    );
  }

  if (existing.status_code !== "draft" && existing.status_code !== "returned") {
    throw new Error(
      "onboarding transaction request can only be edited while draft or returned",
    );
  }
}

function rollbackNamedSavepoint(
  db: OnboardingTransactionRequestDatabase,
  savepointName: string,
): void {
  try {
    db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
  } catch {
    // Preserve the original write failure; rollback cleanup is best-effort.
  }

  try {
    db.exec(`RELEASE SAVEPOINT ${savepointName}`);
  } catch {
    // Preserve the original write failure; rollback cleanup is best-effort.
  }
}
